'use client';
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type Lang = 'en' | 'ar';
type Theme = 'light' | 'dark';

const T: Record<string, Record<string, string>> = {
  en: {
    'title': 'FP9 Host', 'subtitle': 'Professional Discord Bot Hosting',
    'login': 'Login with Discord', 'logout': 'Logout', 'home': 'Home', 'dashboard': 'Dashboard',
    'start': 'Start', 'stop': 'Stop', 'restart': 'Restart', 'delete': 'Delete',
    'upload': 'Upload Bot', 'uploadFirst': 'Upload Your First Bot',
    'noBots': 'No bots yet', 'files': 'Files', 'console': 'Console', 'settings': 'Settings',
  },
  ar: {
    'title': 'FP9 Host', 'subtitle': 'استضافة بوتات ديسكورد الاحترافية',
    'login': 'تسجيل الدخول عبر ديسكورد', 'logout': 'تسجيل الخروج',
    'home': 'الرئيسية', 'dashboard': 'لوحة التحكم',
    'start': 'تشغيل', 'stop': 'إيقاف', 'restart': 'إعادة تشغيل', 'delete': 'حذف',
    'upload': 'رفع بوت', 'uploadFirst': 'ارفع أول بوت لك',
    'noBots': 'لا توجد بوتات بعد', 'files': 'الملفات', 'console': 'الكونسول', 'settings': 'الإعدادات',
  },
};

const Ctx = createContext<any>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>('en');
  const [theme, setTheme] = useState<Theme>('dark');
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const l = localStorage.getItem('fp9-lang') as Lang;
    const t = localStorage.getItem('fp9-theme') as Theme;
    const u = localStorage.getItem('fp9-user');
    if (l) setLang(l);
    if (t) setTheme(t);
    if (u) try { setUser(JSON.parse(u)); } catch {}
  }, []);

  useEffect(() => { localStorage.setItem('fp9-lang', lang); document.documentElement.lang = lang; }, [lang]);
  useEffect(() => {
    localStorage.setItem('fp9-theme', theme);
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const t = (key: string) => (T[lang] || T.en)[key] || key;

  return <Ctx.Provider value={{ lang, setLang, theme, setTheme, t, user, setUser }}>{children}</Ctx.Provider>;
}

export const useApp = () => useContext(Ctx);
