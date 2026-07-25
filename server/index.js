const express = require('express');
const JSZip = require('jszip');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { WebSocketServer } = require('ws');
const http = require('http');
const { spawn, exec } = require('child_process');
const { randomBytes } = require('crypto');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3001;
const DATA_DIR = path.join(__dirname, '..', 'data');
const BOTS_DIR = path.join(__dirname, '..', 'bots');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(BOTS_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'fp9.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS bots (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    language TEXT DEFAULT 'unknown',
    status TEXT DEFAULT 'stopped',
    owner_id TEXT,
    package_json BOOLEAN DEFAULT 0,
    deps_hash TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
`);

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.json({ limit: '50mb' }));

app.get('/', (req, res) => {
  res.json({ name: 'FP9 Host API', status: 'running', version: '2.0.0' });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), memory: process.memoryUsage().rss });
});

app.post('/api/auth/discord', async (req, res) => {
  try {
    const { code, redirectUri } = req.body;
    if (!code) return res.status(400).json({ error: 'Code is required' });
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID || '1530409781045493882',
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code', code: code,
        redirect_uri: redirectUri || 'https://fp9.netlify.app/callback',
      }),
    });
    const tokenData = await tokenRes.json();
    if (tokenData.error) return res.status(400).json({ error: tokenData.error_description || tokenData.error });
    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userData = await userRes.json();
    res.json({ access_token: tokenData.access_token, user: userData });
  } catch (err) {
    res.status(500).json({ error: 'Authentication failed' });
  }
});

const botProcesses = new Map();
const consoleBuffers = new Map();

function addConsoleLog(botId, type, text) {
  if (!consoleBuffers.has(botId)) consoleBuffers.set(botId, []);
  const logs = consoleBuffers.get(botId);
  const entry = { id: Date.now(), type, text, timestamp: new Date().toLocaleTimeString() };
  logs.push(entry);
  if (logs.length > 1000) logs.splice(0, logs.length - 1000);
  wss.clients.forEach(client => {
    if (client.readyState === 1 && client.botId === botId)
      client.send(JSON.stringify({ type: 'console', botId, data: entry }));
  });
  return entry;
}

function execShell(command, cwd) {
  return new Promise((resolve) => {
    exec(command, { cwd, env: { ...process.env }, timeout: 120000, maxBuffer: 5 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ stdout: stdout || '', stderr: stderr || '', code: err ? (err.code || err.killed ? 1 : 1) : 0 });
    });
  });
}

function getBotPath(botId) {
  return path.join(BOTS_DIR, botId);
}

function computeDepsHash(botPath) {
  try {
    const pkg = fs.readFileSync(path.join(botPath, 'package.json'), 'utf-8');
    const deps = JSON.parse(pkg).dependencies || {};
    return randomBytes(4).toString('hex') + '-' + Object.keys(deps).sort().join(',');
  } catch { return ''; }
}

async function ensureDependencies(botId, botPath) {
  if (!fs.existsSync(path.join(botPath, 'package.json'))) return true;
  const newHash = computeDepsHash(botPath);
  const row = db.prepare('SELECT deps_hash FROM bots WHERE id = ?').get(botId);
  if (row && row.deps_hash === newHash && fs.existsSync(path.join(botPath, 'node_modules'))) return true;
  addConsoleLog(botId, 'system', '📦 Installing dependencies...');
  const result = await execShell('npm install --no-optional --no-audit --no-fund 2>&1', botPath);
  const lines = result.stdout.split('\n').filter(Boolean).slice(-8);
  lines.forEach(l => addConsoleLog(botId, 'output', l));
  if (result.stderr) {
    result.stderr.split('\n').filter(Boolean).slice(-4).forEach(l => addConsoleLog(botId, 'error', l));
  }
  if (fs.existsSync(path.join(botPath, 'node_modules'))) {
    db.prepare('UPDATE bots SET deps_hash = ? WHERE id = ?').run(newHash, botId);
    addConsoleLog(botId, 'system', '✅ Dependencies installed successfully');
    const depCount = fs.readdirSync(path.join(botPath, 'node_modules')).filter(x => !x.startsWith('.')).length;
    addConsoleLog(botId, 'system', `📊 ${depCount} packages installed`);
    return true;
  }
  addConsoleLog(botId, 'error', '❌ npm install failed. Try "install" in console.');
  return false;
}

const TEXT_EXTENSIONS = new Set([
  'js', 'ts', 'jsx', 'tsx', 'py', 'java', 'go', 'rb', 'php',
  'json', 'yaml', 'yml', 'toml', 'xml', 'txt', 'md', 'html', 'css',
  'env', 'gitignore', 'dockerfile', 'sh', 'bat', 'ps1', 'cfg', 'ini',
  'mjs', 'cjs', 'mts', 'cts',
]);

function detectLanguage(fileNames, botPath) {
  if (fileNames.some(f => f === 'package.json' || f.endsWith('/package.json'))) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(botPath, 'package.json'), 'utf-8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps['discord.js'] || deps['eris'] || deps['discord.io']) return 'discord.js';
      if (deps['telegraf'] || deps['node-telegram-bot-api'] || deps['grammy']) return 'telegram';
      return 'nodejs';
    } catch { return 'nodejs'; }
  }
  if (fileNames.some(f => f === 'requirements.txt' || f.endsWith('setup.py') || f.endsWith('pyproject.toml'))) return 'python';
  if (fileNames.some(f => f.endsWith('pom.xml') || f.endsWith('build.gradle'))) return 'java';
  if (fileNames.some(f => f === 'go.mod')) return 'go';
  if (fileNames.some(f => f === 'Gemfile')) return 'ruby';
  if (fileNames.some(f => f === 'composer.json')) return 'php';
  if (fileNames.some(f => f.endsWith('.js') || f.endsWith('.ts') || f.endsWith('.mjs'))) return 'nodejs';
  if (fileNames.some(f => f.endsWith('.py'))) return 'python';
  return 'unknown';
}

function findMainFile(botPath, language) {
  const priorities = {
    'discord.js': ['index.js', 'bot.js', 'main.js', 'app.js'],
    'nodejs': ['index.js', 'bot.js', 'main.js', 'app.js', 'server.js'],
    'python': ['main.py', 'bot.py', 'app.py', 'index.py', 'run.py'],
  };
  const candidates = priorities[language] || [];
  for (const f of candidates) {
    if (fs.existsSync(path.join(botPath, f))) return f;
  }
  if (language === 'nodejs' || language === 'discord.js') {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(botPath, 'package.json'), 'utf-8'));
      if (pkg.main && fs.existsSync(path.join(botPath, pkg.main))) return pkg.main;
    } catch {}
  }
  const files = fs.readdirSync(botPath).filter(f => f.endsWith('.js') || f.endsWith('.ts') || f.endsWith('.py'));
  return files[0] || 'index.js';
}

function startBotProcess(bot) {
  const botPath = getBotPath(bot.id);
  if (!fs.existsSync(botPath)) return false;
  const language = bot.language;
  const mainFile = findMainFile(botPath, language);
  const envVars = {};
  const envFile = path.join(botPath, '.env');
  if (fs.existsSync(envFile)) {
    fs.readFileSync(envFile, 'utf-8').split('\n').forEach(line => {
      const t = line.trim();
      if (t && !t.startsWith('#') && t.includes('=')) {
        const i = t.indexOf('=');
        envVars[t.slice(0, i).trim()] = t.slice(i + 1).trim();
      }
    });
  }
  const env = { ...process.env, ...envVars, HOME: '/tmp' };
  let cmd, args;
  if (language === 'nodejs' || language === 'discord.js' || language === 'telegram') {
    cmd = 'node'; args = [mainFile];
  } else if (language === 'python') {
    cmd = 'python3'; args = [mainFile];
  } else { return false; }
  const proc = spawn(cmd, args, { cwd: botPath, env, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
  botProcesses.set(bot.id, proc);
  db.prepare('UPDATE bots SET status = ?, updated_at = datetime("now") WHERE id = ?').run('running', bot.id);
  addConsoleLog(bot.id, 'system', `🚀 Bot started (${language}: ${mainFile})`);
  broadcastStatus(bot.id, 'running');
  proc.stdout.on('data', d => d.toString().split('\n').filter(Boolean).forEach(l => addConsoleLog(bot.id, 'output', l)));
  proc.stderr.on('data', d => d.toString().split('\n').filter(Boolean).forEach(l => addConsoleLog(bot.id, 'error', l)));
  proc.on('close', code => {
    botProcesses.delete(bot.id);
    db.prepare('UPDATE bots SET status = ?, updated_at = datetime("now") WHERE id = ?').run('stopped', bot.id);
    addConsoleLog(bot.id, 'system', `⏹ Bot stopped (exit code: ${code})`);
    broadcastStatus(bot.id, 'stopped');
  });
  proc.on('error', err => {
    botProcesses.delete(bot.id);
    db.prepare('UPDATE bots SET status = ?, updated_at = datetime("now") WHERE id = ?').run('error', bot.id);
    addConsoleLog(bot.id, 'error', `❌ Failed to start: ${err.message}`);
    broadcastStatus(bot.id, 'error');
  });
  return true;
}

function stopBotProcess(botId) {
  const proc = botProcesses.get(botId);
  if (proc) {
    try { proc.kill('SIGTERM'); } catch {}
    setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} }, 5000);
    botProcesses.delete(botId);
    return true;
  }
  return false;
}

function broadcastStatus(botId, status) {
  const msg = JSON.stringify({ type: 'status', botId, status });
  wss.clients.forEach(client => { if (client.readyState === 1) client.send(msg); });
}

function readBotFiles(botPath) {
  if (!fs.existsSync(botPath)) return [];
  const result = [];
  const visited = new Set();
  const MAX_DEPTH = 30;
  function walk(dir, prefix, depth) {
    if (depth > MAX_DEPTH) return [];
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
    for (const entry of entries) {
      const full = path.resolve(path.join(dir, entry.name));
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink() || entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      if (visited.has(full)) continue;
      visited.add(full);
      if (entry.isDirectory()) {
        result.push({ name: entry.name, path: rel, content: '', isDirectory: true, children: walk(full, rel, depth + 1) });
      } else {
        let content = '';
        try {
          const ext = entry.name.split('.').pop()?.toLowerCase() || '';
          if (TEXT_EXTENSIONS.has(ext)) content = fs.readFileSync(full, 'utf-8');
        } catch {}
        result.push({ name: entry.name, path: rel, content, isDirectory: false });
      }
    }
    return result;
  }
  return walk(botPath, '', 0);
}

function verifyModule(botPath, modName) {
  const p = path.join(botPath, 'node_modules', modName);
  return fs.existsSync(p);
}

app.post('/api/upload', (req, res) => {
  const multer = require('multer');
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
  upload.single('file')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    try {
      const zip = await JSZip.loadAsync(req.file.buffer);
      const botId = `bot-${Date.now()}`;
      const botPath = getBotPath(botId);
      fs.mkdirSync(botPath, { recursive: true });
      let fileCount = 0;
      const fileNames = [];
      const promises = [];
      zip.forEach((filePath, entry) => {
        if (!entry.dir) {
          promises.push((async () => {
            const ext = filePath.split('.').pop()?.toLowerCase() || '';
            const base = path.basename(filePath);
            if (TEXT_EXTENSIONS.has(ext) || base === 'Dockerfile' || base === 'Procfile' || base === '.env') {
              try {
                const text = await entry.async('text');
                const out = path.join(botPath, filePath);
                fs.mkdirSync(path.dirname(out), { recursive: true });
                fs.writeFileSync(out, text, 'utf-8');
                fileNames.push(filePath);
                fileCount++;
              } catch {}
            }
          })());
        }
      });
      await Promise.all(promises);
      const botName = req.body.name || req.file.originalname.replace('.zip', '').replace(/_/g, ' ');
      const language = detectLanguage(fileNames, botPath);
      const hasPackageJson = fs.existsSync(path.join(botPath, 'package.json'));
      db.prepare('INSERT INTO bots (id, name, language, status, package_json) VALUES (?, ?, ?, ?, ?)').run(
        botId, botName, language, 'stopped', hasPackageJson ? 1 : 0
      );
      addConsoleLog(botId, 'system', `📁 Bot "${botName}" uploaded successfully`);
      addConsoleLog(botId, 'system', `🔍 Language: ${language} | Files: ${fileCount}`);
      if (hasPackageJson) {
        await ensureDependencies(botId, botPath);
      }
      const files = readBotFiles(botPath);
      const flatFiles = [];
      try {
        (function countFiles(f, d) { if (d > 30) return; for (const x of f) { if (x.isDirectory) countFiles(x.children || [], d + 1); else flatFiles.push(x.path); } })(files, 0);
      } catch {} finally {}
      res.json({
        bot: {
          id: botId, name: botName, language, status: 'stopped',
          hasPackageJson, uptime: '0m',
          mainFile: hasPackageJson ? findMainFile(botPath, language) : null,
          lastUpdate: new Date().toLocaleString('en-US'),
          files, console: consoleBuffers.get(botId) || [],
          plugins: [], envVars: {},
          resources: { cpu: 0, memory: 0, disk: flatFiles.length },
        }
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
});

app.get('/api/bots', (req, res) => {
  const bots = db.prepare('SELECT * FROM bots ORDER BY created_at DESC').all();
  const result = bots.map(bot => {
    const botPath = getBotPath(bot.id);
    const files = readBotFiles(botPath);
    const proc = botProcesses.get(bot.id);
    const isRunning = proc && !proc.killed;
    const nmExists = fs.existsSync(path.join(botPath, 'node_modules'));
    let depStatus = 'none';
    if (bot.package_json) {
      depStatus = nmExists ? 'installed' : 'missing';
      if (nmExists && bot.language === 'discord.js') {
        depStatus = verifyModule(botPath, 'discord.js') ? 'ready' : 'missing-module';
      }
    }
    return {
      id: bot.id, name: bot.name, language: bot.language,
      status: isRunning ? 'running' : bot.status || 'stopped',
      package_json: !!bot.package_json, depStatus,
      uptime: isRunning ? 'Active' : '0m',
      lastUpdate: bot.updated_at || bot.created_at,
      files, console: consoleBuffers.get(bot.id) || [],
      plugins: [], envVars: {},
      resources: {
        cpu: isRunning ? Math.floor(Math.random() * 20) + 3 : 0,
        memory: isRunning ? Math.floor(Math.random() * 150) + 30 : 0,
        disk: files.length,
      },
    };
  });
  res.json(result);
});

app.get('/api/bots/:id', (req, res) => {
  const bot = db.prepare('SELECT * FROM bots WHERE id = ?').get(req.params.id);
  if (!bot) return res.status(404).json({ error: 'Bot not found' });
  const botPath = getBotPath(bot.id);
  const files = readBotFiles(botPath);
  const proc = botProcesses.get(bot.id);
  const isRunning = proc && !proc.killed;
  res.json({
    id: bot.id, name: bot.name, language: bot.language,
    status: isRunning ? 'running' : bot.status || 'stopped',
    package_json: !!bot.package_json,
    uptime: isRunning ? 'Active' : '0m',
    lastUpdate: bot.updated_at || bot.created_at,
    files, console: consoleBuffers.get(bot.id) || [],
    plugins: [], envVars: {},
    resources: {
      cpu: isRunning ? Math.floor(Math.random() * 20) + 3 : 0,
      memory: isRunning ? Math.floor(Math.random() * 150) + 30 : 0,
      disk: files.length,
    },
  });
});

app.post('/api/bots/:id/start', async (req, res) => {
  const bot = db.prepare('SELECT * FROM bots WHERE id = ?').get(req.params.id);
  if (!bot) return res.status(404).json({ error: 'Bot not found' });
  if (botProcesses.has(bot.id)) return res.json({ status: 'already_running' });
  const botPath = getBotPath(bot.id);
  if (bot.language === 'nodejs' || bot.language === 'discord.js' || bot.language === 'telegram') {
    const ok = await ensureDependencies(bot.id, botPath);
    if (!ok) return res.status(400).json({ error: 'Dependencies not installed. Run "install" in console first.' });
    if (bot.language === 'discord.js' && !verifyModule(botPath, 'discord.js')) {
      addConsoleLog(bot.id, 'system', '📦 discord.js not found, installing specifically...');
      await execShell('npm install discord.js --no-optional --no-audit 2>&1', botPath);
      if (!verifyModule(botPath, 'discord.js'))
        return res.status(400).json({ error: 'Failed to install discord.js. Check your package.json.' });
      addConsoleLog(bot.id, 'system', '✅ discord.js installed');
    }
  }
  const success = startBotProcess(bot);
  res.json({ status: success ? 'running' : 'error' });
});

app.post('/api/bots/:id/stop', (req, res) => {
  const bot = db.prepare('SELECT * FROM bots WHERE id = ?').get(req.params.id);
  if (!bot) return res.status(404).json({ error: 'Bot not found' });
  stopBotProcess(bot.id);
  res.json({ status: 'stopped' });
});

app.post('/api/bots/:id/restart', async (req, res) => {
  const bot = db.prepare('SELECT * FROM bots WHERE id = ?').get(req.params.id);
  if (!bot) return res.status(404).json({ error: 'Bot not found' });
  stopBotProcess(bot.id);
  const botPath = getBotPath(bot.id);
  if (bot.language === 'nodejs' || bot.language === 'discord.js' || bot.language === 'telegram') {
    await ensureDependencies(bot.id, botPath);
  }
  setTimeout(() => {
    const success = startBotProcess(bot);
    res.json({ status: success ? 'running' : 'error' });
  }, 1500);
});

app.put('/api/bots/:id/files', (req, res) => {
  const bot = db.prepare('SELECT * FROM bots WHERE id = ?').get(req.params.id);
  if (!bot) return res.status(404).json({ error: 'Bot not found' });
  const filePath = req.body.filePath;
  if (!filePath) return res.status(400).json({ error: 'No file path' });
  const fullPath = path.resolve(path.join(getBotPath(bot.id), filePath));
  if (!fullPath.startsWith(path.resolve(getBotPath(bot.id)))) return res.status(400).json({ error: 'Invalid path' });
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, req.body.content || '', 'utf-8');
  db.prepare('UPDATE bots SET updated_at = datetime("now") WHERE id = ?').run(bot.id);
  if (req.body.content && path.basename(filePath) === 'package.json') {
    db.prepare('UPDATE bots SET deps_hash = NULL WHERE id = ?').run(bot.id);
  }
  res.json({ success: true });
});

app.delete('/api/bots/:id', (req, res) => {
  const bot = db.prepare('SELECT * FROM bots WHERE id = ?').get(req.params.id);
  if (!bot) return res.status(404).json({ error: 'Bot not found' });
  stopBotProcess(bot.id);
  const botPath = getBotPath(bot.id);
  if (fs.existsSync(botPath)) fs.rmSync(botPath, { recursive: true, force: true });
  db.prepare('DELETE FROM bots WHERE id = ?').run(bot.id);
  consoleBuffers.delete(bot.id);
  res.json({ success: true });
});

wss.on('connection', (ws) => {
  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data);

      if (msg.type === 'subscribe') {
        ws.botId = msg.botId;
        (consoleBuffers.get(msg.botId) || []).forEach(log => {
          ws.send(JSON.stringify({ type: 'console', botId: msg.botId, data: log }));
        });
      }

      if (msg.type === 'input') {
        const botId = msg.botId;
        const text = msg.text.trim();
        if (!text) return;
        const bot = db.prepare('SELECT * FROM bots WHERE id = ?').get(botId);
        const botPath = getBotPath(botId);

        addConsoleLog(botId, 'input', `$ ${text}`);

        switch (text) {
          case 'clear':
            consoleBuffers.set(botId, []);
            return ws.send(JSON.stringify({ type: 'clear', botId }));

          case 'help':
            addConsoleLog(botId, 'system', '╔══════════════════════════════════════╗');
            addConsoleLog(botId, 'system', '║         FP9 Host Console Help        ║');
            addConsoleLog(botId, 'system', '╠══════════════════════════════════════╣');
            addConsoleLog(botId, 'system', '║ start        Start the bot          ║');
            addConsoleLog(botId, 'system', '║ stop         Stop the bot           ║');
            addConsoleLog(botId, 'system', '║ restart      Restart the bot        ║');
            addConsoleLog(botId, 'system', '║ install      Install dependencies   ║');
            addConsoleLog(botId, 'system', '║ install <pkg> Install a package     ║');
            addConsoleLog(botId, 'system', '║ uninstall <pkg> Remove a package    ║');
            addConsoleLog(botId, 'system', '║ update       Update all packages    ║');
            addConsoleLog(botId, 'system', '║ ls / dir     List files             ║');
            addConsoleLog(botId, 'system', '║ cat <file>   View file content      ║');
            addConsoleLog(botId, 'system', '║ edit <file> <text>  Write to file   ║');
            addConsoleLog(botId, 'system', '║ rm <file>    Delete a file          ║');
            addConsoleLog(botId, 'system', '║ mkdir <name> Create a directory     ║');
            addConsoleLog(botId, 'system', '║ npm <cmd>    Run npm command        ║');
            addConsoleLog(botId, 'system', '║ node <file>  Run a JS file          ║');
            addConsoleLog(botId, 'system', '║ python <file> Run a Python file     ║');
            addConsoleLog(botId, 'system', '║ status       Show bot info          ║');
            addConsoleLog(botId, 'system', '║ env          Show environment vars  ║');
            addConsoleLog(botId, 'system', '║ deps         Show installed deps    ║');
            addConsoleLog(botId, 'system', '║ clear        Clear console          ║');
            addConsoleLog(botId, 'system', '╚══════════════════════════════════════╝');
            return;

          case 'start': {
            if (botProcesses.has(botId)) return addConsoleLog(botId, 'error', 'Bot is already running');
            if (!bot) return addConsoleLog(botId, 'error', 'Bot not found');
            if (!fs.existsSync(botPath)) return addConsoleLog(botId, 'error', 'Bot directory not found');
            if (bot.language === 'nodejs' || bot.language === 'discord.js') {
              const ok = await ensureDependencies(botId, botPath);
              if (!ok) return addConsoleLog(botId, 'error', 'Cannot start: dependencies not installed');
              if (bot.language === 'discord.js' && !verifyModule(botPath, 'discord.js')) {
                addConsoleLog(botId, 'system', '📦 Installing discord.js...');
                await execShell('npm install discord.js 2>&1', botPath);
                if (!verifyModule(botPath, 'discord.js'))
                  return addConsoleLog(botId, 'error', '❌ Failed to install discord.js');
                addConsoleLog(botId, 'system', '✅ discord.js installed');
              }
            }
            startBotProcess(bot);
            return;
          }

          case 'stop': {
            if (!botProcesses.has(botId)) return addConsoleLog(botId, 'error', 'Bot is not running');
            stopBotProcess(botId);
            addConsoleLog(botId, 'system', '⏹ Bot stopped');
            return;
          }

          case 'restart': {
            const wasRunning = botProcesses.has(botId);
            if (wasRunning) stopBotProcess(botId);
            if (!bot) return addConsoleLog(botId, 'error', 'Bot not found');
            if (!fs.existsSync(botPath)) return addConsoleLog(botId, 'error', 'Bot directory not found');
            setTimeout(async () => {
              if (bot.language === 'nodejs' || bot.language === 'discord.js') {
                const ok = await ensureDependencies(botId, botPath);
                if (ok) startBotProcess(bot);
              } else {
                startBotProcess(bot);
              }
            }, wasRunning ? 1500 : 500);
            return;
          }

          case 'status':
            if (!bot) return addConsoleLog(botId, 'error', 'Bot not found');
            addConsoleLog(botId, 'system', `📋 Bot: ${bot.name}`);
            addConsoleLog(botId, 'system', `   Language: ${bot.language}`);
            addConsoleLog(botId, 'system', `   Status: ${botProcesses.has(botId) ? '🟢 Running' : '🔴 Stopped'}`);
            addConsoleLog(botId, 'system', `   Package.json: ${bot.package_json ? '✅ Yes' : '❌ No'}`);
            if (bot.package_json) {
              const nm = fs.existsSync(path.join(botPath, 'node_modules'));
              addConsoleLog(botId, 'system', `   node_modules: ${nm ? '✅ Found' : '❌ Missing'}`);
              if (nm) {
                const count = fs.readdirSync(path.join(botPath, 'node_modules')).filter(x => !x.startsWith('.')).length;
                addConsoleLog(botId, 'system', `   Packages: ${count}`);
              }
            }
            return;

          case 'env':
            if (!fs.existsSync(botPath)) return addConsoleLog(botId, 'error', 'Bot directory not found');
            const envFile = path.join(botPath, '.env');
            if (!fs.existsSync(envFile)) return addConsoleLog(botId, 'output', 'No .env file found');
            const envContent = fs.readFileSync(envFile, 'utf-8');
            addConsoleLog(botId, 'output', envContent || '(empty)');
            return;

          case 'deps':
            if (!bot || !bot.package_json) return addConsoleLog(botId, 'error', 'No package.json found');
            try {
              const pkg = JSON.parse(fs.readFileSync(path.join(botPath, 'package.json'), 'utf-8'));
              const deps = pkg.dependencies || {};
              const names = Object.keys(deps);
              if (names.length === 0) return addConsoleLog(botId, 'output', 'No dependencies in package.json');
              addConsoleLog(botId, 'system', `📦 ${names.length} dependencies:`);
              names.forEach(n => {
                const installed = verifyModule(botPath, n);
                addConsoleLog(botId, 'output', `  ${installed ? '✅' : '❌'} ${n}@${deps[n]}`);
              });
            } catch { addConsoleLog(botId, 'error', 'Failed to parse package.json'); }
            return;

          case 'install':
            if (bot && bot.package_json) {
              await ensureDependencies(botId, botPath);
            } else {
              addConsoleLog(botId, 'system', 'Running npm install...');
              const r = await execShell('npm install 2>&1', botPath);
              (r.stdout || '').split('\n').filter(Boolean).slice(-10).forEach(l => addConsoleLog(botId, 'output', l));
              if (r.stderr) r.stderr.split('\n').filter(Boolean).slice(-5).forEach(l => addConsoleLog(botId, 'error', l));
              addConsoleLog(botId, 'system', r.code === 0 ? '✅ Done' : `❌ Failed (exit: ${r.code})`);
            }
            return;
        }

        if (text.startsWith('install ')) {
          const pkg = text.slice(8).trim();
          addConsoleLog(botId, 'system', `📦 Installing ${pkg}...`);
          const r = await execShell(`npm install ${pkg} 2>&1`, botPath);
          (r.stdout || '').split('\n').filter(Boolean).slice(-10).forEach(l => addConsoleLog(botId, 'output', l));
          if (r.stderr) r.stderr.split('\n').filter(Boolean).slice(-5).forEach(l => addConsoleLog(botId, 'error', l));
          addConsoleLog(botId, 'system', r.code === 0 ? `✅ ${pkg} installed` : `❌ Failed`);
          return;
        }

        if (text.startsWith('uninstall ')) {
          const pkg = text.slice(10).trim();
          addConsoleLog(botId, 'system', `Removing ${pkg}...`);
          const r = await execShell(`npm uninstall ${pkg} 2>&1`, botPath);
          (r.stdout || '').split('\n').filter(Boolean).slice(-5).forEach(l => addConsoleLog(botId, 'output', l));
          addConsoleLog(botId, 'system', r.code === 0 ? `✅ ${pkg} removed` : `❌ Failed`);
          return;
        }

        if (text === 'update' || text === 'upgrade') {
          addConsoleLog(botId, 'system', '📦 Updating all packages...');
          const r = await execShell('npm update 2>&1', botPath);
          (r.stdout || '').split('\n').filter(Boolean).slice(-10).forEach(l => addConsoleLog(botId, 'output', l));
          addConsoleLog(botId, 'system', r.code === 0 ? '✅ Updated' : `❌ Failed`);
          return;
        }

        if (text === 'ls' || text === 'dir') {
          if (!fs.existsSync(botPath)) return addConsoleLog(botId, 'error', 'Bot directory not found');
          const entries = fs.readdirSync(botPath, { withFileTypes: true });
          const list = entries.map(e => {
            if (e.name === 'node_modules') return `  📦 node_modules/`;
            if (e.isDirectory()) return `  📁 ${e.name}/`;
            const s = fs.statSync(path.join(botPath, e.name)).size;
            return `  📄 ${e.name} (${(s / 1024).toFixed(1)}KB)`;
          }).join('\n');
          addConsoleLog(botId, 'output', list || '📂 Empty directory');
          return;
        }

        if (text.startsWith('cat ')) {
          const fn = text.slice(4).trim();
          const fp = path.join(botPath, fn);
          if (!fs.existsSync(fp)) return addConsoleLog(botId, 'error', `File not found: ${fn}`);
          const content = fs.readFileSync(fp, 'utf-8');
          const lines = content.split('\n');
          if (lines.length > 100) {
            lines.slice(0, 100).forEach(l => addConsoleLog(botId, 'output', l));
            addConsoleLog(botId, 'system', `... (${lines.length - 100} more lines)`);
          } else {
            lines.forEach(l => addConsoleLog(botId, 'output', l));
          }
          return;
        }

        if (text.startsWith('edit ')) {
          const rest = text.slice(5).trim();
          const spaceIdx = rest.indexOf(' ');
          if (spaceIdx === -1) return addConsoleLog(botId, 'error', 'Usage: edit <file> <content>');
          const fn = rest.slice(0, spaceIdx);
          const content = rest.slice(spaceIdx + 1);
          const fp = path.join(botPath, fn);
          if (!fp.startsWith(path.resolve(botPath))) return addConsoleLog(botId, 'error', 'Invalid path');
          fs.mkdirSync(path.dirname(fp), { recursive: true });
          fs.writeFileSync(fp, content, 'utf-8');
          addConsoleLog(botId, 'system', `✅ Written to ${fn}`);
          return;
        }

        if (text.startsWith('rm ')) {
          const fn = text.slice(3).trim();
          const fp = path.join(botPath, fn);
          if (!fs.existsSync(fp)) return addConsoleLog(botId, 'error', `Not found: ${fn}`);
          fs.rmSync(fp, { recursive: true, force: true });
          addConsoleLog(botId, 'system', `🗑 Deleted: ${fn}`);
          return;
        }

        if (text.startsWith('mkdir ')) {
          const dn = text.slice(6).trim();
          fs.mkdirSync(path.join(botPath, dn), { recursive: true });
          addConsoleLog(botId, 'system', `📁 Created: ${dn}/`);
          return;
        }

        const proc = botProcesses.get(botId);
        if (proc && proc.stdin && !proc.stdin.destroyed) {
          proc.stdin.write(text + '\n');
          return;
        }

        addConsoleLog(botId, 'system', `⚡ ${text}`);
        const r = await execShell(text + ' 2>&1', botPath);
        if (r.stdout) r.stdout.split('\n').filter(Boolean).forEach(l => addConsoleLog(botId, 'output', l));
        if (r.stderr) r.stderr.split('\n').filter(Boolean).forEach(l => addConsoleLog(botId, 'error', l));
        addConsoleLog(botId, 'system', r.code === 0 ? '✅ Done' : `❌ Failed (exit: ${r.code})`);
      }
    } catch (err) {
      console.error('WebSocket error:', err);
    }
  });
});

server.listen(PORT, () => {
  const mode = process.env.NODE_ENV || 'production';
  console.log(`╔══════════════════════════════════╗`);
  console.log(`║    FP9 Host API v2.0.0           ║`);
  console.log(`║    Port: ${PORT}                       ║`);
  console.log(`║    Mode: ${mode}                      ║`);
  console.log(`╚══════════════════════════════════╝`);
});
