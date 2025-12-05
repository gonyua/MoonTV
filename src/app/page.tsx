/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps, no-console */

'use client';

import { ChevronRight, Settings } from 'lucide-react';
import Link from 'next/link';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';

// 客户端收藏 API
import {
  clearAllFavorites,
  getAllFavorites,
  getAllPlayRecords,
  subscribeToDataUpdates,
} from '@/lib/client/db.client';
import { getDoubanCategories } from '@/lib/client/douban.client';
import { getDoubanCookie, syncDoubanCookie } from '@/lib/client/douban-auth';
import { DoubanItem, DoubanMineItem, DoubanMineResult } from '@/lib/types';

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

type TabType = 'home' | 'wish' | 'do' | 'collect' | 'favorites';

function HomeClient() {
  const [activeTab, setActiveTab] = useState<TabType>('home');
  const [hotMovies, setHotMovies] = useState<DoubanItem[]>([]);
  const [hotTvShows, setHotTvShows] = useState<DoubanItem[]>([]);
  const [hotVarietyShows, setHotVarietyShows] = useState<DoubanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { announcement } = useSite();

  const [showAnnouncement, setShowAnnouncement] = useState(false);

  // 豆瓣个人数据状态
  const [doubanMineData, setDoubanMineData] = useState<{
    wish: DoubanMineItem[];
    do: DoubanMineItem[];
    collect: DoubanMineItem[];
  }>({ wish: [], do: [], collect: [] });
  const [doubanMineHasMore, setDoubanMineHasMore] = useState<{
    wish: boolean;
    do: boolean;
    collect: boolean;
  }>({ wish: true, do: true, collect: true });
  const [doubanMineLoading, setDoubanMineLoading] = useState(false);
  const [doubanMineLoadingMore, setDoubanMineLoadingMore] = useState(false);
  const [showCookieModal, setShowCookieModal] = useState(false);
  const [doubanMineError, setDoubanMineError] = useState<string | null>(null);
  const [doubanLoggedIn, setDoubanLoggedIn] = useState(false);

  // IntersectionObserver refs for infinite scroll
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadingRef = useRef<HTMLDivElement>(null);

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
    poster: string;
    episodes: number;
    source_name: string;
    currentEpisode?: number;
    search_title?: string;
  };

  const [favoriteItems, setFavoriteItems] = useState<FavoriteItem[]>([]);

  // 同步当前豆瓣登录状态（从 Cookie 源解析）
  useEffect(() => {
    let cancelled = false;
    syncDoubanCookie().then((id) => {
      if (!cancelled) {
        setDoubanLoggedIn(Boolean(id));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [showCookieModal]);

  useEffect(() => {
    const fetchDoubanData = async () => {
      try {
        setLoading(true);

        // 并行获取热门电影、热门剧集和热门综艺
        const [moviesData, tvShowsData, varietyShowsData] = await Promise.all([
          getDoubanCategories({
            kind: 'movie',
            category: '热门',
            type: '全部',
          }),
          getDoubanCategories({ kind: 'tv', category: 'tv', type: 'tv' }),
          getDoubanCategories({ kind: 'tv', category: 'show', type: 'show' }),
        ]);

        if (moviesData.code === 200) {
          setHotMovies(moviesData.list);
        }

        if (tvShowsData.code === 200) {
          setHotTvShows(tvShowsData.list);
        }

        if (varietyShowsData.code === 200) {
          setHotVarietyShows(varietyShowsData.list);
        }
      } catch (error) {
        console.error('获取豆瓣数据失败:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDoubanData();
  }, []);

  // 处理收藏数据更新的函数
  const updateFavoriteItems = async (allFavorites: Record<string, any>) => {
    const allPlayRecords = await getAllPlayRecords();

    // 根据保存时间排序（从近到远）
    const sorted = Object.entries(allFavorites)
      .sort(([, a], [, b]) => b.save_time - a.save_time)
      .map(([key, fav]) => {
        const plusIndex = key.indexOf('+');
        const source = key.slice(0, plusIndex);
        const id = key.slice(plusIndex + 1);

        // 查找对应的播放记录，获取当前集数
        const playRecord = allPlayRecords[key];
        const currentEpisode = playRecord?.index;

        return {
          id,
          source,
          title: fav.title,
          year: fav.year,
          poster: fav.cover,
          episodes: fav.total_episodes,
          source_name: fav.source_name,
          currentEpisode,
          search_title: fav?.search_title,
        } as FavoriteItem;
      });
    setFavoriteItems(sorted);
  };

  // 当切换到收藏夹时加载收藏数据
  useEffect(() => {
    if (activeTab !== 'favorites') return;

    const loadFavorites = async () => {
      const allFavorites = await getAllFavorites();
      await updateFavoriteItems(allFavorites);
    };

    loadFavorites();

    // 监听收藏更新事件
    const unsubscribe = subscribeToDataUpdates(
      'favoritesUpdated',
      (newFavorites: Record<string, any>) => {
        updateFavoriteItems(newFavorites);
      }
    );

    return unsubscribe;
  }, [activeTab]);

  // 获取豆瓣个人数据
  const fetchDoubanMine = useCallback(
    async (status: 'wish' | 'do' | 'collect', loadMore = false) => {
      // 计算起始位置
      const start = loadMore ? doubanMineData[status].length : 0;

      // 根据存储类型构建请求 URL
      let url = `/api/douban/mine?status=${status}&start=${start}`;

      // 非 D1 模式下仍然从localStorage获取 豆瓣cookie 并透传给服务端
      if (STORAGE_TYPE !== 'd1') {
        const cookie = getDoubanCookie();
        if (!cookie) {
          setShowCookieModal(true);
          return;
        }

        url += `&cookie=${encodeURIComponent(cookie)}`;
      }

      if (loadMore) {
        setDoubanMineLoadingMore(true);
      } else {
        setDoubanMineLoading(true);
      }
      setDoubanMineError(null);

      try {
        const response = await fetch(url);
        const data: DoubanMineResult = await response.json();

        if (data.code === 401 || data.code === 403) {
          setShowCookieModal(true);
          setDoubanMineError(data.message);
        } else if (data.code === 200) {
          setDoubanMineData((prev) => ({
            ...prev,
            [status]: loadMore ? [...prev[status], ...data.list] : data.list,
          }));
          setDoubanMineHasMore((prev) => ({
            ...prev,
            [status]: data.hasMore,
          }));
        } else {
          setDoubanMineError(data.message);
        }
      } catch (error) {
        console.error('获取豆瓣数据失败:', error);
        setDoubanMineError('获取数据失败，请稍后重试');
      } finally {
        setDoubanMineLoading(false);
        setDoubanMineLoadingMore(false);
      }
    },
    [doubanMineData]
  );

  // 当切换到豆瓣tab时加载数据
  useEffect(() => {
    if (activeTab === 'wish' || activeTab === 'do' || activeTab === 'collect') {
      // 如果没有数据，则加载
      if (doubanMineData[activeTab].length === 0) {
        fetchDoubanMine(activeTab);
      }
    }
  }, [activeTab, fetchDoubanMine]);

  // Cookie保存后重新加载数据
  const handleCookieSave = () => {
    setShowCookieModal(false);
    if (activeTab === 'wish' || activeTab === 'do' || activeTab === 'collect') {
      // 重置数据和分页状态
      setDoubanMineData((prev) => ({ ...prev, [activeTab]: [] }));
      setDoubanMineHasMore((prev) => ({ ...prev, [activeTab]: true }));
      fetchDoubanMine(activeTab);
    }
  };

  // 加载更多
  const handleLoadMore = useCallback(
    (status: 'wish' | 'do' | 'collect') => {
      if (!doubanMineLoadingMore && doubanMineHasMore[status]) {
        fetchDoubanMine(status, true);
      }
    },
    [doubanMineLoadingMore, doubanMineHasMore, fetchDoubanMine]
  );

  // 设置滚动监听 - 无限滚动加载更多
  useEffect(() => {
    // 只对豆瓣个人数据tab启用
    if (activeTab !== 'wish' && activeTab !== 'do' && activeTab !== 'collect') {
      return;
    }

    // 如果没有更多数据或正在加载，则不设置监听
    if (
      !doubanMineHasMore[activeTab] ||
      doubanMineLoadingMore ||
      doubanMineLoading
    ) {
      return;
    }

    // 确保 loadingRef 存在
    if (!loadingRef.current) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries[0].isIntersecting &&
          doubanMineHasMore[activeTab] &&
          !doubanMineLoadingMore
        ) {
          handleLoadMore(activeTab);
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(loadingRef.current);
    observerRef.current = observer;

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [
    activeTab,
    doubanMineHasMore,
    doubanMineLoadingMore,
    doubanMineLoading,
    handleLoadMore,
  ]);

  // 刷新数据
  const handleRefresh = (status: 'wish' | 'do' | 'collect') => {
    setDoubanMineData((prev) => ({ ...prev, [status]: [] }));
    setDoubanMineHasMore((prev) => ({ ...prev, [status]: true }));
    fetchDoubanMine(status);
  };

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
              { label: '在看', value: 'do' },
              { label: '看过', value: 'collect' },
              { label: '收藏夹', value: 'favorites' },
            ]}
            active={activeTab}
            onChange={(value) => setActiveTab(value as TabType)}
          />
          {(activeTab === 'wish' ||
            activeTab === 'do' ||
            activeTab === 'collect') && (
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
          {activeTab === 'favorites' ? (
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
                      setFavoriteItems([]);
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
          ) : activeTab === 'wish' ||
            activeTab === 'do' ||
            activeTab === 'collect' ? (
            // 豆瓣想看/在看/看过视图
            <section className='mb-8'>
              <div className='mb-4 flex items-center justify-between'>
                <h2 className='text-xl font-bold text-gray-800 dark:text-gray-200'>
                  {activeTab === 'wish'
                    ? '想看'
                    : activeTab === 'do'
                    ? '在看'
                    : '看过'}
                </h2>
                {doubanLoggedIn && doubanMineData[activeTab].length > 0 && (
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
              ) : doubanMineError && doubanMineData[activeTab].length === 0 ? (
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
                    {doubanMineData[activeTab].map((item) => (
                      <div key={item.id} className='w-full'>
                        <VideoCard
                          from='douban'
                          title={item.title}
                          poster={item.poster}
                          douban_id={item.id}
                          year={item.year}
                        />
                      </div>
                    ))}
                    {doubanMineData[activeTab].length === 0 &&
                      !doubanMineLoading && (
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
                  {doubanMineHasMore[activeTab] &&
                    doubanMineData[activeTab].length > 0 && (
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
                  {!doubanMineHasMore[activeTab] &&
                    doubanMineData[activeTab].length > 0 && (
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
              <ContinueWatching />

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
