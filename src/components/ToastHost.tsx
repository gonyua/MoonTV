'use client';

import { useEffect, useState } from 'react';

type ToastPayload = {
  message: string;
  durationMs?: number;
};

type ToastItem = {
  id: string;
  message: string;
  expiresAt: number;
};

const EVENT_NAME = 'moon:toast';

export default function ToastHost() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<ToastPayload>;
      const message = customEvent.detail?.message?.trim();
      if (!message) return;

      const durationMs = Math.max(800, customEvent.detail?.durationMs ?? 2200);
      const now = Date.now();
      const toast: ToastItem = {
        id: `${now}-${Math.random().toString(16).slice(2)}`,
        message,
        expiresAt: now + durationMs,
      };

      setToasts((prev) => [...prev, toast].slice(-3));
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toast.id));
      }, durationMs);
    };

    window.addEventListener(EVENT_NAME, handler);
    return () => window.removeEventListener(EVENT_NAME, handler);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className='pointer-events-none fixed inset-x-0 bottom-20 z-[9999] flex flex-col items-center gap-2 px-4 md:bottom-6'>
      {toasts.map((t) => (
        <div
          key={t.id}
          role='status'
          className='max-w-[92vw] rounded-full bg-black/80 px-4 py-2 text-sm text-white shadow-lg backdrop-blur-sm'
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
