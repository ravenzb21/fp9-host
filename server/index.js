const express = require('express');
const cors = require('cors');
const multer = require('multer');
const JSZip = require('jszip');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const Database = require('better-sqlite3');
const { WebSocketServer } = require('ws');
const http = require('http');
const { spawn } = require('child_process');

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

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
app.use(cors());
app.use(express.json());

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

const TEXT_EXTENSIONS = new Set([
  'js', 'ts', 'jsx', 'tsx', 'py', 'java', 'go', 'rb', 'php',
  'json', 'yaml', 'yml', 'toml', 'xml', 'txt', 'md', 'html', 'css',
  'env', 'gitignore', 'dockerfile', 'sh', 'bat', 'ps1', 'cfg', 'ini',
]);

function buildTree(fileData, rootName) {
  const tree = [];
  const dirMap = new Map();
  const sortedPaths = Array.from(fileData.keys()).sort();

  sortedPaths.forEach(fullPath => {
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

function detectLanguage(fileNames) {
  if (fileNames.some(f => f.includes('package.json'))) return 'nodejs';
  if (fileNames.some(f => f.includes('requirements.txt') || f.includes('setup.py') || f.includes('pyproject.toml'))) return 'python';
  if (fileNames.some(f => f.includes('pom.xml') || f.includes('build.gradle'))) return 'java';
  if (fileNames.some(f => f.includes('go.mod'))) return 'go';
  if (fileNames.some(f => f.includes('Gemfile'))) return 'ruby';
  if (fileNames.some(f => f.includes('composer.json'))) return 'php';
  return 'unknown';
}

function flattenFiles(files) {
  const result = [];
  files.forEach(f => {
    if (f.isDirectory && f.children) result.push(...flattenFiles(f.children));
    else result.push(f.path);
  });
  return result;
}

function installDeps(botPath, language) {
  return new Promise((resolve, reject) => {
    let cmd, args;
    if (language === 'nodejs') {
      if (fs.existsSync(path.join(botPath, 'package.json'))) {
        cmd = 'npm';
        args = ['install'];
      } else { return resolve(); }
    } else if (language === 'python') {
      if (fs.existsSync(path.join(botPath, 'requirements.txt'))) {
        cmd = 'pip';
        args = ['install', '-r', 'requirements.txt'];
      } else { return resolve(); }
    } else { return resolve(); }

    const proc = spawn(cmd, args, { cwd: botPath, shell: true });
    let output = '';
    proc.stdout.on('data', d => output += d.toString());
    proc.stderr.on('data', d => output += d.toString());
    proc.on('close', () => resolve(output));
    proc.on('error', err => reject(err));
  });
}

function startBotProcess(bot) {
  const botPath = path.join(BOTS_DIR, bot.id);
  if (!fs.existsSync(botPath)) return false;

  const language = bot.language;
  let cmd, args, env;

  const envVars = {};
  const envFile = path.join(botPath, '.env');
  if (fs.existsSync(envFile)) {
    const lines = fs.readFileSync(envFile, 'utf-8').split('\n');
    lines.forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const [key, ...valueParts] = trimmed.split('=');
        envVars[key.trim()] = valueParts.join('=').trim();
      }
    });
  }
  env = { ...process.env, ...envVars };

  if (language === 'nodejs') {
    const mainFile = fs.existsSync(path.join(botPath, 'index.js')) ? 'index.js' :
                     fs.existsSync(path.join(botPath, 'bot.js')) ? 'bot.js' :
                     fs.existsSync(path.join(botPath, 'main.js')) ? 'main.js' : 'index.js';
    cmd = 'node';
    args = [mainFile];
  } else if (language === 'python') {
    const mainFile = fs.existsSync(path.join(botPath, 'main.py')) ? 'main.py' :
                     fs.existsSync(path.join(botPath, 'bot.py')) ? 'bot.py' :
                     fs.existsSync(path.join(botPath, 'app.py')) ? 'app.py' : 'main.py';
    cmd = 'python';
    args = [mainFile];
  } else {
    return false;
  }

  const proc = spawn(cmd, args, { cwd: botPath, env, shell: true });

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
    setTimeout(() => {
      try { proc.kill('SIGKILL'); } catch {}
    }, 5000);
    botProcesses.delete(botId);
    db.prepare('UPDATE bots SET status = ? WHERE id = ?').run('stopped', botId);
    return true;
  }
  return false;
}

wss.on('connection', (ws) => {
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      if (msg.type === 'subscribe') {
        ws.botId = msg.botId;
        const logs = consoleBuffers.get(msg.botId) || [];
        logs.forEach(log => {
          ws.send(JSON.stringify({ type: 'console', botId: msg.botId, data: log }));
        });
      }
      if (msg.type === 'input') {
        const proc = botProcesses.get(msg.botId);
        if (proc && proc.stdin && !proc.stdin.destroyed) {
          proc.stdin.write(msg.text + '\n');
          addConsoleLog(msg.botId, 'input', msg.text);
        }
      }
    } catch {}
  });
});

app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

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
            } catch {
              fileData.set(filePath, '');
            }
          }
        })());
      }
    });

    await Promise.all(promises);

    const flatNames = flattenFiles(Array.from(fileData.keys()).map(p => ({ path: p })));
    const language = detectLanguage(flatNames);
    const tree = buildTree(fileData, req.file.originalname.replace('.zip', ''));

    db.prepare('INSERT INTO bots (id, name, language, status) VALUES (?, ?, ?, ?)').run(
      botId,
      req.body.name || req.file.originalname.replace('.zip', ''),
      language,
      'stopped'
    );

    if (language === 'nodejs' && fs.existsSync(path.join(botPath, 'package.json'))) {
      addConsoleLog(botId, 'system', 'Installing dependencies...');
      try {
        await installDeps(botPath, language);
        addConsoleLog(botId, 'system', 'Dependencies installed successfully');
      } catch (err) {
        addConsoleLog(botId, 'error', `Failed to install dependencies: ${err.message}`);
      }
    }

    res.json({
      bot: {
        id: botId,
        name: req.body.name || req.file.originalname.replace('.zip', ''),
        language,
        status: 'stopped',
        uptime: '0m',
        lastUpdate: new Date().toLocaleString('en-US'),
        envVars: {},
        files: tree,
        console: consoleBuffers.get(botId) || [],
        plugins: [],
        resources: { cpu: 0, memory: 0, disk: flatNames.length },
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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
      id: bot.id,
      name: bot.name,
      language: bot.language,
      status: isRunning ? 'running' : 'stopped',
      uptime: isRunning ? 'Active' : '0m',
      lastUpdate: bot.updated_at || new Date().toLocaleString('en-US'),
      envVars: {},
      files,
      console: consoleBuffers.get(bot.id) || [],
      plugins: [],
      resources: { cpu: isRunning ? Math.floor(Math.random() * 30) + 5 : 0, memory: isRunning ? Math.floor(Math.random() * 200) + 50 : 0, disk: files.length },
    };
  });
  res.json(result);
});

app.get('/api/bots/:id', (req, res) => {
  const bot = db.prepare('SELECT * FROM bots WHERE id = ?').get(req.params.id);
  if (!bot) return res.status(404).json({ error: 'Bot not found' });

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

  res.json({
    id: bot.id,
    name: bot.name,
    language: bot.language,
    status: isRunning ? 'running' : 'stopped',
    uptime: isRunning ? 'Active' : '0m',
    lastUpdate: bot.updated_at || new Date().toLocaleString('en-US'),
    envVars: {},
    files,
    console: consoleBuffers.get(bot.id) || [],
    plugins: [],
    resources: { cpu: isRunning ? Math.floor(Math.random() * 30) + 5 : 0, memory: isRunning ? Math.floor(Math.random() * 200) + 50 : 0, disk: files.length },
  });
});

app.post('/api/bots/:id/start', (req, res) => {
  const bot = db.prepare('SELECT * FROM bots WHERE id = ?').get(req.params.id);
  if (!bot) return res.status(404).json({ error: 'Bot not found' });
  if (botProcesses.has(bot.id)) return res.status(400).json({ error: 'Bot is already running' });

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

app.post('/api/bots/:id/restart', (req, res) => {
  const bot = db.prepare('SELECT * FROM bots WHERE id = ?').get(req.params.id);
  if (!bot) return res.status(404).json({ error: 'Bot not found' });

  stopBotProcess(bot.id);
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
  if (!filePath) return res.status(400).json({ error: 'No file path provided' });

  const fullPath = path.join(BOTS_DIR, bot.id, filePath);
  if (!fullPath.startsWith(path.join(BOTS_DIR, bot.id))) {
    return res.status(400).json({ error: 'Invalid path' });
  }

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
  console.log(`FP9 Host backend running on http://localhost:${PORT}`);
});
