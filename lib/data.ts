export interface BotFile {
  name: string; path: string; content: string;
  isDirectory: boolean; children?: BotFile[];
}

export interface LogLine {
  id: number; type: 'input' | 'output' | 'error' | 'system';
  text: string; timestamp: string;
}

export interface BotPlugin {
  id: string; name: string; description: string;
  icon: string; installed: boolean;
  category: string; size: string;
}

export type BotLang = 'discord.js' | 'nodejs' | 'telegram' | 'python' | 'java' | 'go' | 'ruby' | 'php' | 'unknown';
export type BotStatus = 'running' | 'stopped' | 'starting' | 'error';

export interface Bot {
  id: string; name: string; language: BotLang; status: BotStatus;
  hasPackageJson?: boolean; depStatus?: 'none' | 'ready' | 'missing';
  uptime: string; lastUpdate: string;
  envVars: Record<string, string>; files: BotFile[]; console: LogLine[];
  plugins: BotPlugin[];
  resources: { cpu: number; memory: number; disk: number };
}

export interface User { id: string; username: string; avatar: string; discriminator: string; global_name: string; }

export const LANGUAGES = [
  { id: 'discord.js' as BotLang, name: 'Discord.js', icon: '🤖', env: 'TOKEN=\nCLIENT_ID=\nGUILD_ID=' },
  { id: 'nodejs' as BotLang, name: 'Node.js', icon: '📦', env: 'NODE_ENV=production\nTOKEN=\nPREFIX=!' },
  { id: 'python' as BotLang, name: 'Python', icon: '🐍', env: 'TOKEN=\nPREFIX=!\nLOG_LEVEL=INFO' },
  { id: 'go' as BotLang, name: 'Go', icon: '🔷', env: 'TOKEN=\nBOT_PREFIX=!' },
  { id: 'ruby' as BotLang, name: 'Ruby', icon: '💎', env: 'TOKEN=\nPREFIX=!' },
  { id: 'php' as BotLang, name: 'PHP', icon: '🐘', env: 'TOKEN=\nPREFIX=!' },
];

export function fileIcon(name: string): string {
  const m: Record<string, string> = {
    js: '📜', ts: '📜', mjs: '📜', cjs: '📜', jsx: '📜', tsx: '📜',
    py: '🐍', json: '📋', md: '📝', html: '🌐', css: '🎨', env: '🔐',
    yml: '📋', yaml: '📋', gitignore: '🙈', lock: '🔒',
    png: '🖼️', jpg: '🖼️', gif: '🖼️', svg: '🖼️', webp: '🖼️',
  };
  return m[name.split('.').pop()?.toLowerCase() || ''] || '📄';
}

export const PLUGINS: Omit<BotPlugin, 'installed'>[] = [
  { id: 'ffmpeg', name: 'FFmpeg', description: 'Audio/video processing for music bots', icon: '🎬', category: 'media', size: '85MB' },
  { id: 'sharp', name: 'Sharp', description: 'High-performance image processing', icon: '🖼️', category: 'media', size: '12MB' },
  { id: 'mongoose', name: 'Mongoose', description: 'MongoDB ODM for Node.js', icon: '🍃', category: 'database', size: '8MB' },
  { id: 'axios', name: 'Axios', description: 'HTTP client for API calls', icon: '🌐', category: 'api', size: '1MB' },
  { id: 'openai', name: 'OpenAI', description: 'GPT-4, DALL-E, Whisper integration', icon: '🤖', category: 'ai', size: '5MB' },
  { id: 'cron', name: 'Node-Cron', description: 'Task scheduler', icon: '⏰', category: 'utility', size: '1MB' },
  { id: 'winston', name: 'Winston Logger', description: 'Professional logging', icon: '📝', category: 'utility', size: '1MB' },
  { id: 'dotenv', name: 'Dotenv', description: 'Load .env files', icon: '🔐', category: 'utility', size: '0.5MB' },
  { id: 'express', name: 'Express', description: 'Web server framework', icon: '🚀', category: 'api', size: '2MB' },
  { id: 'puppeteer', name: 'Puppeteer', description: 'Browser automation', icon: '🌐', category: 'utility', size: '30MB' },
];
