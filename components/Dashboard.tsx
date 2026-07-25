'use client';

import { useState } from 'react';
import { useApp } from '@/lib/context';
import { Plus, Play, Square, RotateCcw, Trash2, Cpu, MemoryStick, Clock, Upload, Terminal, BotIcon, AlertCircle, Package } from 'lucide-react';
import { Bot } from '@/lib/data';
import UploadModal from './UploadModal';
import BotDetail from './BotDetail';
import { startBot, stopBot, restartBot, deleteBot } from '@/lib/api';

interface DashboardProps {
  bots: Bot[];
  setBots: (bots: Bot[]) => void;
}

function StatusDot({ status }: { status: Bot['status'] }) {
  const colors = { running: 'bg-green-500', stopped: 'bg-red-500', starting: 'bg-yellow-500', error: 'bg-red-500' };
  return (
    <span className="relative flex h-2.5 w-2.5">
      {status === 'running' && <span className="animate-ping absolute h-full w-full rounded-full bg-green-400 opacity-75" />}
      <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${colors[status] || 'bg-gray-500'}`} />
    </span>
  );
}

function LangIcon({ lang }: { lang: string }) {
  const map: Record<string, string> = { 'discord.js': '🤖', nodejs: '📦', python: '🐍', java: '☕', go: '🔷', ruby: '💎', php: '🐘' };
  return <span className="text-xl">{map[lang] || '📄'}</span>;
}

export default function Dashboard({ bots, setBots }: DashboardProps) {
  const { t } = useApp();
  const [showUpload, setShowUpload] = useState(false);
  const [selectedBot, setSelectedBot] = useState<Bot | null>(null);
  const [botActions, setBotActions] = useState<Record<string, boolean>>({});
  const [error, setError] = useState('');

  const handleDeploy = (bot: Bot) => {
    setBots([bot, ...bots]);
    setShowUpload(false);
  };

  const handleDelete = async (botId: string) => {
    if (!confirm('Delete this bot permanently?')) return;
    try {
      await deleteBot(botId);
      setBots(bots.filter(b => b.id !== botId));
      if (selectedBot?.id === botId) setSelectedBot(null);
    } catch { setError('Failed to delete bot'); }
  };

  const handleAction = async (botId: string, action: 'start' | 'stop' | 'restart') => {
    setBotActions(p => ({ ...p, [botId]: true }));
    setError('');
    try {
      if (action === 'start') {
        await startBot(botId);
        setBots(bots.map(b => b.id === botId ? { ...b, status: 'running', uptime: 'Active' } : b));
      } else if (action === 'stop') {
        await stopBot(botId);
        setBots(bots.map(b => b.id === botId ? { ...b, status: 'stopped', uptime: '0m' } : b));
      } else {
        const res = await restartBot(botId);
        setBots(bots.map(b => b.id === botId ? { ...b, status: res.status as Bot['status'] } : b));
      }
    } catch (err: any) {
      setError(err.message || 'Action failed');
    }
    setBotActions(p => ({ ...p, [botId]: false }));
  };

  if (selectedBot) {
    return (
      <BotDetail
        bot={selectedBot}
        onBack={() => setSelectedBot(null)}
        onUpdate={(updated) => {
          setBots(bots.map(b => b.id === updated.id ? updated : b));
          setSelectedBot(updated);
        }}
      />
    );
  }

  const runningCount = bots.filter(b => b.status === 'running').length;
  const totalDeps = bots.filter(b => b.depStatus === 'ready').length;

  return (
    <div className="min-h-screen pt-24 pb-12 px-4">
      <div className="max-w-7xl mx-auto">
        {bots.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {[
              { label: 'Total Bots', value: bots.length, icon: BotIcon, color: 'from-blue-500 to-blue-600' },
              { label: 'Running', value: runningCount, icon: Play, color: 'from-green-500 to-green-600' },
              { label: 'Stopped', value: bots.length - runningCount, icon: Square, color: 'from-red-500 to-red-600' },
              { label: 'Deps Ready', value: totalDeps, icon: Package, color: 'from-purple-500 to-purple-600' },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className={`bg-gradient-to-br ${color} rounded-xl p-4 text-white shadow-lg`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm opacity-90">{label}</span>
                  <Icon className="w-5 h-5 opacity-60" />
                </div>
                <div className="text-3xl font-bold">{value}</div>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">{t('dashboard.title')}</h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              {bots.length === 0 ? t('dashboard.noBots') : `${bots.length} bot${bots.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          <button onClick={() => setShowUpload(true)} className="btn-primary shadow-lg shadow-discord-blurple/25">
            <Plus className="w-5 h-5" />
            {t('dashboard.addBot')}
          </button>
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-xl text-discord-red text-sm">
            <AlertCircle className="w-4 h-4" /> {error}
          </div>
        )}

        {bots.length === 0 ? (
          <div className="card text-center py-20">
            <div className="w-20 h-20 bg-discord-blurple/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <BotIcon className="w-10 h-10 text-discord-blurple" />
            </div>
            <h3 className="text-2xl font-bold mb-3">{t('dashboard.noBots')}</h3>
            <p className="text-gray-500 dark:text-gray-400 mb-8 max-w-md mx-auto">
              Upload your Discord bot as a ZIP file and start hosting it in seconds
            </p>
            <button onClick={() => setShowUpload(true)} className="btn-primary text-lg px-8 py-3 shadow-lg shadow-discord-blurple/25">
              <Upload className="w-5 h-5" />
              {t('dashboard.uploadFirst')}
            </button>
          </div>
        ) : (
          <div className="grid gap-4">
            {bots.map((bot) => (
              <div
                key={bot.id}
                className="card hover:shadow-xl hover:scale-[1.002] transition-all duration-200 cursor-pointer group"
                onClick={() => setSelectedBot(bot)}
              >
                <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="w-12 h-12 bg-gray-100 dark:bg-gray-700 rounded-xl flex items-center justify-center flex-shrink-0">
                      <LangIcon lang={bot.language} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="text-lg font-bold truncate">{bot.name}</h3>
                        <StatusDot status={bot.status} />
                        <span className={`text-xs font-medium ${bot.status === 'running' ? 'text-green-600 dark:text-green-400' : 'text-gray-500'}`}>
                          {bot.status === 'running' ? 'Running' : bot.status === 'stopped' ? 'Stopped' : bot.status === 'starting' ? 'Starting...' : 'Error'}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
                        <span className="flex items-center gap-1"><LangIcon lang={bot.language} /> {bot.language.toUpperCase()}</span>
                        <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {bot.uptime}</span>
                        {bot.depStatus === 'missing' && <span className="text-yellow-500 flex items-center gap-1"><Package className="w-3.5 h-3.5" /> No deps</span>}
                        {bot.depStatus === 'ready' && <span className="text-green-500 text-xs">✅ Deps OK</span>}
                        {bot.depStatus === 'missing-module' && <span className="text-red-500 text-xs">⚠️ Missing modules</span>}
                        <span>{bot.files.length} files</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                    {bot.status === 'stopped' || bot.status === 'error' ? (
                      <button onClick={() => handleAction(bot.id, 'start')} disabled={botActions[bot.id]}
                        className="btn-success text-sm"><Play className="w-4 h-4" /> <span className="hidden sm:inline">{t('dashboard.start')}</span>
                      </button>
                    ) : (
                      <button onClick={() => handleAction(bot.id, 'stop')} disabled={botActions[bot.id]}
                        className="btn-danger text-sm"><Square className="w-4 h-4" /> <span className="hidden sm:inline">{t('dashboard.stop')}</span>
                      </button>
                    )}
                    <button onClick={() => handleAction(bot.id, 'restart')} disabled={botActions[bot.id] || bot.status === 'stopped'}
                      className="btn-secondary text-sm"><RotateCcw className="w-4 h-4" />
                    </button>
                    <button onClick={() => setSelectedBot(bot)} className="btn-secondary text-sm"><Terminal className="w-4 h-4" /></button>
                    <button onClick={() => handleDelete(bot.id)}
                      className="p-2 text-gray-400 hover:text-discord-red hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {(bot.status === 'running' || bot.depStatus === 'ready') && (
                  <div className="mt-4 grid grid-cols-3 gap-4">
                    <div>
                      <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                        <span className="flex items-center gap-1"><Cpu className="w-3 h-3" /> CPU</span>
                        <span>{bot.resources.cpu}%</span>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                        <div className="bg-discord-blurple h-1.5 rounded-full transition-all duration-500" style={{ width: `${Math.min(bot.resources.cpu, 100)}%` }} />
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                        <span className="flex items-center gap-1"><MemoryStick className="w-3 h-3" /> RAM</span>
                        <span>{bot.resources.memory}MB</span>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                        <div className="bg-discord-green h-1.5 rounded-full transition-all duration-500" style={{ width: `${Math.min(bot.resources.memory / 2, 100)}%` }} />
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                        <span className="flex items-center gap-1">📁 Files</span>
                        <span>{bot.files.length}</span>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                        <div className="bg-discord-yellow h-1.5 rounded-full transition-all duration-500" style={{ width: `${Math.min(bot.files.length * 10, 100)}%` }} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {showUpload && <UploadModal onDeploy={handleDeploy} onClose={() => setShowUpload(false)} />}
    </div>
  );
}
