/* eslint-disable no-console, @typescript-eslint/no-explicit-any */
'use client';

import {
  CreateCategoryParams,
  CreateSiteParams,
  NavCategory,
  NavsData,
  NavSite,
  UpdateCategoryParams,
  UpdateSiteParams,
} from './navs.types';

const NAVS_CATEGORIES_KEY = 'moontv_nav_categories';
const NAVS_SITES_KEY = 'moontv_nav_sites';

// 存储类型
const STORAGE_TYPE = (() => {
  const raw =
    (typeof window !== 'undefined' &&
      (window as any).RUNTIME_CONFIG?.STORAGE_TYPE) ||
    (process.env.NEXT_PUBLIC_STORAGE_TYPE as
      | 'localstorage'
      | 'redis'
      | 'd1'
      | 'upstash'
      | undefined) ||
    'localstorage';
  return raw;
})();

const isDbStorage = STORAGE_TYPE !== 'localstorage';

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

// 生成随机背景色
export function generateBgColor(name: string): string {
  const colors = [
    '#FF6B6B',
    '#4ECDC4',
    '#45B7D1',
    '#96CEB4',
    '#FFEAA7',
    '#DDA0DD',
    '#98D8C8',
    '#F7DC6F',
    '#BB8FCE',
    '#85C1E9',
    '#F8B500',
    '#00CED1',
    '#FF7F50',
    '#9370DB',
    '#20B2AA',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

// 获取站点 favicon
export async function fetchFavicon(url: string): Promise<string | null> {
  try {
    const urlObj = new URL(url);
    const googleFaviconUrl = `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=64`;
    return googleFaviconUrl;
  } catch {
    return null;
  }
}

// API 请求辅助函数
async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!res.ok) {
    if (res.status === 401) {
      const currentUrl = window.location.pathname + window.location.search;
      const loginUrl = new URL('/login', window.location.origin);
      loginUrl.searchParams.set('redirect', currentUrl);
      window.location.href = loginUrl.toString();
      throw new Error('Unauthorized');
    }
    throw new Error(`Request failed: ${res.status}`);
  }

  return res.json();
}

// ============ localStorage 辅助函数 ============

function getLocalCategories(): NavCategory[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(NAVS_CATEGORIES_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as NavCategory[];
  } catch {
    return [];
  }
}

function saveLocalCategories(categories: NavCategory[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(NAVS_CATEGORIES_KEY, JSON.stringify(categories));
  window.dispatchEvent(
    new CustomEvent('navsCategoriesUpdated', { detail: categories })
  );
}

function getLocalSites(): NavSite[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(NAVS_SITES_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as NavSite[];
  } catch {
    return [];
  }
}

function saveLocalSites(sites: NavSite[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(NAVS_SITES_KEY, JSON.stringify(sites));
  window.dispatchEvent(new CustomEvent('navsSitesUpdated', { detail: sites }));
}

// ============ 分类相关 API ============

// 获取所有分类
export async function getCategories(): Promise<NavCategory[]> {
  if (typeof window === 'undefined') return [];

  if (isDbStorage) {
    try {
      return await fetchApi<NavCategory[]>('/api/navs/categories');
    } catch (err) {
      console.error('获取分类失败:', err);
      return [];
    }
  }

  return getLocalCategories();
}

// 添加分类
export async function addCategory(
  params: CreateCategoryParams
): Promise<NavCategory | null> {
  if (isDbStorage) {
    try {
      const newCategory = await fetchApi<NavCategory>('/api/navs/categories', {
        method: 'POST',
        body: JSON.stringify(params),
      });
      window.dispatchEvent(new CustomEvent('navsCategoriesUpdated'));
      return newCategory;
    } catch (err) {
      console.error('添加分类失败:', err);
      return null;
    }
  }

  // localStorage 模式
  const categories = getLocalCategories();
  const maxOrder =
    categories.length > 0 ? Math.max(...categories.map((c) => c.order)) : -1;
  const newCategory: NavCategory = {
    id: generateId(),
    name: params.name,
    icon: params.icon,
    description: params.description,
    color: params.color,
    parentId: params.parentId,
    order: maxOrder + 1,
    isPrivate: params.isPrivate,
    password: params.password,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  categories.push(newCategory);
  saveLocalCategories(categories);
  return newCategory;
}

// 更新分类
export async function updateCategory(
  id: string,
  params: UpdateCategoryParams
): Promise<boolean> {
  if (isDbStorage) {
    try {
      await fetchApi(`/api/navs/categories?id=${id}`, {
        method: 'PUT',
        body: JSON.stringify(params),
      });
      window.dispatchEvent(new CustomEvent('navsCategoriesUpdated'));
      return true;
    } catch (err) {
      console.error('更新分类失败:', err);
      return false;
    }
  }

  // localStorage 模式
  const categories = getLocalCategories();
  const index = categories.findIndex((c) => c.id === id);
  if (index !== -1) {
    categories[index] = {
      ...categories[index],
      ...params,
      updatedAt: Date.now(),
    };
    saveLocalCategories(categories);
    return true;
  }
  return false;
}

// 删除分类
export async function deleteCategory(id: string): Promise<boolean> {
  if (isDbStorage) {
    try {
      await fetchApi(`/api/navs/categories?id=${id}`, {
        method: 'DELETE',
      });
      window.dispatchEvent(new CustomEvent('navsCategoriesUpdated'));
      window.dispatchEvent(new CustomEvent('navsSitesUpdated'));
      return true;
    } catch (err) {
      console.error('删除分类失败:', err);
      return false;
    }
  }

  // localStorage 模式
  const categories = getLocalCategories().filter((c) => c.id !== id);
  saveLocalCategories(categories);
  const sites = getLocalSites().filter((s) => s.categoryId !== id);
  saveLocalSites(sites);
  return true;
}

// 重新排序分类
export async function reorderCategories(
  orderedIds: string[]
): Promise<boolean> {
  if (isDbStorage) {
    try {
      await fetchApi('/api/navs/reorder', {
        method: 'POST',
        body: JSON.stringify({ type: 'categories', ids: orderedIds }),
      });
      window.dispatchEvent(new CustomEvent('navsCategoriesUpdated'));
      return true;
    } catch (err) {
      console.error('重新排序分类失败:', err);
      return false;
    }
  }

  // localStorage 模式
  const categories = getLocalCategories();
  const reordered = orderedIds
    .map((id, index) => {
      const cat = categories.find((c) => c.id === id);
      if (cat) {
        return { ...cat, order: index, updatedAt: Date.now() };
      }
      return null;
    })
    .filter(Boolean) as NavCategory[];
  saveLocalCategories(reordered);
  return true;
}

// ============ 站点相关 API ============

// 获取所有站点
export async function getSites(categoryId?: string): Promise<NavSite[]> {
  if (typeof window === 'undefined') return [];

  if (isDbStorage) {
    try {
      const url = categoryId
        ? `/api/navs/sites?categoryId=${categoryId}`
        : '/api/navs/sites';
      return await fetchApi<NavSite[]>(url);
    } catch (err) {
      console.error('获取站点失败:', err);
      return [];
    }
  }

  const sites = getLocalSites();
  if (categoryId) {
    return sites.filter((s) => s.categoryId === categoryId);
  }
  return sites;
}

// 添加站点
export async function addSite(
  params: CreateSiteParams
): Promise<NavSite | null> {
  if (isDbStorage) {
    try {
      const newSite = await fetchApi<NavSite>('/api/navs/sites', {
        method: 'POST',
        body: JSON.stringify(params),
      });
      window.dispatchEvent(new CustomEvent('navsSitesUpdated'));
      return newSite;
    } catch (err) {
      console.error('添加站点失败:', err);
      return null;
    }
  }

  // localStorage 模式
  const sites = getLocalSites();
  const categorySites = sites.filter((s) => s.categoryId === params.categoryId);
  const maxOrder =
    categorySites.length > 0
      ? Math.max(...categorySites.map((s) => s.order))
      : -1;
  const newSite: NavSite = {
    id: generateId(),
    categoryId: params.categoryId,
    name: params.name,
    url: params.url,
    backupUrl: params.backupUrl,
    description: params.description,
    keywords: params.keywords,
    icon: params.icon,
    iconType: params.iconType,
    iconBgColor: params.iconBgColor,
    tags: params.tags || [],
    order: maxOrder + 1,
    isPrivate: params.isPrivate,
    password: params.password,
    target: params.target || '_blank',
    notes: params.notes,
    images: params.images,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  sites.push(newSite);
  saveLocalSites(sites);
  return newSite;
}

// 更新站点
export async function updateSite(
  id: string,
  params: UpdateSiteParams
): Promise<boolean> {
  if (isDbStorage) {
    try {
      await fetchApi(`/api/navs/sites?id=${id}`, {
        method: 'PUT',
        body: JSON.stringify(params),
      });
      window.dispatchEvent(new CustomEvent('navsSitesUpdated'));
      return true;
    } catch (err) {
      console.error('更新站点失败:', err);
      return false;
    }
  }

  // localStorage 模式
  const sites = getLocalSites();
  const index = sites.findIndex((s) => s.id === id);
  if (index !== -1) {
    sites[index] = {
      ...sites[index],
      ...params,
      updatedAt: Date.now(),
    };
    saveLocalSites(sites);
    return true;
  }
  return false;
}

// 删除站点
export async function deleteSite(id: string): Promise<boolean> {
  if (isDbStorage) {
    try {
      await fetchApi(`/api/navs/sites?id=${id}`, {
        method: 'DELETE',
      });
      window.dispatchEvent(new CustomEvent('navsSitesUpdated'));
      return true;
    } catch (err) {
      console.error('删除站点失败:', err);
      return false;
    }
  }

  // localStorage 模式
  const sites = getLocalSites().filter((s) => s.id !== id);
  saveLocalSites(sites);
  return true;
}

// 重新排序站点
export async function reorderSites(
  categoryId: string,
  orderedIds: string[]
): Promise<boolean> {
  if (isDbStorage) {
    try {
      await fetchApi('/api/navs/reorder', {
        method: 'POST',
        body: JSON.stringify({ type: 'sites', ids: orderedIds, categoryId }),
      });
      window.dispatchEvent(new CustomEvent('navsSitesUpdated'));
      return true;
    } catch (err) {
      console.error('重新排序站点失败:', err);
      return false;
    }
  }

  // localStorage 模式
  const sites = getLocalSites();
  const otherSites = sites.filter((s) => s.categoryId !== categoryId);
  const categorySites = sites.filter((s) => s.categoryId === categoryId);

  const reordered = orderedIds
    .map((id, index) => {
      const site = categorySites.find((s) => s.id === id);
      if (site) {
        return { ...site, order: index, updatedAt: Date.now() };
      }
      return null;
    })
    .filter(Boolean) as NavSite[];

  saveLocalSites([...otherSites, ...reordered]);
  return true;
}

// 记录访问
export async function recordVisit(id: string): Promise<void> {
  if (isDbStorage) {
    try {
      await fetchApi('/api/navs/visit', {
        method: 'POST',
        body: JSON.stringify({ id }),
      });
    } catch (err) {
      console.error('记录访问失败:', err);
    }
    return;
  }

  // localStorage 模式
  const sites = getLocalSites();
  const index = sites.findIndex((s) => s.id === id);
  if (index !== -1) {
    sites[index] = {
      ...sites[index],
      visitCount: (sites[index].visitCount || 0) + 1,
      lastVisitAt: Date.now(),
      updatedAt: Date.now(),
    };
    saveLocalSites(sites);
  }
}

// ============ 辅助函数 ============

// 获取所有标签
export async function getAllTags(): Promise<string[]> {
  const sites = await getSites();
  const tagSet = new Set<string>();
  sites.forEach((site) => {
    site.tags?.forEach((tag) => tagSet.add(tag));
  });
  return Array.from(tagSet);
}

// 获取分类下的所有标签
export function getCategoryTags(
  sites: NavSite[],
  categoryId: string
): string[] {
  const categorySites = sites.filter((s) => s.categoryId === categoryId);
  const tagSet = new Set<string>();
  categorySites.forEach((site) => {
    site.tags?.forEach((tag) => tagSet.add(tag));
  });
  return Array.from(tagSet);
}

// 获取完整导航数据
export async function getNavsData(): Promise<NavsData> {
  const [categories, sites] = await Promise.all([getCategories(), getSites()]);
  return {
    categories: categories.sort((a, b) => a.order - b.order),
    sites: sites.sort((a, b) => a.order - b.order),
  };
}

// 按分类获取站点
export async function getSitesByCategory(
  categoryId: string
): Promise<NavSite[]> {
  const sites = await getSites(categoryId);
  return sites.sort((a, b) => a.order - b.order);
}

// 按标签筛选站点
export async function getSitesByTag(tag: string): Promise<NavSite[]> {
  const sites = await getSites();
  return sites
    .filter((s) => s.tags?.includes(tag))
    .sort((a, b) => a.order - b.order);
}

// 订阅数据更新
export function subscribeToNavsUpdates(
  callback: (data: NavsData) => void
): () => void {
  if (typeof window === 'undefined') {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    return () => {};
  }

  const handleUpdate = async () => {
    const data = await getNavsData();
    callback(data);
  };

  window.addEventListener('navsCategoriesUpdated', handleUpdate);
  window.addEventListener('navsSitesUpdated', handleUpdate);

  return () => {
    window.removeEventListener('navsCategoriesUpdated', handleUpdate);
    window.removeEventListener('navsSitesUpdated', handleUpdate);
  };
}
