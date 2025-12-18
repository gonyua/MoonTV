import { NextRequest, NextResponse } from 'next/server';

import {
  extractDoubanCk,
  fetchWithTimeout,
  getDoubanCookieFromRequest,
  isLikelyDoubanLoginResponse,
  isValidSubjectId,
} from '@/app/api/douban/mark/_shared';

export const runtime = 'edge';

interface RequestBody {
  subjectId?: string;
  cookie?: string;
}

export async function POST(request: NextRequest) {
  let body: RequestBody | null = null;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    body = null;
  }

  const subjectId = body?.subjectId?.trim() || '';
  if (!subjectId || !isValidSubjectId(subjectId)) {
    return NextResponse.json(
      { code: 400, message: 'subjectId 必须是数字字符串' },
      { status: 400 }
    );
  }

  const doubanCookie = await getDoubanCookieFromRequest(request, body?.cookie);
  if (!doubanCookie) {
    return NextResponse.json(
      { code: 401, message: '请先登录豆瓣' },
      { status: 401 }
    );
  }

  const ck = extractDoubanCk(doubanCookie);
  if (!ck) {
    return NextResponse.json(
      { code: 401, message: '豆瓣Cookie无效，请重新登录' },
      { status: 401 }
    );
  }

  const targetUrl = `https://movie.douban.com/j/subject/${subjectId}/interest`;
  const form = new URLSearchParams({ ck, interest: 'wish' });

  try {
    const response = await fetchWithTimeout(
      targetUrl,
      {
        method: 'POST',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'application/json, text/plain, */*',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          Origin: 'https://movie.douban.com',
          Referer: `https://movie.douban.com/subject/${subjectId}/`,
          Cookie: doubanCookie,
        },
        body: form.toString(),
      },
      15000
    );

    if (response.status === 403 || isLikelyDoubanLoginResponse(response)) {
      return NextResponse.json(
        { code: 403, message: '豆瓣Cookie已过期，请重新登录' },
        { status: 403 }
      );
    }

    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json')
      ? await response.json().catch(() => null)
      : await response.text().catch(() => null);

    if (!response.ok) {
      return NextResponse.json(
        {
          code: response.status,
          message: `请求失败: ${response.status}`,
          details: payload,
        },
        { status: response.status }
      );
    }

    return NextResponse.json({
      code: 200,
      message: '标记成功',
      data: { subjectId, interest: 'wish' },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    const status = msg.includes('abort') ? 408 : 500;
    return NextResponse.json(
      {
        code: status,
        message: status === 408 ? '请求超时' : `请求失败: ${msg}`,
      },
      { status }
    );
  }
}
