import { NextResponse } from 'next/server';

import { getCacheTime } from '@/lib/config';
import { MovieSquareItem, MovieSquareResult } from '@/lib/types';

const MOVIE_SQUARE_URL = 'https://piaofang.maoyan.com/rankings/year';
const MIN_YEAR = 2011;
const MAX_YEAR = 2026;

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function stripTags(value: string) {
  return decodeHtml(value.replace(/<[^>]*>/g, ''));
}

function formatGrossText(grossWan: number) {
  if (!Number.isFinite(grossWan) || grossWan <= 0) {
    return '-';
  }

  if (grossWan >= 10000) {
    return `${(grossWan / 10000).toFixed(2)}亿`;
  }

  return `${grossWan.toFixed(2)}万`;
}

function formatTotalGrossText(totalGrossWan: number) {
  if (!Number.isFinite(totalGrossWan) || totalGrossWan <= 0) {
    return '';
  }

  if (totalGrossWan >= 10000) {
    return `总票房${Math.round(totalGrossWan / 10000)}亿`;
  }

  return `总票房${Math.round(totalGrossWan)}万`;
}

function parseUpdateSummary(rawUpdateTime: string) {
  const normalized = rawUpdateTime.replace(/[()（）]/g, '').trim();
  const dateMatch = normalized.match(/截至\s*(\d{1,2})月(\d{1,2})日/);
  const grossMatch = normalized.match(/总票房\s*([\d.]+)\s*亿/);

  return {
    updateTime: dateMatch
      ? `${dateMatch[1].padStart(2, '0')}.${dateMatch[2].padStart(2, '0')}`
      : '',
    totalGrossText: grossMatch ? `总票房 ${grossMatch[1]}亿` : '',
  };
}

function getValidYear(year: string | null) {
  if (!year) return null;

  if (!/^\d{4}$/.test(year)) {
    return undefined;
  }

  const numericYear = Number.parseInt(year, 10);
  if (numericYear < MIN_YEAR || numericYear > MAX_YEAR) {
    return undefined;
  }

  return year;
}

async function fetchMovieSquareHtml(year: string | null) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    let target = MOVIE_SQUARE_URL;
    if (year) {
      const url = new URL(MOVIE_SQUARE_URL);
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

function parseMovieSquareHtml(
  html: string,
  selectedYear: string
): Omit<MovieSquareResult, 'code' | 'message' | 'selectedYear'> {
  const list: MovieSquareItem[] = [];

  const yearBoxMatch = html.match(/<span id="year-box">([^<]*)<\/span>/);
  const rawYearLabel = yearBoxMatch ? stripTags(yearBoxMatch[1]) : '';

  const updateTimeMatch = html.match(/<span id="update-time">([^<]*)<\/span>/);
  const rawUpdateTime = updateTimeMatch ? stripTags(updateTimeMatch[1]) : '';
  const updateSummary = parseUpdateSummary(rawUpdateTime);

  const rowPattern = /<ul class="row"([^>]*)>([\s\S]*?)<\/ul>/g;
  let match: RegExpExecArray | null;

  while ((match = rowPattern.exec(html)) !== null) {
    const attrs = match[1] || '';
    const content = match[2] || '';

    const rankMatch = content.match(/<li class="col0">([\s\S]*?)<\/li>/);
    const titleBlockMatch = content.match(
      /<li class="col1">\s*([\s\S]*?)<\/li>/
    );
    const grossWanMatch = content.match(/<li class="col2 tr">([\s\S]*?)<\/li>/);
    const avgPriceMatch = content.match(/<li class="col3 tr">([\s\S]*?)<\/li>/);
    const avgPeopleMatch = content.match(
      /<li class="col4 tr">([\s\S]*?)<\/li>/
    );

    if (!rankMatch || !titleBlockMatch || !grossWanMatch) {
      continue;
    }

    const titleBlock = titleBlockMatch[1];
    const titleMatch = titleBlock.match(
      /<p class="first-line">([\s\S]*?)<\/p>/
    );
    const secondMatch = titleBlock.match(
      /<p class="second-line">([\s\S]*?)<\/p>/
    );

    if (!titleMatch || !secondMatch) {
      continue;
    }

    const rank = Number.parseInt(stripTags(rankMatch[1]), 10);
    const title = stripTags(titleMatch[1]);
    const secondText = stripTags(secondMatch[1]);
    const dateMatch = secondText.match(/(\d{4}-\d{2}-\d{2})/);
    const releaseDate = dateMatch ? dateMatch[1] : secondText;

    if (!Number.isFinite(rank) || !title) {
      continue;
    }

    const grossWanStr = stripTags(grossWanMatch[1]).replace(/,/g, '').trim();
    const grossWan = grossWanStr ? Number.parseFloat(grossWanStr) : 0;

    const avgPriceStr = avgPriceMatch ? stripTags(avgPriceMatch[1]) : '';
    const avgPrice = avgPriceStr ? Number.parseFloat(avgPriceStr) : undefined;

    const avgPeopleStr = avgPeopleMatch ? stripTags(avgPeopleMatch[1]) : '';
    const avgPeoplePerShow = avgPeopleStr
      ? Number.parseFloat(avgPeopleStr)
      : undefined;

    const hrefMatch = attrs.match(/href:'([^']+)'/);
    const moviePath = hrefMatch ? hrefMatch[1] : '';
    const detailUrl = moviePath
      ? `https://piaofang.maoyan.com${moviePath}`
      : '';

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
      grossText: formatGrossText(grossWan),
      avgPrice,
      avgPeoplePerShow,
      movieId,
      detailUrl,
      year,
    });
  }

  const totalGrossWan = list.reduce((sum, item) => sum + item.grossWan, 0);
  const fallbackYearLabel =
    selectedYear === 'all' ? '电影票房总榜' : `${selectedYear}年电影票房总榜`;

  return {
    yearLabel: rawYearLabel || fallbackYearLabel,
    updateTime: updateSummary.updateTime,
    totalGrossText:
      updateSummary.totalGrossText || formatTotalGrossText(totalGrossWan),
    list,
  };
}

export const runtime = 'edge';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const yearParam = searchParams.get('year');
  const validYear = getValidYear(yearParam);

  if (validYear === undefined) {
    return NextResponse.json(
      {
        code: 400,
        message: `year 必须为空或 ${MIN_YEAR}-${MAX_YEAR} 之间的年份`,
        selectedYear: 'all',
        yearLabel: '',
        updateTime: '',
        totalGrossText: '',
        list: [],
      } satisfies MovieSquareResult,
      { status: 400 }
    );
  }

  try {
    const html = await fetchMovieSquareHtml(validYear);
    const selectedYear = validYear ?? 'all';
    const parsed = parseMovieSquareHtml(html, selectedYear);
    const response: MovieSquareResult = {
      code: 200,
      message: '获取成功',
      selectedYear,
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
        code: 500,
        message: '获取电影票房榜失败',
        selectedYear: validYear ?? 'all',
        yearLabel: '',
        updateTime: '',
        totalGrossText: '',
        list: [],
        details: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
