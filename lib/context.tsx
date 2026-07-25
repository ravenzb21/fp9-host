'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type Language = 'en' | 'ar';
type Theme = 'light' | 'dark';

interface DiscordUser {
  id: string;
  username: string;
  avatar: string;
  discriminator: string;
  global_name: string;
}

interface AppContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  t: (key: string) => string;
  user: DiscordUser | null;
  setUser: (user: DiscordUser | null) => void;
}

const translations = {
  en: {
    // Navigation
    'nav.home': 'Home',
    'nav.dashboard': 'Dashboard',
    'nav.login': 'Login with Discord',
    'nav.logout': 'Logout',
    
    // Landing Page
    'hero.title': 'FP9 Host',
    'hero.subtitle': 'Professional Discord Bot Hosting',
    'hero.description': 'Upload your bot as a ZIP file, select the language, edit .env variables, and run your bot instantly with a professional control panel.',
    'hero.cta': 'Get Started',
    'hero.cta2': 'Learn More',
    
    // Features
    'features.title': 'Why FP9 Host?',
    'features.upload.title': 'ZIP Upload',
    'features.upload.desc': 'Upload your bot project as a ZIP file and we handle the rest automatically.',
    'features.auto.title': 'Auto Language Detection',
    'features.auto.desc': 'We detect Node.js, Python, and more. Or choose manually if needed.',
    'features.env.title': '.env Editor',
    'features.env.desc': 'Edit environment variables directly from the dashboard with live preview.',
    'features.control.title': 'Full Control Panel',
    'features.control.desc': 'Start, stop, restart, and monitor your bots in real-time.',
    'features.secure.title': 'Secure & Isolated',
    'features.secure.desc': 'Each bot runs in its own isolated environment for maximum security.',
    'features.multi.title': 'Multi-Bot Support',
    'features.multi.desc': 'Host multiple bots per account with individual management for each.',
    
    // Languages
    'languages.title': 'Supported Languages',
    'languages.nodejs': 'Node.js',
    'languages.python': 'Python',
    'languages.java': 'Java',
    'languages.go': 'Go',
    'languages.ruby': 'Ruby',
    'languages.php': 'PHP',
    
    // Dashboard
    'dashboard.title': 'My Bots',
    'dashboard.addBot': 'Add Bot',
    'dashboard.noBots': 'No bots yet. Upload your first bot!',
    'dashboard.uploadFirst': 'Upload Bot',
    'dashboard.botName': 'Bot Name',
    'dashboard.language': 'Language',
    'dashboard.status': 'Status',
    'dashboard.uptime': 'Uptime',
    'dashboard.lastUpdate': 'Last Update',
    'dashboard.actions': 'Actions',
    'dashboard.start': 'Start',
    'dashboard.stop': 'Stop',
    'dashboard.restart': 'Restart',
    'dashboard.logs': 'Logs',
    'dashboard.settings': 'Settings',
    'dashboard.delete': 'Delete',
    
    // Upload
    'upload.title': 'Upload Bot',
    'upload.subtitle': 'Upload a ZIP file containing your bot project',
    'upload.dragDrop': 'Drag & drop your ZIP file here, or click to browse',
    'upload.supported': 'Supported: .zip files up to 50MB',
    'upload.uploading': 'Uploading...',
    'upload.success': 'Upload successful!',
    'upload.error': 'Upload failed. Please try again.',
    'upload.detecting': 'Detecting language...',
    'upload.detected': 'Detected:',
    'upload.selectLanguage': 'Select Language (if not auto-detected)',
    'upload.botName': 'Bot Name',
    'upload.envEditor': 'Environment Variables (.env)',
    'upload.envDescription': 'Edit your environment variables below',
    'upload.addVar': 'Add Variable',
    'upload.deploy': 'Deploy Bot',
    'upload.cancel': 'Cancel',
    'upload.analyzing': 'Analyzing project...',
    'upload.language': 'Language',
    'upload.back': 'Back',
    
    // Bot Detail
    'bot.logs': 'Bot Logs',
    'bot.resources': 'Resource Usage',
    'bot.cpu': 'CPU',
    'bot.memory': 'Memory',
    'bot.disk': 'Disk',
    
    // Status
    'status.running': 'Running',
    'status.stopped': 'Stopped',
    'status.starting': 'Starting...',
    'status.error': 'Error',
    
    // Footer
    'footer.rights': 'All rights reserved.',
    'footer.made': 'Made with',
    
    // Theme
    'theme.light': 'Light',
    'theme.dark': 'Dark',
    'theme.toggle': 'Toggle theme',
  },
  ar: {
    // Navigation
    'nav.home': 'الرئيسية',
    'nav.dashboard': 'لوحة التحكم',
    'nav.login': 'تسجيل الدخول عبر ديسكورد',
    'nav.logout': 'تسجيل الخروج',
    
    // Landing Page
    'hero.title': 'FP9 Host',
    'hero.subtitle': 'استضافة بوتات ديسكورد الاحترافية',
    'hero.description': 'ارفع ملف البوت كملف ZIP، حدد اللغة، عدّل متغيرات البيئة، وشغّل بوتك فوراً مع لوحة تحكم احترافية.',
    'hero.cta': 'ابدأ الآن',
    'hero.cta2': 'اعرف المزيد',
    
    // Features
    'features.title': 'لماذا FP9 Host؟',
    'features.upload.title': 'رفع ZIP',
    'features.upload.desc': 'ارفع مشروع البوت كملف ZIP ونتولى الباقي تلقائياً.',
    'features.auto.title': 'اكتشاف اللغة تلقائياً',
    'features.auto.desc': 'نكتشف Node.js و Python والمزيد. أو اختر يدوياً إذا لزم الأمر.',
    'features.env.title': 'محرر .env',
    'features.env.desc': 'عدّل متغيرات البيئة مباشرة من لوحة التحكم مع معاينة حية.',
    'features.control.title': 'لوحة تحكم كاملة',
    'features.control.desc': 'شغّل وأعد تشغيل وأوقف بوتاتك ومراقبتها في الوقت الفعلي.',
    'features.secure.title': 'آمن ومعزول',
    'features.secure.desc': 'كل بوت يعمل في بيئة معزولة لأقصى درجات الأمان.',
    'features.multi.title': 'دعم بوتات متعددة',
    'features.multi.desc': 'استضف عدة بوتات لكل حساب مع إدارة فردية لكل منها.',
    
    // Languages
    'languages.title': 'اللغات المدعومة',
    'languages.nodejs': 'Node.js',
    'languages.python': 'Python',
    'languages.java': 'Java',
    'languages.go': 'Go',
    'languages.ruby': 'Ruby',
    'languages.php': 'PHP',
    
    // Dashboard
    'dashboard.title': 'بوتاتي',
    'dashboard.addBot': 'إضافة بوت',
    'dashboard.noBots': 'لا توجد بوتات بعد. ارفع بوتك الأول!',
    'dashboard.uploadFirst': 'رفع بوت',
    'dashboard.botName': 'اسم البوت',
    'dashboard.language': 'اللغة',
    'dashboard.status': 'الحالة',
    'dashboard.uptime': 'وقت التشغيل',
    'dashboard.lastUpdate': 'آخر تحديث',
    'dashboard.actions': 'الإجراءات',
    'dashboard.start': 'تشغيل',
    'dashboard.stop': 'إيقاف',
    'dashboard.restart': 'إعادة تشغيل',
    'dashboard.logs': 'السجلات',
    'dashboard.settings': 'الإعدادات',
    'dashboard.delete': 'حذف',
    
    // Upload
    'upload.title': 'رفع بوت',
    'upload.subtitle': 'ارفع ملف ZIP يحتوي على مشروع البوت',
    'upload.dragDrop': 'اسحب وأفلت ملف ZIP هنا، أو انقر للتصفح',
    'upload.supported': 'الملفات المدعومة: .zip حتى 50 ميجا',
    'upload.uploading': 'جارٍ الرفع...',
    'upload.success': 'تم الرفع بنجاح!',
    'upload.error': 'فشل الرفع. يرجى المحاولة مرة أخرى.',
    'upload.detecting': 'جارٍ اكتشاف اللغة...',
    'upload.detected': 'تم اكتشاف:',
    'upload.selectLanguage': 'اختر اللغة (إذا لم يتم اكتشافها تلقائياً)',
    'upload.botName': 'اسم البوت',
    'upload.envEditor': 'متغيرات البيئة (.env)',
    'upload.envDescription': 'عدّل متغيرات البيئة أدناه',
    'upload.addVar': 'إضافة متغير',
    'upload.deploy': 'نشر البوت',
    'upload.cancel': 'إلغاء',
    
    // Bot Detail
    'bot.logs': 'سجلات البوت',
    'bot.resources': 'استهلاك الموارد',
    'bot.cpu': 'المعالج',
    'bot.memory': 'الذاكرة',
    'bot.disk': 'القرص',
    
    // Status
    'status.running': 'يعمل',
    'status.stopped': 'متوقف',
    'status.starting': 'جارٍ التشغيل...',
    'status.error': 'خطأ',
    
    // Footer
    'footer.rights': 'جميع الحقوق محفوظة.',
    'footer.made': 'صُنع بـ',
    
    // Theme
    'theme.light': 'فاتح',
    'theme.dark': 'داكن',
    'theme.toggle': 'تبديل المظهر',
  },
};

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>('en');
  const [theme, setTheme] = useState<Theme>('dark');
  const [user, setUser] = useState<DiscordUser | null>(null);

  useEffect(() => {
    const savedLang = localStorage.getItem('fp9-lang') as Language;
    const savedTheme = localStorage.getItem('fp9-theme') as Theme;
    const savedUser = localStorage.getItem('fp9-user');
    if (savedLang) setLanguage(savedLang);
    if (savedTheme) setTheme(savedTheme);
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch {}
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('fp9-lang', language);
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    localStorage.setItem('fp9-theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const t = (key: string): string => {
    const currentLang = language as keyof typeof translations;
    const langDict = translations[currentLang] || translations.en;
    return (langDict as Record<string, string>)[key] || key;
  };

  return (
    <AppContext.Provider value={{ language, setLanguage, theme, setTheme, t, user, setUser }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
}
