import { NextResponse } from 'next/server';

interface DoubanSuggestApiItem {
  episode?: string;
  id?: string;
  img?: string;
  sub_title?: string;
  title?: string;
  type?: string;
  url?: string;
  year?: string;
}

interface DoubanSuggestItem {
  id: string;
  title: string;
  subTitle: string;
  year: string;
  type: string;
  typeLabel: string;
  poster: string;
  detailUrl: string;
  sourceLabel: string;
}

function getTypeLabel(type?: string) {
  if (type === 'movie') return '电影';
  if (type === 'tv') return '剧集';
  return type || '-';
}

function normalizePoster(url?: string) {
  if (!url) return '';
  if (url.startsWith('//')) return `https:${url}`;
  return url.replace(/^http:/, 'https:');
}

async function fetchDoubanSuggest(
  query: string
): Promise<DoubanSuggestApiItem[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const target = `https://movie.douban.com/j/subject_suggest?q=${encodeURIComponent(
      query
    )}`;
    const response = await fetch(target, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        Referer: 'https://movie.douban.com/',
        Accept: 'application/json, text/plain, */*',
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

export const runtime = 'edge';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q')?.trim().replace(/\s+/g, ' ') || '';

  if (!query) {
    return NextResponse.json(
      { code: 400, message: '缺少必要参数: q', list: [] },
      { status: 400 }
    );
  }

  try {
    const data = await fetchDoubanSuggest(query);
    const list: DoubanSuggestItem[] = data
      .filter((item) => item.id && item.title)
      .map((item) => ({
        id: item.id || '',
        title: item.title || '',
        subTitle: item.sub_title || '',
        year: item.year || '',
        type: item.type || '',
        typeLabel: getTypeLabel(item.type),
        poster: normalizePoster(item.img),
        detailUrl:
          item.url ||
          `https://movie.douban.com/subject/${encodeURIComponent(
            item.id || ''
          )}/`,
        sourceLabel: '豆瓣',
      }));

    return NextResponse.json(
      { code: 200, message: '获取成功', list },
      {
        headers: {
          'Cache-Control': 'public, max-age=300, s-maxage=300',
          'CDN-Cache-Control': 'public, s-maxage=300',
          'Vercel-CDN-Cache-Control': 'public, s-maxage=300',
        },
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        code: 500,
        message: '获取豆瓣搜索建议失败',
        details: error instanceof Error ? error.message : String(error),
        list: [],
      },
      { status: 500 }
    );
  }
}
