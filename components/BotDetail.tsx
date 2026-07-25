'use client';

import { useState, useEffect, useRef } from 'react';
import { useApp } from '@/lib/context';
import {
  ArrowLeft, Play, Square, RotateCcw, Save, Plus, Trash2,
  Terminal, Folder, Cpu, MemoryStick, Clock, Eye,
  ChevronRight, ChevronDown, Send, Copy, Save as SaveIcon,
  Puzzle, Download, Package, AlertCircle, CheckCircle2
} from 'lucide-react';
import { Bot, BotFile, ConsoleLine, getFileIcon } from '@/lib/data';
import { startBot, stopBot, restartBot, saveFile, subscribeBot, sendConsoleInput, deleteBot } from '@/lib/api';

const TABS = [
  { id: 'overview' as const, icon: Eye, label: 'Overview', desc: 'Stats & resources' },
  { id: 'files' as const, icon: Folder, label: 'Files', desc: 'Browse & edit code' },
  { id: 'console' as const, icon: Terminal, label: 'Console', desc: 'Run commands' },
  { id: 'settings' as const, icon: Package, label: 'Settings', desc: 'Env & config' },
];

export default function BotDetail({ bot, onBack, onUpdate }: { bot: Bot; onBack: () => void; onUpdate: (b: Bot) => void }) {
  const { t } = useApp();
  const [activeTab, setActiveTab] = useState('overview');
  const [consoleLines, setConsoleLines] = useState<ConsoleLine[]>(bot.console || []);
  const [consoleInput, setConsoleInput] = useState('');
  const [selectedFile, setSelectedFile] = useState<BotFile | null>(null);
  const [editingFile, setEditingFile] = useState('');
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [autoScroll, setAutoScroll] = useState(true);
  const [envEntries, setEnvEntries] = useState<{ key: string; value: string }[]>([]);
  const [statusMsg, setStatusMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const consoleRef = useRef<HTMLDivElement>(null);
  const lineIdRef = useRef(0);

  useEffect(() => {
    setEnvEntries(Object.entries(bot.envVars || {}).map(([key, value]) => ({ key, value })));
  }, [bot.envVars]);

  useEffect(() => {
    if (autoScroll && consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [consoleLines, autoScroll]);

  useEffect(() => {
    const unsub = subscribeBot(bot.id, (msg) => {
      if (msg.type === 'console' && msg.data) {
        setConsoleLines(prev => [...prev.slice(-1000), { ...msg.data, id: ++lineIdRef.current }]);
      }
      if (msg.type === 'clear') setConsoleLines([]);
      if (msg.type === 'status') onUpdate({ ...bot, status: msg.status });
    });
    return unsub;
  }, [bot.id]);

  const handleConsole = (e: React.FormEvent) => {
    e.preventDefault();
    if (!consoleInput.trim()) return;
    sendConsoleInput(bot.id, consoleInput);
    setConsoleInput('');
  };

  const toggleDir = (path: string) => {
    setExpandedDirs(p => { const n = new Set(p); n.has(path) ? n.delete(path) : n.add(path); return n; });
  };

  const renderFileTree = (files: BotFile[], depth = 0) =>
    files.map(file => (
      <div key={file.path}>
        <div className="group flex items-center">
          <button onClick={() => { if (file.isDirectory) toggleDir(file.path); else { setSelectedFile(file); setEditingFile(file.content); } }}
            className={`flex-1 flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors ${selectedFile?.path === file.path ? 'bg-discord-blurple/10 text-discord-blurple' : ''}`}
            style={{ paddingLeft: `${depth * 16 + 12}px` }}>
            {file.isDirectory ? (expandedDirs.has(file.path) ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />) : <span className="w-3.5" />}
            <span>{file.isDirectory ? (expandedDirs.has(file.path) ? '📂' : '📁') : getFileIcon(file.name)}</span>
            <span className="truncate">{file.name}</span>
          </button>
        </div>
        {file.isDirectory && expandedDirs.has(file.path) && file.children && renderFileTree(file.children, depth + 1)}
      </div>
    ));

  const handleSaveFile = async () => {
    if (!selectedFile) return;
    setSaving(true);
    try {
      await saveFile(bot.id, selectedFile.path, editingFile);
      const update = (f: BotFile[]): BotFile[] => f.map(x => {
        if (x.path === selectedFile.path) return { ...x, content: editingFile };
        if (x.children) return { ...x, children: update(x.children) };
        return x;
      });
      onUpdate({ ...bot, files: update(bot.files) });
      setStatusMsg('File saved');
      setTimeout(() => setStatusMsg(''), 2000);
    } catch { setStatusMsg('Save failed'); }
    setSaving(false);
  };

  const handleDeleteBot = async () => {
    if (!confirm('Delete this bot permanently?')) return;
    try { await deleteBot(bot.id); onBack(); } catch {}
  };

  const saveEnv = async () => {
    const envObj: Record<string, string> = {};
    envEntries.forEach(v => { if (v.key.trim()) envObj[v.key.trim()] = v.value; });
    try {
      const content = envEntries.filter(v => v.key.trim()).map(v => `${v.key}=${v.value}`).join('\n');
      await saveFile(bot.id, '.env', content);
      onUpdate({ ...bot, envVars: envObj });
      setStatusMsg('Environment saved');
      setTimeout(() => setStatusMsg(''), 2000);
    } catch { setStatusMsg('Save failed'); }
  };

  const handleAction = async (action: 'start' | 'stop' | 'restart') => {
    try {
      if (action === 'start') { await startBot(bot.id); onUpdate({ ...bot, status: 'running', uptime: 'Active' }); }
      else if (action === 'stop') { await stopBot(bot.id); onUpdate({ ...bot, status: 'stopped', uptime: '0m' }); }
      else { await restartBot(bot.id); onUpdate({ ...bot, status: 'running' }); }
    } catch (err: any) { setStatusMsg(err.message); }
  };

  return (
    <div className="min-h-screen pt-20 pb-8 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <button onClick={onBack} className="btn-secondary text-sm"><ArrowLeft className="w-4 h-4" /> Back</button>
          <div className="flex items-center gap-3">
            {bot.status === 'running' ? (
              <button onClick={() => handleAction('stop')} className="btn-danger text-sm"><Square className="w-4 h-4" /> Stop</button>
            ) : (
              <button onClick={() => handleAction('start')} className="btn-success text-sm shadow-lg shadow-green-500/20"><Play className="w-4 h-4" /> Start</button>
            )}
            <button onClick={() => handleAction('restart')} className="btn-secondary text-sm" disabled={bot.status === 'stopped'}><RotateCcw className="w-4 h-4" /> Restart</button>
          </div>
        </div>

        {statusMsg && (
          <div className="mb-4 flex items-center gap-2 p-3 bg-discord-blurple/10 rounded-xl text-sm">
            {statusMsg.includes('fail') || statusMsg.includes('Error') ? <AlertCircle className="w-4 h-4 text-red-500" /> : <CheckCircle2 className="w-4 h-4 text-green-500" />}
            {statusMsg}
          </div>
        )}

        <div className="flex items-center gap-4 mb-6">
          <div className="w-14 h-14 bg-discord-blurple/10 rounded-xl flex items-center justify-center text-3xl">
            {bot.language === 'discord.js' ? '🤖' : bot.language === 'nodejs' ? '📦' : bot.language === 'python' ? '🐍' : '📄'}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{bot.name}</h1>
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                bot.status === 'running' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
                bot.status === 'error' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' :
                'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${bot.status === 'running' ? 'bg-green-500 animate-pulse' : 'bg-current'}`} />
                {bot.status === 'running' ? 'Running' : bot.status === 'error' ? 'Error' : 'Stopped'}
              </span>
            </div>
            <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400 mt-1">
              <span>{bot.language.toUpperCase()}</span>
              <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {bot.uptime}</span>
              {bot.depStatus === 'ready' && <span className="text-green-500">✅ Deps OK</span>}
              {bot.depStatus === 'missing' && <span className="text-yellow-500">⚠️ No deps</span>}
              {bot.depStatus === 'missing-module' && <span className="text-red-500">⚠️ Module missing</span>}
              <span>{bot.files.length} files</span>
            </div>
          </div>
        </div>

        <div className="flex gap-1 border-b border-gray-200 dark:border-gray-800 mb-6 overflow-x-auto">
          {TABS.map(({ id, icon: Icon, label, desc }) => (
            <button key={id} onClick={() => setActiveTab(id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === id ? 'border-discord-blurple text-discord-blurple' : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
              title={desc}>
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>

        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { icon: Cpu, label: 'CPU Usage', value: `${bot.resources.cpu}%`, color: 'discord-blurple', pct: bot.resources.cpu },
              { icon: MemoryStick, label: 'Memory', value: `${bot.resources.memory}MB`, color: 'discord-green', pct: bot.resources.memory },
              { icon: Folder, label: 'Files', value: `${bot.files.length}`, color: 'discord-yellow', pct: Math.min(bot.files.length * 10, 100) },
              { icon: Package, label: 'Status', value: bot.depStatus === 'ready' ? 'Ready' : bot.depStatus === 'missing' ? 'No deps' : 'Idle', color: bot.depStatus === 'ready' ? 'discord-green' : 'gray-500', pct: 0 },
            ].map(({ icon: Icon, label, value, color, pct }) => (
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
                {pct > 0 && (
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div className={`bg-${color} h-2 rounded-full transition-all`} style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {activeTab === 'files' && (
          <div className="flex gap-4" style={{ height: 'calc(100vh - 280px)' }}>
            <div className="w-56 lg:w-64 flex-shrink-0 card overflow-y-auto scrollbar-thin">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Files</h3>
              </div>
              <div className="space-y-0.5">{renderFileTree(bot.files)}</div>
              {bot.files.length === 0 && <p className="text-gray-400 text-sm py-4 text-center">No files</p>}
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
                      <button onClick={handleSaveFile} disabled={saving} className="btn-primary text-xs py-1.5 px-3">
                        <Save className="w-3.5 h-3.5" /> {saving ? 'Saving...' : 'Save'}
                      </button>
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
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-500" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500" />
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                </div>
                <span className="text-sm text-gray-500 ml-2">{bot.name} — Console</span>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setConsoleLines([])} className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800">Clear</button>
                <button onClick={() => setAutoScroll(!autoScroll)} className={`text-xs px-2 py-1 rounded ${autoScroll ? 'text-discord-blurple bg-discord-blurple/10' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>Auto-scroll</button>
              </div>
            </div>
            <div ref={consoleRef} className="flex-1 overflow-y-auto scrollbar-thin bg-gray-950 rounded-xl p-4 font-mono text-sm my-3">
              {consoleLines.length === 0 && (
                <div className="text-gray-500">
                  <p className="text-discord-blurple">╔══════════════════════════════╗</p>
                  <p className="text-discord-blurple">║  FP9 Host Console v2.0       ║</p>
                  <p className="text-discord-blurple">║  Type "help" for commands    ║</p>
                  <p className="text-discord-blurple">╚══════════════════════════════╝</p>
                </div>
              )}
              {consoleLines.map((line) => (
                <div key={line.id} className={`leading-6 whitespace-pre-wrap ${
                  line.type === 'input' ? 'text-white' : line.type === 'error' ? 'text-red-400' : line.type === 'system' ? 'text-yellow-400' : 'text-green-400'
                }`}>
                  {line.type === 'input' && <span className="text-discord-blurple mr-2">$</span>}
                  {line.text}
                </div>
              ))}
            </div>
            <form onSubmit={handleConsole} className="flex gap-2">
              <div className="flex items-center flex-1 bg-gray-950 rounded-xl px-4 py-3 font-mono text-sm">
                <span className="text-discord-blurple mr-2">$</span>
                <input type="text" value={consoleInput} onChange={(e) => setConsoleInput(e.target.value)}
                  className="flex-1 bg-transparent text-white outline-none" placeholder="Type command or 'help'..." />
              </div>
              <button type="submit" className="btn-primary px-4"><Send className="w-4 h-4" /></button>
            </form>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="max-w-2xl">
            <div className="card mb-6">
              <h3 className="text-lg font-bold mb-4">🔐 Environment Variables (.env)</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Edit your bot&apos;s secrets. Changes require a restart to take effect.</p>
              <div className="space-y-2">
                {envEntries.map((env, i) => (
                  <div key={i} className="flex gap-2">
                    <input type="text" value={env.key} onChange={(e) => { const v = [...envEntries]; v[i].key = e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''); setEnvEntries(v); }}
                      className="input-field flex-1 font-mono text-sm" placeholder="KEY" />
                    <input type="text" value={env.value} onChange={(e) => { const v = [...envEntries]; v[i].value = e.target.value; setEnvEntries(v); }}
                      className="input-field flex-1 font-mono text-sm" placeholder="value" />
                    <button onClick={() => setEnvEntries(envEntries.filter((_, j) => j !== i))}
                      className="p-2 text-gray-400 hover:text-discord-red hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-4">
                <button onClick={() => setEnvEntries([...envEntries, { key: '', value: '' }])} className="btn-secondary text-sm">
                  <Plus className="w-4 h-4" /> Add Variable
                </button>
                <button onClick={saveEnv} className="btn-primary text-sm">
                  <SaveIcon className="w-4 h-4" /> Save .env
                </button>
              </div>
            </div>

            <div className="card mb-6">
              <h3 className="text-lg font-bold mb-4">📋 Preview .env</h3>
              <pre className="bg-gray-950 text-green-400 font-mono text-sm p-4 rounded-xl overflow-x-auto">
                {envEntries.filter(v => v.key.trim()).map(v => `${v.key}=${v.value}`).join('\n') || '# No variables defined'}
              </pre>
            </div>

            <div className="card mb-6">
              <h3 className="text-lg font-bold mb-4">🤖 Bot Info</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                {[
                  ['Bot ID', bot.id], ['Language', bot.language.toUpperCase()],
                  ['Status', bot.status === 'running' ? '✅ Running' : '⏹ Stopped'],
                  ['Package.json', bot.hasPackageJson ? '✅ Yes' : '❌ No'],
                  ['Dependencies', bot.depStatus === 'ready' ? '✅ Installed' : bot.depStatus === 'missing' ? '❌ Missing' : 'N/A'],
                  ['Files', `${bot.files.length}`],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                    <span className="text-gray-500">{label}</span>
                    <span className="font-mono text-xs truncate ml-2">{value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="card border-red-500/20">
              <h3 className="text-lg font-bold mb-2 text-discord-red">⚠️ Danger Zone</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Permanently delete this bot and all its files. This cannot be undone.</p>
              <button onClick={handleDeleteBot} className="btn-danger text-sm">
                <Trash2 className="w-4 h-4" /> Delete Bot Permanently
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
