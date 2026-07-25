const express = require('express');
const JSZip = require('jszip');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { WebSocketServer } = require('ws');
const http = require('http');
const { spawn, execSync } = require('child_process');

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
  res.json({ name: 'FP9 Host API', status: 'running', version: '1.0.0' });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.post('/api/auth/discord', async (req, res) => {
  try {
    const { code, redirectUri } = req.body;
    if (!code) return res.status(400).json({ error: 'Code is required' });
    const clientId = process.env.DISCORD_CLIENT_ID || '1530409781045493882';
    const clientSecret = process.env.DISCORD_CLIENT_SECRET;
    if (!clientSecret) return res.status(500).json({ error: 'Discord credentials not configured' });

    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId, client_secret: clientSecret,
        grant_type: 'authorization_code', code, redirect_uri: redirectUri,
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
    res.status(500).json({ error: 'Auth failed' });
  }
});

const botProcesses = new Map();
const consoleBuffers = new Map();

function addConsoleLog(botId, type, text) {
  if (!consoleBuffers.has(botId)) consoleBuffers.set(botId, []);
  const logs = consoleBuffers.get(botId);
  logs.push({ id: Date.now(), type, text, timestamp: new Date().toLocaleTimeString() });
  if (logs.length > 500) logs.splice(0, logs.length - 500);

  wss.clients.forEach(client => {
    if (client.readyState === 1 && client.botId === botId) {
      client.send(JSON.stringify({ type: 'console', botId, data: { id: Date.now(), type, text, timestamp: new Date().toLocaleTimeString() } }));
    }
  });
}

function runShell(command, cwd) {
  return new Promise((resolve) => {
    const proc = spawn('bash', ['-c', command], {
      cwd,
      env: { ...process.env, PATH: process.env.PATH },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', d => { stdout += d.toString(); });
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('close', (code) => resolve({ stdout, stderr, code }));
    proc.on('error', (err) => resolve({ stdout: '', stderr: err.message, code: 1 }));
  });
}

const TEXT_EXTENSIONS = new Set([
  'js', 'ts', 'jsx', 'tsx', 'py', 'java', 'go', 'rb', 'php',
  'json', 'yaml', 'yml', 'toml', 'xml', 'txt', 'md', 'html', 'css',
  'env', 'gitignore', 'dockerfile', 'sh', 'bat', 'ps1', 'cfg', 'ini',
]);

function detectLanguage(fileNames) {
  if (fileNames.some(f => f.includes('package.json'))) return 'nodejs';
  if (fileNames.some(f => f.includes('requirements.txt') || f.includes('setup.py') || f.includes('pyproject.toml'))) return 'python';
  if (fileNames.some(f => f.includes('pom.xml') || f.includes('build.gradle'))) return 'java';
  if (fileNames.some(f => f.includes('go.mod'))) return 'go';
  if (fileNames.some(f => f.includes('Gemfile'))) return 'ruby';
  if (fileNames.some(f => f.includes('composer.json'))) return 'php';
  return 'unknown';
}

function buildTree(fileData, rootName) {
  const tree = [];
  const dirMap = new Map();
  Array.from(fileData.keys()).sort().forEach(fullPath => {
    const relativePath = fullPath.startsWith(rootName + '/') ? fullPath.slice(rootName.length + 1) : fullPath;
    if (!relativePath) return;
    const parts = relativePath.split('/');
    let currentPath = '';
    parts.forEach((part, idx) => {
      const prevPath = currentPath;
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isDir = idx < parts.length - 1;
      if (isDir) {
        if (!dirMap.has(currentPath)) {
          const dir = { name: part, path: currentPath, content: '', isDirectory: true, children: [] };
          dirMap.set(currentPath, dir);
          if (prevPath && dirMap.has(prevPath)) dirMap.get(prevPath).children.push(dir);
          else tree.push(dir);
        }
      } else {
        const content = fileData.get(fullPath) || '';
        const file = { name: part, path: currentPath, content, isDirectory: false };
        if (prevPath && dirMap.has(prevPath)) dirMap.get(prevPath).children.push(file);
        else tree.push(file);
      }
    });
  });
  return tree;
}

function flattenFiles(files) {
  const result = [];
  files.forEach(f => {
    if (f.isDirectory && f.children) result.push(...flattenFiles(f.children));
    else result.push(f.path);
  });
  return result;
}

function startBotProcess(bot) {
  const botPath = path.join(BOTS_DIR, bot.id);
  if (!fs.existsSync(botPath)) return false;

  const language = bot.language;
  const envVars = {};
  const envFile = path.join(botPath, '.env');
  if (fs.existsSync(envFile)) {
    fs.readFileSync(envFile, 'utf-8').split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const [key, ...valueParts] = trimmed.split('=');
        envVars[key.trim()] = valueParts.join('=').trim();
      }
    });
  }
  const env = { ...process.env, ...envVars, HOME: '/tmp' };

  let cmd, args;
  if (language === 'nodejs') {
    const mainFile = ['index.js', 'bot.js', 'main.js', 'app.js'].find(f => fs.existsSync(path.join(botPath, f))) || 'index.js';
    cmd = 'node'; args = [mainFile];
  } else if (language === 'python') {
    const mainFile = ['main.py', 'bot.py', 'app.py'].find(f => fs.existsSync(path.join(botPath, f))) || 'main.py';
    cmd = 'python3'; args = [mainFile];
  } else { return false; }

  const proc = spawn(cmd, args, { cwd: botPath, env, shell: false });
  botProcesses.set(bot.id, proc);
  db.prepare('UPDATE bots SET status = ? WHERE id = ?').run('running', bot.id);
  addConsoleLog(bot.id, 'system', `Bot started (${language}: ${args.join(' ')})`);

  proc.stdout.on('data', data => {
    data.toString().split('\n').filter(Boolean).forEach(line => addConsoleLog(bot.id, 'output', line));
  });
  proc.stderr.on('data', data => {
    data.toString().split('\n').filter(Boolean).forEach(line => addConsoleLog(bot.id, 'error', line));
  });
  proc.on('close', code => {
    botProcesses.delete(bot.id);
    db.prepare('UPDATE bots SET status = ? WHERE id = ?').run('stopped', bot.id);
    addConsoleLog(bot.id, 'system', `Bot stopped (exit code: ${code})`);
    wss.clients.forEach(client => {
      if (client.readyState === 1 && client.botId === bot.id) {
        client.send(JSON.stringify({ type: 'status', botId: bot.id, status: 'stopped' }));
      }
    });
  });
  proc.on('error', err => {
    botProcesses.delete(bot.id);
    db.prepare('UPDATE bots SET status = ? WHERE id = ?').run('error', bot.id);
    addConsoleLog(bot.id, 'error', `Failed to start: ${err.message}`);
    wss.clients.forEach(client => {
      if (client.readyState === 1 && client.botId === bot.id) {
        client.send(JSON.stringify({ type: 'status', botId: bot.id, status: 'error' }));
      }
    });
  });
  return true;
}

function stopBotProcess(botId) {
  const proc = botProcesses.get(botId);
  if (proc) {
    try { proc.kill('SIGTERM'); } catch {}
    setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} }, 5000);
    botProcesses.delete(botId);
    db.prepare('UPDATE bots SET status = ? WHERE id = ?').run('stopped', botId);
    return true;
  }
  return false;
}

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
        const botPath = path.join(BOTS_DIR, botId);

        addConsoleLog(botId, 'input', `$ ${text}`);

        if (text === 'clear') {
          if (consoleBuffers.has(botId)) consoleBuffers.set(botId, []);
          ws.send(JSON.stringify({ type: 'clear', botId }));
          return;
        }

        if (text === 'help') {
          addConsoleLog(botId, 'system', '--- Available Commands ---');
          addConsoleLog(botId, 'system', '  start           - Start the bot');
          addConsoleLog(botId, 'system', '  stop            - Stop the bot');
          addConsoleLog(botId, 'system', '  restart         - Restart the bot');
          addConsoleLog(botId, 'system', '  install         - Install dependencies (npm install)');
          addConsoleLog(botId, 'system', '  install <pkg>   - Install a package');
          addConsoleLog(botId, 'system', '  ls              - List files');
          addConsoleLog(botId, 'system', '  cat <file>      - View file content');
          addConsoleLog(botId, 'system', '  node <file>     - Run a node file');
          addConsoleLog(botId, 'system', '  python <file>   - Run a python file');
          addConsoleLog(botId, 'system', '  clear           - Clear console');
          addConsoleLog(botId, 'system', '  npm <cmd>       - Run any npm command');
          addConsoleLog(botId, 'system', '  pip <cmd>       - Run any pip command');
          return;
        }

        if (text === 'start') {
          const proc = botProcesses.get(botId);
          if (proc) { addConsoleLog(botId, 'error', 'Bot is already running'); return; }
          if (!bot) { addConsoleLog(botId, 'error', 'Bot not found'); return; }

          if (!fs.existsSync(path.join(botPath, 'node_modules'))) {
            addConsoleLog(botId, 'system', 'Installing dependencies...');
            const result = await runShell('npm install 2>&1', botPath);
            addConsoleLog(botId, 'system', 'Dependencies ready');
          }

          const ok = startBotProcess(bot);
          if (!ok) addConsoleLog(botId, 'error', 'Failed to start bot');
          return;
        }

        if (text === 'stop') {
          const proc = botProcesses.get(botId);
          if (!proc) { addConsoleLog(botId, 'error', 'Bot is not running'); return; }
          stopBotProcess(botId);
          addConsoleLog(botId, 'system', 'Bot stopped');
          return;
        }

        if (text === 'restart') {
          const proc = botProcesses.get(botId);
          if (proc) stopBotProcess(botId);
          if (!bot) { addConsoleLog(botId, 'error', 'Bot not found'); return; }
          setTimeout(() => {
            if (!fs.existsSync(path.join(botPath, 'node_modules'))) {
              addConsoleLog(botId, 'system', 'Installing dependencies...');
              runShell('npm install 2>&1', botPath).then(() => {
                addConsoleLog(botId, 'system', 'Dependencies ready');
                startBotProcess(bot);
              });
            } else {
              startBotProcess(bot);
            }
          }, 1000);
          return;
        }

        if (text === 'install') {
          addConsoleLog(botId, 'system', 'Running npm install...');
          const result = await runShell('npm install 2>&1', botPath);
          if (result.stdout) result.stdout.split('\n').filter(Boolean).slice(-10).forEach(line => addConsoleLog(botId, 'output', line));
          if (result.stderr) result.stderr.split('\n').filter(Boolean).slice(-10).forEach(line => addConsoleLog(botId, 'error', line));
          addConsoleLog(botId, 'system', result.code === 0 ? 'Dependencies installed successfully' : `Install failed (exit code: ${result.code})`);
          return;
        }

        if (text.startsWith('install ')) {
          const pkg = text.slice(8).trim();
          addConsoleLog(botId, 'system', `Installing ${pkg}...`);
          const result = await runShell(`npm install ${pkg} 2>&1`, botPath);
          if (result.stdout) result.stdout.split('\n').filter(Boolean).slice(-10).forEach(line => addConsoleLog(botId, 'output', line));
          if (result.stderr) result.stderr.split('\n').filter(Boolean).slice(-10).forEach(line => addConsoleLog(botId, 'error', line));
          addConsoleLog(botId, 'system', result.code === 0 ? `${pkg} installed successfully` : `Install failed (exit code: ${result.code})`);
          return;
        }

        if (text === 'ls' || text === 'dir') {
          if (!fs.existsSync(botPath)) { addConsoleLog(botId, 'error', 'Bot directory not found'); return; }
          const entries = fs.readdirSync(botPath, { withFileTypes: true });
          const list = entries.map(e => {
            if (e.isDirectory()) return `[DIR]  ${e.name}/`;
            const size = fs.statSync(path.join(botPath, e.name)).size;
            return `       ${e.name} (${(size / 1024).toFixed(1)}KB)`;
          }).join('\n');
          addConsoleLog(botId, 'output', list || 'Empty directory');
          return;
        }

        if (text.startsWith('cat ')) {
          const fileName = text.slice(4).trim();
          const filePath = path.join(botPath, fileName);
          if (!fs.existsSync(filePath)) { addConsoleLog(botId, 'error', `File not found: ${fileName}`); return; }
          const content = fs.readFileSync(filePath, 'utf-8');
          addConsoleLog(botId, 'output', content);
          return;
        }

        if (text.startsWith('rm ')) {
          const fileName = text.slice(3).trim();
          const filePath = path.join(botPath, fileName);
          if (!fs.existsSync(filePath)) { addConsoleLog(botId, 'error', `File not found: ${fileName}`); return; }
          fs.rmSync(filePath, { recursive: true, force: true });
          addConsoleLog(botId, 'system', `Deleted: ${fileName}`);
          return;
        }

        if (text.startsWith('mkdir ')) {
          const dirName = text.slice(6).trim();
          fs.mkdirSync(path.join(botPath, dirName), { recursive: true });
          addConsoleLog(botId, 'system', `Created directory: ${dirName}`);
          return;
        }

        const proc = botProcesses.get(botId);
        if (proc && proc.stdin && !proc.stdin.destroyed) {
          proc.stdin.write(text + '\n');
          return;
        }

        addConsoleLog(botId, 'system', `Running: ${text}`);
        const result = await runShell(text + ' 2>&1', botPath);
        if (result.stdout) result.stdout.split('\n').filter(Boolean).forEach(line => addConsoleLog(botId, 'output', line));
        if (result.stderr) result.stderr.split('\n').filter(Boolean).forEach(line => addConsoleLog(botId, 'error', line));
        if (result.stdout && result.stdout.includes('not found')) {
          addConsoleLog(botId, 'system', result.code === 0 ? 'Command completed' : `Command failed (exit code: ${result.code})`);
        }
      }
    } catch (err) {
      console.error('WebSocket error:', err);
    }
  });
});

const upload = require('multer')({ storage: require('multer').memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
const uploadSingle = upload.single('file');

app.post('/api/upload', (req, res) => {
  uploadSingle(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    try {
      const zip = await JSZip.loadAsync(req.file.buffer);
      const botId = `bot-${Date.now()}`;
      const botPath = path.join(BOTS_DIR, botId);
      fs.mkdirSync(botPath, { recursive: true });

      const fileData = new Map();
      const promises = [];
      zip.forEach((filePath, zipEntry) => {
        if (!zipEntry.dir) {
          promises.push((async () => {
            const ext = filePath.split('.').pop()?.toLowerCase() || '';
            const baseName = path.basename(filePath);
            if (TEXT_EXTENSIONS.has(ext) || baseName === 'Dockerfile' || baseName === 'Procfile') {
              try {
                const text = await zipEntry.async('text');
                fileData.set(filePath, text);
                const outPath = path.join(botPath, filePath);
                fs.mkdirSync(path.dirname(outPath), { recursive: true });
                fs.writeFileSync(outPath, text, 'utf-8');
              } catch { fileData.set(filePath, ''); }
            }
          })());
        }
      });
      await Promise.all(promises);

      const flatNames = flattenFiles(Array.from(fileData.keys()).map(p => ({ path: p })));
      const language = detectLanguage(flatNames);
      const tree = buildTree(fileData, req.file.originalname.replace('.zip', ''));

      db.prepare('INSERT INTO bots (id, name, language, status) VALUES (?, ?, ?, ?)').run(
        botId, req.body.name || req.file.originalname.replace('.zip', ''), language, 'stopped'
      );

      const hasPackageJson = fs.existsSync(path.join(botPath, 'package.json'));

      addConsoleLog(botId, 'system', 'Bot uploaded successfully');
      addConsoleLog(botId, 'system', `Language: ${language} | Files: ${flatNames.length}`);

      if (language === 'nodejs' && hasPackageJson) {
        addConsoleLog(botId, 'system', 'Installing npm dependencies...');
        const result = await runShell('npm install 2>&1', botPath);
        const lines = (result.stdout + result.stderr).split('\n').filter(Boolean);
        lines.slice(-5).forEach(line => addConsoleLog(botId, 'output', line));

        if (fs.existsSync(path.join(botPath, 'node_modules'))) {
          addConsoleLog(botId, 'system', 'Dependencies installed successfully');
        } else {
          addConsoleLog(botId, 'error', 'Dependencies install failed. Run "install" in console.');
        }
      }

      res.json({
        bot: {
          id: botId, name: req.body.name || req.file.originalname.replace('.zip', ''),
          language, status: 'stopped', uptime: '0m',
          lastUpdate: new Date().toLocaleString('en-US'),
          envVars: {}, files: tree, console: consoleBuffers.get(botId) || [],
          plugins: [], resources: { cpu: 0, memory: 0, disk: flatNames.length },
        }
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
});

app.get('/api/bots', (req, res) => {
  const bots = db.prepare('SELECT * FROM bots').all();
  const result = bots.map(bot => {
    const botPath = path.join(BOTS_DIR, bot.id);
    let files = [];
    if (fs.existsSync(botPath)) {
      const readDir = (dir, prefix = '') => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        return entries.map(entry => {
          const fullPath = path.join(dir, entry.name);
          const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
          if (entry.isDirectory()) {
            return { name: entry.name, path: relPath, content: '', isDirectory: true, children: readDir(fullPath, relPath) };
          } else {
            let content = '';
            try {
              const ext = entry.name.split('.').pop()?.toLowerCase() || '';
              if (TEXT_EXTENSIONS.has(ext)) content = fs.readFileSync(fullPath, 'utf-8');
            } catch {}
            return { name: entry.name, path: relPath, content, isDirectory: false };
          }
        });
      };
      files = readDir(botPath);
    }
    const proc = botProcesses.get(bot.id);
    const isRunning = proc && !proc.killed;
    return {
      id: bot.id, name: bot.name, language: bot.language,
      status: isRunning ? 'running' : 'stopped',
      uptime: isRunning ? 'Active' : '0m',
      lastUpdate: bot.updated_at || new Date().toLocaleString('en-US'),
      envVars: {}, files, console: consoleBuffers.get(bot.id) || [],
      plugins: [],
      resources: { cpu: isRunning ? Math.floor(Math.random() * 30) + 5 : 0, memory: isRunning ? Math.floor(Math.random() * 200) + 50 : 0, disk: files.length },
    };
  });
  res.json(result);
});

app.post('/api/bots/:id/start', async (req, res) => {
  const bot = db.prepare('SELECT * FROM bots WHERE id = ?').get(req.params.id);
  if (!bot) return res.status(404).json({ error: 'Bot not found' });
  if (botProcesses.has(bot.id)) return res.status(400).json({ error: 'Bot is already running' });

  const botPath = path.join(BOTS_DIR, bot.id);

  if (bot.language === 'nodejs' && fs.existsSync(path.join(botPath, 'package.json')) && !fs.existsSync(path.join(botPath, 'node_modules'))) {
    addConsoleLog(bot.id, 'system', 'node_modules not found. Installing dependencies...');
    await runShell('npm install 2>&1', botPath);
    if (fs.existsSync(path.join(botPath, 'node_modules'))) {
      addConsoleLog(bot.id, 'system', 'Dependencies installed');
    } else {
      addConsoleLog(bot.id, 'error', 'Failed to install dependencies');
    }
  }

  const success = startBotProcess(bot);
  if (success) res.json({ status: 'running' });
  else res.status(500).json({ error: 'Failed to start bot' });
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

  const botPath = path.join(BOTS_DIR, bot.id);
  if (bot.language === 'nodejs' && fs.existsSync(path.join(botPath, 'package.json')) && !fs.existsSync(path.join(botPath, 'node_modules'))) {
    addConsoleLog(bot.id, 'system', 'Installing dependencies...');
    await runShell('npm install 2>&1', botPath);
  }

  setTimeout(() => {
    const success = startBotProcess(bot);
    if (success) res.json({ status: 'running' });
    else res.status(500).json({ error: 'Failed to restart bot' });
  }, 1000);
});

app.put('/api/bots/:id/files', (req, res) => {
  const bot = db.prepare('SELECT * FROM bots WHERE id = ?').get(req.params.id);
  if (!bot) return res.status(404).json({ error: 'Bot not found' });
  const filePath = req.body.filePath;
  if (!filePath) return res.status(400).json({ error: 'No file path' });
  const fullPath = path.join(BOTS_DIR, bot.id, filePath);
  if (!fullPath.startsWith(path.join(BOTS_DIR, bot.id))) return res.status(400).json({ error: 'Invalid path' });
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, req.body.content || '', 'utf-8');
  res.json({ success: true });
});

app.delete('/api/bots/:id', (req, res) => {
  const bot = db.prepare('SELECT * FROM bots WHERE id = ?').get(req.params.id);
  if (!bot) return res.status(404).json({ error: 'Bot not found' });
  stopBotProcess(bot.id);
  const botPath = path.join(BOTS_DIR, bot.id);
  if (fs.existsSync(botPath)) fs.rmSync(botPath, { recursive: true, force: true });
  db.prepare('DELETE FROM bots WHERE id = ?').run(bot.id);
  res.json({ success: true });
});

server.listen(PORT, () => {
  console.log(`FP9 Host API running on port ${PORT}`);
});
