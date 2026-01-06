import { fetchJson, fetchText } from './shared';
import type { MusicTrack, MusicTrackDetail, RestSongInfo } from './types';

const PLATFORM = 'cgg' as const;

type CggSource = 'migu' | 'netease';
const DEFAULT_SOURCES: CggSource[] = ['netease', 'migu'];

function isCggSource(value: string): value is CggSource {
  return value === 'migu' || value === 'netease';
}

function parseCggId(
  value: string
): { source: CggSource; rawId: string } | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const [platform, source, ...rest] = trimmed.split('-');
  if (platform !== PLATFORM) return null;
  if (!source || !isCggSource(source)) return null;

  const rawId = rest.join('-').trim();
  if (!rawId) return null;

  return { source, rawId };
}

type CachedSong = {
  title: string;
  artist: string;
  album: string;
  coverArt: string;
  keyword?: string;
};

function normalizeMiguUrl(url: string | null): string | null {
  if (!url) return null;
  if (!url.startsWith('http://')) return url;
  try {
    const parsed = new URL(url);
    if (parsed.hostname.endsWith('.migu.cn')) {
      parsed.protocol = 'https:';
      return parsed.toString();
    }
  } catch {
    // ignore
  }
  return url;
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

async function searchMigu(
  keyword: string,
  limit: number
): Promise<MusicTrack[]> {
  const url = `https://api-v1.cenguigui.cn/api/music/mgmusic_lingsheng.php?msg=${encodeURIComponent(
    keyword
  )}&limit=${encodeURIComponent(limit)}&n=`;
  const json = await fetchJson(url, 8000);

  type MiguSearchItem = { n?: number; title?: string; singer?: string };
  const code = (json as { code?: unknown } | null)?.code;
  const data = (json as { data?: unknown } | null)?.data;
  if (code !== 200 || !Array.isArray(data)) return [];

  return (data as MiguSearchItem[]).slice(0, limit).map((it) => {
    const n = Number(it?.n) || 0;
    const title = String(it?.title ?? '');
    const artist = String(it?.singer ?? '');
    const uid = `${PLATFORM}-migu-${n}-${keyword}`;
    const track: MusicTrack = {
      uid,
      source: 'migu',
      displayIndex: n,
      keyword,
      title,
      artist,
      album: '',
      cover: null,
      audioUrl: null,
      lrc: null,
      lrcUrl: null,
      detailsLoaded: false,
      quality: 'normal',
    };
    return track;
  });
}

async function getMiguDetail(
  keyword: string,
  n: number
): Promise<MusicTrackDetail | null> {
  const url = `https://api-v1.cenguigui.cn/api/mg_music/?msg=${encodeURIComponent(
    keyword
  )}&n=${encodeURIComponent(n)}&type=json&br=1`;
  const json = await fetchJson(url, 12000);
  type MiguDetailData = {
    title?: string;
    singer?: string;
    cover?: string;
    music_url?: string;
    lrc_url?: string;
  };
  const code = (json as { code?: unknown } | null)?.code;
  const data = (json as { data?: unknown } | null)?.data as
    | MiguDetailData
    | undefined;
  if (code !== 200 || !data) return null;

  const lrcUrl = data.lrc_url ? String(data.lrc_url) : null;
  const lrc = lrcUrl ? await fetchText(lrcUrl, 8000) : null;

  return {
    title: String(data.title ?? ''),
    artist: String(data.singer ?? ''),
    album: '',
    cover: data.cover ? String(data.cover) : null,
    audioUrl: normalizeMiguUrl(data.music_url ? String(data.music_url) : null),
    lrcUrl,
    lrc,
    detailsLoaded: true,
    quality: 'normal',
  };
}

async function searchNetease(
  keyword: string,
  limit: number
): Promise<MusicTrack[]> {
  const url = `https://api-v1.cenguigui.cn/api/music/netease/WyY_Dg.php?type=json&msg=${encodeURIComponent(
    keyword
  )}&num=${encodeURIComponent(limit)}&n=`;
  const json = await fetchJson(url, 8000);

  type NeteaseSearchItem = {
    n?: number;
    title?: string;
    singer?: string;
    songid?: number;
  };
  const code = (json as { code?: unknown } | null)?.code;
  const data = (json as { data?: unknown } | null)?.data;
  if (code !== 200 || !Array.isArray(data)) return [];

  return (data as NeteaseSearchItem[]).slice(0, limit).flatMap((it) => {
    const songid = it?.songid;
    if (songid === undefined || songid === null) return [];

    const uid = `${PLATFORM}-netease-${songid}`;
    const track: MusicTrack = {
      uid,
      source: 'netease',
      displayIndex: Number(it?.n) || 0,
      keyword,
      songid,
      title: String(it?.title ?? ''),
      artist: String(it?.singer ?? ''),
      album: '',
      cover: null,
      audioUrl: null,
      lrc: null,
      lrcUrl: null,
      detailsLoaded: false,
      quality: 'lossless',
    };
    return [track];
  });
}

async function getNeteaseDetail(id: string): Promise<MusicTrackDetail | null> {
  const url = `https://api.cenguigui.cn/api/netease/music_v1.php?id=${encodeURIComponent(
    id
  )}&type=json&level=lossless`;
  const json = await fetchJson(url, 12000);
  type NeteaseDetailData = {
    name?: string;
    artist?: string;
    album?: string;
    pic?: string;
    url?: string;
    lyric?: string;
    format?: string;
  };
  const code = (json as { code?: unknown } | null)?.code;
  const data = (json as { data?: unknown } | null)?.data as
    | NeteaseDetailData
    | undefined;
  if (code !== 200 || !data) return null;

  const format = String(data.format ?? '');
  return {
    title: String(data.name ?? ''),
    artist: String(data.artist ?? ''),
    album: String(data.album ?? ''),
    cover: data.pic ? String(data.pic) : null,
    audioUrl: data.url ? String(data.url) : null,
    lrcUrl: null,
    lrc: data.lyric ? String(data.lyric) : null,
    detailsLoaded: true,
    quality: format.includes('无损') ? 'lossless' : 'normal',
  };
}

export async function search3(
  keyword: string,
  limit: number
): Promise<MusicTrack[]> {
  const tasks = DEFAULT_SOURCES.map((source) =>
    source === 'migu'
      ? searchMigu(keyword, limit)
      : searchNetease(keyword, limit)
  );
  const settled = await Promise.allSettled(tasks);

  const merged: MusicTrack[] = [];
  for (const res of settled) {
    if (res.status !== 'fulfilled') continue;
    merged.push(...res.value);
  }

  return merged;
}

export async function getSong(
  id: string,
  cached?: CachedSong | null,
  keywordFallback?: string | null
): Promise<RestSongInfo | null> {
  const parsedId = parseCggId(id);
  if (!parsedId) return null;

  if (parsedId.source === 'netease') {
    const detail = await getNeteaseDetail(parsedId.rawId);
    if (!detail && !cached) return null;

    return {
      title: detail?.title || cached?.title || '',
      artist: detail?.artist || cached?.artist || '',
      album: detail?.album || cached?.album || '',
      coverArt: detail?.cover || cached?.coverArt || null,
    };
  }

  const parsed = parseMiguRawId(parsedId.rawId);
  if (!parsed) return null;

  const keyword = cached?.keyword || parsed.keyword || keywordFallback?.trim();
  if (!keyword) return cached ? { ...cached, coverArt: cached.coverArt } : null;

  const detail = await getMiguDetail(keyword, parsed.n);
  if (!detail && !cached) return null;

  return {
    title: detail?.title || cached?.title || '',
    artist: detail?.artist || cached?.artist || '',
    album: detail?.album || cached?.album || '',
    coverArt: detail?.cover || cached?.coverArt || null,
  };
}

export async function stream(
  id: string,
  cached?: CachedSong | null,
  keywordFallback?: string | null
): Promise<string | null> {
  const parsedId = parseCggId(id);
  if (!parsedId) return null;

  if (parsedId.source === 'netease') {
    const detail = await getNeteaseDetail(parsedId.rawId);
    return detail?.audioUrl || null;
  }

  const parsed = parseMiguRawId(parsedId.rawId);
  if (!parsed) return null;

  const keyword = cached?.keyword || parsed.keyword || keywordFallback?.trim();
  if (!keyword) return null;

  const detail = await getMiguDetail(keyword, parsed.n);
  return detail?.audioUrl || null;
}

export async function getLyricsBySongId(
  id: string,
  cached?: CachedSong | null,
  keywordFallback?: string | null
): Promise<string | null> {
  const parsedId = parseCggId(id);
  if (!parsedId) return null;

  if (parsedId.source === 'netease') {
    const detail = await getNeteaseDetail(parsedId.rawId);
    return detail?.lrc || null;
  }

  const parsed = parseMiguRawId(parsedId.rawId);
  if (!parsed) return null;

  const keyword = cached?.keyword || parsed.keyword || keywordFallback?.trim();
  if (!keyword) return null;

  const detail = await getMiguDetail(keyword, parsed.n);
  return detail?.lrc || null;
}
