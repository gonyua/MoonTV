import { NextRequest, NextResponse } from 'next/server';

import * as fangpiHandler from './fangpiHandler';
import * as jywavHandler from './jywavHandler';
import * as kuwoHandler from './kuwoHandler';
import * as miguHandler from './miguHandler';
import * as neteaseHandler from './neteaseHandler';
import * as qqHandler from './qqHandler';
import { clampLimit } from './shared';
import type { MusicSource, MusicTrack } from './types';

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

function parseSources(value: string | null): MusicSource[] {
  const all: MusicSource[] = [
    'fangpi',
    'jywav',
    'migu',
    'netease',
    'qq',
    'kuwo',
  ];
  if (!value) return all;
  const wanted = value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const set = new Set<MusicSource>();
  for (const s of wanted) {
    if (
      s === 'fangpi' ||
      s === 'jywav' ||
      s === 'migu' ||
      s === 'netease' ||
      s === 'qq' ||
      s === 'kuwo'
    )
      set.add(s);
  }
  const out = all.filter((s) => set.has(s));
  return out.length ? out : all;
}

async function searchAllMusicTracksViaHandlers(
  keyword: string,
  limit: number,
  sourcesCsv: string | null
): Promise<MusicTrack[]> {
  const sources = parseSources(sourcesCsv);
  const perSourceLimit = clampLimit(limit);

  const tasks = sources.map(async (src) => {
    if (src === 'fangpi')
      return await fangpiHandler.search3(keyword, perSourceLimit);
    if (src === 'jywav')
      return await jywavHandler.search3(keyword, perSourceLimit);
    if (src === 'migu')
      return await miguHandler.search3(keyword, perSourceLimit);
    if (src === 'netease')
      return await neteaseHandler.search3(keyword, perSourceLimit);
    if (src === 'qq') return await qqHandler.search3(keyword, perSourceLimit);
    if (src === 'kuwo')
      return await kuwoHandler.search3(keyword, perSourceLimit);
    return [];
  });

  const settled = await Promise.allSettled(tasks);
  const merged: MusicTrack[] = [];

  for (const res of settled) {
    if (res.status !== 'fulfilled') continue;
    merged.push(...res.value);
  }

  return merged;
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
  const tracks = await searchAllMusicTracksViaHandlers(
    keyword,
    limit,
    sourcesCsv
  );
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
    return subsonicOk({
      serverVersion: '0.0.0',
      openSubsonicExtensions: [],
    });
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

    return subsonicOk({
      version: '1.16.1',
      type: 'AginMusicAdapter',
      serverVersion: '0.0.0',
    });
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
    const songCount = clampInt(toInt(searchParams.get('songCount'), 20), 0, 50);

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

  // getSong
  if (action === 'getSong') {
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

    if (parsed.source === 'fangpi') {
      const song = await fangpiHandler.getSong(parsed.rawId);
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

    if (parsed.source === 'jywav') {
      const song = await jywavHandler.getSong(parsed.rawId);
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

    if (parsed.source === 'qq' || parsed.source === 'kuwo') {
      const song =
        parsed.source === 'qq'
          ? await qqHandler.getSong(parsed.rawId)
          : await kuwoHandler.getSong(parsed.rawId);

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

    if (parsed.source === 'netease') {
      const song = await neteaseHandler.getSong(parsed.rawId);
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
    const song = await miguHandler.getSong(parsed.rawId, null, keywordFallback);
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

  // stream
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

    if (parsed.source === 'fangpi') {
      const location = await fangpiHandler.stream(parsed.rawId);
      if (!location) return subsonicFailed('Stream url not found');
      return NextResponse.redirect(location, 307);
    }

    if (parsed.source === 'jywav') {
      const location = await jywavHandler.stream(parsed.rawId);
      if (!location) return subsonicFailed('Stream url not found');
      return NextResponse.redirect(location, 307);
    }

    if (parsed.source === 'qq' || parsed.source === 'kuwo') {
      const location =
        parsed.source === 'qq'
          ? await qqHandler.stream(parsed.rawId)
          : await kuwoHandler.stream(parsed.rawId);
      if (!location) return subsonicFailed('Stream url not found');
      return NextResponse.redirect(location, 307);
    }

    if (parsed.source === 'netease') {
      const url = await neteaseHandler.stream(parsed.rawId);
      if (!url) return subsonicFailed('Stream url not found');
      return NextResponse.redirect(url, 307);
    }

    const keywordFallback = (searchParams.get('query') ?? '').trim();
    const url = await miguHandler.stream(parsed.rawId, null, keywordFallback);
    if (!url) return subsonicFailed('Stream url not found');
    return NextResponse.redirect(url, 307);
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

    const parsed = parseRestSongIdWithFangpiFallback(id);
    if (!parsed) return subsonicFailed('Invalid id');

    let lrc: string | null = null;
    if (parsed.source === 'fangpi') {
      lrc = await fangpiHandler.getLyricsBySongId(parsed.rawId);
    } else if (parsed.source === 'jywav') {
      lrc = await jywavHandler.getLyricsBySongId(parsed.rawId);
    } else if (parsed.source === 'netease') {
      lrc = await neteaseHandler.getLyricsBySongId(parsed.rawId);
    } else if (parsed.source === 'migu') {
      const keywordFallback = (searchParams.get('query') ?? '').trim();
      lrc = await miguHandler.getLyricsBySongId(
        parsed.rawId,
        null,
        keywordFallback
      );
    } else if (parsed.source === 'qq') {
      lrc = await qqHandler.getLyricsBySongId(parsed.rawId);
    } else if (parsed.source === 'kuwo') {
      lrc = await kuwoHandler.getLyricsBySongId(parsed.rawId);
    }

    const structured = lrc ? lrcToStructuredLyrics(lrc) : null;
    if (!structured || structured.line.length === 0) return subsonicOk({});

    const structuredLyrics: StructuredLyrics[] = [
      { lang: 'zh', synced: structured.synced, line: structured.line },
    ];

    return subsonicOk({
      lyricsList: { structuredLyrics },
    });
  }

  return NextResponse.json({ error: 'Not Found' }, { status: 404 });
}
