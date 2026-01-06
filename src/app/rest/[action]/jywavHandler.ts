import { fetchHtml, fetchText, stripHtml } from './shared';
import type { MusicTrack, MusicTrackDetail, RestSongInfo } from './types';

const PLATFORM = 'jywav' as const;

type CachedSong = {
  title: string;
  artist: string;
  album: string;
  coverArt: string;
};

function parseJywavId(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const [platform, source, ...rest] = trimmed.split('-');
  if (platform !== PLATFORM) return null;
  if (source !== PLATFORM) return null;

  const rawId = rest.join('-').trim();
  return rawId || null;
}

function parseJywavSearchText(text: string): { title: string; artist: string } {
  const cleaned = text.trim();
  const match = cleaned.match(/^(.*?)《(.+?)》$/);
  if (match) {
    return {
      artist: match[1]?.trim() ?? '',
      title: match[2]?.trim() ?? '',
    };
  }

  return { title: cleaned, artist: '' };
}

export async function search3(
  keyword: string,
  limit: number
): Promise<MusicTrack[]> {
  const html = await fetchHtml(
    `https://jywav.com/search?keyword=${encodeURIComponent(keyword)}`,
    12000
  );
  if (!html) return [];

  const tracks: MusicTrack[] = [];
  const re =
    /<a[^>]+href="\/music\/info\.html\?id=MUSIC_(\d+)"[^>]*>[\s\S]*?<div[^>]*>\s*([^<]+?)\s*<\/div>[\s\S]*?<\/a>/gi;

  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && tracks.length < limit) {
    const id = m[1] ? String(m[1]) : '';
    const text = stripHtml(m[2] ?? '');
    if (!id || !text) continue;

    const { title, artist } = parseJywavSearchText(text);

    tracks.push({
      uid: `${PLATFORM}-${PLATFORM}-${id}`,
      source: 'jywav',
      displayIndex: 0,
      keyword,
      songid: id,
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

function normalizeJywavId(id: string): string {
  return id.startsWith('MUSIC_') ? id.slice('MUSIC_'.length) : id;
}

function decodeJywavDetailJsonString(value: string): string | null {
  let safe = '';
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i] ?? '';
    if (ch === '"' && (i === 0 || value[i - 1] !== '\\')) {
      safe += '\\"';
      continue;
    }
    safe += ch;
  }

  try {
    return JSON.parse(`"${safe}"`);
  } catch {
    return null;
  }
}

function formatLrcTimestampCentiseconds(totalCentiseconds: number): string {
  const safe = Math.max(0, Math.trunc(totalCentiseconds));
  const minutes = Math.trunc(safe / 6000);
  const seconds = Math.trunc((safe % 6000) / 100);
  const centiseconds = safe % 100;
  return `[${String(minutes).padStart(2, '0')}:${String(seconds).padStart(
    2,
    '0'
  )}.${String(centiseconds).padStart(2, '0')}]`;
}

function lrcListToLrc(
  list: Array<{ time?: unknown; lineLyric?: unknown }>
): string | null {
  const lines: string[] = [];

  for (const item of list) {
    const timeRaw = item?.time;
    const timeSeconds =
      typeof timeRaw === 'number'
        ? timeRaw
        : typeof timeRaw === 'string'
        ? Number(timeRaw)
        : NaN;
    if (!Number.isFinite(timeSeconds)) continue;

    const lyric = String(item?.lineLyric ?? '').trim();
    if (!lyric) continue;

    const totalCentiseconds = Math.round(timeSeconds * 100);
    lines.push(`${formatLrcTimestampCentiseconds(totalCentiseconds)}${lyric}`);
  }

  const joined = lines.join('\n').trim();
  return joined ? `${joined}\n` : null;
}

function normalizeJywavCover(url: string | null): string | null {
  if (!url) return null;
  const normalized = url.startsWith('http://')
    ? `https://${url.slice('http://'.length)}`
    : url;

  try {
    const parsed = new URL(normalized);
    if (parsed.hostname.endsWith('kwcdn.kuwo.cn')) return null;
  } catch {
    return null;
  }

  return normalized;
}

async function getJywavDetail(id: string): Promise<MusicTrackDetail | null> {
  const musicId = normalizeJywavId(id);
  if (!/^\d+$/.test(musicId)) return null;

  const html = await fetchHtml(
    `https://jywav.com/music/info.html?id=MUSIC_${encodeURIComponent(musicId)}`,
    12000
  );
  if (!html) return null;

  const raw = html.match(/const\s+detailJson\s*=\s*'([\s\S]*?)';/)?.[1];
  if (!raw) return null;

  const decoded = decodeJywavDetailJsonString(raw);
  if (!decoded) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object') return null;
  const data = parsed as Record<string, unknown>;

  const lrcList = data.music_lrclist;
  const lrc =
    Array.isArray(lrcList) && lrcList.length
      ? lrcListToLrc(lrcList as Array<{ time?: unknown; lineLyric?: unknown }>)
      : null;

  const flac =
    typeof data.music_flacUrl === 'string' && data.music_flacUrl.trim()
      ? data.music_flacUrl.trim()
      : null;

  return {
    title: String(data.music_name ?? ''),
    artist: String(data.music_artist ?? ''),
    album: String(data.music_album ?? ''),
    cover:
      typeof data.music_cover === 'string'
        ? normalizeJywavCover(data.music_cover)
        : null,
    audioUrl: null,
    lrcUrl: null,
    lrc,
    detailsLoaded: true,
    quality: flac ? 'lossless' : 'normal',
  };
}

export async function getSong(
  id: string,
  cached?: CachedSong | null
): Promise<RestSongInfo | null> {
  const rawId = parseJywavId(id);
  if (!rawId) return null;

  const detail = await getJywavDetail(rawId);
  if (!detail && !cached) return null;

  return {
    title: detail?.title || cached?.title || '',
    artist: detail?.artist || cached?.artist || '',
    album: detail?.album || cached?.album || '',
    coverArt: detail?.cover || cached?.coverArt || null,
  };
}

export async function stream(id: string): Promise<string | null> {
  const parsedId = parseJywavId(id);
  if (!parsedId) return null;

  const musicId = normalizeJywavId(parsedId);
  if (!/^\d+$/.test(musicId)) return null;

  const url = `https://jywav.com/audio/play?id=${encodeURIComponent(musicId)}`;
  const location = (await fetchText(url, 12000))?.trim() ?? '';
  if (!location) return null;
  if (!location.startsWith('http://') && !location.startsWith('https://'))
    return null;
  return location;
}

export async function getLyricsBySongId(id: string): Promise<string | null> {
  const parsedId = parseJywavId(id);
  if (!parsedId) return null;
  const detail = await getJywavDetail(parsedId);
  return detail?.lrc || null;
}
