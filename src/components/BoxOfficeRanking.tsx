'use client';

import { useEffect, useState } from 'react';

import { BoxOfficeItem, BoxOfficeResult } from '@/lib/types';

interface BoxOfficeRankingProps {
  type: 'global' | 'china';
  title: string;
  className?: string;
}

export default function BoxOfficeRanking({
  type,
  title,
  className,
}: BoxOfficeRankingProps) {
  const [items, setItems] = useState<BoxOfficeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch(`/api/boxoffice/${type}`);
        const data: BoxOfficeResult = await response.json();

        if (data.code === 200) {
          setItems(data.list.slice(0, 10));
        } else {
          setError(data.message || '获取数据失败');
        }
      } catch {
        setError('网络错误');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [type]);

  if (loading) {
    return (
      <div className={`flex-1 min-w-0 ${className || ''}`}>
        <h3 className='text-base font-bold text-gray-800 dark:text-gray-200 mb-2'>
          {title}
        </h3>
        <div className='space-y-2'>
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className='h-8 bg-gray-200 dark:bg-gray-800 rounded animate-pulse'
            />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex-1 min-w-0 ${className || ''}`}>
        <h3 className='text-base font-bold text-gray-800 dark:text-gray-200 mb-2'>
          {title}
        </h3>
        <div className='text-sm text-gray-500 dark:text-gray-400'>{error}</div>
      </div>
    );
  }

  return (
    <div className={`flex-1 min-w-0 ${className || ''}`}>
      <h3 className='text-base font-bold text-gray-800 dark:text-gray-200 mb-2'>
        {title}
      </h3>
      <div className='space-y-1'>
        {items.map((item) => (
          <div
            key={item.rank}
            className='flex items-center gap-2 py-1.5 px-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors'
          >
            <span
              className={`w-5 h-5 flex items-center justify-center text-xs font-bold rounded ${
                item.rank <= 3
                  ? 'bg-orange-500 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
              }`}
            >
              {item.rank}
            </span>
            <span className='flex-1 truncate text-sm text-gray-800 dark:text-gray-200'>
              {item.title}
            </span>
            <span className='text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap'>
              {item.grossWanText}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
