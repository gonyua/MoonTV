import { NextResponse } from 'next/server';

import { getCacheTime } from '@/lib/config';
import { BoxOfficeItem, BoxOfficeResult } from '@/lib/types';

const GLOBAL_BOX_OFFICE_URL = 'http://www.piaofang.biz/';
const USD_TO_CNY_RATE = 7;

async function fetchGlobalBoxOfficeHtml(): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(GLOBAL_BOX_OFFICE_URL, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        Referer: 'http://www.piaofang.biz/',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    // 使用原始字节自行解码，避免默认按 UTF-8 解析 GB2312/GBK 导致中文乱码
    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    // 先从 HTML 前几 KB 中解析 meta charset（只包含 ASCII，不依赖正确中文解码）
    const headLength = Math.min(bytes.length, 4096);
    let head = '';
    for (let i = 0; i < headLength; i++) {
      head += String.fromCharCode(bytes[i]);
    }

    let charset = '';
    const metaMatch = head.match(/charset\s*=\s*([a-zA-Z0-9_-]+)/i);
    if (metaMatch && metaMatch[1]) {
      charset = metaMatch[1].toLowerCase();
    } else {
      const contentType = response.headers.get('content-type') || '';
      const headerMatch = contentType.match(/charset\s*=\s*([a-zA-Z0-9_-]+)/i);
      if (headerMatch && headerMatch[1]) {
        charset = headerMatch[1].toLowerCase();
      }
    }

    let encoding = 'utf-8';
    if (charset.startsWith('gb')) {
      // gb2312 / gbk / gb18030 统一按 gbk 解码
      encoding = 'gbk';
    } else if (charset === 'utf8' || charset === 'utf-8') {
      encoding = 'utf-8';
    }

    try {
      // Edge / Node 18 的 TextDecoder 已支持 gbk
      const decoder = new TextDecoder(encoding);
      return decoder.decode(buffer);
    } catch {
      // 解码失败时回退到 UTF-8，至少不影响接口可用性
      const fallbackDecoder = new TextDecoder();
      return fallbackDecoder.decode(buffer);
    }
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

function parseGlobalBoxOffice(html: string): BoxOfficeItem[] {
  const results: BoxOfficeItem[] = [];

  const rowPattern =
    /<td class="num">([\s\S]*?)<\/td>\s*<td class="title">([\s\S]*?)<\/td>\s*<td class="year">([\s\S]*?)<\/td>\s*<td class="type">([\s\S]*?)<\/td>\s*<td class="daoyan">([\s\S]*?)<\/td>\s*<td class="piaofang">([\s\S]*?)<\/td>/g;

  let match: RegExpExecArray | null;

  while ((match = rowPattern.exec(html)) !== null) {
    const numCell = match[1];
    const titleCell = match[2];
    const yearCell = match[3];
    const typeCell = match[4];
    const directorCell = match[5];
    const grossCell = match[6];

    const rankMatch = numCell.match(/(\d+)/);
    if (!rankMatch) {
      continue;
    }

    const rank = Number.parseInt(rankMatch[1], 10);

    const linkMatch = titleCell.match(
      /<a[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/
    );
    if (!linkMatch) {
      continue;
    }

    const detailPath = linkMatch[1];
    const titleCn = linkMatch[2].trim();

    const enMatch = titleCell.match(/<span>([^<]*)<\/span>/);
    const titleEn = enMatch ? enMatch[1].trim() : '';

    const year = yearCell.replace(/<[^>]+>/g, '').trim();
    const genre = typeCell.replace(/<[^>]+>/g, '').trim();
    const director = directorCell.replace(/<[^>]+>/g, '').trim();

    const grossMatch = grossCell.match(/<span>([^<]*)<\/span>\s*\$/);
    const grossNumberString = grossMatch
      ? grossMatch[1].replace(/,/g, '').trim()
      : '';
    const grossUsd = grossNumberString
      ? Number.parseInt(grossNumberString, 10)
      : 0;

    const grossWanRaw = grossUsd ? (grossUsd * USD_TO_CNY_RATE) / 10000 : 0;
    const grossWan = Number.isFinite(grossWanRaw)
      ? Number.parseFloat(grossWanRaw.toFixed(2))
      : 0;
    const grossWanText = `${grossWan.toFixed(2)}万元`;

    const detailUrl = detailPath.startsWith('http')
      ? detailPath
      : `http://www.piaofang.biz${detailPath}`;

    results.push({
      rank,
      title: titleCn,
      originalTitle: titleEn || undefined,
      year,
      genre,
      director,
      region: 'global',
      grossWan,
      grossWanText,
      detailUrl,
      currency: 'CNY',
    });
  }

  return results;
}

export const runtime = 'edge';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const debug = searchParams.get('debug');

    const html = await fetchGlobalBoxOfficeHtml();
    const list = parseGlobalBoxOffice(html);

    if (debug === 'html') {
      return new Response(html, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
        },
      });
    }

    if (debug === 'count') {
      return NextResponse.json({ count: list.length });
    }

    const yearLabel = '全球电影票房排行榜';
    const updateTime = '';

    const response: BoxOfficeResult = {
      code: 200,
      message: '获取成功',
      yearLabel,
      updateTime,
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
        error: '获取全球票房榜失败',
        details: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
