export type MusicSource = 'fangpi' | 'migu' | 'netease' | 'qq' | 'kuwo';

export type MusicTrack = {
  uid: string;
  source: MusicSource;
  displayIndex: number;
  keyword: string;
  songid?: string | number;
  title: string;
  artist: string;
  album: string;
  cover: string | null;
  audioUrl: string | null;
  lrc: string | null;
  lrcUrl: string | null;
  detailsLoaded: boolean;
  quality: 'normal' | 'lossless';
};

export type MusicTrackDetail = {
  title: string;
  artist: string;
  album: string;
  cover: string | null;
  audioUrl: string | null;
  lrc: string | null;
  lrcUrl: string | null;
  detailsLoaded: boolean;
  quality: 'normal' | 'lossless';
};

function clampLimit(limit: number) {
  if (!Number.isFinite(limit)) return 10;
  return Math.min(50, Math.max(1, Math.trunc(limit)));
}

function decodeHtmlEntities(input: string): string {
  const s = input
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .trim();

  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_m, dec: string) =>
      String.fromCodePoint(Number.parseInt(dec, 10))
    );
}

function stripHtml(input: string): string {
  return decodeHtmlEntities(
    input.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')
  );
}

async function fetchJson(url: string, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchText(
  url: string,
  timeoutMs: number
): Promise<string | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    return await res.text();
  } finally {
    clearTimeout(timeoutId);
  }
}

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

async function searchFromFangpi(
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
      uid: `fangpi-${mp3Id}`,
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

async function searchFromMigu(
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

async function searchFromNetease(
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

async function searchFromSayqz(
  keyword: string,
  limit: number,
  source: 'qq' | 'kuwo'
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

export async function getMiguDetail(
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
    quality: 'normal' as const,
  };
}

export async function getNeteaseDetail(
  id: string
): Promise<MusicTrackDetail | null> {
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
    quality: format.includes('无损')
      ? ('lossless' as const)
      : ('normal' as const),
  };
}

export async function getFangpiDetail(
  id: string
): Promise<MusicTrackDetail | null> {
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

export async function resolveFangpiStreamLocation(
  id: string
): Promise<string | null> {
  const page = await fetchFangpiHtml(`/music/${encodeURIComponent(id)}`, 12000);
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
        Referer: `https://www.fangpi.net/music/${encodeURIComponent(id)}`,
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

export async function resolveSayqzStreamLocation(
  source: 'qq' | 'kuwo',
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

function parseSources(value: string | null): MusicSource[] {
  const all: MusicSource[] = ['fangpi', 'migu', 'netease', 'qq', 'kuwo'];
  if (!value) return all;
  const wanted = value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const set = new Set<MusicSource>();
  for (const s of wanted) {
    if (
      s === 'fangpi' ||
      s === 'migu' ||
      s === 'netease' ||
      s === 'qq' ||
      s === 'kuwo'
    )
      set.add(s);
  }
  const out = all.filter((s) => set.has(s));
  return out.length ? out : all;
}

async function searchAllTracks(
  keyword: string,
  sources: MusicSource[],
  searchParams: URLSearchParams,
  fallbackLimit: number
): Promise<{
  merged: MusicTrack[];
  bySource: Partial<Record<MusicSource, number>>;
}> {
  const tasks = sources.map(async (src) => {
    if (src === 'fangpi') return await searchFromFangpi(keyword, fallbackLimit);
    if (src === 'migu') return await searchFromMigu(keyword, fallbackLimit);
    if (src === 'netease')
      return await searchFromNetease(keyword, fallbackLimit);
    if (src === 'qq')
      return await searchFromSayqz(keyword, fallbackLimit, 'qq');
    return await searchFromSayqz(keyword, fallbackLimit, 'kuwo');
  });

  const settled = await Promise.allSettled(tasks);
  const merged: MusicTrack[] = [];
  // const seen = new Set<string>();
  const bySource: Partial<Record<MusicSource, number>> = {};

  for (let i = 0; i < settled.length; i++) {
    const src = sources[i];
    const res = settled[i];
    if (res.status !== 'fulfilled') continue;
    let count = 0;
    for (const track of res.value) {
      // if (!track?.uid) continue;
      // if (seen.has(track.uid)) continue;
      // seen.add(track.uid);
      merged.push(track);
      count++;
    }
    bySource[src] = count;
  }

  return { merged, bySource };
}

export async function searchAllMusicTracks(
  keyword: string,
  limit: number,
  sourcesCsv?: string | null
): Promise<MusicTrack[]> {
  const sources = parseSources(sourcesCsv ?? null);
  const fallbackLimit = clampLimit(limit);
  const { merged } = await searchAllTracks(
    keyword,
    sources,
    new URLSearchParams(),
    fallbackLimit
  );
  return merged;
}
