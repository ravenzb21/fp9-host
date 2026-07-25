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

export interface Bot {
  id: string;
  name: string;
  language: 'nodejs' | 'python' | 'java' | 'go' | 'ruby' | 'php' | 'unknown';
  status: 'running' | 'stopped' | 'starting' | 'error';
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
  { id: 'nodejs', name: 'Node.js', icon: '📦', extensions: ['package.json', 'index.js', 'app.js', 'bot.js'], envTemplate: 'NODE_ENV=production\nTOKEN=\nPREFIX=!\nOWNER_ID=' },
  { id: 'python', name: 'Python', icon: '🐍', extensions: ['requirements.txt', 'main.py', 'bot.py', 'app.py'], envTemplate: 'TOKEN=\nPREFIX=! \nLOG_LEVEL=INFO' },
  { id: 'java', name: 'Java', icon: '☕', extensions: ['pom.xml', 'build.gradle', 'Main.java'], envTemplate: 'TOKEN=\nBOT_PREFIX=!' },
  { id: 'go', name: 'Go', icon: '🔷', extensions: ['go.mod', 'main.go'], envTemplate: 'TOKEN=\nBOT_PREFIX=!' },
  { id: 'ruby', name: 'Ruby', icon: '💎', extensions: ['Gemfile', 'main.rb', 'bot.rb'], envTemplate: 'TOKEN=\nPREFIX=!' },
  { id: 'php', name: 'PHP', icon: '🐘', extensions: ['composer.json', 'bot.php', 'index.php'], envTemplate: 'TOKEN=\nPREFIX=!' },
];

export function detectLanguage(files: string[]): Bot['language'] {
  const fileNames = files.map(f => f.split('/').pop() || f);
  if (fileNames.some(f => f === 'package.json')) return 'nodejs';
  if (fileNames.some(f => f === 'requirements.txt' || f === 'setup.py' || f === 'pyproject.toml')) return 'python';
  if (fileNames.some(f => f === 'pom.xml' || f === 'build.gradle')) return 'java';
  if (fileNames.some(f => f === 'go.mod')) return 'go';
  if (fileNames.some(f => f === 'Gemfile')) return 'ruby';
  if (fileNames.some(f => f === 'composer.json')) return 'php';
  return 'unknown';
}

export function getFileIcon(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const icons: Record<string, string> = {
    js: '📜', ts: '📜', jsx: '📜', tsx: '📜',
    py: '🐍', java: '☕', go: '🔷', rb: '💎', php: '🐘',
    json: '📋', yaml: '📋', yml: '📋', toml: '📋',
    txt: '📄', md: '📝', html: '🌐', css: '🎨',
    env: '🔐', gitignore: '🙈',
    zip: '📦', tar: '📦', gz: '📦',
    png: '🖼️', jpg: '🖼️', gif: '🖼️', svg: '🖼️',
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
  { id: 'ffmpeg', name: 'FFmpeg', description: 'Audio/video processing for music bots. Required for voice channel playback, audio conversion, and streaming.', icon: '🎬', category: 'media', size: '85MB' },
  { id: 'sharp', name: 'Sharp', description: 'High-performance image processing. Resize, crop, filter, and convert images.', icon: '🖼️', category: 'media', size: '12MB' },
  { id: 'canvas', name: 'Canvas', description: 'Create images programmatically. Welcome cards, rank cards, charts, and more.', icon: '🎨', category: 'media', size: '15MB' },
  { id: 'lavalink', name: 'Lavalink Client', description: 'Connect to Lavalink server for advanced music features. Queue, shuffle, bass boost, filters.', icon: '🎵', category: 'media', size: '2MB' },
  { id: 'mongoose', name: 'Mongoose', description: 'MongoDB ODM for Node.js. Store user data, settings, and persistent bot state.', icon: '🍃', category: 'database', size: '8MB' },
  { id: 'sqlite', name: 'SQLite', description: 'Lightweight SQL database. No external server needed. Perfect for small to medium bots.', icon: '💾', category: 'database', size: '3MB' },
  { id: 'redis', name: 'Redis Client', description: 'Fast in-memory data store. Caching, session management, and rate limiting.', icon: '⚡', category: 'database', size: '2MB' },
  { id: 'axios', name: 'Axios', description: 'HTTP client for API calls. Fetch data, webhooks, and external service integration.', icon: '🌐', category: 'api', size: '1MB' },
  { id: 'openai', name: 'OpenAI', description: 'GPT-4, DALL-E, and Whisper integration. AI-powered chat, image generation, and transcription.', icon: '🤖', category: 'ai', size: '5MB' },
  { id: 'google-ai', name: 'Google AI (Gemini)', description: 'Google Gemini AI integration. Multi-modal AI capabilities for your bot.', icon: '🧠', category: 'ai', size: '4MB' },
  { id: 'cron', name: 'Node-Cron', description: 'Task scheduler. Run commands on schedules - daily reminders, auto-posting, cleanup.', icon: '⏰', category: 'utility', size: '1MB' },
  { id: 'winston', name: 'Winston Logger', description: 'Professional logging. File rotation, log levels, and structured logging.', icon: '📝', category: 'utility', size: '1MB' },
  { id: 'dotenv', name: 'Dotenv', description: 'Load environment variables from .env files. Essential for managing secrets.', icon: '🔐', category: 'utility', size: '0.5MB' },
  { id: 'express', name: 'Express', description: 'Web server framework. Dashboard pages, API endpoints, and health checks.', icon: '🚀', category: 'api', size: '2MB' },
  { id: 'puppeteer', name: 'Puppeteer', description: 'Browser automation. Screenshots, web scraping, and PDF generation.', icon: '🌐', category: 'utility', size: '30MB' },
];
