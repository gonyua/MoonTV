'use client';

import { Info } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { MovieSquareItem, MovieSquareResult } from '@/lib/types';

const YEARS = [
  'all',
  ...Array.from({ length: 16 }, (_, index) => String(2026 - index)),
];

function getYearLabel(year: string) {
  return year === 'all' ? '全部' : year;
}

function formatNumber(value?: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '-';
  }

  return String(Math.round(value));
}

async function copyTextToClipboard(text: string) {
  const content = text.trim();
  if (!content) return;

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(content);
      return;
    }
  } catch {
    // Continue with the legacy fallback below.
  }

  const textarea = document.createElement('textarea');
  textarea.value = content;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
}

function getInitialYear(value: string | null) {
  if (!value) return '2026';
  return YEARS.includes(value) ? value : '2026';
}

function getRankClassName(rank: number) {
  if (rank === 1) {
    return 'bg-[#e83355] text-white shadow-[0_2px_4px_rgba(232,51,85,0.28)]';
  }

  if (rank === 2) {
    return 'bg-[#f2a23a] text-white shadow-[0_2px_4px_rgba(242,162,58,0.25)]';
  }

  if (rank === 3) {
    return 'bg-[#5d83cc] text-white shadow-[0_2px_4px_rgba(93,131,204,0.24)]';
  }

  return 'text-gray-400 dark:text-gray-500';
}

export default function MoviesquarePageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedYear, setSelectedYear] = useState(() =>
    getInitialYear(searchParams.get('year'))
  );
  const [data, setData] = useState<MovieSquareResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const title = useMemo(() => {
    return selectedYear === 'all'
      ? '电影票房总榜'
      : `${selectedYear}年电影票房总榜`;
  }, [selectedYear]);

  useEffect(() => {
    const yearFromUrl = getInitialYear(searchParams.get('year'));
    setSelectedYear(yearFromUrl);
  }, [searchParams]);

  useEffect(() => {
    const controller = new AbortController();

    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const query = selectedYear === 'all' ? '' : `?year=${selectedYear}`;
        const response = await fetch(`/api/moviesquare${query}`, {
          signal: controller.signal,
          cache: 'no-store',
        });
        const result = (await response.json()) as MovieSquareResult;

        if (!response.ok || result.code !== 200) {
          throw new Error(result.message || `请求失败: ${response.status}`);
        }

        setData(result);
      } catch (err) {
        if (controller.signal.aborted) return;
        const message = err instanceof Error ? err.message : '获取数据失败';
        setError(message);
        setData(null);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => controller.abort();
  }, [selectedYear]);

  const handleYearClick = (year: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (year === 'all') {
      params.delete('year');
    } else {
      params.set('year', year);
    }

    const query = params.toString();
    router.replace(`/moviesquare${query ? `?${query}` : ''}`, {
      scroll: false,
    });
    setSelectedYear(year);
  };

  const openSenPlayer = async (
    title: string,
    event: {
      preventDefault: () => void;
      stopPropagation: () => void;
    }
  ) => {
    event.preventDefault();
    event.stopPropagation();
    await copyTextToClipboard(title);
    window.location.href = 'SenPlayer://';
  };

  const handleRowClick = (item: MovieSquareItem) => {
    if (!item.detailUrl) return;
    window.location.href = item.detailUrl;
  };

  return (
    <main className='min-h-screen bg-white text-gray-950 dark:bg-black dark:text-gray-100'>
      <div className='mx-auto min-h-screen w-full bg-white dark:bg-black md:max-w-[720px] md:border-x md:border-gray-100 md:shadow-sm md:dark:border-gray-900'>
        <div className='sticky top-0 z-20 border-b border-gray-100 bg-white/95 backdrop-blur dark:border-gray-900 dark:bg-black/95'>
          <div className='overflow-x-auto scrollbar-hide'>
            <div className='flex min-w-max items-center gap-7 px-6 md:px-8'>
              {YEARS.map((year) => {
                const active = selectedYear === year;
                return (
                  <button
                    key={year}
                    type='button'
                    onClick={() => handleYearClick(year)}
                    className={`relative h-[44px] shrink-0 text-[14px] font-semibold leading-none tracking-normal transition-colors md:h-[52px] md:text-[16px] ${
                      active
                        ? 'text-[#d8213d]'
                        : 'text-gray-950 hover:text-[#d8213d] dark:text-gray-100 dark:hover:text-[#ff5a70]'
                    }`}
                  >
                    {getYearLabel(year)}
                    {active && (
                      <span className='absolute bottom-0 left-1/2 h-[3px] w-6 -translate-x-1/2 rounded-full bg-[#d8213d] md:w-7' />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <section className='border-b border-gray-100 bg-white px-4 pb-2 pt-3 dark:border-gray-900 dark:bg-black md:px-7 md:pt-4'>
          <div className='flex flex-wrap items-baseline gap-2'>
            <h1 className='text-[16px] font-extrabold leading-tight tracking-normal text-gray-950 dark:text-gray-50 md:text-[19px]'>
              {title}
            </h1>
            {(data?.updateTime || data?.totalGrossText) && (
              <div className='flex items-baseline gap-1 text-[11px] font-semibold leading-tight text-gray-400 dark:text-gray-500 md:text-[13px]'>
                <span>
                  (
                  {[
                    data?.updateTime ? `截至 ${data.updateTime}` : '',
                    data?.totalGrossText || '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  )
                </span>
                <Info className='relative top-0.5 h-3 w-3 text-gray-400 dark:text-gray-600' />
              </div>
            )}
          </div>
        </section>

        <div className='grid grid-cols-[49%_22%_15%_14%] bg-gray-50 px-4 py-3 text-[12px] font-medium text-gray-700 dark:bg-[#101010] dark:text-gray-300 md:px-7 md:text-[14px]'>
          <div>排名</div>
          <div className='text-right'>票房</div>
          <div className='whitespace-nowrap text-right'>平均票价</div>
          <div className='whitespace-nowrap text-right'>场均人数</div>
        </div>

        {loading ? (
          <div className='divide-y divide-gray-50 dark:divide-gray-900'>
            {Array.from({ length: 12 }).map((_, index) => (
              <div
                key={index}
                className='grid h-[62px] grid-cols-[49%_22%_15%_14%] items-center px-4 md:h-[74px] md:px-7'
              >
                <div className='flex items-center gap-4'>
                  <div className='h-7 w-7 rounded bg-gray-100 dark:bg-gray-900' />
                  <div className='space-y-2'>
                    <div className='h-4 w-32 rounded bg-gray-100 dark:bg-gray-900' />
                    <div className='h-3 w-20 rounded bg-gray-100 dark:bg-gray-900' />
                  </div>
                </div>
                <div className='ml-auto h-4 w-14 rounded bg-gray-100 dark:bg-gray-900' />
                <div className='ml-auto h-4 w-8 rounded bg-gray-100 dark:bg-gray-900' />
                <div className='ml-auto h-4 w-8 rounded bg-gray-100 dark:bg-gray-900' />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className='px-5 py-16 text-center text-sm text-gray-500 dark:text-gray-400'>
            {error}
          </div>
        ) : data?.list.length ? (
          <div className='divide-y divide-gray-50 dark:divide-gray-900'>
            {data.list.map((item) => (
              <div
                key={`${item.rank}-${item.movieId || item.title}`}
                role='link'
                tabIndex={0}
                onClick={() => handleRowClick(item)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    handleRowClick(item);
                  }
                }}
                className='grid min-h-[62px] w-full grid-cols-[49%_22%_15%_14%] items-center px-4 text-left transition-colors hover:bg-gray-50 active:bg-gray-100 dark:hover:bg-[#0d0d0d] dark:active:bg-[#151515] md:min-h-[74px] md:px-7'
              >
                <div className='flex min-w-0 items-center gap-3 pr-2'>
                  <span
                    className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center text-[14px] font-bold ${getRankClassName(
                      item.rank
                    )} ${
                      item.rank <= 3
                        ? 'rounded-md'
                        : 'rounded-none bg-transparent'
                    }`}
                  >
                    {item.rank}
                  </span>
                  <div className='min-w-0'>
                    <div className='flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5'>
                      <span className='min-w-0 break-words text-[13px] font-bold leading-tight text-gray-950 dark:text-gray-50 md:text-[15px]'>
                        {item.title}
                      </span>
                      <button
                        type='button'
                        onClick={(event) => {
                          void openSenPlayer(item.title, event);
                        }}
                        className='shrink-0 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 md:text-[11px]'
                      >
                        [可播放]
                      </button>
                    </div>
                    <div className='mt-1 text-[12px] leading-none text-gray-500 dark:text-gray-500 md:text-[13px]'>
                      {item.releaseDate || item.year || '-'}
                    </div>
                  </div>
                </div>

                <div className='whitespace-nowrap text-right text-[14px] font-semibold text-[#c82643] dark:text-[#ff5a70] md:text-[15px]'>
                  {item.grossText}
                </div>
                <div className='text-right text-[14px] font-medium text-gray-950 dark:text-gray-100 md:text-[15px]'>
                  {formatNumber(item.avgPrice)}
                </div>
                <div className='text-right text-[14px] font-medium text-gray-950 dark:text-gray-100 md:text-[15px]'>
                  {formatNumber(item.avgPeoplePerShow)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className='px-5 py-16 text-center text-sm text-gray-500 dark:text-gray-400'>
            暂无票房数据
          </div>
        )}
      </div>
    </main>
  );
}
