import { fetchJson, fetchText } from './shared';
import type {
  MusicTrack,
  RestPlaylistDetail,
  RestPlaylistInfo,
  RestSongInfo,
} from './types';

const PLATFORM = 'sayqz' as const;

export type SayqzHandlerSource = 'netease' | 'kuwo' | 'qq';

const DEFAULT_SOURCES: SayqzHandlerSource[] = ['netease', 'kuwo', 'qq'];

function isSayqzSource(value: string): value is SayqzHandlerSource {
  return value === 'qq' || value === 'kuwo' || value === 'netease';
}

function parseSayqzId(
  value: string
): { source: SayqzHandlerSource; rawId: string } | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const [platform, source, ...rest] = trimmed.split('-');
  if (platform !== PLATFORM) return null;
  if (!source || !isSayqzSource(source)) return null;

  const rawId = rest.join('-').trim();
  if (!rawId) return null;

  return { source, rawId };
}

export async function search3(
  keyword: string,
  limit: number
): Promise<MusicTrack[]> {
  const tasks = DEFAULT_SOURCES.map((source) =>
    searchSayqz(keyword, limit, source)
  );
  const settled = await Promise.allSettled(tasks);

  const merged: MusicTrack[] = [];
  for (const res of settled) {
    if (res.status !== 'fulfilled') continue;
    merged.push(...res.value);
  }

  return merged;
}

export async function getSong(id: string): Promise<RestSongInfo | null> {
  const parsed = parseSayqzId(id);
  if (!parsed) return null;

  const info = await fetchSayqzInfo(parsed.source, parsed.rawId);

  return {
    title: info?.name || '',
    artist: info?.artist || '',
    album: info?.album || '',
    coverArt: info?.pic || sayqzPicUrl(parsed.source, parsed.rawId),
  };
}

export async function stream(id: string): Promise<string | null> {
  const parsed = parseSayqzId(id);
  if (!parsed) return null;

  const info = await fetchSayqzInfo(parsed.source, parsed.rawId);
  if (info?.url) return info.url;
  return resolveSayqzStreamLocation(parsed.source, parsed.rawId);
}

export async function getLyricsBySongId(id: string): Promise<string | null> {
  const parsed = parseSayqzId(id);
  if (!parsed) return null;
  return fetchSayqzLyrics(parsed.source, parsed.rawId);
}

export async function getPlaylists(): Promise<RestPlaylistInfo[]> {
  const tasks = DEFAULT_SOURCES.map(async (source) => {
    const toplists = await fetchSayqzToplists(source);
    const iso = toIsoOrNull(toplists?.timestamp ?? null);

    return (toplists?.list ?? []).map((it) => ({
      id: `${PLATFORM}-${source}-${it.id}`,
      name: it.name,
      coverArt: it.pic,
      songCount: guessSongCount(it.updateFrequency),
      duration: 0,
      created: iso,
      changed: iso,
    }));
  });

  const settled = await Promise.allSettled(tasks);
  return settled.flatMap((res) =>
    res.status === 'fulfilled' ? res.value : []
  );
}

export async function getPlaylist(
  id: string
): Promise<RestPlaylistDetail | null> {
  const parsed = parseSayqzId(id);
  if (!parsed) return null;

  const toplist = await fetchSayqzToplist(parsed.source, parsed.rawId);
  if (!toplist) return null;

  const toplists = await fetchSayqzToplists(parsed.source);
  const meta =
    (toplists?.list ?? []).find((it) => it.id === parsed.rawId) ?? null;
  const iso = toIsoOrNull(toplist.timestamp ?? null);

  const entry = toplist.list.map((it) => ({
    id: `${PLATFORM}-${parsed.source}-${it.id}`,
    isDir: false as const,
    title: it.name,
    artist: it.artist,
    coverArt: it.pic || sayqzPicUrl(parsed.source, it.id),
  }));

  return {
    id: `${PLATFORM}-${parsed.source}-${parsed.rawId}`,
    name: meta?.name || `Toplist ${parsed.rawId}`,
    coverArt: meta?.pic || entry[0]?.coverArt || null,
    songCount: Math.max(0, Math.trunc(toplist.total || entry.length)),
    duration: 0,
    created: iso,
    changed: iso,
    entry,
  };
}

function toIsoOrNull(value: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString();
}

function guessSongCount(updateFrequency: string | null): number {
  if (!updateFrequency) return 0;
  const m = /(\d+)\s*首/.exec(updateFrequency);
  if (!m) return 0;
  const n = Number(m[1]);
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
}

type SayqzToplistItem = {
  id: string;
  name: string;
  pic: string | null;
  updateFrequency: string | null;
  url: string | null;
};

type SayqzToplistTrackItem = {
  id: string;
  name: string;
  artist: string;
  album: string;
  pic: string | null;
  info: string | null;
  url: string | null;
  lrc: string | null;
};

async function fetchSayqzToplists(
  source: SayqzHandlerSource
): Promise<{ list: SayqzToplistItem[]; timestamp: string | null } | null> {
  const url = `https://music-dl.sayqz.com/api/?source=${encodeURIComponent(
    source
  )}&type=toplists`;
  const json = await fetchJson(url, 8000);

  const code = (json as { code?: unknown } | null)?.code;
  const data = (json as { data?: unknown } | null)?.data as
    | { list?: unknown }
    | undefined;
  if (code !== 200 || !data) return null;

  const rawList = data.list;
  if (!Array.isArray(rawList)) return { list: [], timestamp: null };

  const timestampValue = (json as { timestamp?: unknown } | null)?.timestamp;
  const timestamp =
    typeof timestampValue === 'string' && timestampValue.trim()
      ? timestampValue.trim()
      : null;

  const list = (rawList as Array<Record<string, unknown>>).flatMap((it) => {
    const id = String(it?.id ?? '').trim();
    const name = String(it?.name ?? '').trim();
    if (!id || !name) return [];

    const picValue = it?.pic;
    const updateFrequencyValue = it?.updateFrequency;
    const urlValue = it?.url;

    const item: SayqzToplistItem = {
      id,
      name,
      pic:
        typeof picValue === 'string' && picValue.trim()
          ? picValue.trim()
          : null,
      updateFrequency:
        typeof updateFrequencyValue === 'string' && updateFrequencyValue.trim()
          ? updateFrequencyValue.trim()
          : null,
      url:
        typeof urlValue === 'string' && urlValue.trim()
          ? urlValue.trim()
          : null,
    };

    return [item];
  });

  return { list, timestamp };
}

async function fetchSayqzToplist(
  source: SayqzHandlerSource,
  id: string
): Promise<{
  list: SayqzToplistTrackItem[];
  total: number;
  timestamp: string | null;
} | null> {
  const trimmedId = id.trim();
  if (!trimmedId) return null;

  const url = `https://music-dl.sayqz.com/api/?source=${encodeURIComponent(
    source
  )}&id=${encodeURIComponent(trimmedId)}&type=toplist`;
  const json = await fetchJson(url, 8000);

  const code = (json as { code?: unknown } | null)?.code;
  const data = (json as { data?: unknown } | null)?.data as
    | { list?: unknown; total?: unknown }
    | undefined;
  if (code !== 200 || !data) return null;

  const timestampValue = (json as { timestamp?: unknown } | null)?.timestamp;
  const timestamp =
    typeof timestampValue === 'string' && timestampValue.trim()
      ? timestampValue.trim()
      : null;

  const totalValue = data.total;
  const totalRaw = typeof totalValue === 'number' ? totalValue : Number.NaN;
  const total = Number.isFinite(totalRaw)
    ? Math.max(0, Math.trunc(totalRaw))
    : 0;

  const rawList = data.list;
  if (!Array.isArray(rawList)) return { list: [], total, timestamp };

  const list = (rawList as Array<Record<string, unknown>>).flatMap((it) => {
    const trackId = String(it?.id ?? '').trim();
    const name = String(it?.name ?? '').trim();
    if (!trackId || !name) return [];

    const artist = String(it?.artist ?? '').trim();
    const album = String(it?.album ?? '').trim();

    const infoValue = it?.info;
    const urlValue = it?.url;
    const picValue = it?.pic;
    const lrcValue = it?.lrc;

    const item: SayqzToplistTrackItem = {
      id: trackId,
      name,
      artist,
      album,
      pic:
        typeof picValue === 'string' && picValue.trim()
          ? picValue.trim()
          : null,
      info:
        typeof infoValue === 'string' && infoValue.trim()
          ? infoValue.trim()
          : null,
      url:
        typeof urlValue === 'string' && urlValue.trim()
          ? urlValue.trim()
          : null,
      lrc:
        typeof lrcValue === 'string' && lrcValue.trim()
          ? lrcValue.trim()
          : null,
    };

    return [item];
  });

  return { list, total: Math.max(total, list.length), timestamp };
}

function sayqzPicUrl(source: SayqzHandlerSource, id: string): string {
  return `https://music-dl.sayqz.com/api/?source=${encodeURIComponent(
    source
  )}&id=${encodeURIComponent(id)}&type=pic`;
}

async function fetchSayqzInfo(
  source: SayqzHandlerSource,
  id: string
): Promise<{
  name: string;
  artist: string;
  album: string;
  url: string | null;
  pic: string | null;
  lrc: string | null;
} | null> {
  const url = `https://music-dl.sayqz.com/api/?source=${encodeURIComponent(
    source
  )}&id=${encodeURIComponent(id)}&type=info`;
  const json = await fetchJson(url, 8000);

  type SayqzInfoData = {
    name?: unknown;
    artist?: unknown;
    album?: unknown;
    url?: unknown;
    pic?: unknown;
    lrc?: unknown;
  };

  const code = (json as { code?: unknown } | null)?.code;
  const data = (json as { data?: unknown } | null)?.data as
    | SayqzInfoData
    | undefined;
  if (code !== 200 || !data) return null;

  const urlValue = data.url;
  const picValue = data.pic;
  const lrcValue = data.lrc;

  return {
    name: String(data.name ?? ''),
    artist: String(data.artist ?? ''),
    album: String(data.album ?? ''),
    url:
      typeof urlValue === 'string' && urlValue.trim() ? urlValue.trim() : null,
    pic:
      typeof picValue === 'string' && picValue.trim() ? picValue.trim() : null,
    lrc:
      typeof lrcValue === 'string' && lrcValue.trim() ? lrcValue.trim() : null,
  };
}

async function searchSayqz(
  keyword: string,
  limit: number,
  source: SayqzHandlerSource
): Promise<MusicTrack[]> {
  const url = `https://music-dl.sayqz.com/api?&type=search&keyword=${encodeURIComponent(
    keyword
  )}&source=${encodeURIComponent(source)}&limit=${encodeURIComponent(limit)}`;
  const json = await fetchJson(url, 8000);

  type SayqzSearchItem = {
    id?: string | number;
    name?: string;
    artist?: string;
    album?: string;
    url?: string;
    pic?: string;
    lrc?: string;
  };
  const code = (json as { code?: unknown } | null)?.code;
  const results = (json as { data?: { results?: unknown } } | null)?.data
    ?.results;
  if (code !== 200 || !Array.isArray(results)) return [];

  return (results as SayqzSearchItem[]).slice(0, limit).flatMap((it) => {
    const id = String(it?.id ?? '');
    if (!id) return [];

    const uid = `${PLATFORM}-${source}-${id}`;
    const track: MusicTrack = {
      uid,
      source,
      displayIndex: 0,
      keyword,
      songid: id,
      title: String(it?.name ?? ''),
      artist: String(it?.artist ?? ''),
      album: String(it?.album ?? ''),
      cover: it?.pic ? String(it.pic) : null,
      audioUrl: null,
      lrc: null,
      lrcUrl: it?.lrc ? String(it.lrc) : null,
      detailsLoaded: false,
      quality: 'normal',
    };
    return [track];
  });
}

async function resolveSayqzStreamLocation(
  source: SayqzHandlerSource,
  id: string
): Promise<string | null> {
  const first = await fetch(
    `https://music-dl.sayqz.com/api/?source=${encodeURIComponent(
      source
    )}&id=${encodeURIComponent(id)}&type=url`,
    { redirect: 'manual' }
  );

  return first.headers.get('location');
}

async function fetchSayqzLyrics(
  source: SayqzHandlerSource,
  id: string
): Promise<string | null> {
  const url = `https://music-dl.sayqz.com/api/?source=${encodeURIComponent(
    source
  )}&id=${encodeURIComponent(id)}&type=lrc`;
  const text = await fetchText(url, 8000);
  if (!text) return null;

  const trimmed = text.replace(/^\uFEFF/, '').trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('{')) {
    try {
      const json = JSON.parse(trimmed) as {
        lrc?: unknown;
        data?: { lrc?: unknown };
      } | null;
      const lrc = (json as { data?: { lrc?: unknown } } | null)?.data?.lrc;
      const topLevel = (json as { lrc?: unknown } | null)?.lrc;
      const candidate = typeof lrc === 'string' ? lrc : topLevel;
      return typeof candidate === 'string' && candidate.trim()
        ? candidate.trim()
        : null;
    } catch {
      return null;
    }
  }

  return trimmed;
}
