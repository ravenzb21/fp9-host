'use client';

import { useState, useEffect, useRef } from 'react';
import { useApp } from '@/lib/context';
import {
  ArrowLeft, Play, Square, RotateCcw, Save, Plus, Trash2,
  Terminal, Folder, FolderOpen, Cpu, MemoryStick, HardDrive,
  Clock, Eye, ChevronRight, ChevronDown, Send, Copy,
  Puzzle, Download, Upload, Package, Check, ExternalLink, Search
} from 'lucide-react';
import { Bot, BotFile, BotPlugin, ConsoleLine, getFileIcon, availablePlugins } from '@/lib/data';
import { startBot, stopBot, restartBot, saveFile, subscribeBot, sendConsoleInput, deleteBot } from '@/lib/api';

interface BotDetailProps {
  bot: Bot;
  onBack: () => void;
  onUpdate: (bot: Bot) => void;
}

type Tab = 'overview' | 'files' | 'console' | 'plugins' | 'settings';

export default function BotDetail({ bot, onBack, onUpdate }: BotDetailProps) {
  const { t } = useApp();
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [consoleLines, setConsoleLines] = useState<ConsoleLine[]>(bot.console || []);
  const [consoleInput, setConsoleInput] = useState('');
  const [selectedFile, setSelectedFile] = useState<BotFile | null>(null);
  const [editingFile, setEditingFile] = useState<string>('');
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set(['/']));
  const [autoScroll, setAutoScroll] = useState(true);
  const [newItemName, setNewItemName] = useState('');
  const [newItemType, setNewItemType] = useState<'file' | 'folder'>('file');
  const [showNewItem, setShowNewItem] = useState(false);
  const [pluginSearch, setPluginSearch] = useState('');
  const [pluginCategory, setPluginCategory] = useState<string>('all');
  const [installingPlugin, setInstallingPlugin] = useState<string | null>(null);
  const [envVars, setEnvVars] = useState<{ key: string; value: string }[]>([]);
  const consoleRef = useRef<HTMLDivElement>(null);
  const consoleIdRef = useRef(0);

  const installedPlugins = bot.plugins || [];

  useEffect(() => {
    setEnvVars(Object.entries(bot.envVars || {}).map(([key, value]) => ({ key, value })));
  }, [bot.envVars]);

  useEffect(() => {
    if (autoScroll && consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [consoleLines, autoScroll]);

  useEffect(() => {
    const unsubscribe = subscribeBot(bot.id, (msg) => {
      if (msg.type === 'console' && msg.data) {
        setConsoleLines(prev => [...prev.slice(-500), { ...msg.data, id: ++consoleIdRef.current }]);
      }
      if (msg.type === 'status') {
        onUpdate({ ...bot, status: msg.status });
      }
    });
    return unsubscribe;
  }, [bot.id]);

  const handleConsoleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!consoleInput.trim()) return;
    sendConsoleInput(bot.id, consoleInput);
    setConsoleInput('');
  };

  const toggleDir = (path: string) => {
    setExpandedDirs(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const addNewFile = () => {
    if (!newItemName.trim()) return;
    const path = newItemName;
    if (newItemType === 'folder') {
      const dir: BotFile = { name: newItemName, path, content: '', isDirectory: true, children: [] };
      onUpdate({ ...bot, files: [...bot.files, dir] });
    } else {
      const file: BotFile = { name: newItemName, path, content: `// ${newItemName}`, isDirectory: false };
      onUpdate({ ...bot, files: [...bot.files, file] });
    }
    setNewItemName('');
    setShowNewItem(false);
  };

  const deleteFile = (path: string) => {
    const removeFile = (files: BotFile[]): BotFile[] =>
      files.filter(f => f.path !== path).map(f => {
        if (f.children) return { ...f, children: removeFile(f.children) };
        return f;
      });
    onUpdate({ ...bot, files: removeFile(bot.files) });
    if (selectedFile?.path === path) setSelectedFile(null);
  };

  const renderFileTree = (files: BotFile[], depth = 0) => {
    return files.map(file => (
      <div key={file.path}>
        <div className="group flex items-center">
          <button
            onClick={() => {
              if (file.isDirectory) toggleDir(file.path);
              else { setSelectedFile(file); setEditingFile(file.content); }
            }}
            className={`flex-1 flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors ${
              selectedFile?.path === file.path ? 'bg-discord-blurple/10 text-discord-blurple' : ''
            }`}
            style={{ paddingLeft: `${depth * 16 + 12}px` }}
          >
            {file.isDirectory ? (
              expandedDirs.has(file.path) ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
            ) : <span className="w-3.5" />}
            <span className="text-base">
              {file.isDirectory ? (expandedDirs.has(file.path) ? '📂' : '📁') : getFileIcon(file.name)}
            </span>
            <span className="truncate">{file.name}</span>
          </button>
          <button onClick={() => deleteFile(file.path)} className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-discord-red transition-all">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
        {file.isDirectory && expandedDirs.has(file.path) && file.children && renderFileTree(file.children, depth + 1)}
      </div>
    ));
  };

  const handleSaveFile = async () => {
    if (!selectedFile) return;
    try {
      await saveFile(bot.id, selectedFile.path, editingFile);
      const updateFile = (files: BotFile[]): BotFile[] =>
        files.map(f => {
          if (f.path === selectedFile.path) return { ...f, content: editingFile };
          if (f.children) return { ...f, children: updateFile(f.children) };
          return f;
        });
      onUpdate({ ...bot, files: updateFile(bot.files) });
    } catch (err) {
      alert('Failed to save file');
    }
  };

  const togglePlugin = (pluginId: string) => {
    const plugin = availablePlugins.find(p => p.id === pluginId);
    if (!plugin) return;
    setInstallingPlugin(pluginId);
    setTimeout(() => {
      const isInstalled = installedPlugins.some(p => p.id === pluginId);
      const newPlugins = isInstalled
        ? installedPlugins.filter(p => p.id !== pluginId)
        : [...installedPlugins, { ...plugin, installed: true }];
      onUpdate({ ...bot, plugins: newPlugins });
      setInstallingPlugin(null);
    }, 1500);
  };

  const handleStart = async () => {
    try {
      await startBot(bot.id);
      onUpdate({ ...bot, status: 'running', uptime: 'Active' });
    } catch (err: any) {
      alert(err.message || 'Failed to start');
    }
  };

  const handleStop = async () => {
    try {
      await stopBot(bot.id);
      onUpdate({ ...bot, status: 'stopped', uptime: '0m' });
    } catch (err: any) {
      alert(err.message || 'Failed to stop');
    }
  };

  const handleRestart = async () => {
    try {
      await restartBot(bot.id);
      onUpdate({ ...bot, status: 'running' });
    } catch (err: any) {
      alert(err.message || 'Failed to restart');
    }
  };

  const handleDeleteBot = async () => {
    if (!confirm('Delete this bot permanently?')) return;
    try {
      await deleteBot(bot.id);
      onBack();
    } catch (err) {
      alert('Failed to delete bot');
    }
  };

  const filteredPlugins = availablePlugins.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(pluginSearch.toLowerCase()) || p.description.toLowerCase().includes(pluginSearch.toLowerCase());
    const matchCategory = pluginCategory === 'all' || p.category === pluginCategory;
    return matchSearch && matchCategory;
  });

  const categories = [
    { id: 'all', name: 'All', icon: '📦' },
    { id: 'media', name: 'Media', icon: '🎬' },
    { id: 'database', name: 'Database', icon: '💾' },
    { id: 'api', name: 'API', icon: '🌐' },
    { id: 'ai', name: 'AI', icon: '🤖' },
    { id: 'utility', name: 'Utility', icon: '🔧' },
  ];

  const tabs: { id: Tab; icon: React.ElementType; label: string }[] = [
    { id: 'overview', icon: Eye, label: 'Overview' },
    { id: 'files', icon: Folder, label: 'Files' },
    { id: 'console', icon: Terminal, label: 'Console' },
    { id: 'plugins', icon: Puzzle, label: 'Plugins' },
    { id: 'settings', icon: Package, label: 'Settings' },
  ];

  return (
    <div className="min-h-screen pt-20 pb-8 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <button onClick={onBack} className="btn-secondary text-sm">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <div className="flex items-center gap-3">
            {bot.status === 'stopped' || bot.status === 'error' ? (
              <button onClick={handleStart} className="btn-success text-sm"><Play className="w-4 h-4" /> Start</button>
            ) : (
              <button onClick={handleStop} className="btn-danger text-sm"><Square className="w-4 h-4" /> Stop</button>
            )}
            <button onClick={handleRestart} className="btn-secondary text-sm" disabled={bot.status === 'stopped'}><RotateCcw className="w-4 h-4" /> Restart</button>
          </div>
        </div>

        <div className="flex items-center gap-4 mb-6">
          <div className="w-14 h-14 bg-discord-blurple/10 rounded-xl flex items-center justify-center text-3xl">
            {bot.language === 'nodejs' ? '📦' : bot.language === 'python' ? '🐍' : '📄'}
          </div>
          <div>
            <h1 className="text-2xl font-bold">{bot.name}</h1>
            <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
              <span className={`status-badge ${bot.status === 'running' ? 'status-running' : bot.status === 'stopped' ? 'status-stopped' : 'status-starting'}`}>
                <span className="w-1.5 h-1.5 rounded-full bg-current" />
                {t(`status.${bot.status}`)}
              </span>
              <span>{bot.language.toUpperCase()}</span>
              <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {bot.uptime}</span>
              <span>{installedPlugins.length} plugins</span>
            </div>
          </div>
        </div>

        <div className="flex gap-1 border-b border-gray-200 dark:border-gray-800 mb-6 overflow-x-auto">
          {tabs.map(({ id, icon: Icon, label }) => (
            <button key={id} onClick={() => setActiveTab(id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === id ? 'border-discord-blurple text-discord-blurple' : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>

        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { icon: Cpu, label: 'CPU Usage', value: `${bot.resources.cpu}%`, color: 'discord-blurple', percent: bot.resources.cpu },
              { icon: MemoryStick, label: 'Memory', value: `${bot.resources.memory}MB`, color: 'discord-green', percent: bot.resources.memory },
              { icon: HardDrive, label: 'Disk', value: `${bot.resources.disk}MB`, color: 'discord-yellow', percent: Math.min(bot.resources.disk * 2, 100) },
              { icon: Folder, label: 'Files', value: `${bot.files.length}`, color: 'purple-500', percent: 0, sub: `Updated: ${bot.lastUpdate}` },
            ].map(({ icon: Icon, label, value, color, percent, sub }) => (
              <div key={label} className="card">
                <div className="flex items-center gap-3 mb-4">
                  <div className={`w-10 h-10 bg-${color}/10 rounded-lg flex items-center justify-center`}>
                    <Icon className={`w-5 h-5 text-${color}`} />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">{label}</p>
                    <p className="text-xl font-bold">{value}</p>
                  </div>
                </div>
                {percent > 0 && (
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div className={`bg-${color} h-2 rounded-full transition-all`} style={{ width: `${percent}%` }} />
                  </div>
                )}
                {sub && <p className="text-xs text-gray-500 mt-2">{sub}</p>}
              </div>
            ))}
          </div>
        )}

        {activeTab === 'files' && (
          <div className="flex gap-4" style={{ height: 'calc(100vh - 280px)' }}>
            <div className="w-64 flex-shrink-0 card overflow-y-auto scrollbar-thin">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Files</h3>
                <button onClick={() => setShowNewItem(!showNewItem)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded">
                  <Plus className="w-4 h-4 text-gray-400" />
                </button>
              </div>
              {showNewItem && (
                <div className="mb-3 space-y-2">
                  <div className="flex gap-1">
                    <button onClick={() => setNewItemType('file')} className={`flex-1 text-xs py-1 rounded ${newItemType === 'file' ? 'bg-discord-blurple text-white' : 'bg-gray-100 dark:bg-gray-800'}`}>File</button>
                    <button onClick={() => setNewItemType('folder')} className={`flex-1 text-xs py-1 rounded ${newItemType === 'folder' ? 'bg-discord-blurple text-white' : 'bg-gray-100 dark:bg-gray-800'}`}>Folder</button>
                  </div>
                  <div className="flex gap-1">
                    <input type="text" value={newItemName} onChange={(e) => setNewItemName(e.target.value)} className="flex-1 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 outline-none" placeholder={newItemType === 'file' ? 'filename.js' : 'foldername'} onKeyDown={(e) => e.key === 'Enter' && addNewFile()} />
                    <button onClick={addNewFile} className="btn-primary text-xs py-1 px-2"><Check className="w-3 h-3" /></button>
                  </div>
                </div>
              )}
              <div className="space-y-0.5">{renderFileTree(bot.files)}</div>
            </div>
            <div className="flex-1 card flex flex-col">
              {selectedFile ? (
                <>
                  <div className="flex items-center justify-between pb-3 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-2">
                      <span>{getFileIcon(selectedFile.name)}</span>
                      <span className="font-mono text-sm">{selectedFile.path}</span>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => navigator.clipboard.writeText(editingFile)} className="btn-secondary text-xs py-1.5 px-3"><Copy className="w-3.5 h-3.5" /> Copy</button>
                      <button onClick={handleSaveFile} className="btn-primary text-xs py-1.5 px-3"><Save className="w-3.5 h-3.5" /> Save</button>
                    </div>
                  </div>
                  <textarea value={editingFile} onChange={(e) => setEditingFile(e.target.value)}
                    className="flex-1 bg-gray-900 text-green-400 font-mono text-sm p-4 rounded-b-xl resize-none outline-none scrollbar-thin mt-3" spellCheck={false} />
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-gray-400">
                  <div className="text-center">
                    <Folder className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>Select a file to view and edit</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'console' && (
          <div className="card flex flex-col" style={{ height: 'calc(100vh - 280px)' }}>
            <div className="flex items-center justify-between pb-3 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-discord-red" />
                <div className="w-3 h-3 rounded-full bg-discord-yellow" />
                <div className="w-3 h-3 rounded-full bg-discord-green" />
                <span className="text-sm text-gray-500 ml-2">{bot.name} — Console</span>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setConsoleLines([])} className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800">Clear</button>
                <button onClick={() => setAutoScroll(!autoScroll)} className={`text-xs px-2 py-1 rounded ${autoScroll ? 'text-discord-blurple bg-discord-blurple/10' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>Auto-scroll</button>
              </div>
            </div>
            <div ref={consoleRef} className="flex-1 overflow-y-auto scrollbar-thin bg-gray-900 rounded-xl p-4 font-mono text-sm my-3">
              {consoleLines.length === 0 && (
                <div className="text-gray-500">
                  <p>FP9 Host Console v1.0</p>
                  <p>Start the bot to see real output</p>
                </div>
              )}
              {consoleLines.map((line) => (
                <div key={line.id} className={`leading-6 ${
                  line.type === 'input' ? 'text-white' : line.type === 'error' ? 'text-discord-red' : line.type === 'system' ? 'text-discord-yellow' : 'text-green-400'
                }`}>
                  {line.type === 'input' && <span className="text-discord-blurple mr-2">$</span>}
                  {line.text}
                </div>
              ))}
            </div>
            <form onSubmit={handleConsoleSubmit} className="flex gap-2">
              <div className="flex items-center flex-1 bg-gray-900 rounded-xl px-4 py-3 font-mono text-sm">
                <span className="text-discord-blurple mr-2">$</span>
                <input type="text" value={consoleInput} onChange={(e) => setConsoleInput(e.target.value)}
                  className="flex-1 bg-transparent text-white outline-none" placeholder="Type input..." disabled={bot.status !== 'running'} />
              </div>
              <button type="submit" className="btn-primary px-4" disabled={bot.status !== 'running'}><Send className="w-4 h-4" /></button>
            </form>
            {bot.status !== 'running' && <p className="text-xs text-gray-500 mt-2 text-center">Start the bot to use the console</p>}
          </div>
        )}

        {activeTab === 'plugins' && (
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type="text" value={pluginSearch} onChange={(e) => setPluginSearch(e.target.value)}
                  className="input-field pl-10" placeholder="Search plugins..." />
              </div>
              <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
                {categories.map(cat => (
                  <button key={cat.id} onClick={() => setPluginCategory(cat.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      pluginCategory === cat.id ? 'bg-white dark:bg-gray-700 shadow text-gray-900 dark:text-white' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}>
                    {cat.icon} {cat.name}
                  </button>
                ))}
              </div>
            </div>

            {installedPlugins.length > 0 && (
              <div>
                <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Installed ({installedPlugins.length})</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {installedPlugins.map(plugin => (
                    <div key={plugin.id} className="card border-discord-green/20 bg-discord-green/5">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{plugin.icon}</span>
                          <div>
                            <h4 className="font-bold">{plugin.name}</h4>
                            <span className="text-xs text-gray-500">{plugin.size}</span>
                          </div>
                        </div>
                        <span className="status-badge status-running">Installed</span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 line-clamp-2">{plugin.description}</p>
                      <button onClick={() => togglePlugin(plugin.id)} disabled={installingPlugin === plugin.id}
                        className="btn-danger text-xs w-full justify-center">
                        {installingPlugin === plugin.id ? 'Uninstalling...' : 'Uninstall'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Available ({filteredPlugins.length})</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredPlugins.filter(p => !installedPlugins.some(ip => ip.id === p.id)).map(plugin => (
                  <div key={plugin.id} className="card hover:scale-[1.01] transition-all">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{plugin.icon}</span>
                        <div>
                          <h4 className="font-bold">{plugin.name}</h4>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500">{plugin.size}</span>
                            <span className="text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded capitalize">{plugin.category}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 line-clamp-2">{plugin.description}</p>
                    <button onClick={() => togglePlugin(plugin.id)} disabled={installingPlugin === plugin.id}
                      className="btn-primary text-xs w-full justify-center">
                      {installingPlugin === plugin.id ? (
                        <><Download className="w-3.5 h-3.5 animate-bounce" /> Installing...</>
                      ) : (
                        <><Download className="w-3.5 h-3.5" /> Install</>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="max-w-2xl">
            <div className="card mb-6">
              <h3 className="text-lg font-bold mb-4">Environment Variables (.env)</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Edit your bot&apos;s environment variables. Changes require restart.</p>
              <div className="space-y-2">
                {envVars.map((env, index) => (
                  <div key={index} className="flex gap-2">
                    <input type="text" value={env.key} onChange={(e) => { const v = [...envVars]; v[index].key = e.target.value; setEnvVars(v); }}
                      className="input-field flex-1 font-mono text-sm" placeholder="KEY" />
                    <input type="text" value={env.value} onChange={(e) => { const v = [...envVars]; v[index].value = e.target.value; setEnvVars(v); }}
                      className="input-field flex-1 font-mono text-sm" placeholder="value" />
                    <button onClick={() => setEnvVars(envVars.filter((_, i) => i !== index))} className="p-2 text-gray-400 hover:text-discord-red hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-4">
                <button onClick={() => setEnvVars([...envVars, { key: '', value: '' }])} className="btn-secondary text-sm"><Plus className="w-4 h-4" /> Add</button>
                <button onClick={() => {
                  const envObj: Record<string, string> = {};
                  envVars.forEach(v => { if (v.key.trim()) envObj[v.key.trim()] = v.value; });
                  onUpdate({ ...bot, envVars: envObj });
                }} className="btn-primary text-sm"><Save className="w-4 h-4" /> Save</button>
              </div>
            </div>

            <div className="card mb-6">
              <h3 className="text-lg font-bold mb-4">Preview .env</h3>
              <pre className="bg-gray-900 text-green-400 font-mono text-sm p-4 rounded-xl overflow-x-auto">
                {envVars.filter(v => v.key.trim()).map(v => `${v.key}=${v.value}`).join('\n') || '# No variables defined'}
              </pre>
            </div>

            <div className="card border-discord-red/20">
              <h3 className="text-lg font-bold mb-2 text-discord-red">Danger Zone</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Permanently delete this bot and all its files.</p>
              <button onClick={handleDeleteBot} className="btn-danger text-sm">
                <Trash2 className="w-4 h-4" /> Delete Bot
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
