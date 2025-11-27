/* eslint-disable no-console, @typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { CreateSiteParams, NavSite, UpdateSiteParams } from '@/lib/navs.types';

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

// 数据库行转换为 NavSite
function rowToSite(row: any): NavSite {
  return {
    id: row.id,
    username: row.username,
    categoryId: row.category_id,
    name: row.name,
    url: row.url,
    backupUrl: row.backup_url || undefined,
    description: row.description || undefined,
    keywords: row.keywords || undefined,
    icon: row.icon || undefined,
    iconType: row.icon_type || 'auto',
    iconBgColor: row.icon_bg_color || undefined,
    tags: row.tags ? JSON.parse(row.tags) : [],
    order: row.order_num,
    isPinned: Boolean(row.is_pinned),
    isVisible: Boolean(row.is_visible),
    isPrivate: Boolean(row.is_private),
    password: row.password || undefined,
    target: row.target || '_blank',
    status: row.status ?? 1,
    statusCheckAt: row.status_check_at || undefined,
    visitCount: row.visit_count ?? 0,
    lastVisitAt: row.last_visit_at || undefined,
    rating: row.rating ?? 0,
    notes: row.notes || undefined,
    images: row.images ? JSON.parse(row.images) : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at || undefined,
  };
}

/**
 * GET /api/navs/sites
 * 获取用户的所有站点，可选参数 categoryId 筛选
 */
export async function GET(request: NextRequest) {
  try {
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo?.username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get('categoryId');

    const db = getD1Database();
    let result;

    if (categoryId) {
      result = await db
        .prepare(
          'SELECT * FROM nav_sites WHERE username = ? AND category_id = ? AND deleted_at IS NULL ORDER BY is_pinned DESC, order_num ASC'
        )
        .bind(authInfo.username, categoryId)
        .all<any>();
    } else {
      result = await db
        .prepare(
          'SELECT * FROM nav_sites WHERE username = ? AND deleted_at IS NULL ORDER BY is_pinned DESC, order_num ASC'
        )
        .bind(authInfo.username)
        .all<any>();
    }

    const sites = result.results.map(rowToSite);
    return NextResponse.json(sites, { status: 200 });
  } catch (err) {
    console.error('获取站点失败', err);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/navs/sites
 * 创建新站点
 */
export async function POST(request: NextRequest) {
  try {
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo?.username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: CreateSiteParams = await request.json();
    if (!body.name?.trim() || !body.url?.trim() || !body.categoryId) {
      return NextResponse.json(
        { error: 'Name, URL, and categoryId are required' },
        { status: 400 }
      );
    }

    const db = getD1Database();
    const now = Date.now();
    const id = generateId();

    // 获取该分类下的最大排序号
    const maxOrderResult = await db
      .prepare(
        'SELECT MAX(order_num) as max_order FROM nav_sites WHERE username = ? AND category_id = ? AND deleted_at IS NULL'
      )
      .bind(authInfo.username, body.categoryId)
      .first<{ max_order: number | null }>();
    const order = (maxOrderResult?.max_order ?? -1) + 1;

    const tags = JSON.stringify(body.tags || []);
    const images = JSON.stringify(body.images || []);

    await db
      .prepare(
        `INSERT INTO nav_sites 
        (id, username, category_id, name, url, backup_url, description, keywords, icon, icon_type, icon_bg_color, tags, order_num, is_private, password, target, notes, images, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        authInfo.username,
        body.categoryId,
        body.name.trim(),
        body.url.trim(),
        body.backupUrl || null,
        body.description || null,
        body.keywords || null,
        body.icon || null,
        body.iconType || 'auto',
        body.iconBgColor || null,
        tags,
        order,
        body.isPrivate ? 1 : 0,
        body.password || null,
        body.target || '_blank',
        body.notes || null,
        images,
        now,
        now
      )
      .run();

    const newSite: NavSite = {
      id,
      username: authInfo.username,
      categoryId: body.categoryId,
      name: body.name.trim(),
      url: body.url.trim(),
      backupUrl: body.backupUrl,
      description: body.description,
      keywords: body.keywords,
      icon: body.icon,
      iconType: body.iconType || 'auto',
      iconBgColor: body.iconBgColor,
      tags: body.tags || [],
      order,
      isPinned: false,
      isVisible: true,
      isPrivate: body.isPrivate || false,
      password: body.password,
      target: body.target || '_blank',
      status: 1,
      visitCount: 0,
      rating: 0,
      notes: body.notes,
      images: body.images || [],
      createdAt: now,
      updatedAt: now,
    };

    return NextResponse.json(newSite, { status: 201 });
  } catch (err) {
    console.error('创建站点失败', err);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/navs/sites?id=xxx
 * 更新站点
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

    const body: UpdateSiteParams = await request.json();
    const db = getD1Database();
    const now = Date.now();

    // 构建更新语句
    const updates: string[] = ['updated_at = ?'];
    const values: any[] = [now];

    if (body.categoryId !== undefined) {
      updates.push('category_id = ?');
      values.push(body.categoryId);
    }
    if (body.name !== undefined) {
      updates.push('name = ?');
      values.push(body.name.trim());
    }
    if (body.url !== undefined) {
      updates.push('url = ?');
      values.push(body.url.trim());
    }
    if (body.backupUrl !== undefined) {
      updates.push('backup_url = ?');
      values.push(body.backupUrl || null);
    }
    if (body.description !== undefined) {
      updates.push('description = ?');
      values.push(body.description || null);
    }
    if (body.keywords !== undefined) {
      updates.push('keywords = ?');
      values.push(body.keywords || null);
    }
    if (body.icon !== undefined) {
      updates.push('icon = ?');
      values.push(body.icon || null);
    }
    if (body.iconType !== undefined) {
      updates.push('icon_type = ?');
      values.push(body.iconType);
    }
    if (body.iconBgColor !== undefined) {
      updates.push('icon_bg_color = ?');
      values.push(body.iconBgColor || null);
    }
    if (body.tags !== undefined) {
      updates.push('tags = ?');
      values.push(JSON.stringify(body.tags));
    }
    if (body.order !== undefined) {
      updates.push('order_num = ?');
      values.push(body.order);
    }
    if (body.isPinned !== undefined) {
      updates.push('is_pinned = ?');
      values.push(body.isPinned ? 1 : 0);
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
    if (body.target !== undefined) {
      updates.push('target = ?');
      values.push(body.target);
    }
    if (body.rating !== undefined) {
      updates.push('rating = ?');
      values.push(body.rating);
    }
    if (body.notes !== undefined) {
      updates.push('notes = ?');
      values.push(body.notes || null);
    }
    if (body.images !== undefined) {
      updates.push('images = ?');
      values.push(JSON.stringify(body.images));
    }

    values.push(id, authInfo.username);

    await db
      .prepare(
        `UPDATE nav_sites SET ${updates.join(
          ', '
        )} WHERE id = ? AND username = ?`
      )
      .bind(...values)
      .run();

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error('更新站点失败', err);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/navs/sites?id=xxx
 * 删除站点（软删除）
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

    await db
      .prepare(
        'UPDATE nav_sites SET deleted_at = ?, updated_at = ? WHERE id = ? AND username = ?'
      )
      .bind(now, now, id, authInfo.username)
      .run();

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error('删除站点失败', err);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
