import {
  fetchSayqzInfo,
  fetchSayqzLyrics,
  resolveSayqzStreamLocation,
  sayqzPicUrl,
  searchSayqz,
} from './sayqz';
import type { RestSongInfo } from './types';

export async function search3(keyword: string, limit: number) {
  return searchSayqz(keyword, limit, 'kuwo');
}

export async function getSong(rawId: string): Promise<RestSongInfo> {
  const info = await fetchSayqzInfo('kuwo', rawId);

  return {
    title: info?.name || '',
    artist: info?.artist || '',
    album: info?.album || '',
    coverArt: info?.pic || sayqzPicUrl('kuwo', rawId),
  };
}

export async function stream(rawId: string): Promise<string | null> {
  const info = await fetchSayqzInfo('kuwo', rawId);
  if (info?.url) return info.url;
  return resolveSayqzStreamLocation('kuwo', rawId);
}

export async function getLyricsBySongId(rawId: string): Promise<string | null> {
  return fetchSayqzLyrics('kuwo', rawId);
}
