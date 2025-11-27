/**
 * 浏览器书签 HTML 解析工具
 * 支持 Chrome、Firefox、Edge 导出的书签 HTML 文件
 */

export interface ParsedBookmark {
  title: string;
  url: string;
  icon?: string;
  addDate?: number;
}

export interface ParsedFolder {
  name: string;
  bookmarks: ParsedBookmark[];
  children: ParsedFolder[];
}

export interface ParsedBookmarksResult {
  folders: ParsedFolder[];
  rootBookmarks: ParsedBookmark[];
  stats: {
    totalFolders: number;
    totalBookmarks: number;
  };
}

/**
 * 解析书签 HTML 文件
 */
export function parseBookmarksHtml(html: string): ParsedBookmarksResult {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const stats = { totalFolders: 0, totalBookmarks: 0 };
  const rootBookmarks: ParsedBookmark[] = [];

  function parseFolder(dl: Element): ParsedFolder[] {
    const folders: ParsedFolder[] = [];
    const children = dl.children;

    let currentFolder: ParsedFolder | null = null;

    for (let i = 0; i < children.length; i++) {
      const child = children[i];

      if (child.tagName === 'DT') {
        const h3 = child.querySelector(':scope > H3');
        const a = child.querySelector(':scope > A');
        const nestedDl = child.querySelector(':scope > DL');

        if (h3) {
          // 这是一个文件夹
          currentFolder = {
            name: h3.textContent?.trim() || '未命名文件夹',
            bookmarks: [],
            children: [],
          };
          stats.totalFolders++;

          // 解析文件夹内容
          if (nestedDl) {
            const nestedResult = parseFolderContent(nestedDl);
            currentFolder.bookmarks = nestedResult.bookmarks;
            currentFolder.children = nestedResult.children;
          }

          folders.push(currentFolder);
        } else if (a) {
          // 这是一个书签
          const bookmark = parseAnchor(a);
          if (bookmark) {
            stats.totalBookmarks++;
            if (currentFolder) {
              currentFolder.bookmarks.push(bookmark);
            } else {
              rootBookmarks.push(bookmark);
            }
          }
        }
      }
    }

    return folders;
  }

  function parseFolderContent(dl: Element): {
    bookmarks: ParsedBookmark[];
    children: ParsedFolder[];
  } {
    const bookmarks: ParsedBookmark[] = [];
    const children: ParsedFolder[] = [];
    const items = dl.children;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      if (item.tagName === 'DT') {
        const h3 = item.querySelector(':scope > H3');
        const a = item.querySelector(':scope > A');
        const nestedDl = item.querySelector(':scope > DL');

        if (h3 && nestedDl) {
          // 子文件夹
          const subFolder: ParsedFolder = {
            name: h3.textContent?.trim() || '未命名文件夹',
            bookmarks: [],
            children: [],
          };
          stats.totalFolders++;

          const nestedResult = parseFolderContent(nestedDl);
          subFolder.bookmarks = nestedResult.bookmarks;
          subFolder.children = nestedResult.children;
          children.push(subFolder);
        } else if (a) {
          // 书签
          const bookmark = parseAnchor(a);
          if (bookmark) {
            stats.totalBookmarks++;
            bookmarks.push(bookmark);
          }
        }
      }
    }

    return { bookmarks, children };
  }

  function parseAnchor(a: Element): ParsedBookmark | null {
    const href = a.getAttribute('href');
    if (!href || !href.startsWith('http')) return null;

    const addDateStr = a.getAttribute('add_date');
    const icon = a.getAttribute('icon');

    return {
      title: a.textContent?.trim() || href,
      url: href,
      icon: icon || undefined,
      addDate: addDateStr ? parseInt(addDateStr, 10) * 1000 : undefined,
    };
  }

  // 查找主 DL 元素
  const mainDl = doc.querySelector('DL');
  const folders = mainDl ? parseFolder(mainDl) : [];

  return {
    folders,
    rootBookmarks,
    stats,
  };
}

/**
 * 扁平化文件夹结构，将嵌套文件夹合并为一级
 * 子文件夹名称格式：父文件夹/子文件夹
 */
export function flattenFolders(
  folders: ParsedFolder[],
  parentName = ''
): Array<{ name: string; bookmarks: ParsedBookmark[] }> {
  const result: Array<{ name: string; bookmarks: ParsedBookmark[] }> = [];

  for (const folder of folders) {
    const fullName = parentName ? `${parentName}/${folder.name}` : folder.name;

    if (folder.bookmarks.length > 0) {
      result.push({
        name: fullName,
        bookmarks: folder.bookmarks,
      });
    }

    if (folder.children.length > 0) {
      result.push(...flattenFolders(folder.children, fullName));
    }
  }

  return result;
}

/**
 * 简化文件夹结构，只保留一级文件夹
 * 子文件夹的书签合并到父文件夹
 */
export function simplifyFolders(
  folders: ParsedFolder[]
): Array<{ name: string; bookmarks: ParsedBookmark[] }> {
  const result: Array<{ name: string; bookmarks: ParsedBookmark[] }> = [];

  function collectBookmarks(folder: ParsedFolder): ParsedBookmark[] {
    let bookmarks = [...folder.bookmarks];
    for (const child of folder.children) {
      bookmarks = bookmarks.concat(collectBookmarks(child));
    }
    return bookmarks;
  }

  for (const folder of folders) {
    const allBookmarks = collectBookmarks(folder);
    if (allBookmarks.length > 0) {
      result.push({
        name: folder.name,
        bookmarks: allBookmarks,
      });
    }
  }

  return result;
}
