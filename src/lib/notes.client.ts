'use client';

import { getAuthInfoFromBrowserCookie } from './auth';

export interface NoteItem {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

const BASE_STORAGE_KEY = 'moontv_notes';
const NOTES_EVENT = 'notesUpdated';

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

function readNotes(): NoteItem[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = localStorage.getItem(getStorageKey());
    if (!raw) return [];
    const parsed = JSON.parse(raw) as NoteItem[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch (error) {
    notifyNotesError('读取笔记失败');
    return [];
  }
}

function persistNotes(notes: NoteItem[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(getStorageKey(), JSON.stringify(notes));
    window.dispatchEvent(
      new CustomEvent(NOTES_EVENT, {
        detail: notes,
      })
    );
  } catch (error) {
    notifyNotesError('保存笔记失败');
  }
}

function sortNotes(notes: NoteItem[]): NoteItem[] {
  return [...notes].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getAllNotes(): NoteItem[] {
  return sortNotes(readNotes());
}

export function getNoteById(id: string): NoteItem | null {
  return readNotes().find((note) => note.id === id) ?? null;
}

export function createNote(data: { title: string; content: string }): NoteItem {
  const now = Date.now();
  const title = data.title.trim() || '未命名笔记';
  const note: NoteItem = {
    id:
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${now}`,
    title,
    content: data.content,
    createdAt: now,
    updatedAt: now,
  };

  const notes = readNotes();
  notes.unshift(note);
  persistNotes(notes);
  return note;
}

export function updateNote(
  id: string,
  data: { title: string; content: string }
): NoteItem {
  const notes = readNotes();
  const index = notes.findIndex((note) => note.id === id);
  if (index === -1) {
    throw new Error('笔记不存在');
  }

  const updated: NoteItem = {
    ...notes[index],
    title: data.title.trim() || '未命名笔记',
    content: data.content,
    updatedAt: Date.now(),
  };

  notes.splice(index, 1);
  notes.unshift(updated);
  persistNotes(notes);
  return updated;
}

export function deleteNote(id: string): void {
  const notes = readNotes();
  const filtered = notes.filter((note) => note.id !== id);
  if (filtered.length === notes.length) {
    return;
  }
  persistNotes(filtered);
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
