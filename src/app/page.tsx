/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps, no-console */

'use client';

import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { ChevronRight, Settings } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

// 客户端收藏 API
import {
  type Favorite as ClientFavorite,
  type PlayRecord as ClientPlayRecord,
  clearAllFavorites,
  getAllFavorites,
  getAllPlayRecords,
  subscribeToDataUpdates,
} from '@/lib/client/db.client';
import { getDoubanCategories } from '@/lib/client/douban.client';
import { getDoubanCookie, syncDoubanCookie } from '@/lib/client/douban-auth';
import { BoxOfficeResult, DoubanMineResult, DoubanResult } from '@/lib/types';

import CapsuleSwitch from '@/components/CapsuleSwitch';
import ContinueWatching from '@/components/ContinueWatching';
import DoubanCookieModal from '@/components/DoubanCookieModal';
import PageLayout from '@/components/PageLayout';
import ScrollableRow from '@/components/ScrollableRow';
import { useSite } from '@/components/SiteProvider';
import VideoCard from '@/components/VideoCard';

const STORAGE_TYPE =
  (process.env.NEXT_PUBLIC_STORAGE_TYPE as
    | 'localstorage'
    | 'redis'
    | 'd1'
    | 'upstash'
    | undefined) || 'localstorage';

const QUERY_STALE_TIME = 1000 * 60 * 5;
const QUERY_GC_TIME = 1000 * 60 * 30;
const HOME_ACTIVE_TAB_KEY = 'selection:home:activeTab';

type TabType =
  | 'home'
  | 'wish'
  | 'collect'
  | 'globalRank'
  | 'chinaRank'
  | 'favorites';

function HomeClient() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<TabType>(() => {
    if (typeof window === 'undefined') return 'home';
    const saved = sessionStorage.getItem(HOME_ACTIVE_TAB_KEY);
    if (!saved) return 'home';
    const candidate = saved as TabType;
    const valid: TabType[] = [
      'home',
      'wish',
      'collect',
      'globalRank',
      'chinaRank',
      'favorites',
    ];
    return valid.includes(candidate) ? candidate : 'home';
  });
  const { announcement } = useSite();

  const [showAnnouncement, setShowAnnouncement] = useState(false);

  const [showCookieModal, setShowCookieModal] = useState(false);
  const [doubanUserId, setDoubanUserId] = useState<string | null>(null);

  // IntersectionObserver refs for infinite scroll
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadingRef = useRef<HTMLDivElement>(null);

  const hasRestoredScrollRef = useRef(false);
  const ignoreScrollSaveRef = useRef(false);
  const lastSavedScrollTopRef = useRef(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    sessionStorage.setItem(HOME_ACTIVE_TAB_KEY, activeTab);
  }, [activeTab]);

  // 检查公告弹窗状态
  useEffect(() => {
    if (typeof window !== 'undefined' && announcement) {
      const hasSeenAnnouncement = localStorage.getItem('hasSeenAnnouncement');
      if (hasSeenAnnouncement !== announcement) {
        setShowAnnouncement(true);
      } else {
        setShowAnnouncement(Boolean(!hasSeenAnnouncement && announcement));
      }
    }
  }, [announcement]);

  // 收藏夹数据
  type FavoriteItem = {
    id: string;
    source: string;
    title: string;
    year?: string;
    poster: string;
    episodes: number;
    source_name: string;
    currentEpisode?: number;
    search_title?: string;
  };

  // 同步当前豆瓣登录状态（从 Cookie 源解析）
  useEffect(() => {
    let cancelled = false;
    syncDoubanCookie().then((id) => {
      if (!cancelled) {
        setDoubanUserId(id);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [showCookieModal]);

  const scrollKey = useMemo(() => `scroll:home:${activeTab}`, [activeTab]);

  const buildFavoriteItems = useCallback(
    (
      allFavorites: Record<string, ClientFavorite>,
      allPlayRecords: Record<string, ClientPlayRecord>
    ): FavoriteItem[] => {
      return Object.entries(allFavorites)
        .sort(([, a], [, b]) => b.save_time - a.save_time)
        .map(([key, fav]) => {
          const plusIndex = key.indexOf('+');
          const source = key.slice(0, plusIndex);
          const id = key.slice(plusIndex + 1);
          const currentEpisode = allPlayRecords[key]?.index;

          return {
            id,
            source,
            title: fav.title,
            year: fav.year,
            poster: fav.cover,
            episodes: fav.total_episodes,
            source_name: fav.source_name,
            currentEpisode,
            search_title: fav.search_title,
          };
        });
    },
    []
  );

  const { data: favoriteItems = [], isPending: favoritesPending } = useQuery<
    FavoriteItem[]
  >({
    queryKey: ['favorites', 'home'],
    enabled: activeTab === 'favorites',
    queryFn: async () => {
      const [allFavorites, allPlayRecords] = await Promise.all([
        getAllFavorites(),
        getAllPlayRecords(),
      ]);
      return buildFavoriteItems(allFavorites, allPlayRecords);
    },
    staleTime: QUERY_STALE_TIME,
    gcTime: QUERY_GC_TIME,
  });

  useEffect(() => {
    const unsubscribe = subscribeToDataUpdates(
      'favoritesUpdated',
      async (newFavorites: Record<string, ClientFavorite>) => {
        const allPlayRecords = await getAllPlayRecords();
        queryClient.setQueryData<FavoriteItem[]>(
          ['favorites', 'home'],
          buildFavoriteItems(newFavorites, allPlayRecords)
        );
      }
    );
    return unsubscribe;
  }, [buildFavoriteItems, queryClient]);

  const hotMoviesQuery = useQuery({
    queryKey: [
      'douban',
      'categories',
      { kind: 'movie', category: '热门', type: '全部' },
    ],
    enabled: activeTab === 'home',
    queryFn: () =>
      getDoubanCategories({
        kind: 'movie',
        category: '热门',
        type: '全部',
      }),
    staleTime: QUERY_STALE_TIME,
    gcTime: QUERY_GC_TIME,
  });

  const hotTvShowsQuery = useQuery({
    queryKey: [
      'douban',
      'categories',
      { kind: 'tv', category: 'tv', type: 'tv' },
    ],
    enabled: activeTab === 'home',
    queryFn: () =>
      getDoubanCategories({ kind: 'tv', category: 'tv', type: 'tv' }),
    staleTime: QUERY_STALE_TIME,
    gcTime: QUERY_GC_TIME,
  });

  const hotVarietyShowsQuery = useQuery({
    queryKey: [
      'douban',
      'categories',
      { kind: 'tv', category: 'show', type: 'show' },
    ],
    enabled: activeTab === 'home',
    queryFn: () =>
      getDoubanCategories({ kind: 'tv', category: 'show', type: 'show' }),
    staleTime: QUERY_STALE_TIME,
    gcTime: QUERY_GC_TIME,
  });

  const nowPlayingQuery = useQuery<DoubanResult>({
    queryKey: ['douban', 'nowplaying'],
    enabled: activeTab === 'home',
    queryFn: async () => {
      const response = await fetch('/api/douban/nowplaying');
      const data = (await response.json()) as DoubanResult;
      if (!response.ok || data.code !== 200) {
        throw new Error(data.message || `获取正在热映失败: ${response.status}`);
      }
      return data;
    },
    staleTime: QUERY_STALE_TIME,
    gcTime: QUERY_GC_TIME,
  });

  const loading =
    hotMoviesQuery.isPending ||
    hotTvShowsQuery.isPending ||
    hotVarietyShowsQuery.isPending;

  const hotMovies = hotMoviesQuery.data?.list ?? [];
  const hotTvShows = hotTvShowsQuery.data?.list ?? [];
  const hotVarietyShows = hotVarietyShowsQuery.data?.list ?? [];
  const nowPlayingMovies = nowPlayingQuery.data?.list ?? [];

  const boxOfficeGlobalQuery = useQuery<BoxOfficeResult>({
    queryKey: ['boxOffice', 'global'],
    enabled: activeTab === 'globalRank',
    queryFn: async () => {
      const response = await fetch('/api/boxoffice/global');
      const data = (await response.json()) as BoxOfficeResult;
      if (!response.ok || data.code !== 200) {
        throw new Error(data.message || `获取票房榜失败: ${response.status}`);
      }
      return data;
    },
    staleTime: QUERY_STALE_TIME,
    gcTime: QUERY_GC_TIME,
  });

  const boxOfficeChinaQuery = useQuery<BoxOfficeResult>({
    queryKey: ['boxOffice', 'china'],
    enabled: activeTab === 'chinaRank',
    queryFn: async () => {
      const response = await fetch('/api/boxoffice/china');
      const data = (await response.json()) as BoxOfficeResult;
      if (!response.ok || data.code !== 200) {
        throw new Error(data.message || `获取票房榜失败: ${response.status}`);
      }
      return data;
    },
    staleTime: QUERY_STALE_TIME,
    gcTime: QUERY_GC_TIME,
  });

  const getDoubanMineQueryKey = useCallback(
    (status: 'wish' | 'collect') => {
      return [
        'doubanMine',
        { status, userId: doubanUserId || 'anonymous' },
      ] as const;
    },
    [doubanUserId]
  );

  const useDoubanMine = (status: 'wish' | 'collect') => {
    return useInfiniteQuery<DoubanMineResult>({
      queryKey: getDoubanMineQueryKey(status),
      enabled:
        activeTab === status &&
        Boolean(doubanUserId) &&
        // 非 D1 模式下：必须有 cookie 才能请求
        (STORAGE_TYPE === 'd1' ? true : Boolean(getDoubanCookie())),
      initialPageParam: 0,
      queryFn: async ({ pageParam }) => {
        let url = `/api/douban/mine?status=${status}&start=${pageParam}`;

        if (STORAGE_TYPE !== 'd1') {
          const cookie = getDoubanCookie();
          if (!cookie) {
            throw new Error('请先登录豆瓣账号');
          }
          url += `&cookie=${encodeURIComponent(cookie)}`;
        }

        const response = await fetch(url);
        const data = (await response.json()) as DoubanMineResult;
        if (!response.ok) {
          throw new Error(
            data.message || `获取豆瓣数据失败: ${response.status}`
          );
        }

        if (data.code === 401 || data.code === 403) {
          throw new Error(data.message || '请先登录豆瓣账号');
        }
        if (data.code !== 200) {
          throw new Error(data.message || '获取豆瓣数据失败');
        }
        return data;
      },
      getNextPageParam: (lastPage, pages) => {
        if (!lastPage.hasMore) return undefined;
        return pages.reduce((sum, p) => sum + p.list.length, 0);
      },
      staleTime: QUERY_STALE_TIME,
      gcTime: QUERY_GC_TIME,
    });
  };

  const doubanMineWishQuery = useDoubanMine('wish');
  const doubanMineCollectQuery = useDoubanMine('collect');

  const isMineTab = activeTab === 'wish' || activeTab === 'collect';

  const activeMineQuery =
    activeTab === 'wish'
      ? doubanMineWishQuery
      : activeTab === 'collect'
      ? doubanMineCollectQuery
      : null;

  const mineItems = useMemo(() => {
    const pages = activeMineQuery?.data?.pages ?? [];
    return pages.flatMap((p) => p.list);
  }, [activeMineQuery?.data?.pages]);

  useEffect(() => {
    if (!isMineTab) return;
    if (doubanUserId) return;
    setShowCookieModal(true);
  }, [doubanUserId, isMineTab]);

  useEffect(() => {
    if (!isMineTab) return;
    if (!activeMineQuery?.isError) return;

    const message =
      (activeMineQuery.error as Error | null)?.message || '获取豆瓣数据失败';
    if (message.includes('登录') || message.includes('cookie')) {
      setShowCookieModal(true);
    }
  }, [activeMineQuery?.error, activeMineQuery?.isError, isMineTab]);

  // Cookie保存后重新加载数据
  const handleCookieSave = () => {
    setShowCookieModal(false);
    if (activeTab === 'wish' || activeTab === 'collect') {
      queryClient.removeQueries({ queryKey: getDoubanMineQueryKey(activeTab) });
    }
  };

  // 刷新数据
  const handleRefresh = (status: 'wish' | 'collect') => {
    queryClient.removeQueries({ queryKey: getDoubanMineQueryKey(status) });
  };

  const removeMineItemFromCache = useCallback(
    (status: 'wish' | 'collect', subjectId: string) => {
      queryClient.setQueryData(getDoubanMineQueryKey(status), (old) => {
        if (!old) return old;

        const data = old as {
          pages: DoubanMineResult[];
          pageParams: unknown[];
        };

        return {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            list: page.list.filter((item) => item.id !== subjectId),
          })),
        };
      });
    },
    [getDoubanMineQueryKey, queryClient]
  );

  const mineCardActions = useMemo(() => {
    if (activeTab === 'wish') return ['remove', 'collect'] as const;
    if (activeTab === 'collect') return ['remove'] as const;
    return null;
  }, [activeTab]);

  // 设置滚动监听 - 无限滚动加载更多
  useEffect(() => {
    if (!isMineTab) return;
    if (!activeMineQuery) return;
    if (!activeMineQuery.hasNextPage) return;
    if (activeMineQuery.isFetchingNextPage || activeMineQuery.isPending) return;
    if (!loadingRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        if (!activeMineQuery.hasNextPage) return;
        if (activeMineQuery.isFetchingNextPage) return;
        activeMineQuery.fetchNextPage();
      },
      { threshold: 0.1 }
    );

    observer.observe(loadingRef.current);
    observerRef.current = observer;

    return () => {
      observer.disconnect();
    };
  }, [
    activeMineQuery,
    activeMineQuery?.fetchNextPage,
    activeMineQuery?.hasNextPage,
    activeMineQuery?.isFetchingNextPage,
    activeMineQuery?.isPending,
    isMineTab,
  ]);

  const isScrollRestoreReady = useMemo(() => {
    if (activeTab === 'home') {
      return (
        !hotMoviesQuery.isPending &&
        !hotTvShowsQuery.isPending &&
        !hotVarietyShowsQuery.isPending &&
        !nowPlayingQuery.isPending
      );
    }
    if (activeTab === 'favorites') {
      return !favoritesPending;
    }
    if (activeTab === 'globalRank') {
      return boxOfficeGlobalQuery.isSuccess || boxOfficeGlobalQuery.isError;
    }
    if (activeTab === 'chinaRank') {
      return boxOfficeChinaQuery.isSuccess || boxOfficeChinaQuery.isError;
    }
    if (isMineTab) {
      return !activeMineQuery?.isPending;
    }
    return true;
  }, [
    activeMineQuery?.isPending,
    activeTab,
    boxOfficeChinaQuery.isError,
    boxOfficeChinaQuery.isSuccess,
    boxOfficeGlobalQuery.isError,
    boxOfficeGlobalQuery.isSuccess,
    hotMoviesQuery.isPending,
    hotTvShowsQuery.isPending,
    hotVarietyShowsQuery.isPending,
    nowPlayingQuery.isPending,
    isMineTab,
  ]);

  useEffect(() => {
    hasRestoredScrollRef.current = false;
    ignoreScrollSaveRef.current = false;
    lastSavedScrollTopRef.current = 0;
  }, [scrollKey]);

  // 记录列表滚动位置（body 为滚动容器）
  useEffect(() => {
    if (!scrollKey) return;

    let rafId = 0;
    const save = () => {
      if (ignoreScrollSaveRef.current) return;
      const top = document.body.scrollTop;
      lastSavedScrollTopRef.current = top;
      sessionStorage.setItem(scrollKey, String(top));
    };

    const onScroll = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(save);
    };

    document.body.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      document.body.removeEventListener('scroll', onScroll);
      if (rafId) cancelAnimationFrame(rafId);
      sessionStorage.setItem(scrollKey, String(lastSavedScrollTopRef.current));
    };
  }, [scrollKey]);

  // 数据已就绪时恢复滚动位置（返回列表页场景）
  useEffect(() => {
    if (!scrollKey) return;
    if (hasRestoredScrollRef.current) return;
    if (!isScrollRestoreReady) return;

    const saved = sessionStorage.getItem(scrollKey);
    if (!saved) return;

    hasRestoredScrollRef.current = true;
    requestAnimationFrame(() => {
      const top = Number(saved) || 0;
      lastSavedScrollTopRef.current = top;
      document.body.scrollTo(0, top);
    });
  }, [isScrollRestoreReady, scrollKey]);

  const handleCardClickCapture = useCallback(() => {
    if (!scrollKey) return;
    const top = document.body.scrollTop;
    ignoreScrollSaveRef.current = true;
    lastSavedScrollTopRef.current = top;
    sessionStorage.setItem(scrollKey, String(top));

    window.setTimeout(() => {
      ignoreScrollSaveRef.current = false;
    }, 1000);
  }, [scrollKey]);

  // 兜底：用原生 capture 监听，保证“点卡片跳转”时一定会先保存滚动（避免路由切换把 scrollTop=0 写回）
  useEffect(() => {
    if (!scrollKey) return;

    const onDocumentClickCapture = (e: MouseEvent) => {
      const target = e.target;
      if (!(target instanceof Element)) return;

      // VideoCard 根节点：className 包含 `group relative w-full ...`
      const card = target.closest('div.group.relative.w-full');
      if (!card) return;

      handleCardClickCapture();
    };

    document.addEventListener('click', onDocumentClickCapture, true);
    return () => {
      document.removeEventListener('click', onDocumentClickCapture, true);
    };
  }, [handleCardClickCapture, scrollKey]);

  const doubanLoggedIn = Boolean(doubanUserId);

  const boxOfficeQuery =
    activeTab === 'globalRank' ? boxOfficeGlobalQuery : boxOfficeChinaQuery;
  const boxOfficeItems = boxOfficeQuery.data?.list ?? [];
  const boxOfficeErrorMessage = boxOfficeQuery.isError
    ? (boxOfficeQuery.error as Error).message
    : null;

  const doubanMineLoading = Boolean(isMineTab && activeMineQuery?.isPending);
  const doubanMineLoadingMore = Boolean(
    isMineTab && activeMineQuery?.isFetchingNextPage
  );
  const doubanMineHasMore = Boolean(isMineTab && activeMineQuery?.hasNextPage);
  const doubanMineError =
    isMineTab && activeMineQuery?.isError
      ? (activeMineQuery.error as Error).message
      : null;

  const handleCloseAnnouncement = (announcement: string) => {
    setShowAnnouncement(false);
    localStorage.setItem('hasSeenAnnouncement', announcement); // 记录已查看弹窗
  };

  return (
    <PageLayout>
      <div className='px-2 sm:px-10 py-4 sm:py-8 overflow-visible'>
        {/* 顶部 Tab 切换 */}
        <div className='mb-8 flex justify-center items-center gap-2'>
          <CapsuleSwitch
            options={[
              { label: '首页', value: 'home' },
              { label: '想看', value: 'wish' },
              { label: '看过', value: 'collect' },
              { label: '全球', value: 'globalRank' },
              { label: '中国', value: 'chinaRank' },
              { label: '收藏夹', value: 'favorites' },
            ]}
            active={activeTab}
            onChange={(value) => setActiveTab(value as TabType)}
          />
          {(activeTab === 'wish' || activeTab === 'collect') && (
            <button
              onClick={() => setShowCookieModal(true)}
              className='p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              title='豆瓣账号设置'
            >
              <Settings className='w-5 h-5' />
            </button>
          )}
        </div>

        <div className='max-w-[95%] mx-auto'>
          {activeTab === 'globalRank' || activeTab === 'chinaRank' ? (
            // 票房榜视图
            <section className='mb-8'>
              <div className='mb-4 flex items-center justify-between'>
                <h2 className='text-xl font-bold text-gray-800 dark:text-gray-200'>
                  {activeTab === 'globalRank'
                    ? '全球电影票房排行榜'
                    : '中国电影票房排行榜'}
                </h2>
                {boxOfficeItems.length > 0 && (
                  <button
                    className='text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                    onClick={() => {
                      const type =
                        activeTab === 'globalRank' ? 'global' : 'china';
                      queryClient.invalidateQueries({
                        queryKey: ['boxOffice', type],
                      });
                    }}
                  >
                    刷新
                  </button>
                )}
              </div>
              {boxOfficeQuery.isPending ? (
                <div className='space-y-2'>
                  {Array.from({ length: 10 }).map((_, i) => (
                    <div
                      key={i}
                      className='h-12 bg-gray-200 dark:bg-gray-800 rounded animate-pulse'
                    />
                  ))}
                </div>
              ) : boxOfficeErrorMessage ? (
                <div className='text-center text-gray-500 py-8 dark:text-gray-400'>
                  {boxOfficeErrorMessage}
                </div>
              ) : (
                <div className='space-y-1'>
                  {boxOfficeItems.map((item) => (
                    <div
                      key={item.rank}
                      className='flex items-center gap-3 py-3 px-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer'
                      onClick={() => {
                        handleCardClickCapture();
                        const searchTitle = (item.title || '').trim();
                        if (!searchTitle) return;
                        const params = new URLSearchParams();
                        params.set('title', searchTitle);
                        if (item.year) {
                          params.set('year', item.year);
                        }
                        params.set('stype', 'movie');
                        router.push(`/play?${params.toString()}`);
                      }}
                    >
                      <span
                        className={`w-8 h-8 flex items-center justify-center text-sm font-bold rounded ${
                          item.rank <= 3
                            ? 'bg-orange-500 text-white'
                            : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                        }`}
                      >
                        {item.rank}
                      </span>
                      <div className='flex-1 min-w-0'>
                        <div className='text-sm font-medium text-gray-800 dark:text-gray-200 truncate'>
                          {item.title}
                        </div>
                        <div className='text-xs text-gray-500 dark:text-gray-400'>
                          {item.year && (
                            <span className='mr-2'>{item.year}</span>
                          )}
                          {item.genre && (
                            <span className='mr-2'>{item.genre}</span>
                          )}
                          {item.director && <span>{item.director}</span>}
                        </div>
                      </div>
                      <span className='text-sm text-orange-500 font-medium whitespace-nowrap'>
                        {(() => {
                          const yi = item.grossWan / 10000;
                          return `${yi.toFixed(2)}亿元`;
                        })()}
                      </span>
                    </div>
                  ))}
                  {boxOfficeItems.length === 0 && (
                    <div className='text-center text-gray-500 py-8 dark:text-gray-400'>
                      暂无数据
                    </div>
                  )}
                </div>
              )}
            </section>
          ) : activeTab === 'favorites' ? (
            // 收藏夹视图
            <section className='mb-8'>
              <div className='mb-4 flex items-center justify-between'>
                <h2 className='text-xl font-bold text-gray-800 dark:text-gray-200'>
                  我的收藏
                </h2>
                {favoriteItems.length > 0 && (
                  <button
                    className='text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                    onClick={async () => {
                      await clearAllFavorites();
                      queryClient.setQueryData<FavoriteItem[]>(
                        ['favorites', 'home'],
                        []
                      );
                    }}
                  >
                    清空
                  </button>
                )}
              </div>
              <div className='justify-start grid grid-cols-3 gap-x-4 gap-y-8 sm:gap-y-10 px-0 sm:px-2 sm:grid-cols-[repeat(auto-fill,_minmax(11rem,_1fr))] sm:gap-x-8'>
                {favoriteItems.map((item) => (
                  <div key={item.id + item.source} className='w-full'>
                    <VideoCard
                      query={item.search_title}
                      {...item}
                      from='favorite'
                      type={item.episodes > 1 ? 'tv' : ''}
                    />
                  </div>
                ))}
                {favoriteItems.length === 0 && (
                  <div className='col-span-full text-center text-gray-500 py-8 dark:text-gray-400'>
                    暂无收藏内容
                  </div>
                )}
              </div>
            </section>
          ) : activeTab === 'wish' || activeTab === 'collect' ? (
            // 豆瓣想看/看过视图
            <section className='mb-8'>
              <div className='mb-4 flex items-center justify-between'>
                <h2 className='text-xl font-bold text-gray-800 dark:text-gray-200'>
                  {activeTab === 'wish' ? '想看' : '看过'}
                </h2>
                {doubanLoggedIn && mineItems.length > 0 && (
                  <button
                    className='text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                    onClick={() => handleRefresh(activeTab)}
                  >
                    刷新
                  </button>
                )}
              </div>
              {doubanMineLoading ? (
                // 加载状态
                <div className='justify-start grid grid-cols-3 gap-x-4 gap-y-8 sm:gap-y-10 px-0 sm:px-2 sm:grid-cols-[repeat(auto-fill,_minmax(11rem,_1fr))] sm:gap-x-8'>
                  {Array.from({ length: 6 }).map((_, index) => (
                    <div key={index} className='w-full'>
                      <div className='relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-gray-200 animate-pulse dark:bg-gray-800'>
                        <div className='absolute inset-0 bg-gray-300 dark:bg-gray-700'></div>
                      </div>
                      <div className='mt-2 h-4 bg-gray-200 rounded animate-pulse dark:bg-gray-800'></div>
                    </div>
                  ))}
                </div>
              ) : doubanMineError && mineItems.length === 0 ? (
                // 错误状态
                <div className='text-center text-gray-500 py-8 dark:text-gray-400'>
                  <p>{doubanMineError}</p>
                  <button
                    className='mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600'
                    onClick={() => setShowCookieModal(true)}
                  >
                    设置豆瓣账号
                  </button>
                </div>
              ) : (
                // 数据展示
                <>
                  <div className='justify-start grid grid-cols-3 gap-x-4 gap-y-8 sm:gap-y-10 px-0 sm:px-2 sm:grid-cols-[repeat(auto-fill,_minmax(11rem,_1fr))] sm:gap-x-8'>
                    {mineItems.map((item) => (
                      <div key={item.id} className='w-full'>
                        <VideoCard
                          from='douban'
                          title={item.title}
                          poster={item.poster}
                          douban_id={item.id}
                          year={item.year}
                          doubanMarkActions={mineCardActions ?? undefined}
                          onDoubanMarkNeedLogin={() => setShowCookieModal(true)}
                          onDoubanMarkSuccess={(action, subjectId) => {
                            if (activeTab === 'wish') {
                              if (action === 'collect' || action === 'remove') {
                                removeMineItemFromCache('wish', subjectId);
                              }
                              if (action === 'collect') {
                                queryClient.removeQueries({
                                  queryKey: getDoubanMineQueryKey('collect'),
                                });
                              }
                              return;
                            }

                            if (
                              activeTab === 'collect' &&
                              action === 'remove'
                            ) {
                              removeMineItemFromCache('collect', subjectId);
                            }
                          }}
                        />
                      </div>
                    ))}
                    {mineItems.length === 0 && !doubanMineLoading && (
                      <div className='col-span-full text-center text-gray-500 py-8 dark:text-gray-400'>
                        {doubanLoggedIn ? '暂无数据' : '请先登录豆瓣账号'}
                        {!doubanLoggedIn && (
                          <button
                            className='ml-2 text-blue-500 hover:text-blue-600'
                            onClick={() => setShowCookieModal(true)}
                          >
                            去登录
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  {/* 加载更多指示器 */}
                  {doubanMineHasMore && mineItems.length > 0 && (
                    <div
                      ref={(el) => {
                        if (el && el.offsetParent !== null) {
                          (
                            loadingRef as React.MutableRefObject<HTMLDivElement | null>
                          ).current = el;
                        }
                      }}
                      className='flex justify-center mt-12 py-8'
                    >
                      {doubanMineLoadingMore && (
                        <div className='flex items-center gap-2'>
                          <div className='animate-spin rounded-full h-6 w-6 border-b-2 border-orange-500'></div>
                          <span className='text-gray-600 dark:text-gray-400'>
                            加载中...
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                  {/* 没有更多数据提示 */}
                  {!doubanMineHasMore && mineItems.length > 0 && (
                    <div className='text-center text-gray-500 py-8'>
                      已加载全部
                    </div>
                  )}
                </>
              )}
            </section>
          ) : (
            // 首页视图
            <>
              {/* 继续观看 */}
              <div className='mb-4'>
                <ContinueWatching
                  onDoubanMarkNeedLogin={() => setShowCookieModal(true)}
                />
              </div>

              {/* 正在热映 */}
              <section className='mb-4'>
                <div className='mb-2 flex items-center justify-between'>
                  <h2 className='text-xl font-bold text-gray-800 dark:text-gray-200'>
                    正在热映
                  </h2>
                  <Link
                    href='/douban?type=movie'
                    className='flex items-center text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                  >
                    查看更多
                    <ChevronRight className='w-4 h-4 ml-1' />
                  </Link>
                </div>
                <ScrollableRow>
                  {nowPlayingQuery.isPending
                    ? // 加载状态显示灰色占位数据
                      Array.from({ length: 8 }).map((_, index) => (
                        <div
                          key={index}
                          className='min-w-[96px] w-24 sm:min-w-[180px] sm:w-44'
                        >
                          <div className='relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-gray-200 animate-pulse dark:bg-gray-800'>
                            <div className='absolute inset-0 bg-gray-300 dark:bg-gray-700'></div>
                          </div>
                          <div className='mt-2 h-4 bg-gray-200 rounded animate-pulse dark:bg-gray-800'></div>
                        </div>
                      ))
                    : // 显示真实数据
                      nowPlayingMovies.map((movie, index) => (
                        <div
                          key={index}
                          className='min-w-[96px] w-24 sm:min-w-[180px] sm:w-44'
                        >
                          <VideoCard
                            from='douban'
                            title={movie.title}
                            poster={movie.poster}
                            douban_id={movie.id}
                            rate={movie.rate}
                            year={movie.year}
                            type='movie'
                            doubanMarkActions={['collect', 'wish']}
                            onDoubanMarkNeedLogin={() =>
                              setShowCookieModal(true)
                            }
                          />
                        </div>
                      ))}
                </ScrollableRow>
              </section>

              {/* 热门电影 */}
              <section className='mb-4'>
                <div className='mb-2 flex items-center justify-between'>
                  <h2 className='text-xl font-bold text-gray-800 dark:text-gray-200'>
                    热门电影
                  </h2>
                  <Link
                    href='/douban?type=movie'
                    className='flex items-center text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                  >
                    查看更多
                    <ChevronRight className='w-4 h-4 ml-1' />
                  </Link>
                </div>
                <ScrollableRow>
                  {loading
                    ? // 加载状态显示灰色占位数据
                      Array.from({ length: 8 }).map((_, index) => (
                        <div
                          key={index}
                          className='min-w-[96px] w-24 sm:min-w-[180px] sm:w-44'
                        >
                          <div className='relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-gray-200 animate-pulse dark:bg-gray-800'>
                            <div className='absolute inset-0 bg-gray-300 dark:bg-gray-700'></div>
                          </div>
                          <div className='mt-2 h-4 bg-gray-200 rounded animate-pulse dark:bg-gray-800'></div>
                        </div>
                      ))
                    : // 显示真实数据
                      hotMovies.map((movie, index) => (
                        <div
                          key={index}
                          className='min-w-[96px] w-24 sm:min-w-[180px] sm:w-44'
                        >
                          <VideoCard
                            from='douban'
                            title={movie.title}
                            poster={movie.poster}
                            douban_id={movie.id}
                            rate={movie.rate}
                            year={movie.year}
                            type='movie'
                            doubanMarkActions={['collect', 'wish']}
                            onDoubanMarkNeedLogin={() =>
                              setShowCookieModal(true)
                            }
                          />
                        </div>
                      ))}
                </ScrollableRow>
              </section>

              {/* 热门剧集 */}
              <section className='mb-4'>
                <div className='mb-2 flex items-center justify-between'>
                  <h2 className='text-xl font-bold text-gray-800 dark:text-gray-200'>
                    热门剧集
                  </h2>
                  <Link
                    href='/douban?type=tv'
                    className='flex items-center text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                  >
                    查看更多
                    <ChevronRight className='w-4 h-4 ml-1' />
                  </Link>
                </div>
                <ScrollableRow>
                  {loading
                    ? // 加载状态显示灰色占位数据
                      Array.from({ length: 8 }).map((_, index) => (
                        <div
                          key={index}
                          className='min-w-[96px] w-24 sm:min-w-[180px] sm:w-44'
                        >
                          <div className='relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-gray-200 animate-pulse dark:bg-gray-800'>
                            <div className='absolute inset-0 bg-gray-300 dark:bg-gray-700'></div>
                          </div>
                          <div className='mt-2 h-4 bg-gray-200 rounded animate-pulse dark:bg-gray-800'></div>
                        </div>
                      ))
                    : // 显示真实数据
                      hotTvShows.map((show, index) => (
                        <div
                          key={index}
                          className='min-w-[96px] w-24 sm:min-w-[180px] sm:w-44'
                        >
                          <VideoCard
                            from='douban'
                            title={show.title}
                            poster={show.poster}
                            douban_id={show.id}
                            rate={show.rate}
                            year={show.year}
                            doubanMarkActions={['collect', 'wish']}
                            onDoubanMarkNeedLogin={() =>
                              setShowCookieModal(true)
                            }
                          />
                        </div>
                      ))}
                </ScrollableRow>
              </section>

              {/* 热门综艺 */}
              <section className='mb-4'>
                <div className='mb-2 flex items-center justify-between'>
                  <h2 className='text-xl font-bold text-gray-800 dark:text-gray-200'>
                    热门综艺
                  </h2>
                  <Link
                    href='/douban?type=show'
                    className='flex items-center text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                  >
                    查看更多
                    <ChevronRight className='w-4 h-4 ml-1' />
                  </Link>
                </div>
                <ScrollableRow>
                  {loading
                    ? // 加载状态显示灰色占位数据
                      Array.from({ length: 8 }).map((_, index) => (
                        <div
                          key={index}
                          className='min-w-[96px] w-24 sm:min-w-[180px] sm:w-44'
                        >
                          <div className='relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-gray-200 animate-pulse dark:bg-gray-800'>
                            <div className='absolute inset-0 bg-gray-300 dark:bg-gray-700'></div>
                          </div>
                          <div className='mt-2 h-4 bg-gray-200 rounded animate-pulse dark:bg-gray-800'></div>
                        </div>
                      ))
                    : // 显示真实数据
                      hotVarietyShows.map((show, index) => (
                        <div
                          key={index}
                          className='min-w-[96px] w-24 sm:min-w-[180px] sm:w-44'
                        >
                          <VideoCard
                            from='douban'
                            title={show.title}
                            poster={show.poster}
                            douban_id={show.id}
                            rate={show.rate}
                            year={show.year}
                            doubanMarkActions={['collect', 'wish']}
                            onDoubanMarkNeedLogin={() =>
                              setShowCookieModal(true)
                            }
                          />
                        </div>
                      ))}
                </ScrollableRow>
              </section>
            </>
          )}
        </div>
      </div>
      {announcement && showAnnouncement && (
        <div
          className={`fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm dark:bg-black/70 p-4 transition-opacity duration-300 ${
            showAnnouncement ? '' : 'opacity-0 pointer-events-none'
          }`}
        >
          <div className='w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-gray-900 transform transition-all duration-300 hover:shadow-2xl'>
            <div className='flex justify-between items-start mb-4'>
              <h3 className='text-2xl font-bold tracking-tight text-gray-800 dark:text-white border-b border-orange-500 pb-1'>
                提示
              </h3>
              <button
                onClick={() => handleCloseAnnouncement(announcement)}
                className='text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-white transition-colors'
                aria-label='关闭'
              ></button>
            </div>
            <div className='mb-6'>
              <div className='relative overflow-hidden rounded-lg mb-4 bg-orange-50 dark:bg-orange-900/20'>
                <div className='absolute inset-y-0 left-0 w-1.5 bg-orange-500 dark:bg-orange-400'></div>
                <p className='ml-4 text-gray-600 dark:text-gray-300 leading-relaxed'>
                  {announcement}
                </p>
              </div>
            </div>
            <button
              onClick={() => handleCloseAnnouncement(announcement)}
              className='w-full rounded-lg bg-gradient-to-r from-orange-600 to-orange-700 px-4 py-3 text-white font-medium shadow-md hover:shadow-lg hover:from-orange-700 hover:to-orange-800 dark:from-orange-600 dark:to-orange-700 dark:hover:from-orange-700 dark:hover:to-orange-800 transition-all duration-300 transform hover:-translate-y-0.5'
            >
              我知道了
            </button>
          </div>
        </div>
      )}

      {/* 豆瓣Cookie设置弹窗 */}
      <DoubanCookieModal
        isOpen={showCookieModal}
        onClose={() => setShowCookieModal(false)}
        onSave={handleCookieSave}
      />
    </PageLayout>
  );
}

export default function Home() {
  return (
    <Suspense>
      <HomeClient />
    </Suspense>
  );
}
