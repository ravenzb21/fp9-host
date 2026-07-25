'use client';

import { useState } from 'react';
import { useApp } from '@/lib/context';
import { Bot as BotIcon, Plus, Play, Square, RotateCcw, Trash2, Clock, Cpu, HardDrive, MemoryStick, Upload, FolderOpen, Terminal, Settings } from 'lucide-react';
import { Bot, getFileIcon } from '@/lib/data';
import UploadModal from './UploadModal';
import BotDetail from './BotDetail';
import { startBot, stopBot, restartBot, deleteBot } from '@/lib/api';

interface DashboardProps {
  bots: Bot[];
  setBots: (bots: Bot[]) => void;
}

export default function Dashboard({ bots, setBots }: DashboardProps) {
  const { t } = useApp();
  const [showUpload, setShowUpload] = useState(false);
  const [selectedBot, setSelectedBot] = useState<Bot | null>(null);
  const [botActions, setBotActions] = useState<Record<string, boolean>>({});

  const handleDeploy = (bot: Bot) => {
    setBots([...bots, bot]);
    setShowUpload(false);
  };

  const handleDelete = async (botId: string) => {
    if (!confirm('Delete this bot permanently?')) return;
    try {
      await deleteBot(botId);
      setBots(bots.filter(b => b.id !== botId));
      if (selectedBot?.id === botId) setSelectedBot(null);
    } catch (err) {
      alert('Failed to delete bot');
    }
  };

  const toggleBotStatus = async (botId: string, action: 'start' | 'stop' | 'restart') => {
    setBotActions(prev => ({ ...prev, [botId]: true }));
    try {
      if (action === 'start') {
        await startBot(botId);
        setBots(bots.map(bot => bot.id === botId ? { ...bot, status: 'running' as const, uptime: 'Active' } : bot));
      } else if (action === 'stop') {
        await stopBot(botId);
        setBots(bots.map(bot => bot.id === botId ? { ...bot, status: 'stopped' as const, uptime: '0m' } : bot));
      } else if (action === 'restart') {
        await restartBot(botId);
        setBots(bots.map(bot => bot.id === botId ? { ...bot, status: 'running' as const } : bot));
      }
    } catch (err: any) {
      alert(err.message || 'Action failed');
    }
    setBotActions(prev => ({ ...prev, [botId]: false }));
  };

  const getStatusColor = (status: Bot['status']) => {
    switch (status) {
      case 'running': return 'status-running';
      case 'stopped': return 'status-stopped';
      case 'starting': return 'status-starting';
      case 'error': return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400';
    }
  };

  const getLanguageInfo = (lang: string) => {
    const icons: Record<string, string> = {
      nodejs: '📦', python: '🐍', java: '☕', go: '🔷', ruby: '💎', php: '🐘'
    };
    return icons[lang] || '📄';
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

  return (
    <div className="min-h-screen pt-24 pb-12 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">{t('dashboard.title')}</h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              {bots.length === 0 ? t('dashboard.noBots') : `${bots.length} bot${bots.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          <button onClick={() => setShowUpload(true)} className="btn-primary">
            <Plus className="w-5 h-5" />
            {t('dashboard.addBot')}
          </button>
        </div>

        {bots.length === 0 ? (
          <div className="card text-center py-20">
            <div className="w-20 h-20 bg-discord-blurple/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <BotIcon className="w-10 h-10 text-discord-blurple" />
            </div>
            <h3 className="text-2xl font-bold mb-3">{t('dashboard.noBots')}</h3>
            <p className="text-gray-500 dark:text-gray-400 mb-8 max-w-md mx-auto">
              Upload your Discord bot as a ZIP file and start hosting it in seconds
            </p>
            <button onClick={() => setShowUpload(true)} className="btn-primary text-lg px-8 py-3">
              <Upload className="w-5 h-5" />
              {t('dashboard.uploadFirst')}
            </button>
          </div>
        ) : (
          <div className="grid gap-4">
            {bots.map((bot) => (
              <div
                key={bot.id}
                className="card hover:scale-[1.005] transition-all duration-200 cursor-pointer group"
                onClick={() => setSelectedBot(bot)}
              >
                <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="w-12 h-12 bg-gray-100 dark:bg-gray-700 rounded-xl flex items-center justify-center text-2xl flex-shrink-0">
                      {getLanguageInfo(bot.language)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="text-lg font-bold truncate">{bot.name}</h3>
                        <span className={`status-badge ${getStatusColor(bot.status)}`}>
                          <span className="w-1.5 h-1.5 rounded-full bg-current" />
                          {t(`status.${bot.status}`)}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                        <span className="flex items-center gap-1">
                          {getLanguageInfo(bot.language)} {bot.language.toUpperCase()}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" /> {bot.uptime}
                        </span>
                        <span className="flex items-center gap-1">
                          <Cpu className="w-3.5 h-3.5" /> {bot.resources.cpu}%
                        </span>
                        <span className="flex items-center gap-1">
                          <MemoryStick className="w-3.5 h-3.5" /> {bot.resources.memory}MB
                        </span>
                        <span className="flex items-center gap-1">
                          <FolderOpen className="w-3.5 h-3.5" /> {bot.files.length} files
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                    {bot.status === 'stopped' || bot.status === 'error' ? (
                      <button
                        onClick={() => toggleBotStatus(bot.id, 'start')}
                        disabled={botActions[bot.id]}
                        className="btn-success text-sm"
                      >
                        <Play className="w-4 h-4" />
                        <span className="hidden sm:inline">{t('dashboard.start')}</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => toggleBotStatus(bot.id, 'stop')}
                        disabled={botActions[bot.id]}
                        className="btn-danger text-sm"
                      >
                        <Square className="w-4 h-4" />
                        <span className="hidden sm:inline">{t('dashboard.stop')}</span>
                      </button>
                    )}
                    <button
                      onClick={() => toggleBotStatus(bot.id, 'restart')}
                      disabled={botActions[bot.id] || bot.status === 'stopped'}
                      className="btn-secondary text-sm"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setSelectedBot(bot)}
                      className="btn-secondary text-sm"
                    >
                      <Terminal className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(bot.id)}
                      className="p-2 text-gray-400 hover:text-discord-red hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {bot.status === 'running' && (
                  <div className="mt-4 grid grid-cols-3 gap-4">
                    <div>
                      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                        <span className="flex items-center gap-1"><Cpu className="w-3 h-3" /> CPU</span>
                        <span>{bot.resources.cpu}%</span>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                        <div
                          className="bg-discord-blurple h-1.5 rounded-full transition-all duration-500"
                          style={{ width: `${Math.min(bot.resources.cpu, 100)}%` }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                        <span className="flex items-center gap-1"><MemoryStick className="w-3 h-3" /> RAM</span>
                        <span>{bot.resources.memory}MB</span>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                        <div
                          className="bg-discord-green h-1.5 rounded-full transition-all duration-500"
                          style={{ width: `${Math.min(bot.resources.memory, 100)}%` }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                        <span className="flex items-center gap-1"><HardDrive className="w-3 h-3" /> Disk</span>
                        <span>{bot.resources.disk}MB</span>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                        <div
                          className="bg-discord-yellow h-1.5 rounded-full transition-all duration-500"
                          style={{ width: `${Math.min(bot.resources.disk * 2, 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {showUpload && (
        <UploadModal
          onDeploy={handleDeploy}
          onClose={() => setShowUpload(false)}
        />
      )}
    </div>
  );
}
