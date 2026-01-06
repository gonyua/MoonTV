import { decodeHtmlEntities, stripHtml } from './shared';
import type { MusicTrack, MusicTrackDetail, RestSongInfo } from './types';

const PLATFORM = 'fangpi' as const;

type CachedSong = {
  title: string;
  artist: string;
  album: string;
  coverArt: string;
};

function parseFangpiId(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const [platform, source, ...rest] = trimmed.split('-');
  if (platform !== PLATFORM) return null;
  if (source !== PLATFORM) return null;

  const rawId = rest.join('-').trim();
  return rawId || null;
}

function getSetCookieValues(headers: Headers): string[] {
  const asAny = headers as unknown as {
    getSetCookie?: () => string[];
    getAll?: (name: string) => string[];
  };

  if (typeof asAny.getSetCookie === 'function') {
    return asAny.getSetCookie();
  }

  if (typeof asAny.getAll === 'function') {
    return asAny.getAll('set-cookie');
  }

  const values: string[] = [];
  headers.forEach((v, k) => {
    if (k.toLowerCase() === 'set-cookie') values.push(v);
  });
  if (values.length) return values;

  const raw = headers.get('set-cookie');
  return raw ? [raw] : [];
}

function extractCookieValue(
  setCookie: string,
  cookieName: string
): string | null {
  const match = setCookie.match(new RegExp(`${cookieName}=([^;]+)`, 'i'))?.[1];
  return match ? `${cookieName}=${match}` : null;
}

function extractFangpiSessionCookie(headers: Headers): string | null {
  const setCookies = getSetCookieValues(headers);

  for (const sc of setCookies) {
    const v = extractCookieValue(sc, 'server_name_session');
    if (v) return v;
  }

  return extractCookieValue(setCookies.join('; '), 'server_name_session');
}

function parseFangpiAppData(html: string): {
  mp3Id: string | null;
  playId: string | null;
  title: string;
  artist: string;
  cover: string | null;
} | null {
  const m = html.match(/window\.appData\s*=\s*(\{[\s\S]*?\})\s*;/);
  if (!m?.[1]) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(m[1]);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object') return null;
  const data = parsed as Record<string, unknown>;

  const mp3Id = data.mp3_id !== undefined ? String(data.mp3_id) : null;
  const playId = data.play_id !== undefined ? String(data.play_id) : null;
  const title = data.mp3_title !== undefined ? String(data.mp3_title) : '';
  const artist = data.mp3_author !== undefined ? String(data.mp3_author) : '';
  const cover = data.mp3_cover !== undefined ? String(data.mp3_cover) : null;

  return { mp3Id, playId, title, artist, cover };
}

function parseFangpiLrc(html: string): string | null {
  const m = html.match(/<div[^>]+id="content-lrc"[^>]*>([\s\S]*?)<\/div>/i);
  if (!m?.[1]) return null;

  const raw = m[1].replace(/<br\s*\/?>/gi, '\n');
  const cleaned = decodeHtmlEntities(raw.replace(/<[^>]*>/g, ''))
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!cleaned) return null;
  if (cleaned.includes('该歌曲暂无歌词')) return null;
  return cleaned;
}

async function fetchFangpiHtml(
  path: string,
  timeoutMs: number
): Promise<{ html: string; sessionCookie: string | null } | null> {
  const url = `https://www.fangpi.net${path}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const sessionCookie = extractFangpiSessionCookie(res.headers);
    return { html, sessionCookie };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function search3(
  keyword: string,
  limit: number
): Promise<MusicTrack[]> {
  const page = await fetchFangpiHtml(
    `/s/${encodeURIComponent(keyword)}`,
    12000
  );
  if (!page) return [];

  const tracks: MusicTrack[] = [];
  const re =
    /<a\s+href="\/music\/(\d+)"[^>]*class="[^"]*\bmusic-link\b[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;

  let m: RegExpExecArray | null;
  while ((m = re.exec(page.html)) && tracks.length < limit) {
    const mp3Id = m[1] ? String(m[1]) : '';
    const inner = m[2] ?? '';
    if (!mp3Id) continue;

    const title =
      stripHtml(inner.match(/<span>\s*([^<]+?)\s*<\/span>/i)?.[1] ?? '') || '';
    const artist =
      stripHtml(
        inner.match(/<small[^>]*>\s*([\s\S]*?)\s*<\/small>/i)?.[1] ?? ''
      ) || '';

    tracks.push({
      uid: `${PLATFORM}-${PLATFORM}-${mp3Id}`,
      source: 'fangpi',
      displayIndex: 0,
      keyword,
      songid: mp3Id,
      title,
      artist,
      album: '',
      cover: null,
      audioUrl: null,
      lrc: null,
      lrcUrl: null,
      detailsLoaded: false,
      quality: 'normal',
    });
  }

  return tracks;
}

async function getFangpiDetail(id: string): Promise<MusicTrackDetail | null> {
  const page = await fetchFangpiHtml(`/music/${encodeURIComponent(id)}`, 12000);
  if (!page?.html) return null;

  const data = parseFangpiAppData(page.html);
  if (!data) return null;

  return {
    title: data.title,
    artist: data.artist,
    album: '',
    cover: data.cover,
    audioUrl: null,
    lrcUrl: null,
    lrc: parseFangpiLrc(page.html),
    detailsLoaded: true,
    quality: 'normal',
  };
}

export async function getSong(
  id: string,
  cached?: CachedSong | null
): Promise<RestSongInfo | null> {
  const rawId = parseFangpiId(id);
  if (!rawId) return null;

  const detail = await getFangpiDetail(rawId);
  if (!detail && !cached) return null;

  return {
    title: detail?.title || cached?.title || '',
    artist: detail?.artist || cached?.artist || '',
    album: detail?.album || cached?.album || '',
    coverArt: detail?.cover || cached?.coverArt || null,
  };
}

export async function stream(id: string): Promise<string | null> {
  const parsedId = parseFangpiId(id);
  if (!parsedId) return null;

  const page = await fetchFangpiHtml(
    `/music/${encodeURIComponent(parsedId)}`,
    12000
  );
  if (!page?.html) return null;

  const data = parseFangpiAppData(page.html);
  const playId = data?.playId;
  if (!playId) return null;

  const sessionCookie = page.sessionCookie;
  if (!sessionCookie) return null;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  try {
    const res = await fetch('https://www.fangpi.net/api/play-url', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'X-Requested-With': 'XMLHttpRequest',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Origin: 'https://www.fangpi.net',
        Referer: `https://www.fangpi.net/music/${encodeURIComponent(parsedId)}`,
        Cookie: sessionCookie,
        Accept: 'application/json, text/javascript, */*; q=0.01',
      },
      body: `id=${encodeURIComponent(playId)}`,
    });

    if (!res.ok) return null;
    const json = (await res.json().catch(() => null)) as {
      code?: unknown;
      data?: { url?: unknown } | null;
    } | null;

    if (!json || json.code !== 1) return null;
    const url = json.data?.url ? String(json.data.url) : '';
    return url || null;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function getLyricsBySongId(id: string): Promise<string | null> {
  const parsedId = parseFangpiId(id);
  if (!parsedId) return null;
  const detail = await getFangpiDetail(parsedId);
  return detail?.lrc || null;
}
