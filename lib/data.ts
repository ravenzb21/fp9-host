export interface BotFile {
  name: string;
  path: string;
  content: string;
  isDirectory: boolean;
  children?: BotFile[];
}

export interface ConsoleLine {
  id: number;
  type: 'input' | 'output' | 'error' | 'system';
  text: string;
  timestamp: string;
}

export interface BotPlugin {
  id: string;
  name: string;
  description: string;
  icon: string;
  installed: boolean;
  category: 'media' | 'database' | 'api' | 'utility' | 'ai';
  size: string;
}

export type BotLanguage = 'nodejs' | 'discord.js' | 'telegram' | 'python' | 'java' | 'go' | 'ruby' | 'php' | 'unknown';
export type BotStatus = 'running' | 'stopped' | 'starting' | 'error';

export interface Bot {
  id: string;
  name: string;
  language: BotLanguage;
  status: BotStatus;
  hasPackageJson?: boolean;
  depStatus?: 'none' | 'installed' | 'missing' | 'missing-module' | 'ready';
  uptime: string;
  lastUpdate: string;
  envVars: Record<string, string>;
  files: BotFile[];
  console: ConsoleLine[];
  plugins: BotPlugin[];
  resources: {
    cpu: number;
    memory: number;
    disk: number;
  };
}

export interface User {
  id: string;
  username: string;
  avatar: string;
  discriminator: string;
  global_name: string;
  bots: Bot[];
}

export const supportedLanguages = [
  { id: 'discord.js' as BotLanguage, name: 'Discord.js', icon: '🤖', extensions: ['package.json', 'index.js', 'bot.js'], envTemplate: 'TOKEN=\nCLIENT_ID=\nGUILD_ID=' },
  { id: 'nodejs' as BotLanguage, name: 'Node.js', icon: '📦', extensions: ['package.json', 'index.js', 'app.js'], envTemplate: 'NODE_ENV=production\nTOKEN=\nPREFIX=!' },
  { id: 'python' as BotLanguage, name: 'Python', icon: '🐍', extensions: ['requirements.txt', 'main.py', 'bot.py'], envTemplate: 'TOKEN=\nPREFIX=!\nLOG_LEVEL=INFO' },
  { id: 'java' as BotLanguage, name: 'Java', icon: '☕', extensions: ['pom.xml', 'build.gradle', 'Main.java'], envTemplate: 'TOKEN=\nBOT_PREFIX=!' },
  { id: 'go' as BotLanguage, name: 'Go', icon: '🔷', extensions: ['go.mod', 'main.go'], envTemplate: 'TOKEN=\nBOT_PREFIX=!' },
  { id: 'ruby' as BotLanguage, name: 'Ruby', icon: '💎', extensions: ['Gemfile', 'main.rb', 'bot.rb'], envTemplate: 'TOKEN=\nPREFIX=!' },
  { id: 'php' as BotLanguage, name: 'PHP', icon: '🐘', extensions: ['composer.json', 'bot.php', 'index.php'], envTemplate: 'TOKEN=\nPREFIX=!' },
];

export function getFileIcon(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const icons: Record<string, string> = {
    js: '📜', ts: '📜', jsx: '📜', tsx: '📜', mjs: '📜', cjs: '📜',
    py: '🐍', java: '☕', go: '🔷', rb: '💎', php: '🐘',
    json: '📋', yaml: '📋', yml: '📋', toml: '📋',
    txt: '📄', md: '📝', html: '🌐', css: '🎨',
    env: '🔐', gitignore: '🙈',
    zip: '📦', tar: '📦', gz: '📦',
    png: '🖼️', jpg: '🖼️', gif: '🖼️', svg: '🖼️', webp: '🖼️',
  };
  return icons[ext] || '📄';
}

export function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export const availablePlugins: Omit<BotPlugin, 'installed'>[] = [
  { id: 'ffmpeg', name: 'FFmpeg', description: 'Audio/video processing for music bots', icon: '🎬', category: 'media', size: '85MB' },
  { id: 'sharp', name: 'Sharp', description: 'High-performance image processing', icon: '🖼️', category: 'media', size: '12MB' },
  { id: 'canvas', name: 'Canvas', description: 'Create images programmatically', icon: '🎨', category: 'media', size: '15MB' },
  { id: 'mongoose', name: 'Mongoose', description: 'MongoDB ODM for Node.js', icon: '🍃', category: 'database', size: '8MB' },
  { id: 'sqlite', name: 'SQLite', description: 'Lightweight SQL database', icon: '💾', category: 'database', size: '3MB' },
  { id: 'redis', name: 'Redis Client', description: 'Fast in-memory data store', icon: '⚡', category: 'database', size: '2MB' },
  { id: 'axios', name: 'Axios', description: 'HTTP client for API calls', icon: '🌐', category: 'api', size: '1MB' },
  { id: 'openai', name: 'OpenAI', description: 'GPT-4, DALL-E, Whisper integration', icon: '🤖', category: 'ai', size: '5MB' },
  { id: 'google-ai', name: 'Google AI (Gemini)', description: 'Google Gemini AI integration', icon: '🧠', category: 'ai', size: '4MB' },
  { id: 'cron', name: 'Node-Cron', description: 'Task scheduler for scheduled commands', icon: '⏰', category: 'utility', size: '1MB' },
  { id: 'winston', name: 'Winston Logger', description: 'Professional logging with rotation', icon: '📝', category: 'utility', size: '1MB' },
  { id: 'dotenv', name: 'Dotenv', description: 'Load .env files for secrets', icon: '🔐', category: 'utility', size: '0.5MB' },
  { id: 'express', name: 'Express', description: 'Web server for dashboards', icon: '🚀', category: 'api', size: '2MB' },
  { id: 'puppeteer', name: 'Puppeteer', description: 'Browser automation & screenshots', icon: '🌐', category: 'utility', size: '30MB' },
];
