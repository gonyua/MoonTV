'use client';

/* eslint-disable no-console */

import { getAuthInfoFromBrowserCookie } from '@/lib/auth';

const CONFIG_KEY = 'douban_cookie';

// 存储类型（与其他 client 模块保持一致）
const STORAGE_TYPE = (() => {
  const runtimeConfig =
    typeof window !== 'undefined'
      ? (
          window as Window & {
            RUNTIME_CONFIG?: { STORAGE_TYPE?: string };
          }
        ).RUNTIME_CONFIG
      : undefined;

  const storageType =
    runtimeConfig?.STORAGE_TYPE ||
    (process.env.NEXT_PUBLIC_STORAGE_TYPE as
      | 'localstorage'
      | 'redis'
      | 'd1'
      | 'upstash'
      | undefined) ||
    'localstorage';

  return storageType;
})();

const IS_D1 = STORAGE_TYPE === 'd1';

interface UserConfigResponse {
  code: number;
  data?: {
    value?: string;
  } | null;
}

// 获取当前站点登录用户名
function getCurrentUsername(): string | null {
  const authInfo = getAuthInfoFromBrowserCookie();
  const username = authInfo?.username?.trim();
  return username || null;
}

// 非d1模式 本地 Cookie 存储 key
function getCookieStorageKey(): string {
  const username = getCurrentUsername();
  return username ? `${CONFIG_KEY}_${username}` : CONFIG_KEY;
}

// 从 cookie 字符串中提取用户 ID
function extractUserIdFromCookie(cookie: string): string | null {
  const match = cookie.match(/dbcl2="(\d+):/);
  return match ? match[1] : null;
}

// ---------- Cookie 获取 ----------

// 同同步获取 cookie（仅非 D1 模式）
export function getDoubanCookie(): string | null {
  if (typeof window === 'undefined') return null;
  if (IS_D1) return null;

  try {
    return localStorage.getItem(getCookieStorageKey());
  } catch {
    return null;
  }
}

// 异步获取 cookie：D1 每次走服务器，非 D1 直接读 localStorage
export async function fetchDoubanCookie(): Promise<string | null> {
  if (typeof window === 'undefined') return null;

  if (IS_D1) {
    try {
      const response = await fetch(`/api/user-config?key=${CONFIG_KEY}`);
      const data = (await response.json()) as UserConfigResponse;

      if (data.code !== 200 || !data.data || !data.data.value) {
        return null;
      }

      return String(data.data.value);
    } catch (error) {
      console.error('从 D1 获取豆瓣 Cookie 失败:', error);
      return null;
    }
  }

  return getDoubanCookie();
}

// ---------- Cookie 写入 / 清理 ----------

// 保存 cookie
export async function setDoubanCookie(cookie: string): Promise<void> {
  if (typeof window === 'undefined') return;

  if (IS_D1) {
    // D1 模式：仅保存到服务器
    try {
      await fetch('/api/user-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: CONFIG_KEY,
          value: cookie,
          type: 'string',
          description: '豆瓣Cookie',
        }),
      });
    } catch (error) {
      console.error('保存豆瓣 Cookie 到 D1 失败:', error);
    }
  } else {
    // 非 D1 模式：cookie 仅存 localStorage
    try {
      localStorage.setItem(getCookieStorageKey(), cookie);
    } catch {
      // ignore
    }
  }
}

// 清除 cookie
export async function clearDoubanCookie(): Promise<void> {
  if (typeof window === 'undefined') return;

  if (IS_D1) {
    // D1 模式：删除服务器端配置
    try {
      await fetch(`/api/user-config?key=${CONFIG_KEY}`, {
        method: 'DELETE',
      });
    } catch (error) {
      console.error('从 D1 删除豆瓣 Cookie 失败:', error);
    }
  } else {
    // 非 D1 模式：删除 localStorage 中的 cookie
    try {
      localStorage.removeItem(getCookieStorageKey());
    } catch {
      // ignore
    }
  }
}

// 异步读取：D1 模式每次从服务器拿 cookie 再解析；非 D1 从 localStorage 中拿 cookie 再解析
export async function syncDoubanCookie(): Promise<string | null> {
  if (typeof window === 'undefined') return null;

  let cookie: string | null = null;

  if (IS_D1) {
    cookie = await fetchDoubanCookie();
    if (!cookie) return null;
  } else {
    try {
      cookie = localStorage.getItem(getCookieStorageKey());
      if (!cookie) return null;
    } catch {
      return null;
    }
  }

  return extractUserIdFromCookie(cookie);
}
