import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { getAvailableApiSitesForUser, getCacheTime } from '@/lib/config';
import { isYellowFilterDisabledForUser } from '@/lib/yellow';

export const runtime = 'edge';

// OrionTV 兼容接口
export async function GET(request: NextRequest) {
  try {
    const authInfo = getAuthInfoFromCookie(request);
    const username = authInfo?.username;
    const canViewYellow = isYellowFilterDisabledForUser(username);

    const apiSites = await getAvailableApiSitesForUser(username);
    const cacheTime = await getCacheTime();

    return NextResponse.json(apiSites, {
      headers: {
        ...(canViewYellow
          ? {
              'Cache-Control': 'private, no-store',
              Vary: 'Cookie',
            }
          : {
              'Cache-Control': `public, max-age=${cacheTime}, s-maxage=${cacheTime}`,
              'CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
              'Vercel-CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
            }),
      },
    });
  } catch (error) {
    return NextResponse.json({ error: '获取资源失败' }, { status: 500 });
  }
}
