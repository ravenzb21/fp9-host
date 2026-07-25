import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'FP9 Host - Discord Bot Hosting',
  description: 'Professional Discord bot hosting platform.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 min-h-screen">
        {children}
      </body>
    </html>
  );
}
