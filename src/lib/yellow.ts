export const yellowWords = [
  '伦理片',
  '福利',
  '里番动漫',
  '门事件',
  '萝莉少女',
  '制服诱惑',
  '国产传媒',
  'cosplay',
  '黑丝诱惑',
  '无码',
  '日本无码',
  '有码',
  '日本有码',
  'SWAG',
  '网红主播',
  '色情片',
  '同性片',
  '福利视频',
  '福利片',
  '写真热舞',
];

export function isYellowFilterDisabledForUser(
  username?: string | null
): boolean {
  const raw = process.env.NEXT_PUBLIC_DISABLE_YELLOW_FILTER;
  if (!raw || !username) {
    return false;
  }

  const whitelist = raw
    .trim()
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name.length > 0);

  const current = username.trim();
  if (!current) {
    return false;
  }

  return whitelist.includes(current);
}
