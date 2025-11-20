export function formatNoteDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN', {
    hour12: false,
  });
}

export function createPreview(markdown: string, maxLength = 140): string {
  const plain = markdown
    .replace(/```[\s\S]*?```/g, ' ') // 移除代码块
    .replace(/`([^`]+)`/g, '$1') // 行内代码
    .replace(/!\[.*?\]\(.*?\)/g, '') // 图片
    .replace(/\[([^\]]+)\]\((.*?)\)/g, '$1') // 链接文本
    .replace(/[-#>*_~]/g, ' ') // markdown 语法符号
    .replace(/\s+/g, ' ')
    .trim();

  if (!plain) return '暂无内容，点击添加...';
  if (plain.length <= maxLength) return plain;
  return `${plain.slice(0, maxLength)}…`;
}
