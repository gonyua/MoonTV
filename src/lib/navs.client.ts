'use client';

import { NavCategory, NavsData, NavSite } from './navs.types';

const NAVS_CATEGORIES_KEY = 'moontv_nav_categories';
const NAVS_SITES_KEY = 'moontv_nav_sites';

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
    // 使用 Google Favicon API
    const googleFaviconUrl = `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=64`;
    return googleFaviconUrl;
  } catch {
    return null;
  }
}

// 获取所有分类
export function getCategories(): NavCategory[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(NAVS_CATEGORIES_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as NavCategory[];
  } catch {
    return [];
  }
}

// 保存所有分类
export function saveCategories(categories: NavCategory[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(NAVS_CATEGORIES_KEY, JSON.stringify(categories));
  window.dispatchEvent(
    new CustomEvent('navsCategoriesUpdated', { detail: categories })
  );
}

// 添加分类
export function addCategory(name: string, icon?: string): NavCategory {
  const categories = getCategories();
  const maxOrder =
    categories.length > 0 ? Math.max(...categories.map((c) => c.order)) : -1;
  const newCategory: NavCategory = {
    id: generateId(),
    name,
    icon,
    order: maxOrder + 1,
    createdAt: Date.now(),
  };
  categories.push(newCategory);
  saveCategories(categories);
  return newCategory;
}

// 更新分类
export function updateCategory(
  id: string,
  updates: Partial<Omit<NavCategory, 'id' | 'createdAt'>>
): void {
  const categories = getCategories();
  const index = categories.findIndex((c) => c.id === id);
  if (index !== -1) {
    categories[index] = { ...categories[index], ...updates };
    saveCategories(categories);
  }
}

// 删除分类（同时删除该分类下的所有站点）
export function deleteCategory(id: string): void {
  const categories = getCategories().filter((c) => c.id !== id);
  saveCategories(categories);
  // 删除该分类下的所有站点
  const sites = getSites().filter((s) => s.categoryId !== id);
  saveSites(sites);
}

// 重新排序分类
export function reorderCategories(orderedIds: string[]): void {
  const categories = getCategories();
  const reordered = orderedIds
    .map((id, index) => {
      const cat = categories.find((c) => c.id === id);
      if (cat) {
        return { ...cat, order: index };
      }
      return null;
    })
    .filter(Boolean) as NavCategory[];
  saveCategories(reordered);
}

// 获取所有站点
export function getSites(): NavSite[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(NAVS_SITES_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as NavSite[];
  } catch {
    return [];
  }
}

// 保存所有站点
export function saveSites(sites: NavSite[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(NAVS_SITES_KEY, JSON.stringify(sites));
  window.dispatchEvent(new CustomEvent('navsSitesUpdated', { detail: sites }));
}

// 添加站点
export function addSite(
  categoryId: string,
  name: string,
  url: string,
  description?: string,
  icon?: string,
  tags: string[] = []
): NavSite {
  const sites = getSites();
  const categorySites = sites.filter((s) => s.categoryId === categoryId);
  const maxOrder =
    categorySites.length > 0
      ? Math.max(...categorySites.map((s) => s.order))
      : -1;
  const newSite: NavSite = {
    id: generateId(),
    categoryId,
    name,
    url,
    description,
    icon,
    tags,
    order: maxOrder + 1,
    createdAt: Date.now(),
  };
  sites.push(newSite);
  saveSites(sites);
  return newSite;
}

// 更新站点
export function updateSite(
  id: string,
  updates: Partial<Omit<NavSite, 'id' | 'createdAt'>>
): void {
  const sites = getSites();
  const index = sites.findIndex((s) => s.id === id);
  if (index !== -1) {
    sites[index] = { ...sites[index], ...updates };
    saveSites(sites);
  }
}

// 删除站点
export function deleteSite(id: string): void {
  const sites = getSites().filter((s) => s.id !== id);
  saveSites(sites);
}

// 重新排序站点（在同一分类内）
export function reorderSites(categoryId: string, orderedIds: string[]): void {
  const sites = getSites();
  const otherSites = sites.filter((s) => s.categoryId !== categoryId);
  const categorySites = sites.filter((s) => s.categoryId === categoryId);

  const reordered = orderedIds
    .map((id, index) => {
      const site = categorySites.find((s) => s.id === id);
      if (site) {
        return { ...site, order: index };
      }
      return null;
    })
    .filter(Boolean) as NavSite[];

  saveSites([...otherSites, ...reordered]);
}

// 获取所有标签
export function getAllTags(): string[] {
  const sites = getSites();
  const tagSet = new Set<string>();
  sites.forEach((site) => {
    site.tags.forEach((tag) => tagSet.add(tag));
  });
  return Array.from(tagSet);
}

// 获取分类下的所有标签
export function getCategoryTags(categoryId: string): string[] {
  const sites = getSites().filter((s) => s.categoryId === categoryId);
  const tagSet = new Set<string>();
  sites.forEach((site) => {
    site.tags.forEach((tag) => tagSet.add(tag));
  });
  return Array.from(tagSet);
}

// 获取完整导航数据
export function getNavsData(): NavsData {
  return {
    categories: getCategories().sort((a, b) => a.order - b.order),
    sites: getSites().sort((a, b) => a.order - b.order),
  };
}

// 按分类获取站点
export function getSitesByCategory(categoryId: string): NavSite[] {
  return getSites()
    .filter((s) => s.categoryId === categoryId)
    .sort((a, b) => a.order - b.order);
}

// 按标签筛选站点
export function getSitesByTag(tag: string): NavSite[] {
  return getSites()
    .filter((s) => s.tags.includes(tag))
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

  const handleUpdate = () => {
    callback(getNavsData());
  };

  window.addEventListener('navsCategoriesUpdated', handleUpdate);
  window.addEventListener('navsSitesUpdated', handleUpdate);

  return () => {
    window.removeEventListener('navsCategoriesUpdated', handleUpdate);
    window.removeEventListener('navsSitesUpdated', handleUpdate);
  };
}
