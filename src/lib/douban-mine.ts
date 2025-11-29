import { DoubanMineItem, DoubanMineResult } from './types';

export function parseDoubanMineHtml(html: string): DoubanMineResult {
  // 提取总数 - 从标题中获取，如: 我想看的影视(178)
  const totalMatch = html.match(/<title>[^(]*\((\d+)\)/);
  const total = totalMatch ? parseInt(totalMatch[1], 10) : 0;

  // 检查是否需要登录
  if (
    html.includes('没有访问权限') &&
    !html.includes('我想看') &&
    !html.includes('我看过')
  ) {
    return {
      code: 401,
      message: '请先登录豆瓣',
      total: 0,
      list: [],
      hasMore: false,
    };
  }

  // 解析所有影片
  const items = parseAllItems(html);

  // 检查是否有更多数据
  const hasMore = html.includes('后页&gt;') || html.includes('class="next"');

  return {
    code: 200,
    message: '获取成功',
    total,
    list: items,
    hasMore,
  };
}

function parseAllItems(html: string): DoubanMineItem[] {
  const items: DoubanMineItem[] = [];

  // 匹配每个影片项，提取<em>标签内的中文标题
  const pattern =
    /<div class="item comment-item"[^>]*data-cid="[^"]*"[^>]*>[\s\S]*?<a title="([^"]*)" href="https:\/\/movie\.douban\.com\/subject\/(\d+)\/"[^>]*>\s*<img[^>]*src="([^"]+)"[\s\S]*?<li class="title">\s*<a[^>]*>\s*<em>([^<]*)<\/em>[\s\S]*?<li class="intro">([^<]*)<\/li>[\s\S]*?<span class="date">([^<]+)<\/span>/g;

  let match;
  while ((match = pattern.exec(html)) !== null) {
    const originalTitle = decodeHtmlEntities(match[1]);
    const id = match[2];
    const poster = match[3];
    const emTitle = decodeHtmlEntities(match[4].trim());
    const intro = decodeHtmlEntities(match[5].trim());
    const date = match[6].trim();
    // 从<em>标签中提取中文标题（格式可能是"中文名 / English Name"）
    // 取第一个斜杠前的部分作为中文标题
    let title = emTitle;
    if (emTitle.includes(' / ')) {
      title = emTitle.split(' / ')[0].trim();
    }
    // 如果提取失败则使用原标题
    if (!title) {
      title = originalTitle;
    }

    // 检查是否可播放
    const itemStart = match.index;
    const nextItemStart = html.indexOf(
      '<div class="item comment-item"',
      itemStart + 1
    );
    const itemSection =
      nextItemStart > 0
        ? html.substring(itemStart, nextItemStart)
        : html.substring(itemStart, itemStart + 2000);
    const playable = itemSection.includes('class="playable"');

    // 从简介中提取年份
    const yearMatch = intro.match(/^(\d{4})/);
    const year = yearMatch ? yearMatch[1] : '';

    items.push({
      id,
      title,
      poster,
      intro,
      date,
      playable,
      year,
    });
  }

  return items;
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/');
}
