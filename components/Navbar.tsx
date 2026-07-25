'use client';
import { useState } from 'react';
import { useApp } from '@/lib/context';
import { Bot, Sun, Moon, Globe, LogOut, Menu, X } from 'lucide-react';

export default function Navbar({ loggedIn, onLogout }: { loggedIn: boolean; onLogout: () => void }) {
  const { lang, setLang, theme, setTheme, t } = useApp();
  const [open, setOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border-b border-gray-200 dark:border-gray-800">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <a href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-discord-blurple rounded-lg flex items-center justify-center">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-discord-blurple to-purple-500">FP9 Host</span>
        </a>

        <div className="hidden md:flex items-center gap-4">
          <button onClick={() => setLang(lang === 'en' ? 'ar' : 'en')} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" title={lang === 'en' ? 'العربية' : 'English'}>
            <Globe className="w-5 h-5" />
          </button>
          <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
          {loggedIn && (
            <button onClick={onLogout} className="btn-secondary text-sm"><LogOut className="w-4 h-4" /> {t('logout')}</button>
          )}
        </div>

        <button onClick={() => setOpen(!open)} className="md:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
          {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {open && (
        <div className="md:hidden border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-3 space-y-3">
          <div className="flex gap-2">
            <button onClick={() => setLang(lang === 'en' ? 'ar' : 'en')} className="btn-secondary text-sm flex-1 justify-center">
              <Globe className="w-4 h-4" /> {lang === 'en' ? 'العربية' : 'English'}
            </button>
            <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="btn-secondary text-sm flex-1 justify-center">
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
          {loggedIn && <button onClick={() => { onLogout(); setOpen(false); }} className="btn-secondary text-sm w-full justify-center"><LogOut className="w-4 h-4" /> {t('logout')}</button>}
        </div>
      )}
    </nav>
  );
}
