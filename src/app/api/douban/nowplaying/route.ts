import { NextResponse } from 'next/server';

import { getCacheTime } from '@/lib/config';
import { DoubanItem, DoubanResult } from '@/lib/types';

const NOW_PLAYING_BASE_URL =
  'https://movie.douban.com/cinema/nowplaying/' as const;

async function fetchNowPlayingHtml(city: string): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const safeCity = /^[a-zA-Z-]+$/.test(city) ? city : 'hangzhou';
    const target = `${NOW_PLAYING_BASE_URL}${encodeURIComponent(safeCity)}/`;

    const response = await fetch(target, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        Referer: 'https://movie.douban.com/',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    return await response.text();
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

function parseNowPlayingHtml(html: string): DoubanItem[] {
  const list: DoubanItem[] = [];

  const itemPattern =
    /<li([^>]*class="[^"]*\blist-item\b[^"]*"[^>]*)>([\s\S]*?)<\/li>/gi;

  const getAttr = (attrs: string, name: string): string => {
    const regex = new RegExp(`${name}="([^"]*)"`, 'i');
    const match = attrs.match(regex);
    return match ? match[1] : '';
  };

  let match: RegExpExecArray | null;

  while ((match = itemPattern.exec(html)) !== null) {
    const attrs = match[1] || '';
    const inner = match[2] || '';

    const category = getAttr(attrs, 'data-category');
    if (category.toLowerCase() !== 'nowplaying') {
      continue;
    }

    const id = getAttr(attrs, 'data-subject') || getAttr(attrs, 'id');
    const title = getAttr(attrs, 'data-title') || '';
    const rate = getAttr(attrs, 'data-score') || '';
    const year = getAttr(attrs, 'data-release') || '';

    const imgMatch = inner.match(/<img[^>]+(?:data-src|src)="([^"]+)"[^>]*>/i);
    let poster = imgMatch ? imgMatch[1] : '';

    if (poster.startsWith('//')) {
      poster = `https:${poster}`;
    }
    poster = poster.replace(/^http:/, 'https:');

    if (!id || !title || !poster) {
      continue;
    }

    list.push({
      id,
      title,
      poster,
      rate,
      year,
    });
  }

  return list;
}

export const runtime = 'edge';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const city = searchParams.get('city') || 'hangzhou';

    const html = await fetchNowPlayingHtml(city);
    const list = parseNowPlayingHtml(html);

    const response: DoubanResult = {
      code: 200,
      message: '获取成功',
      list,
    };

    const cacheTime = await getCacheTime();

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': `public, max-age=${cacheTime}, s-maxage=${cacheTime}`,
        'CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
        'Vercel-CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: '获取豆瓣正在热映数据失败',
        details: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
