/* eslint-disable no-console */
const DOUBAN_COOKIE_KEY = 'douban_cookie';
const CONFIG_KEY = 'douban_cookie';

// 获取存储类型
function getStorageType(): string {
  if (typeof window === 'undefined') return 'localstorage';
  return process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
}

// 是否使用D1存储
function isD1Storage(): boolean {
  return getStorageType() === 'd1';
}

// 同步获取cookie（从localStorage缓存）
export function getDoubanCookie(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(DOUBAN_COOKIE_KEY);
}

// 异步从D1获取cookie
export async function fetchDoubanCookie(): Promise<string | null> {
  if (typeof window === 'undefined') return null;

  // 先返回本地缓存
  const localCookie = localStorage.getItem(DOUBAN_COOKIE_KEY);

  // 如果使用D1，尝试从服务器获取
  if (isD1Storage()) {
    try {
      const response = await fetch(`/api/user-config?key=${CONFIG_KEY}`);
      const data = await response.json();
      if (data.code === 200 && data.data?.value) {
        // 同步到本地缓存
        localStorage.setItem(DOUBAN_COOKIE_KEY, data.data.value);
        return data.data.value;
      }
    } catch (error) {
      console.error('从D1获取cookie失败:', error);
    }
  }

  return localCookie;
}

// 保存cookie
export async function setDoubanCookie(cookie: string): Promise<void> {
  if (typeof window === 'undefined') return;

  // 始终保存到localStorage（作为缓存）
  localStorage.setItem(DOUBAN_COOKIE_KEY, cookie);

  // 如果使用D1，同时保存到服务器
  if (isD1Storage()) {
    try {
      const userId = extractUserIdFromCookie(cookie);
      await fetch('/api/user-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: CONFIG_KEY,
          value: cookie,
          type: 'string',
          description: '豆瓣Cookie',
          metadata: userId ? { userId } : undefined,
        }),
      });
    } catch (error) {
      console.error('保存cookie到D1失败:', error);
    }
  }
}

// 清除cookie
export async function clearDoubanCookie(): Promise<void> {
  if (typeof window === 'undefined') return;

  localStorage.removeItem(DOUBAN_COOKIE_KEY);

  if (isD1Storage()) {
    try {
      await fetch(`/api/user-config?key=${CONFIG_KEY}`, {
        method: 'DELETE',
      });
    } catch (error) {
      console.error('从D1删除cookie失败:', error);
    }
  }
}

// 从cookie字符串中提取用户ID
function extractUserIdFromCookie(cookie: string): string | null {
  const match = cookie.match(/dbcl2="(\d+):/);
  return match ? match[1] : null;
}

export function getDoubanUserId(): string | null {
  const cookie = getDoubanCookie();
  if (!cookie) return null;
  return extractUserIdFromCookie(cookie);
}

export function isDoubanLoggedIn(): boolean {
  return getDoubanUserId() !== null;
}

// 初始化时从D1同步cookie到本地
export async function syncDoubanCookie(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!isD1Storage()) return;

  try {
    const response = await fetch(`/api/user-config?key=${CONFIG_KEY}`);
    const data = await response.json();
    if (data.code === 200 && data.data?.value) {
      localStorage.setItem(DOUBAN_COOKIE_KEY, data.data.value);
    }
  } catch (error) {
    console.error('同步cookie失败:', error);
  }
}
