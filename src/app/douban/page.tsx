/* eslint-disable no-console,react-hooks/exhaustive-deps,@typescript-eslint/no-explicit-any */

'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { getDoubanCategories, getDoubanList } from '@/lib/client/douban.client';
import { DoubanItem, DoubanResult } from '@/lib/types';

import DoubanCardSkeleton from '@/components/DoubanCardSkeleton';
import DoubanCookieModal from '@/components/DoubanCookieModal';
import DoubanCustomSelector from '@/components/DoubanCustomSelector';
import DoubanSelector from '@/components/DoubanSelector';
import PageLayout from '@/components/PageLayout';
import VideoCard from '@/components/VideoCard';

function readPersistedSelection(key: string): {
  primarySelection?: string;
  secondarySelection?: string;
} | null {
  if (typeof window === 'undefined') return null;
  const raw = sessionStorage.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const record = parsed as Record<string, unknown>;
    return {
      primarySelection:
        typeof record.primarySelection === 'string'
          ? record.primarySelection
          : undefined,
      secondarySelection:
        typeof record.secondarySelection === 'string'
          ? record.secondarySelection
          : undefined,
    };
  } catch {
    return null;
  }
}

function writePersistedSelection(
  key: string,
  selection: { primarySelection: string; secondarySelection: string }
) {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(key, JSON.stringify(selection));
}

function DoubanPageClient() {
  const searchParams = useSearchParams();
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadingRef = useRef<HTMLDivElement>(null);

  const type = searchParams.get('type') || 'movie';
  const selectionStorageKey = `selection:douban:${type}`;

  const [showCookieModal, setShowCookieModal] = useState(false);

  // 获取 runtimeConfig 中的自定义分类数据
  const [customCategories, setCustomCategories] = useState<
    Array<{ name: string; type: 'movie' | 'tv'; query: string }>
  >([]);

  // 选择器状态 - 使用 sessionStorage 做“返回保持分类”
  const [primarySelection, setPrimarySelection] = useState<string>(() => {
    const saved = readPersistedSelection(selectionStorageKey);
    if (saved?.primarySelection != null) return saved.primarySelection;
    return type === 'movie' ? '热门' : '';
  });
  const [secondarySelection, setSecondarySelection] = useState<string>(() => {
    const saved = readPersistedSelection(selectionStorageKey);
    if (saved?.secondarySelection != null) return saved.secondarySelection;
    if (type === 'movie') return '全部';
    if (type === 'tv') return 'tv';
    if (type === 'show') return 'show';
    return '全部';
  });

  // 获取自定义分类数据
  useEffect(() => {
    const runtimeConfig = (window as any).RUNTIME_CONFIG;
    if (runtimeConfig?.CUSTOM_CATEGORIES?.length > 0) {
      setCustomCategories(runtimeConfig.CUSTOM_CATEGORIES);
    }
  }, []);

  // 当 type 变化时恢复选择器状态（或回落到默认值）
  useEffect(() => {
    const saved = readPersistedSelection(selectionStorageKey);

    if (type === 'custom' && customCategories.length > 0) {
      // 自定义分类模式：优先选择 movie，如果没有 movie 则选择 tv
      const types = Array.from(
        new Set(customCategories.map((cat) => cat.type))
      );
      if (types.length > 0) {
        const fallbackPrimary = types.includes('movie') ? 'movie' : 'tv';
        const nextPrimary =
          saved?.primarySelection &&
          types.includes(saved.primarySelection as 'movie' | 'tv')
            ? (saved.primarySelection as 'movie' | 'tv')
            : fallbackPrimary;

        const available = customCategories.filter(
          (c) => c.type === nextPrimary
        );
        const fallbackSecondary =
          available[0]?.query || customCategories[0]?.query;
        const nextSecondary =
          saved?.secondarySelection &&
          available.some((c) => c.query === saved.secondarySelection)
            ? saved.secondarySelection
            : fallbackSecondary;

        setPrimarySelection(nextPrimary);
        setSecondarySelection(nextSecondary);
      }
    } else {
      // 原有逻辑
      if (type === 'movie') {
        setPrimarySelection(saved?.primarySelection ?? '热门');
        setSecondarySelection(saved?.secondarySelection ?? '全部');
      } else if (type === 'tv') {
        setPrimarySelection(saved?.primarySelection ?? '');
        setSecondarySelection(saved?.secondarySelection ?? 'tv');
      } else if (type === 'show') {
        setPrimarySelection(saved?.primarySelection ?? '');
        setSecondarySelection(saved?.secondarySelection ?? 'show');
      } else {
        setPrimarySelection(saved?.primarySelection ?? '');
        setSecondarySelection(saved?.secondarySelection ?? '全部');
      }
    }
  }, [customCategories, selectionStorageKey, type]);

  // 选择器状态持久化（返回列表页时复用）
  useEffect(() => {
    if (type === 'custom' && customCategories.length === 0) return;
    writePersistedSelection(selectionStorageKey, {
      primarySelection,
      secondarySelection,
    });
  }, [
    customCategories.length,
    primarySelection,
    secondarySelection,
    selectionStorageKey,
    type,
  ]);

  // 生成骨架屏数据
  const skeletonData = Array.from({ length: 25 }, (_, index) => index);

  const selection = useMemo(() => {
    if (type === 'custom') {
      if (customCategories.length === 0) return null;

      const types = Array.from(new Set(customCategories.map((c) => c.type)));
      const defaultPrimary = types.includes('movie') ? 'movie' : types[0];
      const primary = types.includes(primarySelection as 'movie' | 'tv')
        ? (primarySelection as 'movie' | 'tv')
        : defaultPrimary;

      const available = customCategories.filter((c) => c.type === primary);
      const defaultSecondary =
        available[0]?.query || customCategories[0]?.query;
      const secondary = available.some((c) => c.query === secondarySelection)
        ? secondarySelection
        : defaultSecondary;

      return { primary, secondary };
    }

    if (type === 'movie') {
      const primary = primarySelection || '热门';
      const secondary =
        secondarySelection && !['tv', 'show'].includes(secondarySelection)
          ? secondarySelection
          : '全部';

      return { primary, secondary };
    }

    if (type === 'tv') {
      return {
        primary: '',
        secondary:
          secondarySelection && secondarySelection !== '全部'
            ? secondarySelection
            : 'tv',
      };
    }

    if (type === 'show') {
      return {
        primary: '',
        secondary:
          secondarySelection && secondarySelection !== '全部'
            ? secondarySelection
            : 'show',
      };
    }

    return { primary: '', secondary: '全部' };
  }, [customCategories, primarySelection, secondarySelection, type]);
  const pageLimit = 25;

  // 生成API请求参数的辅助函数
  const getRequestParams = useCallback(
    (pageStart: number) => {
      if (!selection) return null;

      // 当type为tv或show时，kind统一为'tv'，category使用type本身
      if (type === 'tv' || type === 'show') {
        return {
          kind: 'tv' as const,
          category: type,
          type: selection.secondary,
          pageLimit,
          pageStart,
        };
      }

      // 电影类型保持原逻辑
      return {
        kind: type as 'tv' | 'movie',
        category: selection.primary,
        type: selection.secondary,
        pageLimit,
        pageStart,
      };
    },
    [pageLimit, selection, type]
  );

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isPending } =
    useInfiniteQuery<DoubanResult>({
      queryKey: [
        'douban',
        {
          type,
          primary: selection?.primary ?? null,
          secondary: selection?.secondary ?? null,
        },
      ],
      enabled: Boolean(selection),
      initialPageParam: 0,
      queryFn: async ({ pageParam }) => {
        const pageStart = Number(pageParam) || 0;

        if (type === 'custom') {
          if (!selection) {
            throw new Error('自定义分类未就绪');
          }

          const result = await getDoubanList({
            tag: selection.secondary,
            type: selection.primary as 'movie' | 'tv',
            pageLimit,
            pageStart,
          });
          if (result.code !== 200) {
            throw new Error(result.message || '获取数据失败');
          }
          return result;
        }

        const params = getRequestParams(pageStart);
        if (!params) {
          throw new Error('分类未就绪');
        }

        const result = await getDoubanCategories(params);
        if (result.code !== 200) {
          throw new Error(result.message || '获取数据失败');
        }
        return result;
      },
      getNextPageParam: (lastPage, allPages) => {
        if (lastPage.list.length < pageLimit) return undefined;
        return allPages.length * pageLimit;
      },
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 30,
    });

  const doubanData: DoubanItem[] = data?.pages.flatMap((p) => p.list) ?? [];
  const showSkeleton = !selection || (isPending && doubanData.length === 0);

  const scrollKey = useMemo(() => {
    return `scroll:douban:${type}:${selection?.primary ?? ''}:${
      selection?.secondary ?? ''
    }`;
  }, [selection?.primary, selection?.secondary, type]);

  const hasRestoredScrollRef = useRef(false);
  const ignoreScrollSaveRef = useRef(false);
  const lastSavedScrollTopRef = useRef(0);

  useEffect(() => {
    hasRestoredScrollRef.current = false;
    ignoreScrollSaveRef.current = false;
    lastSavedScrollTopRef.current = 0;
  }, [scrollKey]);

  // 记录列表滚动位置（body 为滚动容器）
  useEffect(() => {
    if (!selection) return;

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
  }, [scrollKey, selection]);

  // 数据已就绪时恢复滚动位置（返回列表页场景）
  useEffect(() => {
    if (!selection) return;
    if (hasRestoredScrollRef.current) return;
    if (doubanData.length === 0) return;

    const saved = sessionStorage.getItem(scrollKey);
    if (!saved) return;

    hasRestoredScrollRef.current = true;
    requestAnimationFrame(() => {
      const top = Number(saved) || 0;
      lastSavedScrollTopRef.current = top;
      document.body.scrollTo(0, top);
    });
  }, [doubanData.length, scrollKey, selection]);

  // 设置滚动监听
  useEffect(() => {
    // 如果没有更多数据或正在加载，则不设置监听
    if (!hasNextPage || isFetchingNextPage) {
      return;
    }

    // 确保 loadingRef 存在
    if (!loadingRef.current) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
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
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  // 处理选择器变化
  const handlePrimaryChange = useCallback(
    (value: string) => {
      if (value !== primarySelection) {
        // 如果是自定义分类模式，同时更新一级和二级选择器
        if (type === 'custom' && customCategories.length > 0) {
          const firstCategory = customCategories.find(
            (cat) => cat.type === value
          );
          if (firstCategory) {
            // 批量更新状态，避免多次触发数据加载
            setPrimarySelection(value);
            setSecondarySelection(firstCategory.query);
          } else {
            setPrimarySelection(value);
          }
        } else {
          setPrimarySelection(value);
        }
      }
    },
    [primarySelection, type, customCategories]
  );

  const handleSecondaryChange = useCallback(
    (value: string) => {
      if (value !== secondarySelection) {
        setSecondarySelection(value);
      }
    },
    [secondarySelection]
  );

  // const getPageTitle = () => {
  //   // 根据 type 生成标题
  //   return type === 'movie'
  //     ? '电影'
  //     : type === 'tv'
  //     ? '电视剧'
  //     : type === 'show'
  //     ? '综艺'
  //     : '自定义';
  // };

  const getActivePath = () => {
    const params = new URLSearchParams();
    if (type) params.set('type', type);

    const queryString = params.toString();
    const activePath = `/douban${queryString ? `?${queryString}` : ''}`;
    return activePath;
  };

  return (
    <PageLayout activePath={getActivePath()}>
      <div className='px-4 sm:px-10 py-4 sm:py-8 overflow-visible'>
        {/* 页面标题和选择器 */}
        <div className='mb-6 sm:mb-8 space-y-4 sm:space-y-6'>
          {/* 页面标题 */}
          {/* <div>
            <h1 className='text-2xl sm:text-3xl font-bold text-gray-800 mb-1 sm:mb-2 dark:text-gray-200'>
              {getPageTitle()}
            </h1>
            <p className='text-sm sm:text-base text-gray-600 dark:text-gray-400'>
              来自豆瓣的精选内容
            </p>
          </div> */}

          {/* 选择器组件 */}
          {type !== 'custom' ? (
            <div className='bg-white/60 dark:bg-gray-800/40 rounded-2xl p-4 sm:p-6 border border-gray-200/30 dark:border-gray-700/30 backdrop-blur-sm'>
              <DoubanSelector
                type={type as 'movie' | 'tv' | 'show'}
                primarySelection={primarySelection}
                secondarySelection={secondarySelection}
                onPrimaryChange={handlePrimaryChange}
                onSecondaryChange={handleSecondaryChange}
              />
            </div>
          ) : (
            <div className='bg-white/60 dark:bg-gray-800/40 rounded-2xl p-4 sm:p-6 border border-gray-200/30 dark:border-gray-700/30 backdrop-blur-sm'>
              <DoubanCustomSelector
                customCategories={customCategories}
                primarySelection={primarySelection}
                secondarySelection={secondarySelection}
                onPrimaryChange={handlePrimaryChange}
                onSecondaryChange={handleSecondaryChange}
              />
            </div>
          )}
        </div>

        {/* 内容展示区域 */}
        <div className='max-w-[100%] mx-auto mt-4 overflow-visible'>
          {/* 内容网格 */}
          <div className='justify-start grid grid-cols-3 gap-x-4 gap-y-8 px-0 sm:px-2 sm:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] sm:gap-x-8 sm:gap-y-20'>
            {showSkeleton
              ? // 显示骨架屏
                skeletonData.map((index) => <DoubanCardSkeleton key={index} />)
              : // 显示实际数据
                doubanData.map((item, index) => (
                  <div
                    key={`${item.title}-${index}`}
                    className='w-full'
                    onClickCapture={() => {
                      const top = document.body.scrollTop;
                      ignoreScrollSaveRef.current = true;
                      lastSavedScrollTopRef.current = top;
                      sessionStorage.setItem(scrollKey, String(top));

                      // 防止因路由切换触发的滚动重置覆盖掉刚保存的值
                      window.setTimeout(() => {
                        ignoreScrollSaveRef.current = false;
                      }, 1000);
                    }}
                  >
                    <VideoCard
                      from='douban'
                      title={item.title}
                      poster={item.poster}
                      douban_id={item.id}
                      rate={item.rate}
                      year={item.year}
                      type={type === 'movie' ? 'movie' : ''} // 电影类型严格控制，tv 不控
                      doubanMarkActions={['collect', 'wish']}
                      onDoubanMarkNeedLogin={() => setShowCookieModal(true)}
                    />
                  </div>
                ))}
          </div>

          {/* 加载更多指示器 */}
          {hasNextPage && !showSkeleton && doubanData.length > 0 && (
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
              {isFetchingNextPage && (
                <div className='flex items-center gap-2'>
                  <div className='animate-spin rounded-full h-6 w-6 border-b-2 border-orange-500'></div>
                  <span className='text-gray-600'>加载中...</span>
                </div>
              )}
            </div>
          )}

          {/* 没有更多数据提示 */}
          {!hasNextPage && doubanData.length > 0 && !showSkeleton && (
            <div className='text-center text-gray-500 py-8'>已加载全部内容</div>
          )}

          {/* 空状态 */}
          {!showSkeleton && doubanData.length === 0 && (
            <div className='text-center text-gray-500 py-8'>暂无相关内容</div>
          )}
        </div>
      </div>
      <DoubanCookieModal
        isOpen={showCookieModal}
        onClose={() => setShowCookieModal(false)}
        onSave={() => setShowCookieModal(false)}
      />
    </PageLayout>
  );
}

export default function DoubanPage() {
  return (
    <Suspense>
      <DoubanPageClient />
    </Suspense>
  );
}
