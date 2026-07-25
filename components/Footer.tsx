'use client';
import { Bot, Heart } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 py-8 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-discord-blurple rounded-lg flex items-center justify-center">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <span className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-discord-blurple to-purple-500">FP9 Host</span>
        </div>
        <p className="text-gray-500 dark:text-gray-400 text-sm flex items-center gap-1">
          Made with <Heart className="w-4 h-4 text-red-500 fill-red-500" /> by FP9
        </p>
      </div>
    </footer>
  );
}
