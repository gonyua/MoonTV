import { fetchJson } from './shared';
import type { MusicTrack, MusicTrackDetail, RestSongInfo } from './types';

type CachedSong = {
  title: string;
  artist: string;
  album: string;
  coverArt: string;
};

export async function search3(
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

    const uid = `netease-${songid}`;
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

export async function getSong(
  rawId: string,
  cached?: CachedSong | null
): Promise<RestSongInfo | null> {
  const detail = await getNeteaseDetail(rawId);
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
  _cached?: CachedSong | null
): Promise<string | null> {
  const detail = await getNeteaseDetail(rawId);
  return detail?.audioUrl || null;
}

export async function getLyricsBySongId(
  rawId: string,
  _cached?: CachedSong | null
): Promise<string | null> {
  const detail = await getNeteaseDetail(rawId);
  return detail?.lrc || null;
}
