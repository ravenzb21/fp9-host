import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'FP9 Host - Discord Bot Hosting',
  description: 'Professional Discord bot hosting platform. Upload, manage, and run your bots with ease.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
