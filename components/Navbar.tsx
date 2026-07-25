'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useApp } from '@/lib/context';
import { Bot, Menu, X, Sun, Moon, Globe, LogOut } from 'lucide-react';

export default function Navbar({ isLoggedIn, onLogout }: { isLoggedIn: boolean; onLogout: () => void }) {
  const { language, setLanguage, theme, setTheme, t } = useApp();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border-b border-gray-200 dark:border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-discord-blurple rounded-lg flex items-center justify-center">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold gradient-text">FP9 Host</span>
          </Link>

          <div className="hidden md:flex items-center gap-4">
            <Link href="/" className="text-gray-600 dark:text-gray-300 hover:text-discord-blurple transition-colors">
              {t('nav.home')}
            </Link>
            {isLoggedIn && (
              <a href="/" className="text-gray-600 dark:text-gray-300 hover:text-discord-blurple transition-colors">
                {t('nav.dashboard')}
              </a>
            )}

            <button
              onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title={language === 'en' ? 'العربية' : 'English'}
            >
              <Globe className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            </button>

            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title={t('theme.toggle')}
            >
              {theme === 'dark' ? (
                <Sun className="w-5 h-5 text-gray-300" />
              ) : (
                <Moon className="w-5 h-5 text-gray-600" />
              )}
            </button>

            {isLoggedIn ? (
              <button onClick={onLogout} className="btn-secondary text-sm">
                <LogOut className="w-4 h-4" />
                {t('nav.logout')}
              </button>
            ) : (
              <a
                href={`https://discord.com/api/oauth2/authorize?client_id=1530409781045493882&redirect_uri=${encodeURIComponent('https://fp9.netlify.app/callback')}&response_type=code&scope=identify%20email`}
                className="btn-primary text-sm"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                </svg>
                {t('nav.login')}
              </a>
            )}
          </div>

          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="md:hidden bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800">
          <div className="px-4 py-3 space-y-3">
            <Link href="/" className="block py-2 text-gray-600 dark:text-gray-300" onClick={() => setMobileMenuOpen(false)}>
              {t('nav.home')}
            </Link>
            {isLoggedIn && (
              <a href="/" className="block py-2 text-gray-600 dark:text-gray-300" onClick={() => setMobileMenuOpen(false)}>
                {t('nav.dashboard')}
              </a>
            )}
            <div className="flex gap-2 pt-2">
              <button onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')} className="btn-secondary text-sm flex-1">
                <Globe className="w-4 h-4" /> {language === 'en' ? 'العربية' : 'English'}
              </button>
              <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="btn-secondary text-sm flex-1">
                {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
            </div>
            {isLoggedIn ? (
              <button onClick={() => { onLogout(); setMobileMenuOpen(false); }} className="btn-secondary text-sm w-full">
                <LogOut className="w-4 h-4" /> {t('nav.logout')}
              </button>
            ) : (
              <a href={`https://discord.com/api/oauth2/authorize?client_id=1530409781045493882&redirect_uri=${encodeURIComponent('https://fp9.netlify.app/callback')}&response_type=code&scope=identify%20email`} className="btn-primary text-sm w-full justify-center">
                {t('nav.login')}
              </a>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
