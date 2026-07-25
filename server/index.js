const express = require('express');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { exec } = require('child_process');
const { randomBytes } = require('crypto');
const Database = require('better-sqlite3');
const { WebSocketServer } = require('ws');
const JSZip = require('jszip');
const multer = require('multer');

const PORT = process.env.PORT || 3001;
const DATA_DIR = path.join(__dirname, '..', 'data');
const BOTS_DIR = path.join(__dirname, '..', 'bots');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(BOTS_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'fp9.db'));
db.pragma('journal_mode = WAL');
db.exec(`CREATE TABLE IF NOT EXISTS bots (
  id TEXT PRIMARY KEY, name TEXT, language TEXT DEFAULT 'unknown',
  status TEXT DEFAULT 'stopped', owner_id TEXT,
  has_package INT DEFAULT 0, deps_hash TEXT,
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
)`);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});
app.use(express.json({ limit: '50mb' }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

const TEXT_EXTS = new Set([
  'js', 'ts', 'mjs', 'cjs', 'jsx', 'tsx', 'py', 'java', 'go', 'rb', 'php',
  'json', 'yaml', 'yml', 'toml', 'xml', 'txt', 'md', 'html', 'css',
  'env', 'sh', 'bat', 'ps1', 'cfg', 'ini', 'gitignore', 'dockerfile',
  'lock', 'gradle', 'properties',
]);

const botProcs = new Map();
const botLogs = new Map();

function log(botId, type, text) {
  if (!botLogs.has(botId)) botLogs.set(botId, []);
  const entry = { id: Date.now() + Math.random(), type, text, t: new Date().toLocaleTimeString() };
  const arr = botLogs.get(botId);
  arr.push(entry);
  if (arr.length > 1000) arr.splice(0, arr.length - 1000);
  wss.clients.forEach(c => { if (c.readyState === 1 && c.botId === botId) c.send(JSON.stringify({ type: 'log', botId, data: entry })); });
  return entry;
}

function broadcast(botId, msg) {
  const s = JSON.stringify({ ...msg, botId });
  wss.clients.forEach(c => { if (c.readyState === 1 && (!c.botId || c.botId === botId)) c.send(s); });
}

function execAsync(cmd, cwd) {
  return new Promise(resolve => {
    exec(cmd, { cwd, env: { ...process.env }, timeout: 120000 }, (err, stdout, stderr) => {
      resolve({ code: err ? (err.code || 1) : 0, stdout: stdout || '', stderr: stderr || '' });
    });
  });
}

function getBotDir(id) { return path.join(BOTS_DIR, id); }

function readTree(botDir) {
  if (!fs.existsSync(botDir)) return [];
  const visited = new Set();
  const root = { name: path.basename(botDir), path: '', children: [] };
  const stack = [{ dir: botDir, node: root, depth: 0 }];
  while (stack.length) {
    const { dir, node, depth } = stack.pop();
    if (depth > 30 || visited.has(dir)) continue;
    visited.add(dir);
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (e.name.startsWith('.') || e.name === 'node_modules' || e.isSymbolicLink()) continue;
      const full = path.join(dir, e.name);
      const rel = path.relative(botDir, full).replace(/\\/g, '/');
      if (e.isDirectory()) {
        const child = { name: e.name, path: rel, isDirectory: true, children: [] };
        node.children.push(child);
        stack.push({ dir: full, node: child, depth: depth + 1 });
      } else {
        let content = '';
        const ext = e.name.split('.').pop()?.toLowerCase() || '';
        if (TEXT_EXTS.has(ext)) try { content = fs.readFileSync(full, 'utf-8'); } catch {}
        node.children.push({ name: e.name, path: rel, isDirectory: false, content });
      }
    }
  }
  return root.children;
}

function flatCount(tree) {
  let n = 0;
  const s = [...tree];
  while (s.length) { const x = s.pop(); if (x.isDirectory) s.push(...(x.children || [])); else n++; }
  return n;
}

function detectLang(files, botDir) {
  const names = files.map(f => path.basename(f));
  if (names.some(n => n === 'package.json')) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(botDir, 'package.json'), 'utf-8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps['discord.js']) return 'discord.js';
      if (deps['telegraf'] || deps['node-telegram-bot-api']) return 'telegram';
      return 'nodejs';
    } catch { return 'nodejs'; }
  }
  if (names.some(n => n === 'requirements.txt' || n.endsWith('.py'))) return 'python';
  if (names.some(n => n === 'go.mod')) return 'go';
  if (names.some(n => n === 'Gemfile')) return 'ruby';
  if (names.some(n => n === 'composer.json')) return 'php';
  if (names.some(n => n.endsWith('.js') || n.endsWith('.ts'))) return 'nodejs';
  return 'unknown';
}

function findMain(botDir, lang) {
  const order = {
    'discord.js': ['index.js', 'bot.js', 'main.js'],
    'telegram': ['index.js', 'bot.js', 'main.js'],
    'nodejs': ['index.js', 'bot.js', 'main.js', 'server.js', 'app.js'],
    'python': ['main.py', 'bot.py', 'app.py', 'run.py'],
  };
  for (const f of (order[lang] || [])) { if (fs.existsSync(path.join(botDir, f))) return f; }
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(botDir, 'package.json'), 'utf-8'));
    if (pkg.main && fs.existsSync(path.join(botDir, pkg.main))) return pkg.main;
  } catch {}
  const files = fs.readdirSync(botDir).filter(f => /\.(js|ts|mjs|py)$/.test(f));
  return files[0] || 'index.js';
}

function depsHash(botDir) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(botDir, 'package.json'), 'utf-8'));
    const deps = Object.keys(pkg.dependencies || {}).sort().join(',');
    return deps.length + ':' + randomBytes(2).toString('hex');
  } catch { return ''; }
}

async function ensureDeps(botId, botDir) {
  if (!fs.existsSync(path.join(botDir, 'package.json'))) return true;
  const hash = depsHash(botDir);
  const row = db.prepare('SELECT deps_hash FROM bots WHERE id = ?').get(botId);
  if (row && row.deps_hash === hash && fs.existsSync(path.join(botDir, 'node_modules'))) {
    log(botId, 'system', 'Dependencies up to date');
    return true;
  }
  log(botId, 'system', 'Installing dependencies...');
  const r = await execAsync('npm install --no-optional --no-audit --no-fund 2>&1', botDir);
  (r.stdout || '').split('\n').filter(Boolean).slice(-6).forEach(l => log(botId, 'output', l));
  if (r.stderr) r.stderr.split('\n').filter(Boolean).slice(-3).forEach(l => log(botId, 'error', l));
  if (fs.existsSync(path.join(botDir, 'node_modules'))) {
    db.prepare('UPDATE bots SET deps_hash = ? WHERE id = ?').run(hash, botId);
    const count = fs.readdirSync(path.join(botDir, 'node_modules')).filter(x => !x.startsWith('.')).length;
    log(botId, 'system', `Done. ${count} packages installed.`);
    return true;
  }
  log(botId, 'error', 'npm install failed');
  return false;
}

function startProc(bot) {
  const dir = getBotDir(bot.id);
  if (!fs.existsSync(dir)) return false;
  const main = findMain(dir, bot.language);
  const env = { ...process.env, HOME: '/tmp' };
  const envFile = path.join(dir, '.env');
  if (fs.existsSync(envFile)) {
    fs.readFileSync(envFile, 'utf-8').split('\n').forEach(line => {
      const t = line.trim();
      if (t && !t.startsWith('#') && t.includes('=')) {
        const i = t.indexOf('=');
        env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
      }
    });
  }
  const isNode = ['discord.js', 'telegram', 'nodejs'].includes(bot.language);
  const isPy = bot.language === 'python';
  if (!isNode && !isPy) return false;
  const cmd = isNode ? 'node' : 'python3';
  const proc = require('child_process').spawn(cmd, [main], { cwd: dir, env, stdio: ['pipe', 'pipe', 'pipe'], shell: false });
  botProcs.set(bot.id, proc);
  db.prepare('UPDATE bots SET status = ?, updated_at = datetime("now") WHERE id = ?').run('running', bot.id);
  log(bot.id, 'system', `Started (${bot.language}: ${main})`);
  broadcast(bot.id, { type: 'status', status: 'running' });
  proc.stdout.on('data', d => d.toString().split('\n').filter(Boolean).forEach(l => log(bot.id, 'output', l)));
  proc.stderr.on('data', d => d.toString().split('\n').filter(Boolean).forEach(l => log(bot.id, 'error', l)));
  proc.on('close', code => {
    botProcs.delete(bot.id);
    db.prepare('UPDATE bots SET status = ?, updated_at = datetime("now") WHERE id = ?').run('stopped', bot.id);
    log(bot.id, 'system', `Stopped (exit: ${code})`);
    broadcast(bot.id, { type: 'status', status: 'stopped' });
  });
  proc.on('error', err => {
    botProcs.delete(bot.id);
    db.prepare('UPDATE bots SET status = ?, updated_at = datetime("now") WHERE id = ?').run('error', bot.id);
    log(bot.id, 'error', `Error: ${err.message}`);
    broadcast(bot.id, { type: 'status', status: 'error' });
  });
  return true;
}

function stopProc(botId) {
  const proc = botProcs.get(botId);
  if (!proc) return false;
  try { proc.kill('SIGTERM'); } catch {}
  setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} }, 5000);
  return true;
}

// === API Routes ===

app.get('/', (req, res) => res.json({ name: 'FP9 Host', version: '3.0.0', status: 'ok' }));

app.get('/api/health', (req, res) => res.json({ ok: true, uptime: process.uptime() }));

app.post('/api/auth/discord', async (req, res) => {
  try {
    const { code, redirectUri } = req.body;
    if (!code) return res.status(400).json({ error: 'No code' });
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID || '1530409781045493882',
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code', code,
        redirect_uri: redirectUri || 'https://fp9.netlify.app/callback',
      }),
    });
    const token = await tokenRes.json();
    if (token.error) return res.status(400).json({ error: token.error_description || token.error });
    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    const user = await userRes.json();
    res.json({ access_token: token.access_token, user });
  } catch (e) {
    res.status(500).json({ error: 'Auth failed' });
  }
});

app.post('/api/upload', (req, res) => {
  upload.single('file')(req, res, async err => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file' });
    try {
      const zip = await JSZip.loadAsync(req.file.buffer);
      const botId = `bot-${Date.now()}`;
      const dir = getBotDir(botId);
      fs.mkdirSync(dir, { recursive: true });
      const fileNames = [];
      const tasks = [];
      zip.forEach((name, entry) => {
        if (entry.dir) return;
        tasks.push((async () => {
          const ext = name.split('.').pop()?.toLowerCase() || '';
          const base = path.basename(name);
          if (TEXT_EXTS.has(ext) || ['Dockerfile', 'Procfile', '.env'].includes(base)) {
            try {
              const text = await entry.async('text');
              const out = path.join(dir, name);
              fs.mkdirSync(path.dirname(out), { recursive: true });
              fs.writeFileSync(out, text, 'utf-8');
              fileNames.push(name);
            } catch {}
          }
        })());
      });
      await Promise.all(tasks);
      const botName = req.body.name || path.basename(req.file.originalname, '.zip').replace(/_/g, ' ');
      const lang = detectLang(fileNames, dir);
      const hasPkg = fs.existsSync(path.join(dir, 'package.json'));
      db.prepare('INSERT INTO bots (id, name, language, status, has_package) VALUES (?,?,?,?,?)').run(botId, botName, lang, 'stopped', hasPkg ? 1 : 0);
      log(botId, 'system', `Uploaded: ${botName}`);
      log(botId, 'system', `Language: ${lang} | Files: ${fileNames.length}`);
      if (hasPkg) await ensureDeps(botId, dir);
      const tree = readTree(dir);
      const count = flatCount(tree);
      res.json({
        bot: { id: botId, name: botName, language: lang, status: 'stopped', hasPackageJson: hasPkg,
          uptime: '0m', mainFile: hasPkg ? findMain(dir, lang) : null,
          lastUpdate: new Date().toLocaleString('en-US'), files: tree, console: botLogs.get(botId) || [],
          plugins: [], envVars: {}, resources: { cpu: 0, memory: 0, disk: count } },
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
});

app.get('/api/bots', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM bots ORDER BY created_at DESC').all();
    const result = rows.map(bot => {
      const dir = getBotDir(bot.id);
      const tree = readTree(dir);
      const running = botProcs.has(bot.id) && !botProcs.get(bot.id).killed;
      let depStatus = 'none';
      if (bot.has_package) {
        const nm = fs.existsSync(path.join(dir, 'node_modules'));
        depStatus = nm ? 'ready' : 'missing';
      }
      return { id: bot.id, name: bot.name, language: bot.language, status: running ? 'running' : bot.status || 'stopped',
        hasPackageJson: !!bot.has_package, depStatus, uptime: running ? 'Active' : '0m',
        lastUpdate: bot.updated_at || bot.created_at, files: tree, console: botLogs.get(bot.id) || [],
        plugins: [], envVars: {}, resources: { cpu: running ? Math.floor(Math.random() * 20) + 3 : 0,
          memory: running ? Math.floor(Math.random() * 150) + 30 : 0, disk: flatCount(tree) } };
    });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/bots/:id', (req, res) => {
  try {
    const bot = db.prepare('SELECT * FROM bots WHERE id = ?').get(req.params.id);
    if (!bot) return res.status(404).json({ error: 'Not found' });
    const dir = getBotDir(bot.id);
    const tree = readTree(dir);
    const running = botProcs.has(bot.id) && !botProcs.get(bot.id).killed;
    res.json({ id: bot.id, name: bot.name, language: bot.language, status: running ? 'running' : bot.status || 'stopped',
      hasPackageJson: !!bot.has_package, uptime: running ? 'Active' : '0m',
      lastUpdate: bot.updated_at || bot.created_at, files: tree, console: botLogs.get(bot.id) || [],
      plugins: [], envVars: {}, resources: { cpu: running ? Math.floor(Math.random() * 20) + 3 : 0,
        memory: running ? Math.floor(Math.random() * 150) + 30 : 0, disk: flatCount(tree) } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/bots/:id/start', async (req, res) => {
  try {
    const bot = db.prepare('SELECT * FROM bots WHERE id = ?').get(req.params.id);
    if (!bot) return res.status(404).json({ error: 'Not found' });
    if (botProcs.has(bot.id)) return res.json({ status: 'already_running' });
    const dir = getBotDir(bot.id);
    if (['discord.js', 'telegram', 'nodejs'].includes(bot.language)) {
      if (!fs.existsSync(path.join(dir, 'package.json'))) return res.status(400).json({ error: 'No package.json' });
      const ok = await ensureDeps(bot.id, dir);
      if (!ok) return res.status(400).json({ error: 'Dependency installation failed. Try "install" in console.' });
      if (bot.language === 'discord.js' && !fs.existsSync(path.join(dir, 'node_modules', 'discord.js'))) {
        log(bot.id, 'system', 'Installing discord.js...');
        await execAsync('npm install discord.js --no-optional 2>&1', dir);
        if (!fs.existsSync(path.join(dir, 'node_modules', 'discord.js')))
          return res.status(400).json({ error: 'Failed to install discord.js' });
      }
    }
    startProc(bot) ? res.json({ status: 'running' }) : res.status(500).json({ error: 'Failed to start' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/bots/:id/stop', (req, res) => {
  try {
    const bot = db.prepare('SELECT * FROM bots WHERE id = ?').get(req.params.id);
    if (!bot) return res.status(404).json({ error: 'Not found' });
    stopProc(bot.id);
    res.json({ status: 'stopped' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/bots/:id/restart', async (req, res) => {
  try {
    const bot = db.prepare('SELECT * FROM bots WHERE id = ?').get(req.params.id);
    if (!bot) return res.status(404).json({ error: 'Not found' });
    stopProc(bot.id);
    const dir = getBotDir(bot.id);
    if (['discord.js', 'telegram', 'nodejs'].includes(bot.language)) await ensureDeps(bot.id, dir);
    setTimeout(() => startProc(bot) ? res.json({ status: 'running' }) : res.status(500).json({ error: 'Failed' }), 1500);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/bots/:id/files', (req, res) => {
  try {
    const bot = db.prepare('SELECT * FROM bots WHERE id = ?').get(req.params.id);
    if (!bot) return res.status(404).json({ error: 'Not found' });
    const filePath = req.body.filePath;
    if (!filePath || typeof filePath !== 'string') return res.status(400).json({ error: 'No file path' });
    const botDir = path.resolve(getBotDir(bot.id));
    const clean = filePath.replace(/\\/g, '/').replace(/^\/+/, '');
    const full = path.resolve(path.join(botDir, clean));
    if (!full.startsWith(botDir + path.sep)) return res.status(400).json({ error: 'Invalid path' });
    const dir = path.dirname(full);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(full, String(req.body.content || ''), 'utf-8');
    db.prepare('UPDATE bots SET updated_at = datetime("now") WHERE id = ?').run(bot.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/bots/:id', (req, res) => {
  try {
    const bot = db.prepare('SELECT * FROM bots WHERE id = ?').get(req.params.id);
    if (!bot) return res.status(404).json({ error: 'Not found' });
    stopProc(bot.id);
    const dir = getBotDir(bot.id);
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    db.prepare('DELETE FROM bots WHERE id = ?').run(bot.id);
    botLogs.delete(bot.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// === WebSocket ===

wss.on('connection', ws => {
  ws.on('message', async data => {
    try {
      const msg = JSON.parse(data);
      if (msg.type === 'sub') {
        ws.botId = msg.botId;
        (botLogs.get(msg.botId) || []).forEach(e => ws.send(JSON.stringify({ type: 'log', botId: msg.botId, data: e })));
        return;
      }
      if (msg.type !== 'cmd') return;
      const botId = msg.botId;
      const text = (msg.text || '').trim();
      if (!text) return;
      const bot = db.prepare('SELECT * FROM bots WHERE id = ?').get(botId);
      const dir = getBotDir(botId);

      const send = (type, t) => {
        const e = log(botId, type, t);
        ws.send(JSON.stringify({ type: 'log', botId, data: e }));
      };

      send('input', `$ ${text}`);

      if (text === 'clear') { botLogs.set(botId, []); return ws.send(JSON.stringify({ type: 'clear', botId })); }

      if (text === 'help') {
        send('system', 'Commands: start, stop, restart, install, install <pkg>, uninstall <pkg>,');
        send('system', '  ls, cat <file>, edit <file> <content>, rm <file>, mkdir <dir>,');
        send('system', '  npm <cmd>, node <file>, python <file>, status, env, deps, clear');
        return;
      }

      if (text === 'start') {
        if (botProcs.has(botId)) return send('error', 'Already running');
        if (!bot) return send('error', 'Bot not found');
        if (!fs.existsSync(dir)) return send('error', 'Bot dir not found');
        if (['discord.js', 'telegram', 'nodejs'].includes(bot.language)) {
          const ok = await ensureDeps(botId, dir);
          if (!ok) return send('error', 'Deps not installed');
          if (bot.language === 'discord.js' && !fs.existsSync(path.join(dir, 'node_modules', 'discord.js'))) {
            send('system', 'Installing discord.js...');
            await execAsync('npm install discord.js 2>&1', dir);
            if (!fs.existsSync(path.join(dir, 'node_modules', 'discord.js'))) return send('error', 'Failed to install discord.js');
          }
        }
        startProc(bot);
        return;
      }

      if (text === 'stop') {
        if (!botProcs.has(botId)) return send('error', 'Not running');
        stopProc(botId);
        send('system', 'Stopped');
        return;
      }

      if (text === 'restart') {
        const was = botProcs.has(botId);
        if (was) stopProc(botId);
        if (!bot) return send('error', 'Not found');
        setTimeout(async () => {
          if (['discord.js', 'telegram', 'nodejs'].includes(bot.language)) await ensureDeps(botId, dir);
          startProc(bot);
        }, was ? 1500 : 500);
        return;
      }

      if (text === 'status') {
        if (!bot) return send('error', 'Not found');
        send('system', `Name: ${bot.name}`);
        send('system', `Language: ${bot.language}`);
        send('system', `Status: ${botProcs.has(botId) ? 'Running' : 'Stopped'}`);
        send('system', `Package.json: ${bot.has_package ? 'Yes' : 'No'}`);
        if (bot.has_package) {
          const nm = fs.existsSync(path.join(dir, 'node_modules'));
          send('system', `node_modules: ${nm ? 'Found' : 'Missing'}`);
          if (nm) {
            const n = fs.readdirSync(path.join(dir, 'node_modules')).filter(x => !x.startsWith('.')).length;
            send('system', `Packages: ${n}`);
          }
        }
        return;
      }

      if (text === 'env') {
        const ef = path.join(dir, '.env');
        if (!fs.existsSync(ef)) return send('output', '(no .env)');
        send('output', fs.readFileSync(ef, 'utf-8') || '(empty)');
        return;
      }

      if (text === 'deps') {
        if (!bot || !bot.has_package) return send('error', 'No package.json');
        try {
          const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8'));
          const deps = pkg.dependencies || {};
          const keys = Object.keys(deps);
          if (!keys.length) return send('output', 'No dependencies');
          send('system', `${keys.length} dependencies:`);
          keys.forEach(n => send('output', `  ${fs.existsSync(path.join(dir, 'node_modules', n)) ? '✓' : '✗'} ${n}@${deps[n]}`));
        } catch { send('error', 'Parse error'); }
        return;
      }

      if (text === 'install') {
        if (bot && bot.has_package) await ensureDeps(botId, dir);
        else {
          const r = await execAsync('npm install 2>&1', dir);
          (r.stdout || '').split('\n').filter(Boolean).slice(-8).forEach(l => send('output', l));
          send('system', r.code === 0 ? 'Done' : `Failed (${r.code})`);
        }
        return;
      }

      if (text.startsWith('install ')) {
        const pkg = text.slice(8).trim();
        send('system', `Installing ${pkg}...`);
        const r = await execAsync(`npm install ${pkg} 2>&1`, dir);
        (r.stdout || '').split('\n').filter(Boolean).slice(-6).forEach(l => send('output', l));
        send('system', r.code === 0 ? `Installed ${pkg}` : 'Failed');
        return;
      }

      if (text.startsWith('uninstall ')) {
        const pkg = text.slice(10).trim();
        const r = await execAsync(`npm uninstall ${pkg} 2>&1`, dir);
        (r.stdout || '').split('\n').filter(Boolean).slice(-4).forEach(l => send('output', l));
        send('system', r.code === 0 ? `Removed ${pkg}` : 'Failed');
        return;
      }

      if (text === 'ls' || text === 'dir') {
        if (!fs.existsSync(dir)) return send('error', 'Dir not found');
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        entries.forEach(e => {
          if (e.name === 'node_modules') send('output', '  📦 node_modules/');
          else if (e.isDirectory()) send('output', `  📁 ${e.name}/`);
          else send('output', `  📄 ${e.name} (${(fs.statSync(path.join(dir, e.name)).size / 1024).toFixed(1)}KB)`);
        });
        if (!entries.length) send('output', '(empty)');
        return;
      }

      if (text.startsWith('cat ')) {
        const fn = text.slice(4).trim();
        const fp = path.join(dir, fn);
        if (!fp.startsWith(path.resolve(dir))) return send('error', 'Invalid path');
        if (!fs.existsSync(fp)) return send('error', `Not found: ${fn}`);
        const content = fs.readFileSync(fp, 'utf-8');
        const lines = content.split('\n');
        (lines.length > 150 ? lines.slice(0, 150) : lines).forEach(l => send('output', l));
        if (lines.length > 150) send('system', `... ${lines.length - 150} more lines`);
        return;
      }

      if (text.startsWith('edit ')) {
        const rest = text.slice(5).trim();
        const i = rest.indexOf(' ');
        if (i === -1) return send('error', 'Usage: edit <file> <content>');
        const fn = rest.slice(0, i);
        const content = rest.slice(i + 1);
        const fp = path.join(dir, fn);
        if (!fp.startsWith(path.resolve(dir))) return send('error', 'Invalid path');
        fs.mkdirSync(path.dirname(fp), { recursive: true });
        fs.writeFileSync(fp, content, 'utf-8');
        send('system', `Written to ${fn}`);
        return;
      }

      if (text.startsWith('rm ')) {
        const fn = text.slice(3).trim();
        const fp = path.join(dir, fn);
        if (!fp.startsWith(path.resolve(dir))) return send('error', 'Invalid path');
        if (!fs.existsSync(fp)) return send('error', `Not found: ${fn}`);
        fs.rmSync(fp, { recursive: true, force: true });
        send('system', `Deleted ${fn}`);
        return;
      }

      if (text.startsWith('mkdir ')) {
        const dn = text.slice(6).trim();
        fs.mkdirSync(path.join(dir, dn), { recursive: true });
        send('system', `Created ${dn}/`);
        return;
      }

      const proc = botProcs.get(botId);
      if (proc && proc.stdin && !proc.stdin.destroyed) {
        proc.stdin.write(text + '\n');
        return;
      }

      send('system', `Running: ${text}`);
      const r = await execAsync(text + ' 2>&1', dir);
      (r.stdout || '').split('\n').filter(Boolean).forEach(l => send('output', l));
      send('system', r.code === 0 ? 'Done' : `Failed (${r.code})`);
    } catch (e) { console.error('WS error:', e); }
  });
});

server.listen(PORT, () => {
  console.log(`FP9 Host v3.0.0 running on port ${PORT}`);
});
