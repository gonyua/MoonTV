import { NextRequest } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';

interface D1Database {
  prepare(sql: string): D1PreparedStatement;
}

interface D1PreparedStatement {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  bind(...values: any[]): D1PreparedStatement;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  first<T = any>(): Promise<T | null>;
}

function getD1Database(): D1Database | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (process.env as any).DB as D1Database | null;
}

export type StorageType = 'localstorage' | 'redis' | 'd1' | 'upstash';

export const STORAGE_TYPE: StorageType =
  (process.env.NEXT_PUBLIC_STORAGE_TYPE as StorageType | undefined) ||
  'localstorage';

export function normalizeDoubanCookie(input: string): string {
  // 以数据库/配置中保存的“纯 Cookie 字符串”为准
  // 允许存在换行（例如存储时被格式化），这里仅做头部安全化处理
  return input
    .trim()
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export async function getDoubanCookieFromRequest(
  request: NextRequest,
  bodyCookie?: string
): Promise<string | null> {
  if (STORAGE_TYPE !== 'd1') {
    const normalized = bodyCookie ? normalizeDoubanCookie(bodyCookie) : '';
    return normalized ? normalized : null;
  }

  const db = getD1Database();
  if (!db) return null;

  const authInfo = getAuthInfoFromCookie(request);
  if (!authInfo?.username) return null;

  try {
    const result = await db
      .prepare(
        'SELECT config_value FROM user_configs WHERE username = ? AND config_key = ?'
      )
      .bind(authInfo.username, 'douban_cookie')
      .first<{ config_value: string }>();

    if (!result?.config_value) return null;
    const normalized = normalizeDoubanCookie(result.config_value);
    return normalized || null;
  } catch {
    return null;
  }
}

export function extractDoubanCk(cookie: string): string | null {
  const match = cookie.match(/(?:^|;\s*)ck=([^;]+)/);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export function isValidSubjectId(subjectId: string): boolean {
  return /^[0-9]+$/.test(subjectId);
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

export function isLikelyDoubanLoginResponse(response: Response): boolean {
  const url = response.url || '';
  if (
    url.includes('accounts.douban.com') ||
    url.includes('/passport/login') ||
    url.includes('www.douban.com/accounts/')
  ) {
    return true;
  }
  return false;
}
