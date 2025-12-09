import { NextResponse } from 'next/server';

import { getCacheTime } from '@/lib/config';
import { BoxOfficeItem, BoxOfficeResult } from '@/lib/types';

const CHINA_BOX_OFFICE_URL = 'https://piaofang.maoyan.com/rankings/year';

async function fetchChinaBoxOfficeHtml(year?: string | null) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    let target = CHINA_BOX_OFFICE_URL;

    if (year && /^\d{4}$/.test(year)) {
      const url = new URL(CHINA_BOX_OFFICE_URL);
      url.searchParams.set('year', year);
      target = url.toString();
    }

    const response = await fetch(target, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        Referer: 'https://piaofang.maoyan.com/',
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

function parseChinaBoxOffice(
  html: string
): Omit<BoxOfficeResult, 'code' | 'message'> {
  const list: BoxOfficeItem[] = [];

  const yearBoxMatch = html.match(/<span id="year-box">([^<]*)<\/span>/);
  const yearLabel = yearBoxMatch ? yearBoxMatch[1].trim() : '';

  const updateTimeMatch = html.match(/<span id="update-time">([^<]*)<\/span>/);
  const updateTime = updateTimeMatch ? updateTimeMatch[1].trim() : '';

  const rowPattern = /<ul class="row"([^>]*)>([\s\S]*?)<\/ul>/g;

  let match: RegExpExecArray | null;

  while ((match = rowPattern.exec(html)) !== null) {
    const attrs = match[1] || '';
    const content = match[2] || '';

    const rankMatch = content.match(/<li class="col0">([^<]*)<\/li>/);
    const titleBlockMatch = content.match(
      /<li class="col1">\s*([\s\S]*?)<\/li>/
    );
    const grossWanMatch = content.match(/<li class="col2 tr">([^<]*)<\/li>/);
    const avgPriceMatch = content.match(/<li class="col3 tr">([^<]*)<\/li>/);
    const avgPeopleMatch = content.match(/<li class="col4 tr">([^<]*)<\/li>/);

    if (!rankMatch || !titleBlockMatch || !grossWanMatch) {
      continue;
    }

    const titleBlock = titleBlockMatch[1];

    const titleMatch = titleBlock.match(/<p class="first-line">([^<]*)<\/p>/);
    const secondMatch = titleBlock.match(/<p class="second-line">([^<]*)<\/p>/);

    if (!titleMatch || !secondMatch) {
      continue;
    }

    const rank = Number.parseInt(rankMatch[1].trim(), 10);
    const title = titleMatch[1].trim();

    const secondText = secondMatch[1].trim();
    const dateMatch = secondText.match(/(\d{4}-\d{2}-\d{2})/);
    const releaseDate = dateMatch ? dateMatch[1] : secondText;

    const grossWanStr = grossWanMatch[1].replace(/,/g, '').trim();
    const grossWan = grossWanStr ? Number.parseFloat(grossWanStr) : 0;
    const grossWanText = `${grossWan.toFixed(2)}万元`;

    const avgPriceStr = avgPriceMatch ? avgPriceMatch[1].trim() : '';
    const avgPrice = avgPriceStr ? Number.parseFloat(avgPriceStr) : 0;

    const avgPeopleStr = avgPeopleMatch ? avgPeopleMatch[1].trim() : '';
    const avgPeoplePerShow = avgPeopleStr ? Number.parseFloat(avgPeopleStr) : 0;

    const hrefMatch = attrs.match(/href:'([^']+)'/);
    const moviePath = hrefMatch ? hrefMatch[1] : '';
    const movieUrl = moviePath ? `https://piaofang.maoyan.com${moviePath}` : '';

    const idMatch = moviePath.match(/\/movie\/(\d+)/);
    const movieId = idMatch ? idMatch[1] : '';

    const year =
      releaseDate && /^\d{4}-\d{2}-\d{2}$/.test(releaseDate)
        ? releaseDate.slice(0, 4)
        : undefined;

    list.push({
      rank,
      title,
      releaseDate,
      grossWan,
      avgPrice,
      avgPeoplePerShow,
      movieId,
      detailUrl: movieUrl,
      region: 'china',
      grossWanText,
      year,
      currency: 'CNY',
    });
  }

  return {
    yearLabel,
    updateTime,
    list,
  };
}

export const runtime = 'edge';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const year = searchParams.get('year');

    const html = await fetchChinaBoxOfficeHtml(year);
    const parsed = parseChinaBoxOffice(html);

    const response: BoxOfficeResult = {
      code: 200,
      message: '获取成功',
      ...parsed,
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
        error: '获取中国票房榜失败',
        details: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
