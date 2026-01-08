import type { MusicLikeBasic } from './likesImport';
import type { MusicTrack } from '../[action]/types';

export type KimiSongRecommendation = { title: string; artist: string };

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function normalizeText(value: string): string {
  return value
    .trim()
    .replaceAll('（', '(')
    .replaceAll('）', ')')
    .replace(/\s+/g, '')
    .toLowerCase();
}

function normalizeRecommendationKey(input: {
  title: string;
  artist: string;
}): string {
  return `${normalizeText(input.artist)}::${normalizeText(input.title)}`;
}

function parseKimiSongRecommendations(
  raw: string,
  expectedCount: number
): KimiSongRecommendation[] {
  const text = (raw ?? '').trim();
  if (!text) return [];

  const tryParse = (value: string): unknown => {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  };

  const direct = tryParse(text);
  const extracted =
    direct ??
    (() => {
      const start = text.indexOf('[');
      const end = text.lastIndexOf(']');
      if (start < 0 || end < 0 || end <= start) return null;
      return tryParse(text.slice(start, end + 1));
    })();

  if (!Array.isArray(extracted)) return [];

  const out: KimiSongRecommendation[] = [];
  const seen = new Set<string>();

  for (const item of extracted) {
    if (!item || typeof item !== 'object') continue;
    const title = String((item as { title?: unknown }).title ?? '').trim();
    const artist = String((item as { artist?: unknown }).artist ?? '').trim();
    if (!title || !artist) continue;
    const key = normalizeRecommendationKey({ title, artist });
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ title, artist });
    if (out.length >= expectedCount) break;
  }

  return out;
}

function pickBestTrackForRecommendation(
  tracks: MusicTrack[],
  rec: KimiSongRecommendation
): MusicTrack | null {
  if (!tracks.length) return null;

  const targetTitle = normalizeText(rec.title);
  const targetArtist = normalizeText(rec.artist);

  let best: { score: number; track: MusicTrack } | null = null;
  for (const track of tracks) {
    const scoreTitle =
      targetTitle && normalizeText(track.title).includes(targetTitle) ? 2 : 0;
    const scoreArtist =
      targetArtist && normalizeText(track.artist).includes(targetArtist)
        ? 1
        : 0;
    const score = scoreTitle + scoreArtist;

    if (!best || score > best.score) best = { score, track };
    if (score >= 3) break;
  }

  return best?.track ?? tracks[0] ?? null;
}

export class KimiLikesRecommender {
  private readonly baseURL: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly maxLikes: number;

  constructor(options?: {
    baseURL?: string;
    model?: string;
    timeoutMs?: number;
    maxLikes?: number;
  }) {
    this.baseURL = options?.baseURL ?? 'https://api.moonshot.cn/v1';
    this.model = options?.model ?? 'kimi-k2-turbo-preview';
    this.timeoutMs = clampInt(options?.timeoutMs ?? 12_000, 1_000, 60_000);
    this.maxLikes = clampInt(options?.maxLikes ?? 200, 1, 1_000);
  }

  async getRandomTracksFromLikes(options: {
    likes: MusicLikeBasic[];
    count: number;
    searchTracks: (keyword: string, limit: number) => Promise<MusicTrack[]>;
  }): Promise<MusicTrack[]> {
    const targetCount = clampInt(options.count, 1, 200);
    const likes = options.likes.slice(0, this.maxLikes);

    const likedKeys = new Set<string>();
    for (const it of likes) {
      likedKeys.add(
        normalizeRecommendationKey({ title: it.title, artist: it.artist })
      );
    }

    const tracks: MusicTrack[] = [];
    const usedUids = new Set<string>();
    const excluded: KimiSongRecommendation[] = [];

    for (
      let attempt = 0;
      attempt < 5 && tracks.length < targetCount;
      attempt += 1
    ) {
      const need = targetCount - tracks.length;
      const recs = await this.fetchSongRecommendationsFromLikes({
        likes,
        count: need,
        exclude: excluded,
      });
      excluded.push(...recs);

      for (const rec of recs) {
        if (tracks.length >= targetCount) break;

        const recKey = normalizeRecommendationKey(rec);
        if (!recKey || likedKeys.has(recKey)) continue;

        const queries = [
          `${rec.title} ${rec.artist}`.trim(),
          rec.title.trim(),
        ].filter(Boolean);

        let chosen: MusicTrack | null = null;
        for (const q of queries) {
          const candidates = await options.searchTracks(q, 5);
          chosen = pickBestTrackForRecommendation(candidates, rec);
          if (chosen) break;
        }

        if (!chosen?.uid) continue;
        if (usedUids.has(chosen.uid)) continue;

        usedUids.add(chosen.uid);
        tracks.push(chosen);
      }
    }

    return tracks.slice(0, targetCount);
  }

  private async fetchSongRecommendationsFromLikes(options: {
    likes: MusicLikeBasic[];
    count: number;
    exclude?: KimiSongRecommendation[];
  }): Promise<KimiSongRecommendation[]> {
    const apiKey = (process.env.MOONSHOT_API_KEY ?? '').trim();
    if (!apiKey) throw new Error('Missing env: MOONSHOT_API_KEY');

    const count = clampInt(options.count, 1, 50);
    const likes = options.likes.slice(0, this.maxLikes);

    const likeLines = likes
      .map((it) => `- ${it.title} - ${it.artist}`)
      .join('\n');

    const excludeLines = (options.exclude ?? [])
      .slice(0, 200)
      .map((it) => `- ${it.title} - ${it.artist}`)
      .join('\n');

    const messages = [
      {
        role: 'system',
        content:
          '你现在是一名“音乐推荐助手”，擅长根据用户喜欢的歌曲进行偏好分析并给出推荐。你必须严格遵守输出格式要求。',
      },
      {
        role: 'user',
        content: [
          '下面是用户最近喜欢的歌曲列表（title - artist）：',
          likeLines || '(空)',
          excludeLines
            ? '\n请不要推荐以下歌曲（避免重复）：\n' + excludeLines
            : '',
          '\n请基于以上喜欢列表，推荐用户可能喜欢的歌曲。',
          `要求：1) 返回 ${count} 首；2) 不要推荐“喜欢列表”里出现过的歌曲；3) 尽量避免重复；4) 只输出严格 JSON 数组，不要输出任何解释/前后缀/Markdown。`,
          '输出格式示例：',
          '[{"title":"歌名","artist":"歌手"},{"title":"歌名2","artist":"歌手2"}]',
        ]
          .filter(Boolean)
          .join('\n'),
      },
    ] as const;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          temperature: 0.6,
          stream: false,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(
          `Kimi API failed: HTTP ${response.status}${text ? ` - ${text}` : ''}`
        );
      }

      const json = (await response.json().catch(() => null)) as {
        choices?: Array<{
          message?: { content?: string | null } | null;
        }>;
      } | null;
      const content = json?.choices?.[0]?.message?.content ?? '';
      const recs = parseKimiSongRecommendations(content, count);
      if (recs.length === 0) {
        throw new Error('Kimi returned empty/invalid recommendations');
      }
      return recs;
    } finally {
      clearTimeout(timeout);
    }
  }
}
