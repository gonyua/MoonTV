/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { createNote, listNotes } from '@/lib/server/notes.server';

export const runtime = 'edge';

export async function GET(request: NextRequest) {
  try {
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo?.username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const notes = await listNotes(authInfo.username);
    return NextResponse.json(notes, { status: 200 });
  } catch (err) {
    console.error('获取笔记列表失败', err);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo?.username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const note = await createNote(authInfo.username, body || {});
    return NextResponse.json(note, { status: 201 });
  } catch (err) {
    console.error('创建笔记失败', err);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
