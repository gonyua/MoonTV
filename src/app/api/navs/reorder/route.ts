/* eslint-disable no-console, @typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';

export const runtime = 'edge';

// D1 数据库接口
interface D1Database {
  prepare(sql: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<any>;
}

interface D1PreparedStatement {
  bind(...values: any[]): D1PreparedStatement;
  run(): Promise<any>;
}

function getD1Database(): D1Database {
  return (process.env as any).DB as D1Database;
}

/**
 * POST /api/navs/reorder
 * 重新排序分类或站点
 * body: { type: 'categories' | 'sites', ids: string[], categoryId?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo?.username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { type, ids, categoryId } = body as {
      type: 'categories' | 'sites';
      ids: string[];
      categoryId?: string;
    };

    if (!type || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: 'Type and ids are required' },
        { status: 400 }
      );
    }

    const db = getD1Database();
    const now = Date.now();

    if (type === 'categories') {
      // 重新排序分类
      const statements = ids.map((id, index) =>
        db
          .prepare(
            'UPDATE nav_categories SET order_num = ?, updated_at = ? WHERE id = ? AND username = ?'
          )
          .bind(index, now, id, authInfo.username)
      );
      await db.batch(statements);
    } else if (type === 'sites') {
      // 重新排序站点（在指定分类内）
      if (!categoryId) {
        return NextResponse.json(
          { error: 'categoryId is required for sites reorder' },
          { status: 400 }
        );
      }
      const statements = ids.map((id, index) =>
        db
          .prepare(
            'UPDATE nav_sites SET order_num = ?, updated_at = ? WHERE id = ? AND username = ? AND category_id = ?'
          )
          .bind(index, now, id, authInfo.username, categoryId)
      );
      await db.batch(statements);
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error('重新排序失败', err);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
