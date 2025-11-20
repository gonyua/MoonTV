'use client';

import { NotebookTabs } from 'lucide-react';

import { ThemeToggle } from '@/components/ThemeToggle';
import { UserMenu } from '@/components/UserMenu';

interface NotesStandaloneLayoutProps {
  children: React.ReactNode;
}

export function NotesStandaloneLayout({
  children,
}: NotesStandaloneLayoutProps) {
  return (
    <div className='min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-950 dark:to-gray-900'>
      <header className='sticky top-0 z-20 border-b border-gray-100/70 bg-white/80 backdrop-blur-md dark:border-gray-800/70 dark:bg-gray-950/80'>
        <div className='mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-8'>
          <div className='flex items-center gap-3'>
            <div className='flex items-center justify-center h-11 w-11 rounded-2xl bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-300'>
              <NotebookTabs className='h-5 w-5' />
            </div>
            <div className='space-y-1'>
              <p className='text-sm font-semibold text-gray-900 dark:text-gray-100'>
                笔记
              </p>
              <p className='text-xs text-gray-500 dark:text-gray-400'>
                保存任意灵感，支持Markdown
              </p>
            </div>
          </div>
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
