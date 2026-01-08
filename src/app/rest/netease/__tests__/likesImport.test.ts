import {
  createNeteaseLikeKey,
  extractFirstUrl,
  extractHttpUrl,
  extractNeteasePlaylistId,
  normalizeLikeKeyPart,
} from '../likesImport';

test('extractFirstUrl works with share text', () => {
  const text = 'yyy';
  expect(extractFirstUrl(text)).toBe('https://163cn.tv/');
});

test('extractHttpUrl supports passing share text via url param', () => {
  const text = 'yyy';
  expect(extractHttpUrl(text)).toBe('https://163cn.tv/');
});

test('extractNeteasePlaylistId supports searchParams and hash', () => {
  expect(
    extractNeteasePlaylistId(
      'https://music.163.com/m/playlist?app_version=9.1.65'
    )
  ).toBe('222');
  expect(extractNeteasePlaylistId('https://music.163.com/')).toBe('22');
});

test('normalizeLikeKeyPart strips whitespace and normalizes brackets', () => {
  expect(normalizeLikeKeyPart(' 周杰伦 （Live） ')).toBe('周杰伦(live)');
  expect(normalizeLikeKeyPart('【Remix】 A  B')).toBe('[remix]ab');
});

test('createNeteaseLikeKey is stable', () => {
  expect(createNeteaseLikeKey({ title: '晴天', artist: '周杰伦' })).toBe(
    'netease:周杰伦::晴天'
  );
});
