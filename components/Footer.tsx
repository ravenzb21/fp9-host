'use client';

import { Bot, Heart } from 'lucide-react';
import { useApp } from '@/lib/context';

export default function Footer() {
  const { t } = useApp();
  
  return (
    <footer className="bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-discord-blurple rounded-lg flex items-center justify-center">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-bold gradient-text">FP9 Host</span>
          </div>
          
          <p className="text-gray-500 dark:text-gray-400 text-sm flex items-center gap-1">
            {t('footer.rights')} {t('footer.made')} <Heart className="w-4 h-4 text-discord-red fill-discord-red" /> FP9
          </p>
        </div>
      </div>
    </footer>
  );
}
