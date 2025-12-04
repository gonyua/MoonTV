/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { deleteNote, getNote, updateNote } from '@/lib/server/notes.server';

export const runtime = 'edge';

interface Params {
  params: { id: string };
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo?.username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const note = await getNote(authInfo.username, params.id);
    if (!note) {
      return NextResponse.json({ error: 'Not Found' }, { status: 404 });
    }

    return NextResponse.json(note, { status: 200 });
  } catch (err) {
    console.error('获取笔记失败', err);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo?.username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const note = await updateNote(authInfo.username, params.id, body || {});

    if (!note) {
      return NextResponse.json({ error: 'Not Found' }, { status: 404 });
    }

    return NextResponse.json(note, { status: 200 });
  } catch (err) {
    console.error('更新笔记失败', err);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo?.username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const removed = await deleteNote(authInfo.username, params.id);
    if (!removed) {
      return NextResponse.json({ error: 'Not Found' }, { status: 404 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error('删除笔记失败', err);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
