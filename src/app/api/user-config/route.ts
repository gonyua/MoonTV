/* eslint-disable no-console */
export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';

interface D1Database {
  prepare(sql: string): D1PreparedStatement;
}

interface D1PreparedStatement {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  bind(...values: any[]): D1PreparedStatement;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  first<T = any>(): Promise<T | null>;
  run(): Promise<D1Result>;
}

interface D1Result {
  success: boolean;
  meta: {
    changes: number;
  };
}

function getD1Database(): D1Database | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (process.env as any).DB as D1Database | null;
}

// GET - 获取配置
export async function GET(request: NextRequest) {
  const authInfo = getAuthInfoFromCookie(request);
  if (!authInfo?.username) {
    return NextResponse.json({ code: 401, message: '未登录' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const configKey = searchParams.get('key');

  if (!configKey) {
    return NextResponse.json(
      { code: 400, message: '缺少配置键名' },
      { status: 400 }
    );
  }

  const db = getD1Database();
  if (!db) {
    return NextResponse.json(
      { code: 500, message: '数据库未配置' },
      { status: 500 }
    );
  }

  try {
    const result = await db
      .prepare(
        'SELECT config_value, config_type, metadata, expires_at, updated_at FROM user_configs WHERE username = ? AND config_key = ?'
      )
      .bind(authInfo.username, configKey)
      .first<{
        config_value: string;
        config_type: string;
        metadata: string | null;
        expires_at: number | null;
        updated_at: number;
      }>();

    if (!result) {
      return NextResponse.json({ code: 404, message: '配置不存在' });
    }

    // 检查是否过期
    if (
      result.expires_at &&
      result.expires_at < Math.floor(Date.now() / 1000)
    ) {
      return NextResponse.json({ code: 404, message: '配置已过期' });
    }

    let value: unknown = result.config_value;
    if (result.config_type === 'json') {
      try {
        value = JSON.parse(result.config_value);
      } catch {
        // 保持原值
      }
    } else if (result.config_type === 'number') {
      value = Number(result.config_value);
    } else if (result.config_type === 'boolean') {
      value = result.config_value === 'true';
    }

    return NextResponse.json({
      code: 200,
      data: {
        value,
        type: result.config_type,
        metadata: result.metadata ? JSON.parse(result.metadata) : null,
        updatedAt: result.updated_at,
      },
    });
  } catch (error) {
    console.error('获取配置失败:', error);
    return NextResponse.json(
      { code: 500, message: '获取配置失败' },
      { status: 500 }
    );
  }
}

// POST - 设置配置
export async function POST(request: NextRequest) {
  const authInfo = getAuthInfoFromCookie(request);
  if (!authInfo?.username) {
    return NextResponse.json({ code: 401, message: '未登录' }, { status: 401 });
  }

  const db = getD1Database();
  if (!db) {
    return NextResponse.json(
      { code: 500, message: '数据库未配置' },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const {
      key,
      value,
      type = 'string',
      description,
      expiresIn,
      metadata,
    } = body as {
      key: string;
      value: unknown;
      type?: 'string' | 'json' | 'number' | 'boolean';
      description?: string;
      expiresIn?: number; // 秒
      metadata?: Record<string, unknown>;
    };

    if (!key || value === undefined) {
      return NextResponse.json(
        { code: 400, message: '缺少必要参数' },
        { status: 400 }
      );
    }

    // 转换值为字符串存储
    let configValue: string;
    if (type === 'json') {
      configValue = typeof value === 'string' ? value : JSON.stringify(value);
    } else {
      configValue = String(value);
    }

    const now = Math.floor(Date.now() / 1000);
    const expiresAt = expiresIn ? now + expiresIn : null;
    const metadataStr = metadata ? JSON.stringify(metadata) : null;

    await db
      .prepare(
        `INSERT INTO user_configs (username, config_key, config_value, config_type, description, expires_at, metadata, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(username, config_key) DO UPDATE SET
         config_value = excluded.config_value,
         config_type = excluded.config_type,
         description = COALESCE(excluded.description, description),
         expires_at = excluded.expires_at,
         metadata = COALESCE(excluded.metadata, metadata),
         updated_at = excluded.updated_at`
      )
      .bind(
        authInfo.username,
        key,
        configValue,
        type,
        description || null,
        expiresAt,
        metadataStr,
        now,
        now
      )
      .run();

    return NextResponse.json({ code: 200, message: '保存成功' });
  } catch (error) {
    console.error('保存配置失败:', error);
    return NextResponse.json(
      { code: 500, message: '保存配置失败' },
      { status: 500 }
    );
  }
}

// DELETE - 删除配置
export async function DELETE(request: NextRequest) {
  const authInfo = getAuthInfoFromCookie(request);
  if (!authInfo?.username) {
    return NextResponse.json({ code: 401, message: '未登录' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const configKey = searchParams.get('key');

  if (!configKey) {
    return NextResponse.json(
      { code: 400, message: '缺少配置键名' },
      { status: 400 }
    );
  }

  const db = getD1Database();
  if (!db) {
    return NextResponse.json(
      { code: 500, message: '数据库未配置' },
      { status: 500 }
    );
  }

  try {
    await db
      .prepare('DELETE FROM user_configs WHERE username = ? AND config_key = ?')
      .bind(authInfo.username, configKey)
      .run();

    return NextResponse.json({ code: 200, message: '删除成功' });
  } catch (error) {
    console.error('删除配置失败:', error);
    return NextResponse.json(
      { code: 500, message: '删除配置失败' },
      { status: 500 }
    );
  }
}
