import { fetchJson, fetchText } from './shared';
import type { MusicTrack } from './types';

type SayqzSource = 'qq' | 'kuwo';

export function sayqzPicUrl(source: SayqzSource, id: string): string {
  return `https://music-dl.sayqz.com/api/?source=${encodeURIComponent(
    source
  )}&id=${encodeURIComponent(id)}&type=pic`;
}

export async function fetchSayqzInfo(
  source: SayqzSource,
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

export async function searchSayqz(
  keyword: string,
  limit: number,
  source: SayqzSource
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

    const uid = `${source}-${id}`;
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

export async function resolveSayqzStreamLocation(
  source: SayqzSource,
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

export async function fetchSayqzLyrics(
  source: SayqzSource,
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
