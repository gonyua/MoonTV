'use client';

import { ThemeToggle } from '@/components/ThemeToggle';
import { UserMenu } from '@/components/UserMenu';

interface NotesStandaloneLayoutProps {
  children: React.ReactNode;
  leftSlot?: React.ReactNode;
}

export function NotesStandaloneLayout({
  children,
  leftSlot,
}: NotesStandaloneLayoutProps) {
  return (
    <div className='min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-950 dark:to-gray-900'>
      <header className='sticky top-0 z-20 border-b border-gray-100/70 bg-white/80 backdrop-blur-md dark:border-gray-800/70 dark:bg-gray-950/80'>
        <div className='mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-8'>
          <div className='min-h-[44px] flex items-center gap-3'>{leftSlot}</div>
          <div className='flex items-center gap-3'>
            <ThemeToggle />
            <UserMenu />
          </div>
        </div>
      </header>
      <main className='mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-10'>
        {children}
      </main>
    </div>
  );
}
