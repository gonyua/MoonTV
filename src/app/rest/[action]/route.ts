import { NextRequest, NextResponse } from 'next/server';

import type { MusicSource } from './handler';
import {
  getFangpiDetail,
  getJywavDetail,
  getMiguDetail,
  getNeteaseDetail,
  resolveFangpiStreamLocation,
  resolveJywavStreamLocation,
  resolveSayqzStreamLocation,
  searchAllMusicTracks,
} from './handler';

export const runtime = 'edge';

type SubsonicFailedResponse = {
  'subsonic-response': {
    status: 'failed';
    error: {
      code: 40;
      message: string;
    };
  };
};

type SubsonicOkResponse = {
  'subsonic-response': {
    status: 'ok';
    [key: string]: unknown;
  };
};

function getPublicOrigin(request: NextRequest): string {
  const forwardedProto = request.headers.get('x-forwarded-proto');
  const forwardedHost = request.headers.get('x-forwarded-host');
  const host = forwardedHost || request.headers.get('host');
  const proto =
    forwardedProto ||
    (request.nextUrl.protocol ? request.nextUrl.protocol.replace(':', '') : '');

  if (host && proto) return `${proto}://${host}`;
  if (host) return `http://${host}`;
  return request.nextUrl.origin;
}

type StructuredLyricLine = { value: string; start?: number };
type StructuredLyrics = {
  lang: string;
  synced: boolean;
  line: StructuredLyricLine[];
};

function lrcToStructuredLyrics(lrc: string): {
  synced: boolean;
  line: StructuredLyricLine[];
} {
  const rawLines = lrc
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  type SyncedLine = { start: number; value: string; _idx: number };
  const syncedLines: SyncedLine[] = [];
  let idx = 0;

  for (const rawLine of rawLines) {
    // Skip common metadata tags like `[ar:xxx]`, `[ti:xxx]`, `[offset:...]`
    if (/^\[[a-zA-Z]{2,}:[\s\S]*\]$/.test(rawLine)) continue;

    const timestamps: number[] = [];
    const re = /\[(\d+):(\d{2})(?:\.(\d{1,3}))?\]/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(rawLine))) {
      const minutes = Number(match[1]);
      const seconds = Number(match[2]);
      const fraction = match[3] ?? '';
      const ms =
        fraction.length === 0
          ? 0
          : fraction.length === 1
          ? Number(fraction) * 100
          : fraction.length === 2
          ? Number(fraction) * 10
          : Number(fraction.slice(0, 3));
      if (
        !Number.isFinite(minutes) ||
        !Number.isFinite(seconds) ||
        !Number.isFinite(ms)
      )
        continue;
      timestamps.push(minutes * 60_000 + seconds * 1000 + ms);
    }

    const value = rawLine.replace(re, '').trim();
    if (!value) continue;

    if (timestamps.length) {
      for (const start of timestamps) {
        syncedLines.push({ start, value, _idx: idx });
        idx += 1;
      }
      continue;
    }
  }

  if (syncedLines.length) {
    syncedLines.sort((a, b) => a.start - b.start || a._idx - b._idx);
    return {
      synced: true,
      line: syncedLines.map(({ start, value }) => ({ start, value })),
    };
  }

  const unsynced = rawLines
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^\[[a-zA-Z]{2,}:[\s\S]*\]$/.test(line))
    .map((value) => ({ value }));

  return { synced: false, line: unsynced };
}

function subsonicOk(payload: Record<string, unknown>): NextResponse {
  const body: SubsonicOkResponse = {
    'subsonic-response': {
      ...payload,
      status: 'ok',
    },
  };

  return NextResponse.json(body);
}

function subsonicFailed(message: string): NextResponse {
  const body: SubsonicFailedResponse = {
    'subsonic-response': {
      status: 'failed',
      error: {
        code: 40,
        message,
      },
    },
  };

  return NextResponse.json(body);
}

async function isValidViaLogin(
  request: NextRequest,
  username: string | null,
  password: string | null
): Promise<boolean> {
  const loginUrl = new URL('/api/login', request.url);

  try {
    const response = await fetch(loginUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: username ?? undefined,
        password: password ?? undefined,
      }),
    });

    if (!response.ok) return false;

    const json: unknown = await response.json().catch(() => null);
    if (!json || typeof json !== 'object') return false;
    if (!('ok' in json)) return false;

    return (json as { ok?: unknown }).ok === true;
  } catch {
    return false;
  }
}

function toInt(value: string | null, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

type CachedRestSong = {
  id: string;
  source: MusicSource;
  rawId: string;
  keyword: string;
  title: string;
  artist: string;
  album: string;
  coverArt: string;
  updatedAt: number;
};

const REST_SONG_CACHE_TTL_MS = 10 * 60 * 1000;
const REST_SONG_CACHE_MAX = 2000;
const restSongCache = new Map<string, CachedRestSong>();

function restSongCacheKey(id: string): string {
  return id;
}

function pruneRestSongCache(now: number) {
  restSongCache.forEach((value, key) => {
    if (now - value.updatedAt > REST_SONG_CACHE_TTL_MS)
      restSongCache.delete(key);
  });

  if (restSongCache.size <= REST_SONG_CACHE_MAX) return;
  const entries = Array.from(restSongCache.entries()).sort(
    (a, b) => a[1].updatedAt - b[1].updatedAt
  );
  const over = restSongCache.size - REST_SONG_CACHE_MAX;
  for (let i = 0; i < over; i++) {
    const key = entries[i]?.[0];
    if (key) restSongCache.delete(key);
  }
}

function parseRestSongId(
  value: string
): { source: MusicSource; rawId: string } | null {
  const idx = value.indexOf('-');
  if (idx <= 0) return null;

  const source = value.slice(0, idx);
  const rawId = value.slice(idx + 1);
  if (!rawId) return null;

  if (
    source !== 'fangpi' &&
    source !== 'jywav' &&
    source !== 'migu' &&
    source !== 'netease' &&
    source !== 'qq' &&
    source !== 'kuwo'
  ) {
    return null;
  }

  return { source, rawId };
}

function parseRestSongIdWithFangpiFallback(
  value: string
): { source: MusicSource; rawId: string } | null {
  const parsed = parseRestSongId(value);
  if (parsed) return parsed;

  if (/^\d+$/.test(value)) {
    return { source: 'fangpi', rawId: value };
  }

  return null;
}

function parseMiguRawId(
  rawId: string
): { n: number; keyword: string | null } | null {
  const idx = rawId.indexOf('-');
  if (idx === -1) {
    const n = Number(rawId);
    if (!Number.isFinite(n) || n <= 0) return null;
    return { n: Math.trunc(n), keyword: null };
  }

  const nStr = rawId.slice(0, idx);
  const keyword = rawId.slice(idx + 1).trim();
  const n = Number(nStr);
  if (!Number.isFinite(n) || n <= 0) return null;
  return { n: Math.trunc(n), keyword: keyword || null };
}

async function searchSongsViaMusicApi(
  request: NextRequest,
  keyword: string,
  limit: number,
  sourcesCsv: string | null
): Promise<
  Array<{
    id: string;
    isDir: false;
    title: string;
    artist: string;
    coverArt: string;
  }>
> {
  const tracks = await searchAllMusicTracks(keyword, limit, sourcesCsv);
  const defaultCoverArt = new URL(
    '/logo.png',
    getPublicOrigin(request)
  ).toString();

  const now = Date.now();
  pruneRestSongCache(now);

  return tracks.map((track) => {
    const coverArt = track.cover || defaultCoverArt;
    const song = {
      id: track.uid,
      isDir: false as const,
      title: track.title,
      artist: track.artist,
      coverArt,
    };

    const parsed = parseRestSongId(track.uid);
    if (parsed) {
      restSongCache.set(restSongCacheKey(track.uid), {
        id: track.uid,
        source: parsed.source,
        rawId: parsed.rawId,
        keyword: track.keyword,
        title: track.title,
        artist: track.artist,
        album: track.album,
        coverArt,
        updatedAt: now,
      });
    }

    return song;
  });
}

export async function GET(
  request: NextRequest,
  context: { params: { action: string } }
) {
  const action = context.params.action;

  if (action === 'getOpenSubsonicExtensions') {
    return subsonicOk({
      serverVersion: '0.0.0',
      openSubsonicExtensions: [],
    });
  }

  if (action === 'ping') {
    const { searchParams } = new URL(request.url);
    const username = searchParams.get('u');
    const password = searchParams.get('p');
    const valid = await isValidViaLogin(request, username, password);

    if (!valid) {
      return subsonicFailed('Invalid username or password');
    }

    return subsonicOk({
      version: '1.16.1',
      type: 'AginMusicAdapter',
      serverVersion: '0.0.0',
    });
  }

  if (action === 'getSong' || action === 'getsong') {
    const { searchParams } = new URL(request.url);
    const username = searchParams.get('u');
    const password = searchParams.get('p');
    const valid = await isValidViaLogin(request, username, password);
    if (!valid) return subsonicFailed('Invalid username or password');

    const id = searchParams.get('id');
    if (!id) return subsonicFailed('Missing id');

    const parsed = parseRestSongIdWithFangpiFallback(id);
    if (!parsed) return subsonicFailed('Invalid id');

    const defaultCoverArt = new URL(
      '/logo.png',
      getPublicOrigin(request)
    ).toString();
    const cached = restSongCache.get(restSongCacheKey(id));

    if (parsed.source === 'fangpi') {
      const detail = await getFangpiDetail(parsed.rawId);
      if (!detail && !cached) return subsonicFailed('Song not found');

      return subsonicOk({
        song: {
          id,
          isDir: false,
          title: detail?.title || cached?.title || '',
          artist: detail?.artist || cached?.artist || '',
          album: detail?.album || cached?.album || '',
          coverArt: detail?.cover || cached?.coverArt || defaultCoverArt,
        },
      });
    }

    if (parsed.source === 'jywav') {
      const detail = await getJywavDetail(parsed.rawId);
      if (!detail && !cached) return subsonicFailed('Song not found');

      return subsonicOk({
        song: {
          id,
          isDir: false,
          title: detail?.title || cached?.title || '',
          artist: detail?.artist || cached?.artist || '',
          album: detail?.album || cached?.album || '',
          coverArt: detail?.cover || cached?.coverArt || defaultCoverArt,
        },
      });
    }

    if (parsed.source === 'qq' || parsed.source === 'kuwo') {
      return subsonicOk({
        song: {
          id,
          isDir: false,
          title: cached?.title || '',
          artist: cached?.artist || '',
          album: cached?.album || '',
          coverArt:
            cached?.coverArt ||
            `https://music-dl.sayqz.com/api/?source=${encodeURIComponent(
              parsed.source
            )}&id=${encodeURIComponent(parsed.rawId)}&type=pic`,
        },
      });
    }

    if (parsed.source === 'netease') {
      const detail = await getNeteaseDetail(parsed.rawId);
      if (!detail && !cached) return subsonicFailed('Song not found');

      return subsonicOk({
        song: {
          id,
          isDir: false,
          title: detail?.title || cached?.title || '',
          artist: detail?.artist || cached?.artist || '',
          album: detail?.album || cached?.album || '',
          coverArt: detail?.cover || cached?.coverArt || defaultCoverArt,
        },
      });
    }

    const migu = parseMiguRawId(parsed.rawId);
    if (!migu) return subsonicFailed('Invalid id');
    const keyword =
      cached?.keyword ||
      migu.keyword ||
      (searchParams.get('query') ?? '').trim();
    if (!keyword) return subsonicFailed('Song not found');

    const detail = await getMiguDetail(keyword, migu.n);
    if (!detail && !cached) return subsonicFailed('Song not found');

    return subsonicOk({
      song: {
        id,
        isDir: false,
        title: detail?.title || cached?.title || '',
        artist: detail?.artist || cached?.artist || '',
        album: detail?.album || cached?.album || '',
        coverArt: detail?.cover || cached?.coverArt || defaultCoverArt,
      },
    });
  }

  if (
    action === 'getlrc' ||
    action === 'getLyrics' ||
    action === 'getLyricsBySongId'
  ) {
    const { searchParams } = new URL(request.url);
    const username = searchParams.get('u');
    const password = searchParams.get('p');
    const valid = await isValidViaLogin(request, username, password);
    if (!valid) return subsonicFailed('Invalid username or password');

    const id = searchParams.get('id');
    if (!id) return subsonicFailed('Missing id');

    const parsed = parseRestSongIdWithFangpiFallback(id);
    if (!parsed) return subsonicFailed('Invalid id');

    if (parsed.source === 'fangpi') {
      const detail = await getFangpiDetail(parsed.rawId);
      if (!detail) return subsonicFailed('Song not found');

      const structured = detail.lrc ? lrcToStructuredLyrics(detail.lrc) : null;
      if (!structured || structured.line.length === 0) return subsonicOk({});

      const structuredLyrics: StructuredLyrics[] = [
        { lang: 'zh', synced: structured.synced, line: structured.line },
      ];

      return subsonicOk({
        lyricsList: { structuredLyrics },
      });
    }

    if (parsed.source === 'jywav') {
      const detail = await getJywavDetail(parsed.rawId);
      if (!detail) return subsonicFailed('Song not found');

      const structured = detail.lrc ? lrcToStructuredLyrics(detail.lrc) : null;
      if (!structured || structured.line.length === 0) return subsonicOk({});

      const structuredLyrics: StructuredLyrics[] = [
        { lang: 'zh', synced: structured.synced, line: structured.line },
      ];

      return subsonicOk({
        lyricsList: { structuredLyrics },
      });
    }

    return subsonicOk({});
  }

  if (action === 'stream') {
    const { searchParams } = new URL(request.url);
    const username = searchParams.get('u');
    const password = searchParams.get('p');
    const valid = await isValidViaLogin(request, username, password);
    if (!valid) return subsonicFailed('Invalid username or password');

    const id = searchParams.get('id');
    if (!id) return subsonicFailed('Missing id');

    const parsed = parseRestSongIdWithFangpiFallback(id);
    if (!parsed) return subsonicFailed('Invalid id');

    const cached = restSongCache.get(restSongCacheKey(id));

    if (parsed.source === 'fangpi') {
      const location = await resolveFangpiStreamLocation(parsed.rawId);
      if (!location) return subsonicFailed('Stream url not found');
      return NextResponse.redirect(location, 307);
    }

    if (parsed.source === 'jywav') {
      const location = await resolveJywavStreamLocation(parsed.rawId);
      if (!location) return subsonicFailed('Stream url not found');
      return NextResponse.redirect(location, 307);
    }

    if (parsed.source === 'qq' || parsed.source === 'kuwo') {
      const location = await resolveSayqzStreamLocation(
        parsed.source,
        parsed.rawId
      );
      if (!location) return subsonicFailed('Stream url not found');
      return NextResponse.redirect(location, 307);
    }

    if (parsed.source === 'netease') {
      const detail = await getNeteaseDetail(parsed.rawId);
      const url = detail?.audioUrl;
      if (!url) return subsonicFailed('Stream url not found');
      return NextResponse.redirect(url, 307);
    }

    const migu = parseMiguRawId(parsed.rawId);
    if (!migu) return subsonicFailed('Invalid id');
    const keyword =
      cached?.keyword ||
      migu.keyword ||
      (searchParams.get('query') ?? '').trim();
    if (!keyword) return subsonicFailed('Stream url not found');

    const detail = await getMiguDetail(keyword, migu.n);
    const url = detail?.audioUrl;
    if (!url) return subsonicFailed('Stream url not found');
    return NextResponse.redirect(url, 307);
  }

  if (action === 'search3') {
    const { searchParams } = new URL(request.url);

    const username = searchParams.get('u');
    const password = searchParams.get('p');
    const valid = await isValidViaLogin(request, username, password);

    if (!valid) {
      return subsonicFailed('Invalid username or password');
    }

    const keyword = (searchParams.get('query') ?? '').trim();
    if (!keyword || keyword.length <= 1) {
      return subsonicOk({
        searchResult3: {
          album: [],
          artist: [],
          song: [],
        },
      });
    }

    const songCount = clampInt(toInt(searchParams.get('songCount'), 20), 0, 50);
    const songOffset = Math.max(0, toInt(searchParams.get('songOffset'), 0));

    const fetchLimit = clampInt(songCount + songOffset, 1, 50);
    const sourcesCsv =
      searchParams.get('sources') ?? searchParams.get('source') ?? null;
    const allSongs = await searchSongsViaMusicApi(
      request,
      keyword,
      fetchLimit,
      sourcesCsv
    );
    // const songs = allSongs.slice(songOffset, songOffset + songCount);

    return subsonicOk({
      searchResult3: {
        album: [],
        artist: [],
        song: allSongs,
      },
    });
  }

  return NextResponse.json({ error: 'Not Found' }, { status: 404 });
}
