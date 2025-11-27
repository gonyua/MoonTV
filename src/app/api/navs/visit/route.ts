/* eslint-disable no-console, @typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';

export const runtime = 'edge';

// D1 数据库接口
interface D1Database {
  prepare(sql: string): D1PreparedStatement;
}

interface D1PreparedStatement {
  bind(...values: any[]): D1PreparedStatement;
  run(): Promise<any>;
}

function getD1Database(): D1Database {
  return (process.env as any).DB as D1Database;
}

/**
 * POST /api/navs/visit
 * 记录站点访问
 * body: { id: string }
 */
export async function POST(request: NextRequest) {
  try {
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo?.username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id } = body as { id: string };

    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    const db = getD1Database();
    const now = Date.now();

    await db
      .prepare(
        'UPDATE nav_sites SET visit_count = visit_count + 1, last_visit_at = ?, updated_at = ? WHERE id = ? AND username = ?'
      )
      .bind(now, now, id, authInfo.username)
      .run();

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error('记录访问失败', err);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
