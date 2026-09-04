import type { Metadata } from 'next';

import { fontSans, fontDisplay, fontMono } from '@/lib/fonts';
import { cn } from '@/lib/utils';
import { Toaster } from '@/components/ui/toaster';
import './globals.css';

export const metadata: Metadata = {
  title: 'BizPilot',
  description: 'An AI-powered financial operations copilot for small and medium businesses.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(fontSans.variable, fontDisplay.variable, fontMono.variable, 'font-sans')}
    >
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
