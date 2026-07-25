'use client';
import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Play, Square, RotateCcw, Save, Plus, Trash2, Terminal, Folder, Cpu, MemoryStick, Clock, Eye, ChevronRight, ChevronDown, Send, Copy, Package, CheckCircle2, AlertCircle, SaveIcon, Puzzle, Search, Download } from 'lucide-react';
import { Bot, BotFile, LogLine, fileIcon, PLUGINS } from '@/lib/data';
import { startBot, stopBot, restartBot, saveFile, onMsg, sendCmd, deleteBot } from '@/lib/api';

const TABS = [
  { id: 'overview', icon: Eye, label: 'Overview' }, { id: 'files', icon: Folder, label: 'Files' },
  { id: 'console', icon: Terminal, label: 'Console' }, { id: 'plugins', icon: Puzzle, label: 'Plugins' },
  { id: 'settings', icon: Package, label: 'Settings' },
];

export default function BotDetail({ bot, onBack, onUpdate }: { bot: Bot; onBack: () => void; onUpdate: (b: Bot) => void }) {
  const [tab, setTab] = useState('overview');
  const [lines, setLines] = useState<LogLine[]>(bot.console || []);
  const [input, setInput] = useState('');
  const [selFile, setSelFile] = useState<BotFile | null>(null);
  const [editContent, setEditContent] = useState('');
  const [expDirs, setExpDirs] = useState<Set<string>>(new Set());
  const [autoScroll, setAutoScroll] = useState(true);
  const [env, setEnv] = useState<{ key: string; value: string }[]>([]);
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [pluginSearch, setPluginSearch] = useState('');
  const [pluginCat, setPluginCat] = useState('all');
  const [installing, setInstalling] = useState<string | null>(null);
  const categories = [
    { id: 'all', name: 'All', icon: '📦' }, { id: 'media', name: 'Media', icon: '🎬' },
    { id: 'database', name: 'Database', icon: '💾' }, { id: 'api', name: 'API', icon: '🌐' },
    { id: 'ai', name: 'AI', icon: '🤖' }, { id: 'utility', name: 'Utility', icon: '🔧' },
  ];
  const installed = bot.plugins || [];
  const filtered = PLUGINS.filter(p => {
    const m = p.name.toLowerCase().includes(pluginSearch.toLowerCase()) || p.description.toLowerCase().includes(pluginSearch.toLowerCase());
    const c = pluginCat === 'all' || p.category === pluginCat;
    return m && c;
  });
  const togglePlugin = (id: string) => {
    const plugin = PLUGINS.find(p => p.id === id);
    if (!plugin) return;
    setInstalling(id);
    setTimeout(() => {
      const isInst = installed.some((p: any) => p.id === id);
      const next = isInst ? installed.filter((p: any) => p.id !== id) : [...installed, { ...plugin, installed: true }];
      onUpdate({ ...bot, plugins: next });
      setInstalling(null);
    }, 1200);
  };
  const consoleRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(0);

  useEffect(() => { setEnv(Object.entries(bot.envVars || {}).map(([k, v]) => ({ key: k, value: v }))); }, [bot.envVars]);
  useEffect(() => { if (autoScroll && consoleRef.current) consoleRef.current.scrollTop = consoleRef.current.scrollHeight; }, [lines, autoScroll]);
  useEffect(() => {
    const unsub = onMsg(bot.id, (m: any) => {
      if (m.type === 'log') setLines(p => [...p.slice(-1000), { ...m.data, id: ++idRef.current }]);
      if (m.type === 'clear') setLines([]);
      if (m.type === 'status') onUpdate({ ...bot, status: m.status });
    });
    return unsub;
  }, [bot.id]);

  const toggleDir = (p: string) => setExpDirs(d => { const n = new Set(d); n.has(p) ? n.delete(p) : n.add(p); return n; });

  const renderTree = (files: BotFile[], depth = 0) => files.map(f => (
    <div key={f.path}>
      <button onClick={() => { if (f.isDirectory) toggleDir(f.path); else { setSelFile(f); setEditContent(f.content); } }}
        className={`flex items-center gap-2 w-full px-3 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors ${selFile?.path === f.path ? 'bg-discord-blurple/10 text-discord-blurple' : ''}`}
        style={{ paddingLeft: `${depth * 16 + 12}px` }}>
        {f.isDirectory ? (expDirs.has(f.path) ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />) : <span className="w-3.5" />}
        <span>{f.isDirectory ? (expDirs.has(f.path) ? '📂' : '📁') : fileIcon(f.name)}</span>
        <span className="truncate">{f.name}</span>
      </button>
      {f.isDirectory && expDirs.has(f.path) && f.children && renderTree(f.children, depth + 1)}
    </div>
  ));

  const handleSave = async () => {
    if (!selFile) return;
    setSaving(true); setMsg('');
    try {
      await saveFile(bot.id, selFile.path, editContent);
      const upd = (fs: BotFile[]): BotFile[] => fs.map(x => {
        if (x.path === selFile.path) return { ...x, content: editContent };
        if (x.children) return { ...x, children: upd(x.children) };
        return x;
      });
      onUpdate({ ...bot, files: upd(bot.files) });
      setMsg('✅ Saved'); setTimeout(() => setMsg(''), 2000);
    } catch (e: any) { setMsg(`❌ ${e.message}`); }
    setSaving(false);
  };

  const saveEnv = async () => {
    const o: Record<string, string> = {};
    env.forEach(v => { if (v.key.trim()) o[v.key.trim()] = v.value; });
    try {
      await saveFile(bot.id, '.env', env.filter(v => v.key.trim()).map(v => `${v.key}=${v.value}`).join('\n'));
      onUpdate({ ...bot, envVars: o });
      setMsg('✅ Env saved'); setTimeout(() => setMsg(''), 2000);
    } catch (e: any) { setMsg(`❌ ${e.message}`); }
  };

  const act = async (a: 'start' | 'stop' | 'restart') => {
    try {
      const fn = a === 'start' ? startBot : a === 'stop' ? stopBot : restartBot;
      await fn(bot.id);
      onUpdate({ ...bot, status: a === 'stop' ? 'stopped' : 'running', uptime: a === 'stop' ? '0m' : 'Active' });
    } catch (e: any) { setMsg(`❌ ${e.message}`); }
  };

  return (
    <div className="min-h-screen pt-20 pb-8 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <button onClick={onBack} className="btn-secondary text-sm"><ArrowLeft className="w-4 h-4" /> Back</button>
          <div className="flex items-center gap-3">
            {bot.status === 'running' ? (
              <button onClick={() => act('stop')} className="btn-danger text-sm"><Square className="w-4 h-4" /> Stop</button>
            ) : (
              <button onClick={() => act('start')} className="btn-success text-sm shadow-lg shadow-green-500/20"><Play className="w-4 h-4" /> Start</button>
            )}
            <button onClick={() => act('restart')} disabled={bot.status === 'stopped'} className="btn-secondary text-sm"><RotateCcw className="w-4 h-4" /> Restart</button>
          </div>
        </div>

        {msg && (
          <div className={`mb-4 flex items-center gap-2 p-3 rounded-xl text-sm ${msg.includes('❌') ? 'bg-red-50 dark:bg-red-900/20 text-red-600' : 'bg-green-50 dark:bg-green-900/20 text-green-600'}`}>
            {msg.includes('❌') ? <AlertCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />} {msg}
          </div>
        )}

        <div className="flex items-center gap-4 mb-6">
          <div className="w-14 h-14 bg-discord-blurple/10 rounded-xl flex items-center justify-center text-3xl">
            {bot.language === 'discord.js' ? '🤖' : bot.language === 'nodejs' ? '📦' : bot.language === 'python' ? '🐍' : '📄'}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{bot.name}</h1>
              <span className={`badge ${bot.status === 'running' ? 'badge-green' : bot.status === 'error' ? 'badge-red' : ''}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${bot.status === 'running' ? 'bg-green-500 animate-ping' : 'bg-current'}`} />
                {bot.status === 'running' ? 'Running' : bot.status === 'error' ? 'Error' : 'Stopped'}
              </span>
            </div>
            <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400 mt-1">
              <span>{bot.language.toUpperCase()}</span>
              <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {bot.uptime}</span>
              {bot.depStatus === 'ready' && <span className="text-green-500">✅ Deps OK</span>}
              {bot.depStatus === 'missing' && <span className="text-yellow-500">⚠️ No deps</span>}
              <span>{bot.files.length} files</span>
            </div>
          </div>
        </div>

        <div className="flex gap-1 border-b border-gray-200 dark:border-gray-800 mb-6 overflow-x-auto">
          {TABS.map(({ id, icon: Icon, label }) => (
            <button key={id} onClick={() => setTab(id)} className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${tab === id ? 'border-discord-blurple text-discord-blurple' : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>

        {tab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[
              { icon: Cpu, label: 'CPU', value: `${bot.resources.cpu}%`, color: 'discord-blurple', pct: bot.resources.cpu },
              { icon: MemoryStick, label: 'Memory', value: `${bot.resources.memory}MB`, color: 'discord-green', pct: bot.resources.memory },
              { icon: Folder, label: 'Files', value: `${bot.files.length}`, color: 'discord-yellow', pct: Math.min(bot.files.length * 10, 100) },
              { icon: Package, label: 'Deps', value: bot.depStatus === 'ready' ? 'Ready' : bot.depStatus || 'N/A', color: bot.depStatus === 'ready' ? 'discord-green' : 'gray-500', pct: 0 },
            ].map(({ icon: Icon, label, value, color, pct }) => (
              <div key={label} className="card">
                <div className="flex items-center gap-3 mb-4">
                  <div className={`w-10 h-10 bg-${color}/10 rounded-lg flex items-center justify-center`}><Icon className={`w-5 h-5 text-${color}`} /></div>
                  <div><p className="text-xs text-gray-500">{label}</p><p className="text-xl font-bold">{value}</p></div>
                </div>
                {pct > 0 && <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2"><div className={`bg-${color} h-2 rounded-full transition-all`} style={{ width: `${Math.min(pct, 100)}%` }} /></div>}
              </div>
            ))}
          </div>
        )}

        {tab === 'files' && (
          <div className="flex gap-4" style={{ height: 'calc(100vh - 280px)' }}>
            <div className="w-56 lg:w-64 flex-shrink-0 card overflow-y-auto scroll-thin">
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Files</h3>
              <div className="space-y-0.5">{renderTree(bot.files)}</div>
              {!bot.files.length && <p className="text-gray-400 text-sm py-4 text-center">No files</p>}
            </div>
            <div className="flex-1 card flex flex-col">
              {selFile ? (
                <>
                  <div className="flex items-center justify-between pb-3 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-2"><span>{fileIcon(selFile.name)}</span><span className="font-mono text-sm">{selFile.path}</span></div>
                    <div className="flex gap-2">
                      <button onClick={() => navigator.clipboard.writeText(editContent)} className="btn-secondary text-xs py-1.5 px-3"><Copy className="w-3.5 h-3.5" /> Copy</button>
                      <button onClick={handleSave} disabled={saving} className="btn-primary text-xs py-1.5 px-3"><Save className="w-3.5 h-3.5" /> {saving ? 'Saving...' : 'Save'}</button>
                    </div>
                  </div>
                  <textarea value={editContent} onChange={e => setEditContent(e.target.value)} className="flex-1 bg-gray-950 text-green-400 font-mono text-sm p-4 rounded-xl resize-none outline-none scroll-thin mt-3" spellCheck={false} />
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-gray-400">
                  <div className="text-center"><Folder className="w-12 h-12 mx-auto mb-3 opacity-50" /><p>Select a file to edit</p></div>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'console' && (
          <div className="card flex flex-col" style={{ height: 'calc(100vh - 280px)' }}>
            <div className="flex items-center justify-between pb-3 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <div className="flex gap-1.5"><div className="w-3 h-3 rounded-full bg-red-500" /><div className="w-3 h-3 rounded-full bg-yellow-500" /><div className="w-3 h-3 rounded-full bg-green-500" /></div>
                <span className="text-sm text-gray-500 ml-2">{bot.name} — Console</span>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setLines([])} className="text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 px-2 py-1 rounded">Clear</button>
                <button onClick={() => setAutoScroll(!autoScroll)} className={`text-xs px-2 py-1 rounded ${autoScroll ? 'text-discord-blurple bg-discord-blurple/10' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>Auto</button>
              </div>
            </div>
            <div ref={consoleRef} className="flex-1 overflow-y-auto scroll-thin bg-gray-950 rounded-xl p-4 font-mono text-sm my-3">
              {!lines.length && (
                <div className="text-gray-500">
                  <p className="text-discord-blurple">═══ FP9 Console v3 ═══</p>
                  <p className="text-discord-blurple">Type "help" for commands</p>
                </div>
              )}
              {lines.map(l => (
                <div key={l.id} className={`leading-6 whitespace-pre-wrap ${l.type === 'input' ? 'text-white' : l.type === 'error' ? 'text-red-400' : l.type === 'system' ? 'text-yellow-400' : 'text-green-400'}`}>
                  {l.type === 'input' && <span className="text-discord-blurple mr-2">$</span>}{l.text}
                </div>
              ))}
            </div>
            <form onSubmit={e => { e.preventDefault(); if (input.trim()) { sendCmd(bot.id, input); setInput(''); } }} className="flex gap-2">
              <div className="flex items-center flex-1 bg-gray-950 rounded-xl px-4 py-3 font-mono text-sm">
                <span className="text-discord-blurple mr-2">$</span>
                <input type="text" value={input} onChange={e => setInput(e.target.value)} className="flex-1 bg-transparent text-white outline-none" placeholder="Type a command..." />
              </div>
              <button type="submit" className="btn-primary px-4"><Send className="w-4 h-4" /></button>
            </form>
          </div>
        )}

        {tab === 'plugins' && (
          <div className="space-y-6 animate-in">
            <div className="flex items-center gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type="text" value={pluginSearch} onChange={e => setPluginSearch(e.target.value)} className="input pl-10" placeholder="Search plugins..." />
              </div>
              <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
                {categories.map(c => (
                  <button key={c.id} onClick={() => setPluginCat(c.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${pluginCat === c.id ? 'bg-white dark:bg-gray-700 shadow text-gray-900 dark:text-white' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>
                    {c.icon} {c.name}
                  </button>
                ))}
              </div>
            </div>

            {installed.length > 0 && (
              <div>
                <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Installed ({installed.length})</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {installed.map(p => (
                    <div key={p.id} className="card border-green-500/20 bg-green-500/5">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{p.icon}</span>
                          <div><h4 className="font-bold">{p.name}</h4><span className="text-xs text-gray-500">{p.size}</span></div>
                        </div>
                        <span className="badge-green">Installed</span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 line-clamp-2">{p.description}</p>
                      <button onClick={() => togglePlugin(p.id)} disabled={installing === p.id}
                        className="btn-danger text-xs w-full justify-center">{installing === p.id ? 'Processing...' : 'Uninstall'}</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Available ({filtered.length})</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {filtered.filter(p => !installed.some(ip => ip.id === p.id)).map(p => (
                  <div key={p.id} className="card hover:scale-[1.01] transition-all">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{p.icon}</span>
                        <div><h4 className="font-bold">{p.name}</h4>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500">{p.size}</span>
                            <span className="text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded capitalize">{p.category}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 line-clamp-2">{p.description}</p>
                    <button onClick={() => togglePlugin(p.id)} disabled={installing === p.id}
                      className="btn-primary text-xs w-full justify-center">{installing === p.id ? <><Download className="w-3.5 h-3.5 animate-bounce" /> Installing...</> : <><Download className="w-3.5 h-3.5" /> Install</>}</button>
                  </div>
                ))}
                {filtered.length === 0 && <p className="col-span-full text-center text-gray-500 py-8">No plugins match your search</p>}
              </div>
            </div>
          </div>
        )}

        {tab === 'settings' && (
          <div className="max-w-2xl">
            <div className="card mb-6">
              <h3 className="text-lg font-bold mb-4">🔐 Environment Variables</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Edit your bot's secrets. Changes need a restart.</p>
              <div className="space-y-2">
                {env.map((e, i) => (
                  <div key={i} className="flex gap-2">
                    <input type="text" value={e.key} onChange={ev => { const v = [...env]; v[i].key = ev.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''); setEnv(v); }} className="input flex-1 font-mono text-sm" placeholder="KEY" />
                    <input type="text" value={e.value} onChange={ev => { const v = [...env]; v[i].value = ev.target.value; setEnv(v); }} className="input flex-1 font-mono text-sm" placeholder="value" />
                    <button onClick={() => setEnv(env.filter((_, j) => j !== i))} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-4">
                <button onClick={() => setEnv([...env, { key: '', value: '' }])} className="btn-secondary text-sm"><Plus className="w-4 h-4" /> Add</button>
                <button onClick={saveEnv} className="btn-primary text-sm"><SaveIcon className="w-4 h-4" /> Save</button>
              </div>
            </div>

            <div className="card mb-6">
              <h3 className="text-lg font-bold mb-4">📋 Preview .env</h3>
              <pre className="bg-gray-950 text-green-400 font-mono text-sm p-4 rounded-xl overflow-x-auto">{env.filter(v => v.key.trim()).map(v => `${v.key}=${v.value}`).join('\n') || '# No variables'}</pre>
            </div>

            <div className="card mb-6">
              <h3 className="text-lg font-bold mb-4">🤖 Bot Info</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                {[['ID', bot.id], ['Language', bot.language.toUpperCase()], ['Status', bot.status === 'running' ? '✅ Running' : '⏹ Stopped'],
                  ['Package.json', bot.hasPackageJson ? '✅ Yes' : '❌ No'], ['Deps', bot.depStatus === 'ready' ? '✅ Installed' : bot.depStatus === 'missing' ? '❌ Missing' : 'N/A'], ['Files', `${bot.files.length}`],
                ].map(([l, v]) => (
                  <div key={l} className="flex justify-between p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg"><span className="text-gray-500">{l}</span><span className="font-mono text-xs truncate ml-2">{v}</span></div>
                ))}
              </div>
            </div>

            <div className="card border-red-500/20">
              <h3 className="text-lg font-bold mb-2 text-red-600">⚠️ Danger Zone</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Delete this bot permanently. Cannot be undone.</p>
              <button onClick={async () => { if (confirm('Delete permanently?')) try { await deleteBot(bot.id); onBack(); } catch {} }} className="btn-danger text-sm"><Trash2 className="w-4 h-4" /> Delete Bot</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
