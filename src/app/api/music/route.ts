import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

type MusicSource = 'migu' | 'netease' | 'qq' | 'kuwo';

type MusicTrack = {
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

function clampInt(
  value: string | null,
  fallback: number,
  min: number,
  max: number
) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
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

function addCorsHeaders(headers: Headers) {
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Range');
}

function jsonResponse(
  data: unknown,
  init?: { status?: number; headers?: HeadersInit }
) {
  const headers = new Headers(init?.headers);
  addCorsHeaders(headers);
  headers.set('Cache-Control', 'no-store');
  return NextResponse.json(data, { status: init?.status, headers });
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
    const uid = `migu-${keyword}-${n}-${title}-${artist}`;
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
      audioUrl: `/api/music?action=stream&source=${encodeURIComponent(
        source
      )}&id=${encodeURIComponent(id)}`,
      lrc: null,
      lrcUrl: it?.lrc ? String(it.lrc) : null,
      detailsLoaded: true,
      quality: 'normal',
    };
    return [track];
  });
}

async function getMiguDetail(keyword: string, n: number) {
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
    cover: data.cover ? String(data.cover) : null,
    audioUrl: normalizeMiguUrl(data.music_url ? String(data.music_url) : null),
    lrcUrl,
    lrc,
    detailsLoaded: true,
    quality: 'normal' as const,
  };
}

async function getNeteaseDetail(id: string) {
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

async function getSayqzDetail(source: 'qq' | 'kuwo', id: string) {
  const lrcUrl = `https://music-dl.sayqz.com/api/?source=${encodeURIComponent(
    source
  )}&id=${encodeURIComponent(id)}&type=lrc`;
  const lrc = await fetchText(lrcUrl, 8000);
  return {
    audioUrl: `/api/music?action=stream&source=${encodeURIComponent(
      source
    )}&id=${encodeURIComponent(id)}`,
    lrcUrl,
    lrc,
    detailsLoaded: true,
    quality: 'normal' as const,
  };
}

async function handleStream(
  request: NextRequest,
  source: 'qq' | 'kuwo',
  id: string
) {
  const range = request.headers.get('range') ?? undefined;
  const first = await fetch(
    `https://music-dl.sayqz.com/api/?source=${encodeURIComponent(
      source
    )}&id=${encodeURIComponent(id)}&type=url`,
    { redirect: 'manual' }
  );

  const location = first.headers.get('location');
  if (!location) {
    return jsonResponse({ error: '播放地址获取失败' }, { status: 502 });
  }

  const audioRes = await fetch(location, {
    headers: range ? { Range: range } : undefined,
  });

  if (!audioRes.body) {
    return jsonResponse({ error: '播放资源无内容' }, { status: 502 });
  }

  const headers = new Headers();
  addCorsHeaders(headers);
  headers.set('Cache-Control', 'no-store');

  const passHeaders = [
    'content-type',
    'content-length',
    'accept-ranges',
    'content-range',
    'etag',
    'last-modified',
  ] as const;
  for (const key of passHeaders) {
    const value = audioRes.headers.get(key);
    if (value) headers.set(key, value);
  }

  return new Response(audioRes.body, { status: audioRes.status, headers });
}

function parseSources(value: string | null): MusicSource[] {
  const all: MusicSource[] = ['migu', 'netease', 'qq', 'kuwo'];
  if (!value) return all;
  const wanted = value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const set = new Set<MusicSource>();
  for (const s of wanted) {
    if (s === 'migu' || s === 'netease' || s === 'qq' || s === 'kuwo')
      set.add(s);
  }
  const out = all.filter((s) => set.has(s));
  return out.length ? out : all;
}

function limitForSource(
  searchParams: URLSearchParams,
  source: MusicSource,
  fallback: number
) {
  return clampInt(searchParams.get(`limit_${source}`), fallback, 1, 50);
}

export async function OPTIONS() {
  const headers = new Headers();
  addCorsHeaders(headers);
  headers.set('Cache-Control', 'no-store');
  return new Response(null, { status: 204, headers });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const source = searchParams.get('source') as MusicSource | null;

  if (!action)
    return jsonResponse({ error: 'Missing action' }, { status: 400 });

  if (action === 'stream') {
    if (source !== 'qq' && source !== 'kuwo') {
      return jsonResponse({ error: 'Invalid source' }, { status: 400 });
    }
    const id = searchParams.get('id');
    if (!id) return jsonResponse({ error: 'Missing id' }, { status: 400 });
    return handleStream(request, source, id);
  }

  if (action === 'search') {
    if (
      source !== 'migu' &&
      source !== 'netease' &&
      source !== 'qq' &&
      source !== 'kuwo'
    ) {
      return jsonResponse({ error: 'Invalid source' }, { status: 400 });
    }
    const keyword = searchParams.get('keyword')?.trim() ?? '';
    const limit = clampInt(searchParams.get('limit'), 10, 1, 50);
    if (!keyword) return jsonResponse({ code: 200, data: [] });

    const data =
      source === 'migu'
        ? await searchFromMigu(keyword, limit)
        : source === 'netease'
        ? await searchFromNetease(keyword, limit)
        : await searchFromSayqz(keyword, limit, source);
    return jsonResponse({ code: 200, data });
  }

  if (action === 'searchAll') {
    const keyword = searchParams.get('keyword')?.trim() ?? '';
    const sources = parseSources(searchParams.get('sources'));
    const fallbackLimit = clampInt(searchParams.get('limit'), 10, 1, 50);
    if (!keyword)
      return jsonResponse({ code: 200, data: [], meta: { sources } });

    const tasks = sources.map(async (src) => {
      const lim = limitForSource(searchParams, src, fallbackLimit);
      if (src === 'migu') return await searchFromMigu(keyword, lim);
      if (src === 'netease') return await searchFromNetease(keyword, lim);
      if (src === 'qq') return await searchFromSayqz(keyword, lim, 'qq');
      return await searchFromSayqz(keyword, lim, 'kuwo');
    });

    const settled = await Promise.allSettled(tasks);
    const merged: MusicTrack[] = [];
    const seen = new Set<string>();
    const bySource: Partial<Record<MusicSource, number>> = {};

    for (let i = 0; i < settled.length; i++) {
      const src = sources[i];
      const res = settled[i];
      if (res.status !== 'fulfilled') continue;
      let count = 0;
      for (const track of res.value) {
        if (!track?.uid) continue;
        if (seen.has(track.uid)) continue;
        seen.add(track.uid);
        merged.push(track);
        count++;
      }
      bySource[src] = count;
    }

    return jsonResponse({
      code: 200,
      data: merged,
      meta: { sources, bySource },
    });
  }

  if (action === 'detail') {
    if (
      source !== 'migu' &&
      source !== 'netease' &&
      source !== 'qq' &&
      source !== 'kuwo'
    ) {
      return jsonResponse({ error: 'Invalid source' }, { status: 400 });
    }

    if (source === 'migu') {
      const keyword = searchParams.get('keyword')?.trim() ?? '';
      const n = clampInt(searchParams.get('n'), 1, 1, 500);
      if (!keyword)
        return jsonResponse({ error: 'Missing keyword' }, { status: 400 });
      const data = await getMiguDetail(keyword, n);
      if (!data)
        return jsonResponse({ error: '详情获取失败' }, { status: 502 });
      return jsonResponse({ code: 200, data });
    }

    const id = searchParams.get('id');
    if (!id) return jsonResponse({ error: 'Missing id' }, { status: 400 });

    if (source === 'netease') {
      const data = await getNeteaseDetail(id);
      if (!data)
        return jsonResponse({ error: '详情获取失败' }, { status: 502 });
      return jsonResponse({ code: 200, data });
    }

    const data = await getSayqzDetail(source, id);
    return jsonResponse({ code: 200, data });
  }

  return jsonResponse({ error: 'Invalid action' }, { status: 400 });
}
