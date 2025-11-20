import { NoteInput, NoteItem } from './notes.types';

interface D1Database {
  prepare(sql: string): D1PreparedStatement;
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}

interface D1Result<T = unknown> {
  results: T[];
  success: boolean;
  error?: string;
  meta: {
    changed_db: boolean;
    changes: number;
    last_row_id: number;
    duration: number;
  };
}

interface NoteRow {
  id: string;
  username: string;
  title: string;
  content: string;
  tags: string;
  pinned: number;
  summary: string | null;
  is_archived: number;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

function getD1Database(): D1Database {
  const env = process.env as Record<string, unknown>;
  const db = env.DB as D1Database | undefined;
  if (!db) {
    throw new Error('D1 database binding (DB) is not available');
  }
  return db;
}

function normalizeTags(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.map((tag) => String(tag)).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

function mapRowToNote(row: NoteRow): NoteItem {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    tags: normalizeTags(row.tags),
    pinned: Boolean(row.pinned),
    summary: row.summary,
    isArchived: Boolean(row.is_archived),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

function generateNoteId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}`;
}

function sanitizeInput(input: NoteInput): Required<NoteInput> {
  return {
    title: input.title?.trim() || '未命名笔记',
    content: input.content ?? '',
    tags: Array.isArray(input.tags)
      ? input.tags.map((tag) => String(tag)).filter(Boolean)
      : [],
    pinned: Boolean(input.pinned),
    summary:
      input.summary === null || input.summary === undefined
        ? null
        : String(input.summary),
    isArchived: Boolean(input.isArchived),
  };
}

export async function listNotes(username: string): Promise<NoteItem[]> {
  const db = getD1Database();
  const result = await db
    .prepare(
      `
      SELECT * FROM notes 
      WHERE username = ? AND (deleted_at IS NULL OR deleted_at = 0)
      ORDER BY pinned DESC, updated_at DESC
    `
    )
    .bind(username)
    .all<NoteRow>();

  return result.results.map(mapRowToNote);
}

export async function getNote(
  username: string,
  id: string
): Promise<NoteItem | null> {
  const db = getD1Database();
  const row = await db
    .prepare(
      `
      SELECT * FROM notes 
      WHERE username = ? AND id = ? AND (deleted_at IS NULL OR deleted_at = 0)
      LIMIT 1
    `
    )
    .bind(username, id)
    .first<NoteRow>();

  return row ? mapRowToNote(row) : null;
}

export async function createNote(
  username: string,
  input: NoteInput
): Promise<NoteItem> {
  const db = getD1Database();
  const sanitized = sanitizeInput(input);
  const now = Date.now();
  const id = generateNoteId();

  await db
    .prepare(
      `
      INSERT INTO notes (
        id, username, title, content, tags, pinned, summary, is_archived, created_at, updated_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
    `
    )
    .bind(
      id,
      username,
      sanitized.title,
      sanitized.content,
      JSON.stringify(sanitized.tags),
      sanitized.pinned ? 1 : 0,
      sanitized.summary,
      sanitized.isArchived ? 1 : 0,
      now,
      now
    )
    .run();

  return {
    id,
    title: sanitized.title,
    content: sanitized.content,
    tags: sanitized.tags,
    pinned: sanitized.pinned,
    summary: sanitized.summary,
    isArchived: sanitized.isArchived,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

export async function updateNote(
  username: string,
  id: string,
  input: NoteInput
): Promise<NoteItem | null> {
  const db = getD1Database();
  const existing = await db
    .prepare(
      `
      SELECT * FROM notes 
      WHERE username = ? AND id = ? AND (deleted_at IS NULL OR deleted_at = 0)
      LIMIT 1
    `
    )
    .bind(username, id)
    .first<NoteRow>();

  if (!existing) return null;

  const sanitized = sanitizeInput({
    title: input.title ?? existing.title,
    content: input.content ?? existing.content,
    tags:
      input.tags ??
      (() => {
        try {
          const parsed = JSON.parse(existing.tags);
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      })(),
    pinned: input.pinned ?? Boolean(existing.pinned),
    summary: input.summary ?? existing.summary,
    isArchived: input.isArchived ?? Boolean(existing.is_archived),
  });

  const now = Date.now();

  await db
    .prepare(
      `
      UPDATE notes
      SET title = ?, content = ?, tags = ?, pinned = ?, summary = ?, is_archived = ?, updated_at = ?
      WHERE id = ? AND username = ?
    `
    )
    .bind(
      sanitized.title,
      sanitized.content,
      JSON.stringify(sanitized.tags),
      sanitized.pinned ? 1 : 0,
      sanitized.summary,
      sanitized.isArchived ? 1 : 0,
      now,
      id,
      username
    )
    .run();

  return {
    id,
    title: sanitized.title,
    content: sanitized.content,
    tags: sanitized.tags,
    pinned: sanitized.pinned,
    summary: sanitized.summary,
    isArchived: sanitized.isArchived,
    createdAt: existing.created_at,
    updatedAt: now,
    deletedAt: null,
  };
}

export async function deleteNote(
  username: string,
  id: string
): Promise<boolean> {
  const db = getD1Database();
  const result = await db
    .prepare('DELETE FROM notes WHERE username = ? AND id = ?')
    .bind(username, id)
    .run();
  return result.meta?.changes > 0;
}
