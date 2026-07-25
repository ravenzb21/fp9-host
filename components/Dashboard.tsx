'use client';
import { useState } from 'react';
import { useApp } from '@/lib/context';
import { Plus, Play, Square, RotateCcw, Trash2, Cpu, MemoryStick, Clock, Upload, Terminal, BotIcon, Package } from 'lucide-react';
import { Bot } from '@/lib/data';
import UploadModal from './UploadModal';
import BotDetail from './BotDetail';
import { startBot, stopBot, restartBot, deleteBot } from '@/lib/api';

function Ping({ on }: { on: boolean }) {
  return (
    <span className="relative flex h-2.5 w-2.5">
      {on && <span className="animate-ping absolute h-full w-full rounded-full bg-green-400 opacity-75" />}
      <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${on ? 'bg-green-500' : 'bg-red-500'}`} />
    </span>
  );
}

function LangIcon({ lang }: { lang: string }) {
  const m: Record<string, string> = { 'discord.js': '🤖', nodejs: '📦', python: '🐍', java: '☕', go: '🔷', ruby: '💎', php: '🐘' };
  return <span className="text-xl">{m[lang] || '📄'}</span>;
}

export default function Dashboard({ bots, setBots }: { bots: Bot[]; setBots: (b: Bot[]) => void }) {
  const { t } = useApp();
  const [showUpload, setShowUpload] = useState(false);
  const [selected, setSelected] = useState<Bot | null>(null);
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const handleAction = async (id: string, action: 'start' | 'stop' | 'restart') => {
    setBusy(p => ({ ...p, [id]: true }));
    try {
      const fn = action === 'start' ? startBot : action === 'stop' ? stopBot : restartBot;
      await fn(id);
      setBots(bots.map(b => b.id === id ? { ...b, status: action === 'stop' ? 'stopped' : 'running', uptime: action === 'stop' ? '0m' : 'Active' } : b));
    } catch {}
    setBusy(p => ({ ...p, [id]: false }));
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete permanently?')) return;
    try { await deleteBot(id); setBots(bots.filter(b => b.id !== id)); if (selected?.id === id) setSelected(null); } catch {}
  };

  if (selected) return <BotDetail bot={selected} onBack={() => setSelected(null)} onUpdate={u => { setBots(bots.map(b => b.id === u.id ? u : b)); setSelected(u); }} />;

  const running = bots.filter(b => b.status === 'running').length;
  const ready = bots.filter(b => b.depStatus === 'ready').length;

  return (
    <div className="min-h-screen pt-24 pb-12 px-4">
      <div className="max-w-7xl mx-auto">
        {bots.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {[
              { label: 'Total', value: bots.length, icon: BotIcon, color: 'from-blue-500 to-blue-600' },
              { label: 'Running', value: running, icon: Play, color: 'from-green-500 to-green-600' },
              { label: 'Stopped', value: bots.length - running, icon: Square, color: 'from-red-500 to-red-600' },
              { label: 'Ready', value: ready, icon: Package, color: 'from-purple-500 to-purple-600' },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className={`bg-gradient-to-br ${color} rounded-xl p-4 text-white shadow-lg`}>
                <div className="flex items-center justify-between mb-2"><span className="text-sm opacity-90">{label}</span><Icon className="w-5 h-5 opacity-60" /></div>
                <div className="text-3xl font-bold">{value}</div>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">{t('dashboard')}</h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">{bots.length === 0 ? t('noBots') : `${bots.length} bot${bots.length !== 1 ? 's' : ''}`}</p>
          </div>
          <button onClick={() => setShowUpload(true)} className="btn-primary shadow-lg shadow-discord-blurple/25"><Plus className="w-5 h-5" /> {t('upload')}</button>
        </div>

        {bots.length === 0 ? (
          <div className="card text-center py-20">
            <div className="w-20 h-20 bg-discord-blurple/10 rounded-2xl flex items-center justify-center mx-auto mb-6"><BotIcon className="w-10 h-10 text-discord-blurple" /></div>
            <h3 className="text-2xl font-bold mb-3">{t('noBots')}</h3>
            <p className="text-gray-500 dark:text-gray-400 mb-8 max-w-md mx-auto">Upload your Discord bot as a ZIP file and start hosting it in seconds</p>
            <button onClick={() => setShowUpload(true)} className="btn-primary text-lg px-8 py-3 shadow-lg shadow-discord-blurple/25"><Upload className="w-5 h-5" /> {t('uploadFirst')}</button>
          </div>
        ) : (
          <div className="grid gap-4">
            {bots.map(bot => (
              <div key={bot.id} className="card hover:shadow-xl hover:scale-[1.002] transition-all duration-200 cursor-pointer group" onClick={() => setSelected(bot)}>
                <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="w-12 h-12 bg-gray-100 dark:bg-gray-700 rounded-xl flex items-center justify-center flex-shrink-0"><LangIcon lang={bot.language} /></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="text-lg font-bold truncate">{bot.name}</h3>
                        <Ping on={bot.status === 'running'} />
                        <span className={`text-xs font-medium ${bot.status === 'running' ? 'text-green-600' : 'text-gray-500'}`}>{bot.status === 'running' ? 'Running' : bot.status === 'error' ? 'Error' : 'Stopped'}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
                        <span><LangIcon lang={bot.language} /> {bot.language.toUpperCase()}</span>
                        <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {bot.uptime}</span>
                        {bot.depStatus === 'ready' && <span className="text-green-500 text-xs">✅ Deps OK</span>}
                        {bot.depStatus === 'missing' && <span className="text-yellow-500 text-xs">⚠️ No deps</span>}
                        <span>{bot.files.length} files</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
                    {bot.status === 'stopped' || bot.status === 'error' ? (
                      <button onClick={() => handleAction(bot.id, 'start')} disabled={busy[bot.id]} className="btn-success text-sm"><Play className="w-4 h-4" /> <span className="hidden sm:inline">{t('start')}</span></button>
                    ) : (
                      <button onClick={() => handleAction(bot.id, 'stop')} disabled={busy[bot.id]} className="btn-danger text-sm"><Square className="w-4 h-4" /> <span className="hidden sm:inline">{t('stop')}</span></button>
                    )}
                    <button onClick={() => handleAction(bot.id, 'restart')} disabled={busy[bot.id] || bot.status === 'stopped'} className="btn-secondary text-sm"><RotateCcw className="w-4 h-4" /></button>
                    <button onClick={() => setSelected(bot)} className="btn-secondary text-sm"><Terminal className="w-4 h-4" /></button>
                    <button onClick={() => handleDelete(bot.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
                {(bot.status === 'running' || bot.depStatus === 'ready') && (
                  <div className="mt-4 grid grid-cols-3 gap-4">
                    {[
                      { label: 'CPU', value: `${bot.resources.cpu}%`, pct: bot.resources.cpu, color: 'bg-discord-blurple' },
                      { label: 'RAM', value: `${bot.resources.memory}MB`, pct: Math.min(bot.resources.memory / 2, 100), color: 'bg-green-500' },
                      { label: 'Files', value: `${bot.files.length}`, pct: Math.min(bot.files.length * 10, 100), color: 'bg-yellow-500' },
                    ].map(({ label, value, pct, color }) => (
                      <div key={label}>
                        <div className="flex justify-between text-xs text-gray-500 mb-1"><span>{label}</span><span>{value}</span></div>
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5"><div className={`${color} h-1.5 rounded-full transition-all duration-500`} style={{ width: `${Math.min(pct, 100)}%` }} /></div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      {showUpload && <UploadModal onDeploy={bot => { setBots([bot, ...bots]); setShowUpload(false); }} onClose={() => setShowUpload(false)} />}
    </div>
  );
}
