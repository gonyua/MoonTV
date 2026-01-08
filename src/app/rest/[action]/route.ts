import { NextRequest, NextResponse } from 'next/server';

import * as cggHandler from './cggHandler';
import * as fangpiHandler from './fangpiHandler';
import * as jywavHandler from './jywavHandler';
import * as sayqzHandler from './sayqzHandler';
import { clampLimit } from './shared';
import type { MusicTrack } from './types';
import {
  importNeteaseLikesToD1,
  listMusicLikesFromD1,
} from '../netease/likesImport';
import * as neteaseHandler from '../netease/neteaseHandler';

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

type ParsedSongIdParam = {
  id: string;
  isXxSongId: boolean;
  xxKeyword: string;
  initialParsed: ReturnType<typeof parseRestPlatformId> | null;
};

function parseSongIdParam(
  rawId: string | null
):
  | { ok: true; value: ParsedSongIdParam }
  | { ok: false; response: NextResponse } {
  const id = (rawId ?? '').trim();
  if (!id) return { ok: false, response: subsonicFailed('Missing id') };

  const idParts = id.split('-').filter(Boolean);
  const isXxSongId = idParts[0] === 'xx';
  const xxKeyword = isXxSongId ? (idParts.at(-1) ?? '').trim() : '';
  if (isXxSongId && !xxKeyword)
    return { ok: false, response: subsonicFailed('Invalid id') };

  const initialParsed = isXxSongId ? null : parseRestPlatformId(id);
  if (!isXxSongId && !initialParsed)
    return { ok: false, response: subsonicFailed('Invalid id') };

  return { ok: true, value: { id, isXxSongId, xxKeyword, initialParsed } };
}

async function resolveSongId(
  parsedParam: ParsedSongIdParam,
  onNotFound: () => NextResponse
): Promise<
  | {
      ok: true;
      resolvedId: string;
      parsed: NonNullable<ReturnType<typeof parseRestPlatformId>>;
    }
  | { ok: false; response: NextResponse }
> {
  let resolvedId = parsedParam.id;
  let parsed = parsedParam.initialParsed;

  if (parsedParam.isXxSongId) {
    const tracks = await searchAllMusicTracksViaHandlers(
      parsedParam.xxKeyword,
      10
    );
    const first = tracks[0];
    if (!first?.uid) return { ok: false, response: onNotFound() };

    resolvedId = first.uid;
    parsed = parseRestPlatformId(resolvedId);
  }

  if (!parsed) return { ok: false, response: onNotFound() };

  return { ok: true, resolvedId, parsed };
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

    const parsedParamResult = parseSongIdParam(searchParams.get('id'));
    if (!parsedParamResult.ok) return parsedParamResult.response;
    const { id } = parsedParamResult.value;

    return await withRestCache(request, async () => {
      const defaultCoverArt = new URL(
        '/logo.png',
        getPublicOrigin(request)
      ).toString();

      const resolvedResult = await resolveSongId(parsedParamResult.value, () =>
        subsonicFailed('Song not found')
      );
      if (!resolvedResult.ok) return resolvedResult.response;
      const { resolvedId, parsed } = resolvedResult;

      if (parsed.platform === 'fangpi') {
        const song = await fangpiHandler.getSong(resolvedId);
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
        const song = await jywavHandler.getSong(resolvedId);
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
        const song = await sayqzHandler.getSong(resolvedId);
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
      const song = await cggHandler.getSong(resolvedId, null, keywordFallback);
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

    const parsedParamResult = parseSongIdParam(searchParams.get('id'));
    if (!parsedParamResult.ok) return parsedParamResult.response;

    return await withRestCache(request, async () => {
      const resolvedResult = await resolveSongId(parsedParamResult.value, () =>
        subsonicFailed('Stream url not found')
      );
      if (!resolvedResult.ok) return resolvedResult.response;
      const { resolvedId, parsed } = resolvedResult;

      if (parsed.platform === 'fangpi') {
        const location = await fangpiHandler.stream(resolvedId);
        if (!location) return subsonicFailed('Stream url not found');
        return NextResponse.redirect(location, 307);
      }

      if (parsed.platform === 'jywav') {
        const location = await jywavHandler.stream(resolvedId);
        if (!location) return subsonicFailed('Stream url not found');
        return NextResponse.redirect(location, 307);
      }

      if (parsed.platform === 'sayqz') {
        const location = await sayqzHandler.stream(resolvedId);
        if (!location) return subsonicFailed('Stream url not found');
        return NextResponse.redirect(location, 307);
      }

      const keywordFallback = (searchParams.get('query') ?? '').trim();
      const url = await cggHandler.stream(resolvedId, null, keywordFallback);
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

    const parsedParamResult = parseSongIdParam(searchParams.get('id'));
    if (!parsedParamResult.ok) return parsedParamResult.response;

    return await withRestCache(request, async () => {
      const resolvedResult = await resolveSongId(parsedParamResult.value, () =>
        subsonicOk({})
      );
      if (!resolvedResult.ok) return resolvedResult.response;
      const { resolvedId, parsed } = resolvedResult;

      let lrc: string | null = null;
      if (parsed.platform === 'fangpi') {
        lrc = await fangpiHandler.getLyricsBySongId(resolvedId);
      } else if (parsed.platform === 'jywav') {
        lrc = await jywavHandler.getLyricsBySongId(resolvedId);
      } else if (parsed.platform === 'sayqz') {
        lrc = await sayqzHandler.getLyricsBySongId(resolvedId);
      } else {
        const keywordFallback = (searchParams.get('query') ?? '').trim();
        lrc = await cggHandler.getLyricsBySongId(
          resolvedId,
          null,
          keywordFallback
        );
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
      const likeId = 'xx-like';
      const likePlaylist = {
        id: likeId,
        name: '我的喜欢',
        coverArt: defaultCoverArt,
        songCount: 1000,
        duration: 10000,
        created: '2026-01-01T00:00:00.000Z',
        changed: '2026-01-02T00:00:00.000Z',
      };
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
        playlists: { playlist: [likePlaylist, ...normalized] },
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
    if (!username) return subsonicFailed('Missing u');

    const id = (searchParams.get('id') ?? '').trim();
    if (!id) return subsonicFailed('Missing id');

    // 自定义：xx-like（喜欢列表）
    if (id === 'xx-like') {
      try {
        const likes = await listMusicLikesFromD1({ username });

        const fallbackIso = new Date().toISOString();
        const defaultCoverArt = new URL(
          '/logo.png',
          getPublicOrigin(request)
        ).toString();

        const coverArt =
          likes.find((it) => Boolean(it.cover))?.cover || defaultCoverArt;

        const times = likes.map((it) => it.saveTime).filter(Number.isFinite);
        const createdMs = times.length ? Math.min(...times) : Date.now();
        const changedMs = times.length ? Math.max(...times) : Date.now();

        const created = new Date(createdMs).toISOString();
        const changed = new Date(changedMs).toISOString();

        const entry = likes.map((it) => ({
          id: `${id}-${it.title}`,
          isDir: false as const,
          title: it.title,
          artist: it.artist,
          coverArt: it.cover || coverArt,
        }));

        return subsonicOk({
          playlist: {
            id,
            name: '喜欢的音乐',
            coverArt,
            songCount: entry.length,
            duration: 0,
            created: created || fallbackIso,
            changed: changed || fallbackIso,
            entry,
          },
        });
      } catch (err) {
        const message =
          err instanceof Error && err.message
            ? err.message
            : 'Failed to load likes';
        return subsonicFailed(message);
      }
    }

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

  // getRandomSongs
  if (action === 'getRandomSongs') {
    const { searchParams } = new URL(request.url);
    const username = searchParams.get('u');
    const password = searchParams.get('p');
    const valid = await isValidViaLogin(request, username, password);

    if (!valid) {
      return subsonicFailed('Invalid username or password');
    }

    // const size = clampInt(toInt(searchParams.get('size'), 20), 0, 200);
    const size = 50;
    return await withRestCache(request, async () => {
      const defaultCoverArt = new URL(
        '/logo.png',
        getPublicOrigin(request)
      ).toString();

      try {
        const songs = await neteaseHandler.getRandomSongs({
          size,
          defaultCoverArt,
        });

        return subsonicOk({
          randomSongs: {
            song: songs,
          },
        });
      } catch (err) {
        const message =
          err instanceof Error && err.message
            ? err.message
            : 'Failed to fetch songs';
        return subsonicFailed(message);
      }
    });
  }

  // importNeteaseLikes（自定义：网易云“喜欢的音乐/歌单”导入到 D1）
  if (action === 'importNeteaseLikes') {
    const { searchParams } = new URL(request.url);
    const username = searchParams.get('u');
    const password = searchParams.get('p');
    const valid = await isValidViaLogin(request, username, password);

    const headers = new Headers();
    headers.set('Cache-Control', 'no-store');

    if (!valid) {
      return NextResponse.json(
        { ok: false, error: 'Invalid username or password' },
        { status: 401, headers }
      );
    }
    if (!username) {
      return NextResponse.json(
        { ok: false, error: 'Missing u' },
        { status: 400, headers }
      );
    }

    // 真实的 URL 从 share 文本中解析
    const shareText = searchParams.get('share');
    if (!shareText) {
      return NextResponse.json(
        { ok: false, error: 'Missing share' },
        { status: 400, headers }
      );
    }
    const limitRaw = searchParams.get('limit');
    const limit = limitRaw ? toInt(limitRaw, 0) : null;

    try {
      const result = await importNeteaseLikesToD1({
        username,
        shareText,
        limit: limit && limit > 0 ? limit : null,
      });

      return NextResponse.json({ ok: true, ...result }, { headers });
    } catch (err) {
      const message =
        err instanceof Error && err.message ? err.message : 'Import failed';
      return NextResponse.json(
        { ok: false, error: message },
        { status: 400, headers }
      );
    }
  }

  return NextResponse.json({ error: 'Not Found' }, { status: 404 });
}
