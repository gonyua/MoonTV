/* eslint-disable no-console, @typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import {
  CreateCategoryParams,
  NavCategory,
  UpdateCategoryParams,
} from '@/lib/navs.types';

export const runtime = 'edge';

// D1 数据库接口
interface D1Database {
  prepare(sql: string): D1PreparedStatement;
}

interface D1PreparedStatement {
  bind(...values: any[]): D1PreparedStatement;
  first<T = any>(): Promise<T | null>;
  run(): Promise<any>;
  all<T = any>(): Promise<{ results: T[] }>;
}

function getD1Database(): D1Database {
  return (process.env as any).DB as D1Database;
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

// 数据库行转换为 NavCategory
function rowToCategory(row: any): NavCategory {
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    icon: row.icon || undefined,
    description: row.description || undefined,
    color: row.color || undefined,
    parentId: row.parent_id || undefined,
    order: row.order_num,
    sortBy: row.sort_by || 'order',
    isCollapsed: Boolean(row.is_collapsed),
    isVisible: Boolean(row.is_visible),
    isPrivate: Boolean(row.is_private),
    password: row.password || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at || undefined,
  };
}

/**
 * GET /api/navs/categories
 * 获取用户的所有分类
 */
export async function GET(request: NextRequest) {
  try {
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo?.username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = getD1Database();
    const result = await db
      .prepare(
        'SELECT * FROM nav_categories WHERE username = ? AND deleted_at IS NULL ORDER BY order_num ASC'
      )
      .bind(authInfo.username)
      .all<any>();

    const categories = result.results.map(rowToCategory);
    return NextResponse.json(categories, { status: 200 });
  } catch (err) {
    console.error('获取分类失败', err);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/navs/categories
 * 创建新分类
 */
export async function POST(request: NextRequest) {
  try {
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo?.username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: CreateCategoryParams = await request.json();
    if (!body.name?.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const db = getD1Database();
    const now = Date.now();
    const id = generateId();

    // 获取最大排序号
    const maxOrderResult = await db
      .prepare(
        'SELECT MAX(order_num) as max_order FROM nav_categories WHERE username = ? AND deleted_at IS NULL'
      )
      .bind(authInfo.username)
      .first<{ max_order: number | null }>();
    const order = (maxOrderResult?.max_order ?? -1) + 1;

    await db
      .prepare(
        `INSERT INTO nav_categories 
        (id, username, name, icon, description, color, parent_id, order_num, is_private, password, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        authInfo.username,
        body.name.trim(),
        body.icon || null,
        body.description || null,
        body.color || null,
        body.parentId || null,
        order,
        body.isPrivate ? 1 : 0,
        body.password || null,
        now,
        now
      )
      .run();

    const newCategory: NavCategory = {
      id,
      username: authInfo.username,
      name: body.name.trim(),
      icon: body.icon,
      description: body.description,
      color: body.color,
      parentId: body.parentId,
      order,
      sortBy: 'order',
      isCollapsed: false,
      isVisible: true,
      isPrivate: body.isPrivate || false,
      password: body.password,
      createdAt: now,
      updatedAt: now,
    };

    return NextResponse.json(newCategory, { status: 201 });
  } catch (err) {
    console.error('创建分类失败', err);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/navs/categories?id=xxx
 * 更新分类
 */
export async function PUT(request: NextRequest) {
  try {
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo?.username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    const body: UpdateCategoryParams = await request.json();
    const db = getD1Database();
    const now = Date.now();

    // 构建更新语句
    const updates: string[] = ['updated_at = ?'];
    const values: any[] = [now];

    if (body.name !== undefined) {
      updates.push('name = ?');
      values.push(body.name.trim());
    }
    if (body.icon !== undefined) {
      updates.push('icon = ?');
      values.push(body.icon || null);
    }
    if (body.description !== undefined) {
      updates.push('description = ?');
      values.push(body.description || null);
    }
    if (body.color !== undefined) {
      updates.push('color = ?');
      values.push(body.color || null);
    }
    if (body.parentId !== undefined) {
      updates.push('parent_id = ?');
      values.push(body.parentId || null);
    }
    if (body.order !== undefined) {
      updates.push('order_num = ?');
      values.push(body.order);
    }
    if (body.sortBy !== undefined) {
      updates.push('sort_by = ?');
      values.push(body.sortBy);
    }
    if (body.isCollapsed !== undefined) {
      updates.push('is_collapsed = ?');
      values.push(body.isCollapsed ? 1 : 0);
    }
    if (body.isVisible !== undefined) {
      updates.push('is_visible = ?');
      values.push(body.isVisible ? 1 : 0);
    }
    if (body.isPrivate !== undefined) {
      updates.push('is_private = ?');
      values.push(body.isPrivate ? 1 : 0);
    }
    if (body.password !== undefined) {
      updates.push('password = ?');
      values.push(body.password || null);
    }

    values.push(id, authInfo.username);

    await db
      .prepare(
        `UPDATE nav_categories SET ${updates.join(
          ', '
        )} WHERE id = ? AND username = ?`
      )
      .bind(...values)
      .run();

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error('更新分类失败', err);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/navs/categories?id=xxx
 * 删除分类（软删除，同时删除该分类下的所有站点）
 */
export async function DELETE(request: NextRequest) {
  try {
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo?.username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    const db = getD1Database();
    const now = Date.now();

    // 软删除分类
    await db
      .prepare(
        'UPDATE nav_categories SET deleted_at = ?, updated_at = ? WHERE id = ? AND username = ?'
      )
      .bind(now, now, id, authInfo.username)
      .run();

    // 软删除该分类下的所有站点
    await db
      .prepare(
        'UPDATE nav_sites SET deleted_at = ?, updated_at = ? WHERE category_id = ? AND username = ?'
      )
      .bind(now, now, id, authInfo.username)
      .run();

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error('删除分类失败', err);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
