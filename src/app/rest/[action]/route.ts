import { NextRequest, NextResponse } from 'next/server';

import type { MusicSource } from './handler';
import {
  getMiguDetail,
  getNeteaseDetail,
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
    source !== 'migu' &&
    source !== 'netease' &&
    source !== 'qq' &&
    source !== 'kuwo'
  ) {
    return null;
  }

  return { source, rawId };
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
  limit: number
): Promise<
  Array<{
    id: string;
    isDir: false;
    title: string;
    artist: string;
    coverArt: string;
  }>
> {
  const tracks = await searchAllMusicTracks(keyword, limit);
  const defaultCoverArt = new URL('/logo.png', request.url).toString();

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

  if (action === 'getSong') {
    const { searchParams } = new URL(request.url);
    const username = searchParams.get('u');
    const password = searchParams.get('p');
    const valid = await isValidViaLogin(request, username, password);
    if (!valid) return subsonicFailed('Invalid username or password');

    const id = searchParams.get('id');
    if (!id) return subsonicFailed('Missing id');

    const parsed = parseRestSongId(id);
    if (!parsed) return subsonicFailed('Invalid id');

    const defaultCoverArt = new URL('/logo.png', request.url).toString();
    const cached = restSongCache.get(restSongCacheKey(id));

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

  if (action === 'stream') {
    const { searchParams } = new URL(request.url);
    const username = searchParams.get('u');
    const password = searchParams.get('p');
    const valid = await isValidViaLogin(request, username, password);
    if (!valid) return subsonicFailed('Invalid username or password');

    const id = searchParams.get('id');
    if (!id) return subsonicFailed('Missing id');

    const parsed = parseRestSongId(id);
    if (!parsed) return subsonicFailed('Invalid id');

    const cached = restSongCache.get(restSongCacheKey(id));

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
    const allSongs = await searchSongsViaMusicApi(request, keyword, fetchLimit);
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
