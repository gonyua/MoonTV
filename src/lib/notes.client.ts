'use client';

import { getAuthInfoFromBrowserCookie } from './auth';
import { NoteInput, NoteItem } from './notes.types';

export type { NoteInput, NoteItem } from './notes.types';

const BASE_STORAGE_KEY = 'moontv_notes';
const NOTES_EVENT = 'notesUpdated';

const STORAGE_TYPE = (() => {
  const runtimeConfig =
    typeof window !== 'undefined'
      ? (
          window as Window & {
            RUNTIME_CONFIG?: { STORAGE_TYPE?: string };
          }
        ).RUNTIME_CONFIG
      : undefined;

  const runtime =
    runtimeConfig?.STORAGE_TYPE ||
    (process.env.NEXT_PUBLIC_STORAGE_TYPE as
      | 'localstorage'
      | 'redis'
      | 'd1'
      | 'upstash'
      | undefined) ||
    'localstorage';
  return runtime;
})();

const isLocalMode = STORAGE_TYPE === 'localstorage';

function notifyNotesError(message: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('globalError', {
      detail: { message },
    })
  );
}

function getStorageKey(): string {
  if (typeof window === 'undefined') {
    return BASE_STORAGE_KEY;
  }
  const authInfo = getAuthInfoFromBrowserCookie();
  const username = authInfo?.username?.trim();
  if (username) {
    return `${BASE_STORAGE_KEY}_${username}`;
  }
  return BASE_STORAGE_KEY;
}

function generateNoteId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}`;
}

function normalizeNote(note: Partial<NoteItem>): NoteItem {
  const createdAt =
    typeof note.createdAt === 'number' ? note.createdAt : Date.now();
  const updatedAt =
    typeof note.updatedAt === 'number' ? note.updatedAt : createdAt;

  return {
    id: note.id || generateNoteId(),
    title: note.title?.trim() || '未命名笔记',
    content: note.content ?? '',
    tags: Array.isArray(note.tags)
      ? note.tags.map((tag) => String(tag)).filter(Boolean)
      : [],
    pinned: Boolean(note.pinned),
    summary:
      note.summary === null || note.summary === undefined
        ? null
        : String(note.summary),
    isArchived: Boolean(note.isArchived),
    createdAt,
    updatedAt,
    deletedAt:
      note.deletedAt === null || note.deletedAt === undefined
        ? null
        : Number(note.deletedAt),
  };
}

function sortNotes(notes: NoteItem[]): NoteItem[] {
  return [...notes].sort((a, b) => {
    const pinnedDiff = Number(b.pinned ?? 0) - Number(a.pinned ?? 0);
    if (pinnedDiff !== 0) return pinnedDiff;
    return (b.updatedAt || 0) - (a.updatedAt || 0);
  });
}

function readNotes(): NoteItem[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = localStorage.getItem(getStorageKey());
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<NoteItem>[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => normalizeNote(item))
      .filter((item) => !item.deletedAt);
  } catch (error) {
    notifyNotesError('读取笔记失败');
    return [];
  }
}

function persistNotes(notes: NoteItem[]): void {
  if (typeof window === 'undefined') return;
  try {
    const sorted = sortNotes(notes);
    localStorage.setItem(getStorageKey(), JSON.stringify(sorted));
    window.dispatchEvent(
      new CustomEvent(NOTES_EVENT, {
        detail: sorted,
      })
    );
  } catch (error) {
    notifyNotesError('保存笔记失败');
  }
}

function broadcastNotes(notes: NoteItem[]): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(NOTES_EVENT, {
      detail: sortNotes(notes),
    })
  );
}

async function fetchWithAuth(
  url: string,
  options?: RequestInit
): Promise<Response> {
  const res = await fetch(url, options);
  if (res.status === 401 && typeof window !== 'undefined') {
    const currentUrl = window.location.pathname + window.location.search;
    const loginUrl = new URL('/login', window.location.origin);
    loginUrl.searchParams.set('redirect', currentUrl);
    window.location.href = loginUrl.toString();
    throw new Error('未登录，已跳转到登录页');
  }
  if (!res.ok) {
    throw new Error(`请求失败: ${res.status}`);
  }
  return res;
}

async function fetchNotesFromApi(): Promise<NoteItem[]> {
  const res = await fetchWithAuth('/api/notes');
  const data = (await res.json()) as unknown;
  const list = Array.isArray(data) ? data : [];
  return sortNotes(
    list.map((item) => normalizeNote(item as Partial<NoteItem>))
  );
}

export async function getAllNotes(): Promise<NoteItem[]> {
  if (isLocalMode) {
    return sortNotes(readNotes());
  }

  try {
    const notes = await fetchNotesFromApi();
    broadcastNotes(notes);
    return notes;
  } catch (error) {
    notifyNotesError('获取笔记失败');
    return [];
  }
}

export async function getNoteById(id: string): Promise<NoteItem | null> {
  if (isLocalMode) {
    return readNotes().find((note) => note.id === id) ?? null;
  }

  try {
    const res = await fetchWithAuth(`/api/notes/${id}`);
    const data = (await res.json()) as unknown;
    return normalizeNote((data as Partial<NoteItem>) || {});
  } catch (error) {
    if ((error as Error).message.includes('404')) {
      return null;
    }
    notifyNotesError('读取笔记失败');
    return null;
  }
}

export async function createNote(data: NoteInput): Promise<NoteItem> {
  const now = Date.now();
  const normalized = normalizeNote({
    ...data,
    createdAt: now,
    updatedAt: now,
  });

  if (isLocalMode) {
    const notes = readNotes();
    notes.unshift(normalized);
    persistNotes(notes);
    return normalized;
  }

  try {
    const res = await fetchWithAuth('/api/notes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: normalized.title,
        content: normalized.content,
        tags: normalized.tags,
        pinned: normalized.pinned,
        summary: normalized.summary,
        isArchived: normalized.isArchived,
      }),
    });
    const created = normalizeNote(await res.json());
    const latest = await fetchNotesFromApi();
    broadcastNotes(latest);
    return created;
  } catch (error) {
    notifyNotesError('创建笔记失败');
    throw error;
  }
}

export async function updateNote(
  id: string,
  data: NoteInput
): Promise<NoteItem> {
  if (isLocalMode) {
    const notes = readNotes();
    const index = notes.findIndex((note) => note.id === id);
    if (index === -1) {
      throw new Error('笔记不存在');
    }
    const updated = normalizeNote({
      ...notes[index],
      ...data,
      updatedAt: Date.now(),
    });
    notes.splice(index, 1);
    notes.unshift(updated);
    persistNotes(notes);
    return updated;
  }

  try {
    const res = await fetchWithAuth(`/api/notes/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    const updated = normalizeNote(await res.json());
    const latest = await fetchNotesFromApi();
    broadcastNotes(latest);
    return updated;
  } catch (error) {
    notifyNotesError('更新笔记失败');
    throw error;
  }
}

export async function deleteNote(id: string): Promise<void> {
  if (isLocalMode) {
    const notes = readNotes().filter((note) => note.id !== id);
    persistNotes(notes);
    return;
  }

  try {
    await fetchWithAuth(`/api/notes/${id}`, {
      method: 'DELETE',
    });
    const latest = await fetchNotesFromApi();
    broadcastNotes(latest);
  } catch (error) {
    notifyNotesError('删除笔记失败');
    throw error;
  }
}

export function subscribeToNotes(
  callback: (notes: NoteItem[]) => void
): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<NoteItem[]>;
    callback(customEvent.detail);
  };

  window.addEventListener(NOTES_EVENT, handler as EventListener);
  return () => {
    window.removeEventListener(NOTES_EVENT, handler as EventListener);
  };
}
