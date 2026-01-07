type D1Result<T = unknown> = {
  results?: T[];
  success?: boolean;
  error?: string;
  meta?: { changes?: number };
};

type D1PreparedStatement = {
  bind: (...values: unknown[]) => D1PreparedStatement;
  run: () => Promise<D1Result>;
  all: <T = unknown>() => Promise<D1Result<T>>;
};

type D1Database = {
  prepare: (sql: string) => D1PreparedStatement;
  batch?: (statements: D1PreparedStatement[]) => Promise<D1Result[]>;
};

function tryGetD1Database(): D1Database | null {
  const db = (process.env as unknown as { DB?: unknown }).DB;
  return db ? (db as D1Database) : null;
}

function getD1Database(): D1Database {
  const db = tryGetD1Database();
  if (!db) throw new Error('D1 DB binding not found: process.env.DB');
  return db;
}

const NETEASE_REFERER = 'https://music.163.com/';

export function extractFirstUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s]+/i);
  if (!match) return null;
  return match[0] ?? null;
}

export function extractHttpUrl(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const tryParse = (value: string): string | null => {
    try {
      const url = new URL(value);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
      return url.toString();
    } catch {
      return null;
    }
  };

  const direct = tryParse(trimmed);
  if (direct) return direct;

  const raw = extractFirstUrl(trimmed);
  if (!raw) return null;

  const cleaned = raw.replace(/[),，。；;!?]+$/g, '');
  return tryParse(cleaned);
}

export function normalizeLikeKeyPart(value: string): string {
  return value
    .trim()
    .replaceAll('（', '(')
    .replaceAll('）', ')')
    .replaceAll('【', '[')
    .replaceAll('】', ']')
    .replace(/\s+/g, '')
    .toLowerCase();
}

export function createNeteaseLikeKey(input: {
  title: string;
  artist: string;
}): string {
  return `netease:${normalizeLikeKeyPart(input.artist)}::${normalizeLikeKeyPart(
    input.title
  )}`;
}

export function extractNeteasePlaylistId(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  // 常见：/m/playlist?id=xxx 或 /playlist?id=xxx
  const direct = url.searchParams.get('id');
  if (direct && /^\d+$/.test(direct)) return direct;

  // 常见：https://music.163.com/#/playlist?id=xxx
  const hash = (url.hash ?? '').replace(/^#/, '');
  const queryIdx = hash.indexOf('?');
  if (queryIdx >= 0) {
    const qs = hash.slice(queryIdx + 1);
    const id = new URLSearchParams(qs).get('id');
    if (id && /^\d+$/.test(id)) return id;
  }

  return null;
}

async function resolveFinalUrl(inputUrl: string): Promise<string> {
  let current = inputUrl;
  for (let i = 0; i < 5; i += 1) {
    const response = await fetch(current, {
      method: 'GET',
      redirect: 'manual',
    });

    if (
      response.status === 301 ||
      response.status === 302 ||
      response.status === 303 ||
      response.status === 307 ||
      response.status === 308
    ) {
      const loc = response.headers.get('location');
      if (!loc) break;
      current = new URL(loc, current).toString();
      continue;
    }

    // 如果不是 redirect，就用当前地址（不强依赖 response.url）
    break;
  }

  return current;
}

type NeteasePlaylistDetail = {
  playlist: {
    id: number;
    name: string;
    coverImgUrl?: string;
    trackCount?: number;
    trackIds?: Array<{ id: number }>;
  };
};

type NeteaseSongDetail = {
  songs: Array<{
    id: number;
    name: string;
    artists?: Array<{ id: number; name: string }>;
    ar?: Array<{ id: number; name: string }>;
    album?: { id: number; name: string; picUrl?: string };
    al?: { id: number; name: string; picUrl?: string };
  }>;
};

function getArtistNames(song: NeteaseSongDetail['songs'][number]): string[] {
  const artists = song.artists ?? song.ar ?? [];
  return artists
    .map((a) => (a?.name ?? '').trim())
    .filter((name) => Boolean(name));
}

function getAlbum(song: NeteaseSongDetail['songs'][number]): {
  name: string;
  cover?: string;
} {
  const album = song.album ?? song.al;
  return {
    name: (album?.name ?? '').trim(),
    cover: album?.picUrl ?? undefined,
  };
}

async function fetchPlaylistDetail(playlistId: string): Promise<{
  id: string;
  name: string;
  trackIds: number[];
}> {
  const url = `https://music.163.com/api/v3/playlist/detail?id=${encodeURIComponent(
    playlistId
  )}`;
  const response = await fetch(url, {
    headers: {
      Referer: NETEASE_REFERER,
      Accept: 'application/json',
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch playlist detail: HTTP ${response.status}`);
  }
  const json = (await response.json()) as NeteasePlaylistDetail;
  const playlist = json?.playlist;
  if (!playlist || typeof playlist.id !== 'number') {
    throw new Error('Invalid playlist detail response');
  }

  const trackIds = (playlist.trackIds ?? [])
    .map((it) => it?.id)
    .filter((id): id is number => Number.isFinite(id));

  return {
    id: String(playlist.id),
    name: playlist.name ?? '',
    trackIds,
  };
}

function chunk<T>(items: T[], size: number): T[][] {
  const s = Math.max(1, Math.trunc(size));
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += s) {
    out.push(items.slice(i, i + s));
  }
  return out;
}

async function fetchSongsByIds(
  ids: number[]
): Promise<NeteaseSongDetail['songs']> {
  if (ids.length === 0) return [];
  const url = `https://music.163.com/api/song/detail/?ids=${encodeURIComponent(
    `[${ids.join(',')}]`
  )}`;
  const response = await fetch(url, {
    headers: {
      Referer: NETEASE_REFERER,
      Accept: 'application/json',
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch song detail: HTTP ${response.status}`);
  }
  const json = (await response.json()) as NeteaseSongDetail;
  return Array.isArray(json?.songs) ? json.songs : [];
}

export type ImportNeteaseLikesResult = {
  playlistId: string;
  playlistName: string;
  total: number;
  imported: number;
  skipped: number;
  stored: boolean;
  tracks: Array<{
    key: string;
    source: string;
    songId: string;
    title: string;
    artist: string;
    album: string;
    cover: string | null;
  }>;
};

export type MusicLikeBasic = {
  key: string;
  source: string;
  songId: string;
  title: string;
  artist: string;
  album: string;
  cover: string | null;
  saveTime: number;
};

export async function listMusicLikesFromD1(options: {
  username: string;
  limit?: number | null;
}): Promise<MusicLikeBasic[]> {
  const username = options.username.trim();
  if (!username) throw new Error('Missing username');

  const limit =
    options.limit &&
    Number.isFinite(options.limit) &&
    (options.limit as number) > 0
      ? Math.max(1, Math.trunc(options.limit as number))
      : null;

  const db = getD1Database();
  const sql = `
    SELECT
      key,
      source,
      song_id AS songId,
      title,
      artist,
      album,
      cover,
      save_time AS saveTime
    FROM music_likes
    WHERE username = ?
    ORDER BY save_time DESC
    ${limit ? 'LIMIT ?' : ''}
  `;

  const stmt = limit
    ? db.prepare(sql).bind(username, limit)
    : db.prepare(sql).bind(username);
  const res = await stmt.all<MusicLikeBasic>();
  return Array.isArray(res?.results) ? res.results : [];
}

export async function importNeteaseLikesToD1(options: {
  username: string;
  url?: string | null;
  shareText?: string | null;
  limit?: number | null;
}): Promise<ImportNeteaseLikesResult> {
  const username = options.username.trim();
  if (!username) throw new Error('Missing username');

  const inputText = ((options.url ?? '').trim() ||
    (options.shareText ?? '').trim()) as string;
  const rawUrl =
    extractHttpUrl((options.url ?? '').trim()) ||
    extractHttpUrl((options.shareText ?? '').trim()) ||
    '';
  if (!rawUrl) throw new Error('Missing url/shareText');

  let finalUrl = await resolveFinalUrl(rawUrl);
  let playlistId = extractNeteasePlaylistId(finalUrl);
  if (!playlistId) {
    // 兜底：让 fetch 自己跟随跳转，使用 response.url 再解析一次
    const response = await fetch(rawUrl, { method: 'GET', redirect: 'follow' });
    if (response.url) finalUrl = response.url;
    playlistId = extractNeteasePlaylistId(finalUrl);
  }
  if (!playlistId) throw new Error('Failed to extract netease playlist id');

  const playlist = await fetchPlaylistDetail(playlistId);
  const max =
    options.limit &&
    Number.isFinite(options.limit) &&
    (options.limit as number) > 0
      ? Math.trunc(options.limit as number)
      : Infinity;
  const targetIds = playlist.trackIds.slice(0, max);

  const db = tryGetD1Database();
  const saveTime = Date.now();
  const extraBase = {
    playlistId: playlist.id,
    playlistName: playlist.name,
    inputText: inputText || rawUrl,
    inputUrl: rawUrl,
    resolvedUrl: finalUrl,
  };

  const insertSql = `
    INSERT OR IGNORE INTO music_likes
    (username, key, source, song_id, title, artist, album, cover, audio_url, lrc, lrc_url, quality, extra, save_time)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  let imported = 0;
  let skipped = 0;
  const tracks: ImportNeteaseLikesResult['tracks'] = [];

  const idChunks = chunk(targetIds, 100);
  for (const ids of idChunks) {
    const songs = await fetchSongsByIds(ids);
    const statements: D1PreparedStatement[] = [];

    for (const song of songs) {
      const title = (song?.name ?? '').trim();
      if (!title) continue;

      const artistNames = getArtistNames(song);
      const artist = artistNames.join('/');
      if (!artist) continue;

      const { name: album, cover } = getAlbum(song);
      const key = createNeteaseLikeKey({ title, artist });
      tracks.push({
        key,
        source: 'netease',
        songId: String(song.id),
        title,
        artist,
        album: album || '',
        cover: cover ?? null,
      });

      if (!db) continue;
      const extra = JSON.stringify({
        ...extraBase,
        songId: String(song.id),
      });

      const stmt = db
        .prepare(insertSql)
        .bind(
          username,
          key,
          'netease',
          String(song.id),
          title,
          artist,
          album || '',
          cover ?? null,
          null,
          null,
          null,
          'normal',
          extra,
          saveTime
        );
      statements.push(stmt);
    }

    if (statements.length === 0) continue;

    if (db) {
      if (typeof db.batch === 'function') {
        const results = await db.batch(statements);
        for (const res of results) {
          const changes = res?.meta?.changes ?? 0;
          if (changes > 0) imported += 1;
          else skipped += 1;
        }
      } else {
        for (const stmt of statements) {
          const res = await stmt.run();
          const changes = res?.meta?.changes ?? 0;
          if (changes > 0) imported += 1;
          else skipped += 1;
        }
      }
    }
  }

  return {
    playlistId: playlist.id,
    playlistName: playlist.name,
    total: targetIds.length,
    imported,
    skipped,
    stored: Boolean(db),
    tracks,
  };
}
