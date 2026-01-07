import { NextRequest, NextResponse } from 'next/server';

import * as cggHandler from './cggHandler';
import * as fangpiHandler from './fangpiHandler';
import * as jywavHandler from './jywavHandler';
import * as sayqzHandler from './sayqzHandler';
import { clampLimit } from './shared';
import type { MusicTrack } from './types';

export const runtime = 'edge';

const REST_CACHE_TTL_SECONDS = 60 * 60 * 24; // 1 day

function setRestCacheHeaders(headers: Headers, ttlSeconds: number) {
  const ttl = Math.max(0, Math.trunc(ttlSeconds));
  headers.set('Cache-Control', `public, max-age=${ttl}, s-maxage=${ttl}`);
  headers.set('CDN-Cache-Control', `public, s-maxage=${ttl}`);
  headers.set('Vercel-CDN-Cache-Control', `public, s-maxage=${ttl}`);
}

async function withRestCache(
  request: NextRequest,
  makeResponse: () => Promise<Response>,
  ttlSeconds = REST_CACHE_TTL_SECONDS
): Promise<Response> {
  const cacheStorage = (
    globalThis as unknown as { caches?: CacheStorage | undefined }
  ).caches;
  const cache = (cacheStorage as unknown as { default?: Cache | undefined })
    ?.default;
  if (!cache) {
    const response = await makeResponse();
    if (response.status === 200 || response.status === 307) {
      setRestCacheHeaders(response.headers, ttlSeconds);
    }
    return response;
  }

  const cacheRequest = new Request(request.url, { method: 'GET' });

  const cached = await cache.match(cacheRequest);
  if (cached) return cached;

  const response = await makeResponse();
  if (response.status === 200 || response.status === 307) {
    setRestCacheHeaders(response.headers, ttlSeconds);
    // Best-effort: don't fail the request if the cache write fails.
    cache.put(cacheRequest, response.clone()).catch(() => null);
  }

  return response;
}

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

type MusicPlatform = 'fangpi' | 'jywav' | 'cgg' | 'sayqz';

function parseRestPlatformId(
  value: string
): { platform: MusicPlatform; id: string } | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const parts = trimmed.split('-').filter(Boolean);
  if (parts.length < 3) return null;

  if (
    parts[0] !== 'fangpi' &&
    parts[0] !== 'jywav' &&
    parts[0] !== 'cgg' &&
    parts[0] !== 'sayqz'
  )
    return null;

  return { platform: parts[0], id: trimmed };
}

type SearchProvider = {
  id: MusicPlatform;
  search3: (keyword: string, limit: number) => Promise<MusicTrack[]>;
};

const SAYQZ_SEARCH_SOURCES: sayqzHandler.SayqzHandlerSource[] = [
  'netease',
  'kuwo',
  'qq',
];
let sayqzSourceCursor = 0;
function pickSayqzSearchSource(): sayqzHandler.SayqzHandlerSource {
  const n = SAYQZ_SEARCH_SOURCES.length;
  if (n <= 1) return SAYQZ_SEARCH_SOURCES[0] ?? 'qq';
  const idx = ((sayqzSourceCursor % n) + n) % n;
  sayqzSourceCursor = (sayqzSourceCursor + 1) % n;
  return SAYQZ_SEARCH_SOURCES[idx] ?? 'qq';
}

const SEARCH_PROVIDERS: SearchProvider[] = [
  { id: 'fangpi', search3: fangpiHandler.search3 },
  { id: 'jywav', search3: jywavHandler.search3 },
  { id: 'cgg', search3: cggHandler.search3 },
  // sayqz的默认search3会并发请求多个source；这里也保持“每次只打 1 个上游”，但在子源间轮询。
  {
    id: 'sayqz',
    search3: (keyword, limit) =>
      sayqzHandler.search3BySource(keyword, limit, pickSayqzSearchSource()),
  },
];

const SEARCH_PROVIDER_COOLDOWN_MS = 60_000;
let searchProviderCursor = 0;
const searchProviderCooldownUntil = new Map<MusicPlatform, number>();

function normalizeSearchKeyword(value: string): string {
  return value
    .trim()
    .replaceAll('（', '(')
    .replaceAll('）', ')')
    .replace(/\s+/g, '')
    .toLowerCase();
}

function isTitleContainsKeyword(title: string, keyword: string): boolean {
  const normalizedTitle = normalizeSearchKeyword(title);
  if (!normalizedTitle) return false;
  const normalizedKeyword = normalizeSearchKeyword(keyword);
  if (!normalizedKeyword) return false;
  return normalizedTitle.includes(normalizedKeyword);
}

function hasAnyTitleContainsKeyword(
  tracks: MusicTrack[],
  keyword: string
): boolean {
  for (const track of tracks) {
    if (isTitleContainsKeyword(track.title, keyword)) return true;
  }
  return false;
}

function getProviderOrder(): SearchProvider[] {
  const n = SEARCH_PROVIDERS.length;
  if (n <= 1) return SEARCH_PROVIDERS;

  const start = ((searchProviderCursor % n) + n) % n;
  searchProviderCursor = (searchProviderCursor + 1) % n;

  return [
    ...SEARCH_PROVIDERS.slice(start),
    ...SEARCH_PROVIDERS.slice(0, start),
  ];
}

function isProviderAvailable(provider: SearchProvider): boolean {
  const until = searchProviderCooldownUntil.get(provider.id) ?? 0;
  return Date.now() >= until;
}

function markProviderCooldown(provider: SearchProvider) {
  searchProviderCooldownUntil.set(
    provider.id,
    Date.now() + SEARCH_PROVIDER_COOLDOWN_MS
  );
}

async function searchAllMusicTracksViaHandlers(
  keyword: string,
  limit: number
): Promise<MusicTrack[]> {
  const target = clampLimit(limit);
  const preferred = getProviderOrder().filter(isProviderAvailable);
  const provider = preferred[0] ?? SEARCH_PROVIDERS[0];

  let tracks: MusicTrack[] = [];
  try {
    tracks = await provider.search3(keyword, target);
  } catch {
    markProviderCooldown(provider);
    tracks = [];
  }

  // 如果没有“标题包含关键字”的歌曲，就只用 sayqz 的 qq 源再搜一次。
  if (!hasAnyTitleContainsKeyword(tracks, keyword)) {
    return await sayqzHandler.search3BySource(keyword, target, 'qq');
  }

  return tracks;
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
  const tracks = await searchAllMusicTracksViaHandlers(keyword, limit);
  const defaultCoverArt = new URL(
    '/logo.png',
    getPublicOrigin(request)
  ).toString();

  return tracks.map((track) => {
    const coverArt = track.cover || defaultCoverArt;
    const song = {
      id: track.uid,
      isDir: false as const,
      title: track.title,
      artist: track.artist,
      coverArt,
    };

    return song;
  });
}

export async function GET(
  request: NextRequest,
  context: { params: { action: string } }
) {
  const action = context.params.action;

  // getOpenSubsonicExtensions
  if (action === 'getOpenSubsonicExtensions') {
    return await withRestCache(request, async () =>
      subsonicOk({
        serverVersion: '0.0.0',
        openSubsonicExtensions: [],
      })
    );
  }

  // ping
  if (action === 'ping') {
    const { searchParams } = new URL(request.url);
    const username = searchParams.get('u');
    const password = searchParams.get('p');
    const valid = await isValidViaLogin(request, username, password);

    if (!valid) {
      return subsonicFailed('Invalid username or password');
    }

    return await withRestCache(request, async () =>
      subsonicOk({
        version: '1.16.1',
        type: 'AginMusicAdapter',
        serverVersion: '0.0.0',
      })
    );
  }

  // search3
  if (action === 'search3') {
    const { searchParams } = new URL(request.url);

    const username = searchParams.get('u');
    const password = searchParams.get('p');
    const valid = await isValidViaLogin(request, username, password);

    if (!valid) {
      return subsonicFailed('Invalid username or password');
    }

    const keyword = (searchParams.get('query') ?? '').trim();
    return await withRestCache(request, async () => {
      if (!keyword || keyword.length <= 1) {
        return subsonicOk({
          searchResult3: {
            album: [],
            artist: [],
            song: [],
          },
        });
      }

      const songOffset = Math.max(0, toInt(searchParams.get('songOffset'), 0));
      const songCount = clampInt(
        toInt(searchParams.get('songCount'), 20),
        0,
        50
      );

      const fetchLimit = clampInt(songCount + songOffset, 1, 50);
      const allSongs = await searchSongsViaMusicApi(
        request,
        keyword,
        fetchLimit
      );
      // const songs = allSongs.slice(songOffset, songOffset + songCount);

      return subsonicOk({
        searchResult3: {
          album: [],
          artist: [],
          song: allSongs,
        },
      });
    });
  }

  // getSong
  if (action === 'getSong') {
    const { searchParams } = new URL(request.url);
    const username = searchParams.get('u');
    const password = searchParams.get('p');
    const valid = await isValidViaLogin(request, username, password);
    if (!valid) return subsonicFailed('Invalid username or password');

    const id = searchParams.get('id');
    if (!id) return subsonicFailed('Missing id');

    const parsed = parseRestPlatformId(id);
    if (!parsed) return subsonicFailed('Invalid id');

    return await withRestCache(request, async () => {
      const defaultCoverArt = new URL(
        '/logo.png',
        getPublicOrigin(request)
      ).toString();

      if (parsed.platform === 'fangpi') {
        const song = await fangpiHandler.getSong(id);
        if (!song) return subsonicFailed('Song not found');

        return subsonicOk({
          song: {
            id,
            isDir: false,
            title: song.title,
            artist: song.artist,
            album: song.album,
            coverArt: song.coverArt || defaultCoverArt,
          },
        });
      }

      if (parsed.platform === 'jywav') {
        const song = await jywavHandler.getSong(id);
        if (!song) return subsonicFailed('Song not found');

        return subsonicOk({
          song: {
            id,
            isDir: false,
            title: song.title,
            artist: song.artist,
            album: song.album,
            coverArt: song.coverArt || defaultCoverArt,
          },
        });
      }

      if (parsed.platform === 'sayqz') {
        const song = await sayqzHandler.getSong(id);
        if (!song) return subsonicFailed('Song not found');
        return subsonicOk({
          song: {
            id,
            isDir: false,
            title: song.title,
            artist: song.artist,
            album: song.album,
            coverArt: song.coverArt || defaultCoverArt,
          },
        });
      }

      const keywordFallback = (searchParams.get('query') ?? '').trim();
      const song = await cggHandler.getSong(id, null, keywordFallback);
      if (!song) return subsonicFailed('Song not found');

      return subsonicOk({
        song: {
          id,
          isDir: false,
          title: song.title,
          artist: song.artist,
          album: song.album,
          coverArt: song.coverArt || defaultCoverArt,
        },
      });
    });
  }

  // stream
  if (action === 'stream') {
    const { searchParams } = new URL(request.url);
    const username = searchParams.get('u');
    const password = searchParams.get('p');
    const valid = await isValidViaLogin(request, username, password);
    if (!valid) return subsonicFailed('Invalid username or password');

    const id = searchParams.get('id');
    if (!id) return subsonicFailed('Missing id');

    const parsed = parseRestPlatformId(id);
    if (!parsed) return subsonicFailed('Invalid id');

    return await withRestCache(request, async () => {
      if (parsed.platform === 'fangpi') {
        const location = await fangpiHandler.stream(id);
        if (!location) return subsonicFailed('Stream url not found');
        return NextResponse.redirect(location, 307);
      }

      if (parsed.platform === 'jywav') {
        const location = await jywavHandler.stream(id);
        if (!location) return subsonicFailed('Stream url not found');
        return NextResponse.redirect(location, 307);
      }

      if (parsed.platform === 'sayqz') {
        const location = await sayqzHandler.stream(id);
        if (!location) return subsonicFailed('Stream url not found');
        return NextResponse.redirect(location, 307);
      }

      const keywordFallback = (searchParams.get('query') ?? '').trim();
      const url = await cggHandler.stream(id, null, keywordFallback);
      if (!url) return subsonicFailed('Stream url not found');
      return NextResponse.redirect(url, 307);
    });
  }

  // getLyricsBySongId
  if (action === 'getLyricsBySongId') {
    const { searchParams } = new URL(request.url);
    const username = searchParams.get('u');
    const password = searchParams.get('p');
    const valid = await isValidViaLogin(request, username, password);
    if (!valid) return subsonicFailed('Invalid username or password');

    const id = searchParams.get('id');
    if (!id) return subsonicFailed('Missing id');

    const parsed = parseRestPlatformId(id);
    if (!parsed) return subsonicFailed('Invalid id');

    return await withRestCache(request, async () => {
      let lrc: string | null = null;
      if (parsed.platform === 'fangpi') {
        lrc = await fangpiHandler.getLyricsBySongId(id);
      } else if (parsed.platform === 'jywav') {
        lrc = await jywavHandler.getLyricsBySongId(id);
      } else if (parsed.platform === 'sayqz') {
        lrc = await sayqzHandler.getLyricsBySongId(id);
      } else {
        const keywordFallback = (searchParams.get('query') ?? '').trim();
        lrc = await cggHandler.getLyricsBySongId(id, null, keywordFallback);
      }

      const structured = lrc ? lrcToStructuredLyrics(lrc) : null;
      if (!structured || structured.line.length === 0) return subsonicOk({});

      const structuredLyrics: StructuredLyrics[] = [
        { lang: 'zh', synced: structured.synced, line: structured.line },
      ];

      return subsonicOk({
        lyricsList: { structuredLyrics },
      });
    });
  }

  // getPlaylists
  if (action === 'getPlaylists') {
    const { searchParams } = new URL(request.url);
    const username = searchParams.get('u');
    const password = searchParams.get('p');
    const valid = await isValidViaLogin(request, username, password);
    if (!valid) return subsonicFailed('Invalid username or password');

    return await withRestCache(request, async () => {
      const defaultCoverArt = new URL(
        '/logo.png',
        getPublicOrigin(request)
      ).toString();

      const playlist = await sayqzHandler.getPlaylists();

      const fallbackIso = new Date().toISOString();
      const normalized = playlist.map((it) => ({
        id: it.id,
        name: it.name,
        coverArt: it.coverArt || defaultCoverArt,
        songCount: it.songCount,
        duration: it.duration,
        created: it.created || fallbackIso,
        changed: it.changed || fallbackIso,
      }));

      return subsonicOk({
        playlists: { playlist: normalized },
      });
    });
  }

  // getPlaylist
  if (action === 'getPlaylist') {
    const { searchParams } = new URL(request.url);
    const username = searchParams.get('u');
    const password = searchParams.get('p');
    const valid = await isValidViaLogin(request, username, password);
    if (!valid) return subsonicFailed('Invalid username or password');

    const id = (searchParams.get('id') ?? '').trim();
    if (!id) return subsonicFailed('Missing id');

    const parsed = parseRestPlatformId(id);
    if (!parsed || parsed.platform !== 'sayqz')
      return subsonicFailed('Invalid playlist id');

    return await withRestCache(request, async () => {
      const detail = await sayqzHandler.getPlaylist(id);
      if (!detail) return subsonicFailed('Playlist not found');

      const fallbackIso = new Date().toISOString();
      const defaultCoverArt = new URL(
        '/logo.png',
        getPublicOrigin(request)
      ).toString();

      const coverArt = detail.coverArt || defaultCoverArt;
      const created = detail.created || fallbackIso;
      const changed = detail.changed || fallbackIso;
      const entry = detail.entry.map((it) => ({
        ...it,
        coverArt: it.coverArt || coverArt,
      }));

      return subsonicOk({
        playlist: {
          ...detail,
          coverArt,
          songCount: Math.max(detail.songCount, entry.length),
          created,
          changed,
          entry,
        },
      });
    });
  }

  return NextResponse.json({ error: 'Not Found' }, { status: 404 });
}
