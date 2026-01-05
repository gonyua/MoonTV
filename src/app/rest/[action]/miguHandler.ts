import { fetchJson, fetchText } from './shared';
import type { MusicTrack, MusicTrackDetail, RestSongInfo } from './types';

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

export async function search3(
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
    const uid = `migu-${n}-${keyword}`;
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

export async function getSong(
  rawId: string,
  cached?: CachedSong | null,
  keywordFallback?: string | null
): Promise<RestSongInfo | null> {
  const parsed = parseMiguRawId(rawId);
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
  rawId: string,
  cached?: CachedSong | null,
  keywordFallback?: string | null
): Promise<string | null> {
  const parsed = parseMiguRawId(rawId);
  if (!parsed) return null;

  const keyword = cached?.keyword || parsed.keyword || keywordFallback?.trim();
  if (!keyword) return null;

  const detail = await getMiguDetail(keyword, parsed.n);
  return detail?.audioUrl || null;
}

export async function getLyricsBySongId(
  rawId: string,
  cached?: CachedSong | null,
  keywordFallback?: string | null
): Promise<string | null> {
  const parsed = parseMiguRawId(rawId);
  if (!parsed) return null;

  const keyword = cached?.keyword || parsed.keyword || keywordFallback?.trim();
  if (!keyword) return null;

  const detail = await getMiguDetail(keyword, parsed.n);
  return detail?.lrc || null;
}
