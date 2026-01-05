import {
  fetchSayqzInfo,
  fetchSayqzLyrics,
  resolveSayqzStreamLocation,
  sayqzPicUrl,
  searchSayqz,
} from './sayqz';
import type { RestSongInfo } from './types';

export async function search3(keyword: string, limit: number) {
  return searchSayqz(keyword, limit, 'qq');
}

export async function getSong(rawId: string): Promise<RestSongInfo> {
  const info = await fetchSayqzInfo('qq', rawId);

  return {
    title: info?.name || '',
    artist: info?.artist || '',
    album: info?.album || '',
    coverArt: info?.pic || sayqzPicUrl('qq', rawId),
  };
}

export async function stream(rawId: string): Promise<string | null> {
  const info = await fetchSayqzInfo('qq', rawId);
  if (info?.url) return info.url;
  return resolveSayqzStreamLocation('qq', rawId);
}

export async function getLyricsBySongId(rawId: string): Promise<string | null> {
  return fetchSayqzLyrics('qq', rawId);
}
