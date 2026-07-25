'use client';

import { useApp } from '@/lib/context';
import Link from 'next/link';
import { 
  Upload, Cpu, Shield, Layers, Settings, Zap,
  ArrowRight, ChevronDown, Star
} from 'lucide-react';
import { supportedLanguages } from '@/lib/data';

export default function LandingPage({ onLogin }: { onLogin: () => void }) {
  const { t } = useApp();
  
  const discordOAuthUrl = `https://discord.com/api/oauth2/authorize?client_id=1530409781045493882&redirect_uri=${encodeURIComponent('https://fp9.netlify.app/callback')}&response_type=code&scope=identify%20email`;

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative pt-32 pb-20 px-4 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-discord-blurple/5 to-transparent dark:from-discord-blurple/10" />
        <div className="absolute top-20 left-1/4 w-72 h-72 bg-discord-blurple/20 rounded-full blur-3xl animate-float" />
        <div className="absolute bottom-20 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-float" style={{ animationDelay: '2s' }} />
        
        <div className="relative max-w-7xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-discord-blurple/10 dark:bg-discord-blurple/20 border border-discord-blurple/20 rounded-full px-4 py-2 mb-8">
            <Star className="w-4 h-4 text-discord-blurple" />
            <span className="text-sm text-discord-blurple font-medium">Professional Discord Bot Hosting</span>
          </div>
          
          <h1 className="text-5xl md:text-7xl font-black mb-6">
            <span className="gradient-text">{t('hero.title')}</span>
          </h1>
          <p className="text-2xl md:text-3xl text-gray-600 dark:text-gray-300 mb-4 font-light">
            {t('hero.subtitle')}
          </p>
          <p className="text-lg text-gray-500 dark:text-gray-400 mb-10 max-w-2xl mx-auto">
            {t('hero.description')}
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a href={discordOAuthUrl} className="btn-primary text-lg px-8 py-3 glow">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
              </svg>
              {t('hero.cta')}
              <ArrowRight className="w-5 h-5" />
            </a>
            <a href="#features" className="btn-secondary text-lg px-8 py-3">
              {t('hero.cta2')}
              <ChevronDown className="w-5 h-5" />
            </a>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-4">{t('features.title')}</h2>
          <div className="w-20 h-1 bg-discord-blurple mx-auto mb-16 rounded-full" />
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { icon: Upload, key: 'upload', color: 'from-blue-500 to-cyan-500' },
              { icon: Cpu, key: 'auto', color: 'from-purple-500 to-pink-500' },
              { icon: Settings, key: 'env', color: 'from-green-500 to-emerald-500' },
              { icon: Layers, key: 'control', color: 'from-orange-500 to-red-500' },
              { icon: Shield, key: 'secure', color: 'from-indigo-500 to-purple-500' },
              { icon: Zap, key: 'multi', color: 'from-yellow-500 to-orange-500' },
            ].map(({ icon: Icon, key, color }) => (
              <div key={key} className="card group hover:scale-105 transition-all duration-300">
                <div className={`w-12 h-12 bg-gradient-to-br ${color} rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-xl font-bold mb-2">{t(`features.${key}.title`)}</h3>
                <p className="text-gray-500 dark:text-gray-400">{t(`features.${key}.desc`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Languages Section */}
      <section className="py-20 px-4 bg-gray-50 dark:bg-gray-900/50">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-4">{t('languages.title')}</h2>
          <div className="w-20 h-1 bg-discord-blurple mx-auto mb-16 rounded-full" />
          
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {supportedLanguages.map((lang) => (
              <div key={lang.id} className="card text-center hover:scale-105 transition-all duration-300">
                <div className="text-4xl mb-3">{lang.icon}</div>
                <h3 className="font-bold">{t(`languages.${lang.id}`)}</h3>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="card bg-gradient-to-br from-discord-blurple/10 to-purple-500/10 border-discord-blurple/20">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Ready to Deploy?</h2>
            <p className="text-gray-500 dark:text-gray-400 mb-8 text-lg">
              Join thousands of developers hosting their Discord bots with FP9 Host
            </p>
            <a href={discordOAuthUrl} className="btn-primary text-lg px-8 py-3 glow">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
              </svg>
              {t('nav.login')}
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
