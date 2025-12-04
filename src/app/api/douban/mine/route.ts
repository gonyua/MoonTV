import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { parseDoubanMineHtml } from '@/lib/douban-mine';

export const runtime = 'edge';

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

const STORAGE_TYPE =
  (process.env.NEXT_PUBLIC_STORAGE_TYPE as
    | 'localstorage'
    | 'redis'
    | 'd1'
    | 'upstash'
    | undefined) || 'localstorage';

const STATUS_MAP: Record<string, string> = {
  wish: 'wish', // 想看
  do: 'do', // 在看
  collect: 'collect', // 看过
};

async function getDoubanCookieFromServer(
  request: NextRequest
): Promise<string | null> {
  if (STORAGE_TYPE !== 'd1') return null;

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

    if (!result?.config_value) {
      return null;
    }

    return result.config_value;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const status = searchParams.get('status') || 'wish';
  const start = parseInt(searchParams.get('start') || '0', 10);
  let doubanCookie = '';

  if (STORAGE_TYPE === 'd1') {
    doubanCookie = (await getDoubanCookieFromServer(request)) || '';
  } else {
    doubanCookie = searchParams.get('cookie') || '';
  }

  // 验证 status 参数
  if (!STATUS_MAP[status]) {
    return NextResponse.json(
      { code: 400, message: 'status 参数必须是 wish/do/collect', list: [] },
      { status: 400 }
    );
  }

  // 验证 cookie
  if (!doubanCookie) {
    return NextResponse.json(
      {
        code: 401,
        message: '请先登录豆瓣',
        total: 0,
        list: [],
        hasMore: false,
      },
      { status: 401 }
    );
  }

  // 从 cookie 中提取用户ID
  const userIdMatch = doubanCookie.match(/dbcl2="(\d+):/);
  if (!userIdMatch) {
    return NextResponse.json(
      {
        code: 401,
        message: '豆瓣Cookie无效，请重新登录',
        total: 0,
        list: [],
        hasMore: false,
      },
      { status: 401 }
    );
  }
  const userId = userIdMatch[1];

  const targetUrl = `https://movie.douban.com/people/${userId}/${status}?start=${start}&sort=time&mode=grid`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        Cookie: doubanCookie,
        Referer: 'https://movie.douban.com/mine',
      },
    });

    clearTimeout(timeoutId);

    if (response.status === 403) {
      return NextResponse.json(
        {
          code: 403,
          message: '豆瓣Cookie已过期，请重新登录',
          total: 0,
          list: [],
          hasMore: false,
        },
        { status: 403 }
      );
    }

    if (!response.ok) {
      return NextResponse.json(
        {
          code: response.status,
          message: `请求失败: ${response.status}`,
          total: 0,
          list: [],
          hasMore: false,
        },
        { status: response.status }
      );
    }

    const html = await response.text();
    const result = parseDoubanMineHtml(html);

    return NextResponse.json(result);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    if (errorMessage.includes('abort')) {
      return NextResponse.json(
        {
          code: 408,
          message: '请求超时',
          total: 0,
          list: [],
          hasMore: false,
        },
        { status: 408 }
      );
    }

    return NextResponse.json(
      {
        code: 500,
        message: `获取数据失败: ${errorMessage}`,
        total: 0,
        list: [],
        hasMore: false,
      },
      { status: 500 }
    );
  }
}
