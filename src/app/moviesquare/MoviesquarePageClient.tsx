'use client';

import { Info, Search, Trash2, X } from 'lucide-react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import {
  addSearchHistory,
  clearSearchHistory,
  deleteSearchHistory,
  getSearchHistory,
} from '@/lib/client/db.client';
import { getDoubanCategories } from '@/lib/client/douban.client';
import {
  DoubanItem,
  DoubanResult,
  MovieSquareItem,
  MovieSquareResult,
} from '@/lib/types';

const YEARS = [
  'all',
  ...Array.from({ length: 16 }, (_, index) => String(2026 - index)),
];

type MoviesquareTab = 'boxoffice' | 'hot' | 'records';
type HotSectionKey = (typeof HOT_SECTION_CONFIGS)[number]['key'];
type MovieSquareRecordType = 'movie' | 'tv';

interface HotSection {
  key: HotSectionKey;
  title: string;
  type: 'movie' | 'tv';
  typeLabel: string;
  list: DoubanItem[];
  loading: boolean;
  error: string | null;
}

interface MovieSquareRecord {
  title: string;
  year: string;
  type: MovieSquareRecordType;
  typeLabel: string;
  sourceLabel: string;
  rate?: string;
  grossText?: string;
  detailUrl?: string;
  doubanId?: string;
  saveTime: number;
}

interface DoubanSuggestItem {
  id: string;
  title: string;
  subTitle: string;
  year: string;
  type: string;
  typeLabel: string;
  poster: string;
  detailUrl: string;
  sourceLabel: string;
}

interface DoubanSuggestResult {
  code: number;
  message: string;
  list: DoubanSuggestItem[];
}

const MOVIESQUARE_RECORDS_KEY = 'moontv_moviesquare_records';
const MOVIESQUARE_RECORDS_LIMIT = 100;

const HOT_SECTION_CONFIGS = [
  {
    key: 'nowplaying',
    title: '影院热映',
    type: 'movie',
    typeLabel: '电影',
  },
  {
    key: 'hotMovies',
    title: '豆瓣热门',
    type: 'movie',
    typeLabel: '电影',
  },
  {
    key: 'hotTvShows',
    title: '热播新剧',
    type: 'tv',
    typeLabel: '剧集',
  },
  {
    key: 'hotVarietyShows',
    title: '热播综艺',
    type: 'tv',
    typeLabel: '综艺',
  },
] as const;

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

function getInitialTab(value: string | null): MoviesquareTab {
  if (value === 'records') return 'records';
  return value === 'hot' ? 'hot' : 'boxoffice';
}

function getInitialHotSection(value: string | null): HotSectionKey {
  return HOT_SECTION_CONFIGS.some((section) => section.key === value)
    ? (value as HotSectionKey)
    : 'nowplaying';
}

function getMovieSquareYear(item: MovieSquareItem) {
  return item.year || item.releaseDate?.match(/\d{4}/)?.[0] || '';
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

function createInitialHotSections(): HotSection[] {
  return HOT_SECTION_CONFIGS.map((section) => ({
    ...section,
    list: [],
    loading: true,
    error: null,
  }));
}

function getRecordKey(
  record: Pick<MovieSquareRecord, 'title' | 'year' | 'type'>
) {
  return `${record.title.trim()}::${record.year || ''}::${record.type}`;
}

function readMovieSquareRecords(): MovieSquareRecord[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = localStorage.getItem(MOVIESQUARE_RECORDS_KEY);
    if (!raw) return [];
    const records = JSON.parse(raw) as MovieSquareRecord[];
    if (!Array.isArray(records)) return [];

    return records
      .filter((record) => record?.title && record?.type && record?.saveTime)
      .sort((a, b) => b.saveTime - a.saveTime)
      .slice(0, MOVIESQUARE_RECORDS_LIMIT);
  } catch {
    return [];
  }
}

function writeMovieSquareRecord(record: Omit<MovieSquareRecord, 'saveTime'>) {
  if (typeof window === 'undefined') return [];

  const nextRecord: MovieSquareRecord = {
    ...record,
    title: record.title.trim(),
    year: record.year || '',
    saveTime: Date.now(),
  };

  if (!nextRecord.title) {
    return readMovieSquareRecords();
  }

  const nextKey = getRecordKey(nextRecord);
  const records = readMovieSquareRecords().filter(
    (item) => getRecordKey(item) !== nextKey
  );
  const nextRecords = [nextRecord, ...records].slice(
    0,
    MOVIESQUARE_RECORDS_LIMIT
  );

  try {
    localStorage.setItem(MOVIESQUARE_RECORDS_KEY, JSON.stringify(nextRecords));
  } catch {
    // Ignore storage quota or privacy mode failures.
  }

  return nextRecords;
}

export default function MoviesquarePageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<MoviesquareTab>(() =>
    getInitialTab(searchParams.get('tab'))
  );
  const [activeHotSectionKey, setActiveHotSectionKey] = useState<HotSectionKey>(
    () => getInitialHotSection(searchParams.get('section'))
  );
  const [selectedYear, setSelectedYear] = useState(() =>
    getInitialYear(searchParams.get('year'))
  );
  const [data, setData] = useState<MovieSquareResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hotSections, setHotSections] = useState<HotSection[]>(() =>
    createInitialHotSections()
  );
  const [records, setRecords] = useState<MovieSquareRecord[]>(() =>
    readMovieSquareRecords()
  );
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [suggestResults, setSuggestResults] = useState<DoubanSuggestItem[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const title = useMemo(() => {
    return selectedYear === 'all'
      ? '电影票房总榜'
      : `${selectedYear}年电影票房总榜`;
  }, [selectedYear]);

  useEffect(() => {
    if (activeTab !== 'records') return;
    setRecords(readMovieSquareRecords());
  }, [activeTab]);

  useEffect(() => {
    getSearchHistory().then(setSearchHistory);

    const handleSearchHistoryUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<string[]>;
      setSearchHistory(customEvent.detail || []);
    };

    window.addEventListener('searchHistoryUpdated', handleSearchHistoryUpdated);

    return () => {
      window.removeEventListener(
        'searchHistoryUpdated',
        handleSearchHistoryUpdated
      );
    };
  }, []);

  useEffect(() => {
    if (!isSearchOpen) return;

    const timer = window.setTimeout(() => {
      searchInputRef.current?.focus({ preventScroll: true });
    }, 80);

    return () => window.clearTimeout(timer);
  }, [isSearchOpen]);

  const activeHotSection = useMemo(() => {
    return (
      hotSections.find((section) => section.key === activeHotSectionKey) ??
      hotSections[0]
    );
  }, [activeHotSectionKey, hotSections]);

  useEffect(() => {
    const tabFromUrl = getInitialTab(searchParams.get('tab'));
    const sectionFromUrl = searchParams.get('section');
    const yearFromUrl = getInitialYear(searchParams.get('year'));
    setActiveTab(tabFromUrl);
    if (tabFromUrl === 'hot' || sectionFromUrl) {
      setActiveHotSectionKey(getInitialHotSection(sectionFromUrl));
    }
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

  useEffect(() => {
    if (activeTab !== 'hot') return;

    const controller = new AbortController();

    const fetchHotSections = async () => {
      setHotSections(createInitialHotSections());

      const loaders = HOT_SECTION_CONFIGS.map(async (section) => {
        try {
          let result: DoubanResult;

          if (section.key === 'nowplaying') {
            const response = await fetch('/api/douban/nowplaying', {
              signal: controller.signal,
              cache: 'no-store',
            });
            result = (await response.json()) as DoubanResult;
            if (!response.ok || result.code !== 200) {
              throw new Error(
                result.message || `获取正在热映失败: ${response.status}`
              );
            }
          } else if (section.key === 'hotMovies') {
            result = await getDoubanCategories({
              kind: 'movie',
              category: '热门',
              type: '全部',
              pageLimit: 100,
            });
          } else if (section.key === 'hotTvShows') {
            result = await getDoubanCategories({
              kind: 'tv',
              category: 'tv',
              type: 'tv',
              pageLimit: 100,
            });
          } else {
            result = await getDoubanCategories({
              kind: 'tv',
              category: 'show',
              type: 'show',
              pageLimit: 100,
            });
          }

          return {
            key: section.key,
            list: result.list ?? [],
            error: null,
          };
        } catch (err) {
          if (controller.signal.aborted) return null;
          return {
            key: section.key,
            list: [],
            error: err instanceof Error ? err.message : '获取数据失败',
          };
        }
      });

      const results = await Promise.all(loaders);
      if (controller.signal.aborted) return;

      setHotSections((current) =>
        current.map((section) => {
          const result = results.find((item) => item?.key === section.key);
          if (!result) return section;

          return {
            ...section,
            list: result.list,
            loading: false,
            error: result.error,
          };
        })
      );
    };

    fetchHotSections();

    return () => controller.abort();
  }, [activeTab]);

  const handleTabClick = (tab: MoviesquareTab) => {
    const params = new URLSearchParams(searchParams.toString());

    if (tab === 'boxoffice') {
      params.set('tab', tab);
    } else if (tab === 'hot') {
      params.set('tab', tab);
      if (!params.get('section')) {
        params.set('section', activeHotSectionKey);
      }
    } else {
      params.set('tab', tab);
    }

    const query = params.toString();
    router.replace(`/moviesquare${query ? `?${query}` : ''}`, {
      scroll: false,
    });
    setActiveTab(tab);
  };

  const handleHotSectionClick = (sectionKey: HotSectionKey) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', 'hot');
    params.set('section', sectionKey);

    const query = params.toString();
    router.replace(`/moviesquare${query ? `?${query}` : ''}`, {
      scroll: false,
    });
    setActiveHotSectionKey(sectionKey);
  };

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
    },
    record?: Omit<MovieSquareRecord, 'saveTime'>
  ) => {
    event.preventDefault();
    event.stopPropagation();
    if (record) {
      setRecords(writeMovieSquareRecord(record));
    }
    await copyTextToClipboard(title);
    window.location.href = 'SenPlayer://';
  };

  const handleRowClick = (item: MovieSquareItem) => {
    if (!item.detailUrl) return;
    window.location.href = item.detailUrl;
  };

  const openPlayableSearch = (
    title: string,
    year: string | undefined,
    type: 'movie' | 'tv',
    event: {
      preventDefault: () => void;
      stopPropagation: () => void;
    },
    record?: Omit<MovieSquareRecord, 'saveTime'>
  ) => {
    event.preventDefault();
    event.stopPropagation();

    const searchTitle = title.trim();
    if (!searchTitle) return;
    if (record) {
      setRecords(writeMovieSquareRecord(record));
    }

    const params = new URLSearchParams();
    params.set('title', searchTitle);
    if (year) {
      params.set('year', year);
    }
    params.set('stype', type);
    router.push(`/play?${params.toString()}`);
  };

  const handleHotRowClick = (item: DoubanItem) => {
    if (!item.id) return;
    window.location.href = `https://movie.douban.com/subject/${encodeURIComponent(
      item.id
    )}`;
  };

  const createHotRecord = (
    item: DoubanItem,
    section: HotSection
  ): Omit<MovieSquareRecord, 'saveTime'> => ({
    title: item.title,
    year: item.year || '',
    type: section.type,
    typeLabel: section.typeLabel,
    sourceLabel: section.title,
    rate: item.rate || undefined,
    detailUrl: item.id
      ? `https://movie.douban.com/subject/${encodeURIComponent(item.id)}`
      : undefined,
    doubanId: item.id || undefined,
  });

  const createBoxOfficeRecord = (
    item: MovieSquareItem
  ): Omit<MovieSquareRecord, 'saveTime'> => ({
    title: item.title,
    year: getMovieSquareYear(item),
    type: 'movie',
    typeLabel: '电影',
    sourceLabel: '票房',
    grossText: item.grossText,
    detailUrl: item.detailUrl || undefined,
  });

  const createRecordSnapshot = (
    record: MovieSquareRecord
  ): Omit<MovieSquareRecord, 'saveTime'> => ({
    title: record.title,
    year: record.year,
    type: record.type,
    typeLabel: record.typeLabel,
    sourceLabel: record.sourceLabel,
    rate: record.rate,
    grossText: record.grossText,
    detailUrl: record.detailUrl,
    doubanId: record.doubanId,
  });

  const handleRecordRowClick = (record: MovieSquareRecord) => {
    if (record.detailUrl) {
      window.location.href = record.detailUrl;
      return;
    }

    if (record.doubanId) {
      window.location.href = `https://movie.douban.com/subject/${encodeURIComponent(
        record.doubanId
      )}`;
    }
  };

  const createSuggestRecord = (
    item: DoubanSuggestItem
  ): Omit<MovieSquareRecord, 'saveTime'> => ({
    title: item.title,
    year: item.year || '',
    type: item.type === 'tv' ? 'tv' : 'movie',
    typeLabel: item.typeLabel || (item.type === 'tv' ? '剧集' : '电影'),
    sourceLabel: '豆瓣搜索',
    detailUrl: item.detailUrl,
    doubanId: item.id,
  });

  const handleSuggestRowClick = (item: DoubanSuggestItem) => {
    if (item.detailUrl) {
      window.location.href = item.detailUrl;
      return;
    }

    if (item.id) {
      window.location.href = `https://movie.douban.com/subject/${encodeURIComponent(
        item.id
      )}`;
    }
  };

  const handleSearchSubmit = async (
    event?: React.FormEvent<HTMLFormElement>,
    keyword?: string
  ) => {
    event?.preventDefault();

    const trimmed = (keyword ?? searchQuery).trim().replace(/\s+/g, ' ');
    if (!trimmed) return;

    setSearchQuery(trimmed);
    setHasSearched(true);
    setSuggestLoading(true);
    setSuggestError(null);

    try {
      await addSearchHistory(trimmed);

      const response = await fetch(
        `/api/douban/suggest?q=${encodeURIComponent(trimmed)}`,
        {
          cache: 'no-store',
        }
      );
      const result = (await response.json()) as DoubanSuggestResult;

      if (!response.ok || result.code !== 200) {
        throw new Error(result.message || `请求失败: ${response.status}`);
      }

      setSuggestResults(result.list || []);
    } catch (err) {
      setSuggestResults([]);
      setSuggestError(err instanceof Error ? err.message : '搜索失败');
    } finally {
      setSuggestLoading(false);
    }
  };

  const handleHistoryClick = (keyword: string) => {
    setSearchQuery(keyword);
    void handleSearchSubmit(undefined, keyword);
  };

  const handleSearchQueryChange = (value: string) => {
    setSearchQuery(value);

    if (!value.trim()) {
      setHasSearched(false);
      setSuggestResults([]);
      setSuggestError(null);
    }
  };

  const openSearchOverlay = () => {
    flushSync(() => {
      setIsSearchOpen(true);
    });
    searchInputRef.current?.focus({ preventScroll: true });
  };

  const renderSkeletonRows = (count: number) => (
    <div className='divide-y divide-gray-50 dark:divide-gray-900'>
      {Array.from({ length: count }).map((_, index) => (
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
  );

  const renderSuggestSkeletonRows = (count: number) => (
    <div className='divide-y divide-gray-50 dark:divide-gray-900'>
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className='grid h-[72px] grid-cols-[49%_22%_15%_14%] items-center px-4 md:h-[82px] md:px-7'
        >
          <div className='flex min-w-0 items-center gap-2 pr-2 md:gap-3'>
            <div className='h-7 w-7 shrink-0 rounded bg-gray-100 dark:bg-gray-900' />
            <div className='h-[52px] w-9 shrink-0 rounded bg-gray-100 dark:bg-gray-900 md:h-[60px] md:w-[42px]' />
            <div className='min-w-0 space-y-2'>
              <div className='h-4 w-24 rounded bg-gray-100 dark:bg-gray-900 md:w-32' />
              <div className='h-3 w-16 rounded bg-gray-100 dark:bg-gray-900 md:w-20' />
            </div>
          </div>
          <div className='ml-auto h-4 w-12 rounded bg-gray-100 dark:bg-gray-900 md:w-14' />
          <div className='ml-auto h-4 w-8 rounded bg-gray-100 dark:bg-gray-900' />
          <div className='ml-auto h-4 w-8 rounded bg-gray-100 dark:bg-gray-900' />
        </div>
      ))}
    </div>
  );

  const renderHotSection = (section: HotSection) => (
    <section
      key={section.key}
      className='border-b border-gray-100 bg-white dark:border-gray-900 dark:bg-black'
    >
      <div className='grid grid-cols-[49%_22%_15%_14%] bg-gray-50 px-4 py-3 text-[12px] font-medium text-gray-700 dark:bg-[#101010] dark:text-gray-300 md:px-7 md:text-[14px]'>
        <div>排名</div>
        <div className='text-right'>评分</div>
        <div className='whitespace-nowrap text-right'>年份</div>
        <div className='whitespace-nowrap text-right'>类型</div>
      </div>

      {section.loading ? (
        renderSkeletonRows(6)
      ) : section.error ? (
        <div className='px-5 py-12 text-center text-sm text-gray-500 dark:text-gray-400'>
          {section.error}
        </div>
      ) : section.list.length ? (
        <div className='divide-y divide-gray-50 dark:divide-gray-900'>
          {section.list.map((item, index) => {
            const rank = index + 1;
            return (
              <div
                key={`${section.key}-${item.id || item.title}-${index}`}
                role='link'
                tabIndex={0}
                onClick={() => handleHotRowClick(item)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    handleHotRowClick(item);
                  }
                }}
                className='grid min-h-[62px] w-full grid-cols-[49%_22%_15%_14%] items-center px-4 text-left transition-colors hover:bg-gray-50 active:bg-gray-100 dark:hover:bg-[#0d0d0d] dark:active:bg-[#151515] md:min-h-[74px] md:px-7'
              >
                <div className='flex min-w-0 items-center gap-3 pr-2'>
                  <span
                    className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center text-[14px] font-bold ${getRankClassName(
                      rank
                    )} ${
                      rank <= 3 ? 'rounded-md' : 'rounded-none bg-transparent'
                    }`}
                  >
                    {rank}
                  </span>
                  <div className='min-w-0'>
                    <div className='flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5'>
                      <button
                        type='button'
                        onClick={(event) => {
                          void openSenPlayer(
                            item.title,
                            event,
                            createHotRecord(item, section)
                          );
                        }}
                        className='min-w-0 break-words text-left text-[13px] font-bold leading-tight text-gray-950 dark:text-gray-50 md:text-[15px]'
                      >
                        {item.title}
                      </button>
                      <button
                        type='button'
                        onClick={(event) => {
                          openPlayableSearch(
                            item.title,
                            item.year,
                            section.type,
                            event,
                            createHotRecord(item, section)
                          );
                        }}
                        className='shrink-0 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 md:text-[11px]'
                      >
                        [可播放]
                      </button>
                    </div>
                    <div className='mt-1 text-[12px] leading-none text-gray-500 dark:text-gray-500 md:text-[13px]'>
                      {item.year || '-'}
                    </div>
                  </div>
                </div>

                <div className='whitespace-nowrap text-right text-[14px] font-semibold text-[#c82643] dark:text-[#ff5a70] md:text-[15px]'>
                  {item.rate || '-'}
                </div>
                <div className='text-right text-[14px] font-medium text-gray-950 dark:text-gray-100 md:text-[15px]'>
                  {item.year || '-'}
                </div>
                <div className='text-right text-[14px] font-medium text-gray-950 dark:text-gray-100 md:text-[15px]'>
                  {section.typeLabel}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className='px-5 py-12 text-center text-sm text-gray-500 dark:text-gray-400'>
          暂无数据
        </div>
      )}
    </section>
  );

  const renderRecords = () => (
    <section className='border-b border-gray-100 bg-white dark:border-gray-900 dark:bg-black'>
      <div className='grid grid-cols-[49%_22%_15%_14%] bg-gray-50 px-4 py-3 text-[12px] font-medium text-gray-700 dark:bg-[#101010] dark:text-gray-300 md:px-7 md:text-[14px]'>
        <div>排名</div>
        <div className='text-right'>来源</div>
        <div className='whitespace-nowrap text-right'>年份</div>
        <div className='whitespace-nowrap text-right'>类型</div>
      </div>

      {records.length ? (
        <div className='divide-y divide-gray-50 dark:divide-gray-900'>
          {records.map((record, index) => {
            const rank = index + 1;
            return (
              <div
                key={`${record.title}-${record.year}-${record.type}`}
                role='link'
                tabIndex={0}
                onClick={() => handleRecordRowClick(record)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    handleRecordRowClick(record);
                  }
                }}
                className='grid min-h-[62px] w-full grid-cols-[49%_22%_15%_14%] items-center px-4 text-left transition-colors hover:bg-gray-50 active:bg-gray-100 dark:hover:bg-[#0d0d0d] dark:active:bg-[#151515] md:min-h-[74px] md:px-7'
              >
                <div className='flex min-w-0 items-center gap-3 pr-2'>
                  <span
                    className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center text-[14px] font-bold ${getRankClassName(
                      rank
                    )} ${
                      rank <= 3 ? 'rounded-md' : 'rounded-none bg-transparent'
                    }`}
                  >
                    {rank}
                  </span>
                  <div className='min-w-0'>
                    <div className='flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5'>
                      <button
                        type='button'
                        onClick={(event) => {
                          void openSenPlayer(
                            record.title,
                            event,
                            createRecordSnapshot(record)
                          );
                        }}
                        className='min-w-0 break-words text-left text-[13px] font-bold leading-tight text-gray-950 dark:text-gray-50 md:text-[15px]'
                      >
                        {record.title}
                      </button>
                      <button
                        type='button'
                        onClick={(event) => {
                          openPlayableSearch(
                            record.title,
                            record.year,
                            record.type,
                            event,
                            createRecordSnapshot(record)
                          );
                        }}
                        className='shrink-0 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 md:text-[11px]'
                      >
                        [可播放]
                      </button>
                    </div>
                    <div className='mt-1 text-[12px] leading-none text-gray-500 dark:text-gray-500 md:text-[13px]'>
                      {record.grossText || record.rate || '-'}
                    </div>
                  </div>
                </div>

                <div className='whitespace-nowrap text-right text-[14px] font-semibold text-[#c82643] dark:text-[#ff5a70] md:text-[15px]'>
                  {record.sourceLabel || '-'}
                </div>
                <div className='text-right text-[14px] font-medium text-gray-950 dark:text-gray-100 md:text-[15px]'>
                  {record.year || '-'}
                </div>
                <div className='text-right text-[14px] font-medium text-gray-950 dark:text-gray-100 md:text-[15px]'>
                  {record.typeLabel || '-'}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className='px-5 py-16 text-center text-sm text-gray-500 dark:text-gray-400'>
          暂无记录
        </div>
      )}
    </section>
  );

  const renderSearchOverlay = () => {
    if (!isSearchOpen) return null;

    const showHistory = !searchQuery.trim();

    return (
      <div className='fixed inset-0 z-50 overflow-y-auto bg-white text-gray-950 dark:bg-black dark:text-gray-100'>
        <div className='mx-auto min-h-screen w-full bg-white dark:bg-black md:max-w-[720px] md:border-x md:border-gray-100 md:dark:border-gray-900'>
          <div className='sticky top-0 z-10 border-b border-gray-100 bg-white/95 px-3 py-3 backdrop-blur dark:border-gray-900 dark:bg-black/95'>
            <form
              onSubmit={(event) => void handleSearchSubmit(event)}
              className='flex items-center gap-3'
            >
              <div className='relative min-w-0 flex-1'>
                <Search className='pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400 dark:text-gray-500' />
                <input
                  ref={searchInputRef}
                  type='search'
                  enterKeyHint='search'
                  value={searchQuery}
                  onChange={(event) =>
                    handleSearchQueryChange(event.target.value)
                  }
                  placeholder='找影视剧综、找影人、找公司、找影院'
                  className='h-10 w-full rounded-full border-0 bg-gray-100 pl-10 pr-10 text-[16px] font-medium text-gray-950 outline-none ring-0 placeholder:text-gray-400 focus:ring-0 dark:bg-[#151515] dark:text-gray-100 dark:placeholder:text-gray-600'
                />
                {searchQuery && (
                  <button
                    type='button'
                    onClick={() => handleSearchQueryChange('')}
                    className='absolute right-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-gray-400 hover:bg-gray-200 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300'
                    aria-label='清空搜索内容'
                  >
                    <X className='h-4 w-4' />
                  </button>
                )}
              </div>
              <button
                type='button'
                onClick={() => setIsSearchOpen(false)}
                className='h-10 shrink-0 px-1 text-[15px] font-semibold text-gray-700 hover:text-gray-950 dark:text-gray-300 dark:hover:text-white'
              >
                取消
              </button>
            </form>
          </div>

          {showHistory ? (
            <section className='px-4 py-8 md:px-7'>
              <div className='mb-4 flex items-center justify-between'>
                <h2 className='text-[17px] font-bold text-gray-800 dark:text-gray-200'>
                  搜索历史
                </h2>
                {searchHistory.length > 0 && (
                  <button
                    type='button'
                    onClick={() => void clearSearchHistory()}
                    className='flex h-8 w-8 items-center justify-center text-gray-300 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-300'
                    aria-label='清空搜索历史'
                  >
                    <Trash2 className='h-4 w-4' />
                  </button>
                )}
              </div>
              {searchHistory.length > 0 ? (
                <div className='flex flex-wrap gap-3'>
                  {searchHistory.map((item) => (
                    <div
                      key={item}
                      className='group inline-flex h-8 items-center rounded-[2px] bg-gray-100 text-[14px] font-medium text-gray-600 transition-colors hover:bg-gray-200 dark:bg-[#151515] dark:text-gray-300 dark:hover:bg-[#202020]'
                    >
                      <button
                        type='button'
                        onClick={() => handleHistoryClick(item)}
                        className='h-full px-4'
                      >
                        {item}
                      </button>
                      <button
                        type='button'
                        onClick={(event) => {
                          event.stopPropagation();
                          void deleteSearchHistory(item);
                        }}
                        className='flex h-full items-center pr-3 text-gray-400 opacity-70 transition-opacity hover:opacity-100 dark:text-gray-500'
                        aria-label={`删除搜索历史 ${item}`}
                      >
                        <X className='h-3.5 w-3.5' />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className='py-12 text-center text-sm text-gray-400 dark:text-gray-500'>
                  暂无搜索历史
                </div>
              )}
            </section>
          ) : (
            <section className='border-b border-gray-100 bg-white dark:border-gray-900 dark:bg-black'>
              <div className='grid grid-cols-[49%_22%_15%_14%] bg-gray-50 px-4 py-3 text-[12px] font-medium text-gray-700 dark:bg-[#101010] dark:text-gray-300 md:px-7 md:text-[14px]'>
                <div>标题</div>
                <div className='text-right'>来源</div>
                <div className='whitespace-nowrap text-right'>年份</div>
                <div className='whitespace-nowrap text-right'>类型</div>
              </div>

              {suggestLoading ? (
                renderSuggestSkeletonRows(6)
              ) : suggestError ? (
                <div className='px-5 py-16 text-center text-sm text-gray-500 dark:text-gray-400'>
                  {suggestError}
                </div>
              ) : suggestResults.length ? (
                <div className='divide-y divide-gray-50 dark:divide-gray-900'>
                  {suggestResults.map((item, index) => {
                    const rank = index + 1;
                    return (
                      <div
                        key={`${item.id}-${index}`}
                        role='link'
                        tabIndex={0}
                        onClick={() => handleSuggestRowClick(item)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            handleSuggestRowClick(item);
                          }
                        }}
                        className='grid min-h-[72px] w-full grid-cols-[49%_22%_15%_14%] items-center px-4 text-left transition-colors hover:bg-gray-50 active:bg-gray-100 dark:hover:bg-[#0d0d0d] dark:active:bg-[#151515] md:min-h-[82px] md:px-7'
                      >
                        <div className='flex min-w-0 items-center gap-2 pr-2 md:gap-3'>
                          <span
                            className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center text-[14px] font-bold ${getRankClassName(
                              rank
                            )} ${
                              rank <= 3
                                ? 'rounded-md'
                                : 'rounded-none bg-transparent'
                            }`}
                          >
                            {rank}
                          </span>
                          <div className='relative h-[52px] w-9 shrink-0 overflow-hidden rounded bg-gray-100 dark:bg-gray-900 md:h-[60px] md:w-[42px]'>
                            {item.poster ? (
                              <Image
                                src={item.poster}
                                alt={item.title}
                                fill
                                sizes='42px'
                                className='object-cover'
                                loading='lazy'
                              />
                            ) : null}
                          </div>
                          <div className='min-w-0'>
                            <div className='flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5'>
                              <button
                                type='button'
                                onClick={(event) => {
                                  void openSenPlayer(
                                    item.title,
                                    event,
                                    createSuggestRecord(item)
                                  );
                                }}
                                className='min-w-0 break-words text-left text-[13px] font-bold leading-tight text-gray-950 dark:text-gray-50 md:text-[15px]'
                              >
                                {item.title}
                              </button>
                              <button
                                type='button'
                                onClick={(event) => {
                                  openPlayableSearch(
                                    item.title,
                                    item.year,
                                    item.type === 'tv' ? 'tv' : 'movie',
                                    event,
                                    createSuggestRecord(item)
                                  );
                                }}
                                className='shrink-0 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 md:text-[11px]'
                              >
                                [可播放]
                              </button>
                            </div>
                            <div className='mt-1 truncate text-[12px] leading-none text-gray-500 dark:text-gray-500 md:text-[13px]'>
                              {item.subTitle || item.year || '-'}
                            </div>
                          </div>
                        </div>

                        <div className='whitespace-nowrap text-right text-[14px] font-semibold text-[#c82643] dark:text-[#ff5a70] md:text-[15px]'>
                          {item.sourceLabel || '豆瓣'}
                        </div>
                        <div className='text-right text-[14px] font-medium text-gray-950 dark:text-gray-100 md:text-[15px]'>
                          {item.year || '-'}
                        </div>
                        <div className='text-right text-[14px] font-medium text-gray-950 dark:text-gray-100 md:text-[15px]'>
                          {item.typeLabel || '-'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : hasSearched ? (
                <div className='px-5 py-16 text-center text-sm text-gray-500 dark:text-gray-400'>
                  暂无搜索结果
                </div>
              ) : (
                <div className='px-5 py-16 text-center text-sm text-gray-400 dark:text-gray-500'>
                  输入关键词后点击搜索
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    );
  };

  return (
    <main className='min-h-screen bg-white text-gray-950 dark:bg-black dark:text-gray-100'>
      <div className='mx-auto min-h-screen w-full bg-white dark:bg-black md:max-w-[720px] md:border-x md:border-gray-100 md:shadow-sm md:dark:border-gray-900'>
        <div className='sticky top-0 z-20 border-b border-gray-100 bg-white/95 backdrop-blur dark:border-gray-900 dark:bg-black/95'>
          <div className='relative flex justify-center px-4 py-2 md:px-8'>
            <div className='inline-flex overflow-hidden rounded-[3px] border border-[#e83355] bg-white text-[13px] font-bold leading-none dark:bg-black md:text-[14px]'>
              {[
                { label: '热映', value: 'hot' as MoviesquareTab },
                { label: '票房', value: 'boxoffice' as MoviesquareTab },
                { label: '记录', value: 'records' as MoviesquareTab },
              ].map((tab) => {
                const active = activeTab === tab.value;
                return (
                  <button
                    key={tab.value}
                    type='button'
                    onClick={() => handleTabClick(tab.value)}
                    className={`h-7 min-w-[72px] border-r border-[#e83355] px-4 transition-colors last:border-r-0 md:h-8 md:min-w-[82px] ${
                      active
                        ? 'bg-[#e83355] text-white'
                        : 'bg-white text-[#e83355] hover:bg-[#fff1f3] dark:bg-black dark:hover:bg-[#22070c]'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
            <button
              type='button'
              onClick={openSearchOverlay}
              className='absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-gray-700 transition-colors hover:bg-gray-100 hover:text-[#d8213d] dark:text-gray-300 dark:hover:bg-[#151515] dark:hover:text-[#ff5a70] md:right-6'
              aria-label='打开搜索'
            >
              <Search className='h-5 w-5' />
            </button>
          </div>
          {activeTab === 'hot' ? (
            <div className='overflow-x-auto scrollbar-hide'>
              <div className='flex min-w-max items-center gap-7 px-6 md:px-8'>
                {HOT_SECTION_CONFIGS.map((section) => {
                  const active = activeHotSectionKey === section.key;
                  return (
                    <button
                      key={section.key}
                      type='button'
                      onClick={() => handleHotSectionClick(section.key)}
                      className={`relative h-[44px] shrink-0 text-[14px] font-semibold leading-none tracking-normal transition-colors md:h-[52px] md:text-[16px] ${
                        active
                          ? 'text-[#d8213d]'
                          : 'text-gray-950 hover:text-[#d8213d] dark:text-gray-100 dark:hover:text-[#ff5a70]'
                      }`}
                    >
                      {section.title}
                      {active && (
                        <span className='absolute bottom-0 left-1/2 h-[3px] w-6 -translate-x-1/2 rounded-full bg-[#d8213d] md:w-7' />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : activeTab === 'boxoffice' ? (
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
          ) : null}
        </div>

        {activeTab === 'hot' ? (
          activeHotSection ? (
            renderHotSection(activeHotSection)
          ) : null
        ) : activeTab === 'records' ? (
          renderRecords()
        ) : (
          <>
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
                          <button
                            type='button'
                            onClick={(event) => {
                              void openSenPlayer(
                                item.title,
                                event,
                                createBoxOfficeRecord(item)
                              );
                            }}
                            className='min-w-0 break-words text-left text-[13px] font-bold leading-tight text-gray-950 dark:text-gray-50 md:text-[15px]'
                          >
                            {item.title}
                          </button>
                          <button
                            type='button'
                            onClick={(event) => {
                              openPlayableSearch(
                                item.title,
                                getMovieSquareYear(item),
                                'movie',
                                event,
                                createBoxOfficeRecord(item)
                              );
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
          </>
        )}
      </div>
      {renderSearchOverlay()}
    </main>
  );
}
