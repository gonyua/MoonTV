import { parseCookieValue, weapiPostJson } from '../weapi';

type NeteaseArtist = { name?: unknown };
type NeteaseAlbum = { picUrl?: unknown };

export type NeteaseDailyRecommendSong = {
  id?: unknown;
  name?: unknown;
  artists?: unknown;
  album?: unknown;
};

export async function fetchDailyRecommendSongs(options: {
  cookie: string;
  timeoutMs?: number;
}): Promise<{ code: number; recommend: NeteaseDailyRecommendSong[] }> {
  const csrfToken = parseCookieValue(options.cookie, '__csrf') ?? '';
  if (!csrfToken) {
    throw new Error('Missing netease __csrf in cookie');
  }

  const json = await weapiPostJson(
    '/weapi/v2/discovery/recommend/songs',
    { csrf_token: csrfToken },
    {
      cookie: options.cookie,
      csrfToken,
      referer: 'https://music.163.com/discover/recommend/taste',
      timeoutMs: options.timeoutMs ?? 12_000,
    }
  );

  if (!json || typeof json !== 'object') {
    throw new Error('Unexpected netease response');
  }

  const codeRaw = (json as { code?: unknown }).code;
  const code = Number(codeRaw);
  if (!Number.isFinite(code)) throw new Error('Unexpected netease response');
  if (code === 301) throw new Error('Netease not logged in (code=301)');

  const recommendRaw = (json as { recommend?: unknown }).recommend;
  if (!Array.isArray(recommendRaw)) {
    throw new Error('Unexpected netease response');
  }

  return {
    code,
    recommend: recommendRaw as NeteaseDailyRecommendSong[],
  };
}

export function normalizeDailyRecommendSong(
  raw: NeteaseDailyRecommendSong,
  defaultCoverArt: string
): {
  id: string;
  isDir: false;
  title: string;
  artist: string;
  coverArt: string;
} | null {
  const title = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (!title) return null;

  const artists = Array.isArray(raw.artists)
    ? (raw.artists as NeteaseArtist[])
    : [];
  const artist = artists
    .map((a) => (typeof a?.name === 'string' ? a.name.trim() : ''))
    .filter(Boolean)
    .join('/');

  const album = (
    raw.album && typeof raw.album === 'object'
      ? (raw.album as NeteaseAlbum)
      : null
  ) as NeteaseAlbum | null;
  const coverArt =
    typeof album?.picUrl === 'string' && album.picUrl.trim()
      ? album.picUrl.trim()
      : defaultCoverArt;

  return {
    id: `xx-netease-${title}`,
    isDir: false,
    title,
    artist,
    coverArt,
  };
}
