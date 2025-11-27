'use client';

import { CheckCircle, Loader2, Upload, X } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';

import {
  addCategory,
  addSite,
  fetchFavicon,
  getCategories,
} from '@/lib/navs.client';
import {
  flattenFolders,
  parseBookmarksHtml,
  ParsedBookmarksResult,
  simplifyFolders,
} from '@/lib/parseBookmarks';

interface NavsImportModalProps {
  open: boolean;
  onClose: () => void;
}

type ImportMode = 'flatten' | 'simplify';
type ImportStep = 'upload' | 'preview' | 'importing' | 'done';

interface ImportProgress {
  current: number;
  total: number;
  currentItem: string;
}

export default function NavsImportModal({
  open,
  onClose,
}: NavsImportModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<ImportStep>('upload');
  const [parsedResult, setParsedResult] =
    useState<ParsedBookmarksResult | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>('simplify');
  const [progress, setProgress] = useState<ImportProgress>({
    current: 0,
    total: 0,
    currentItem: '',
  });
  const [importStats, setImportStats] = useState({ categories: 0, sites: 0 });

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const text = await file.text();
      const result = parseBookmarksHtml(text);
      setParsedResult(result);
      setStep('preview');
    },
    []
  );

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file || !file.name.endsWith('.html')) return;

    const text = await file.text();
    const result = parseBookmarksHtml(text);
    setParsedResult(result);
    setStep('preview');
  }, []);

  const handleImport = useCallback(async () => {
    if (!parsedResult) return;

    setStep('importing');

    // 根据模式处理文件夹
    const foldersToImport =
      importMode === 'simplify'
        ? simplifyFolders(parsedResult.folders)
        : flattenFolders(parsedResult.folders);

    // 加上根目录书签
    if (parsedResult.rootBookmarks.length > 0) {
      foldersToImport.unshift({
        name: '未分类',
        bookmarks: parsedResult.rootBookmarks,
      });
    }

    const totalBookmarks = foldersToImport.reduce(
      (sum, f) => sum + f.bookmarks.length,
      0
    );
    setProgress({ current: 0, total: totalBookmarks, currentItem: '' });

    let importedCategories = 0;
    let importedSites = 0;
    let processedCount = 0;

    // 获取现有分类
    const existingCats = await getCategories();
    const categoryMap = new Map<string, string>();
    existingCats.forEach((c) => categoryMap.set(c.name, c.id));

    for (const folder of foldersToImport) {
      // 查找或创建分类
      let categoryId = categoryMap.get(folder.name);
      if (!categoryId) {
        const newCat = await addCategory({ name: folder.name });
        if (newCat) {
          categoryId = newCat.id;
          categoryMap.set(folder.name, categoryId);
          importedCategories++;
        }
      }

      if (!categoryId) continue;

      // 导入书签
      for (const bookmark of folder.bookmarks) {
        setProgress({
          current: processedCount,
          total: totalBookmarks,
          currentItem: bookmark.title,
        });

        // 获取图标
        let icon = bookmark.icon;
        if (!icon) {
          icon = (await fetchFavicon(bookmark.url)) || undefined;
        }

        await addSite({
          categoryId,
          name: bookmark.title,
          url: bookmark.url,
          icon,
        });

        importedSites++;
        processedCount++;
      }
    }

    setImportStats({ categories: importedCategories, sites: importedSites });
    setStep('done');
  }, [parsedResult, importMode]);

  const handleClose = useCallback(() => {
    setStep('upload');
    setParsedResult(null);
    setProgress({ current: 0, total: 0, currentItem: '' });
    setImportStats({ categories: 0, sites: 0 });
    onClose();
  }, [onClose]);

  const getPreviewData = useCallback(() => {
    if (!parsedResult) return [];
    return importMode === 'simplify'
      ? simplifyFolders(parsedResult.folders)
      : flattenFolders(parsedResult.folders);
  }, [parsedResult, importMode]);

  if (!open) return null;

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center'>
      <div
        className='absolute inset-0 bg-black/50'
        onClick={step !== 'importing' ? handleClose : undefined}
      />
      <div className='relative bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col'>
        {/* 标题 */}
        <div className='flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700'>
          <h2 className='text-lg font-semibold text-gray-900 dark:text-gray-100'>
            导入浏览器书签
          </h2>
          {step !== 'importing' && (
            <button
              className='p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors'
              onClick={handleClose}
            >
              <X className='h-5 w-5 text-gray-500' />
            </button>
          )}
        </div>

        {/* 内容 */}
        <div className='flex-1 overflow-y-auto p-6'>
          {step === 'upload' && (
            <div
              className='border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-8 text-center cursor-pointer hover:border-orange-400 dark:hover:border-orange-500 transition-colors'
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
            >
              <Upload className='h-12 w-12 mx-auto text-gray-400 mb-4' />
              <p className='text-gray-600 dark:text-gray-400 mb-2'>
                拖拽书签 HTML 文件到这里，或点击选择文件
              </p>
              <p className='text-sm text-gray-400 dark:text-gray-500'>
                支持 Chrome、Firefox、Edge 导出的书签文件
              </p>
              <input
                ref={fileInputRef}
                type='file'
                accept='.html'
                className='hidden'
                onChange={handleFileSelect}
              />
            </div>
          )}

          {step === 'preview' && parsedResult && (
            <div className='space-y-4'>
              {/* 统计信息 */}
              <div className='bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4'>
                <div className='flex justify-between text-sm'>
                  <span className='text-gray-600 dark:text-gray-400'>
                    解析到的文件夹:
                  </span>
                  <span className='font-medium text-gray-900 dark:text-gray-100'>
                    {parsedResult.stats.totalFolders} 个
                  </span>
                </div>
                <div className='flex justify-between text-sm mt-1'>
                  <span className='text-gray-600 dark:text-gray-400'>
                    解析到的书签:
                  </span>
                  <span className='font-medium text-gray-900 dark:text-gray-100'>
                    {parsedResult.stats.totalBookmarks} 个
                  </span>
                </div>
              </div>

              {/* 导入模式选择 */}
              <div>
                <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
                  文件夹处理方式
                </label>
                <div className='space-y-2'>
                  <label className='flex items-center gap-2 cursor-pointer'>
                    <input
                      type='radio'
                      name='importMode'
                      value='simplify'
                      checked={importMode === 'simplify'}
                      onChange={() => setImportMode('simplify')}
                      className='text-orange-500 focus:ring-orange-500'
                    />
                    <span className='text-sm text-gray-700 dark:text-gray-300'>
                      只保留一级文件夹（子文件夹书签合并到父文件夹）
                    </span>
                  </label>
                  <label className='flex items-center gap-2 cursor-pointer'>
                    <input
                      type='radio'
                      name='importMode'
                      value='flatten'
                      checked={importMode === 'flatten'}
                      onChange={() => setImportMode('flatten')}
                      className='text-orange-500 focus:ring-orange-500'
                    />
                    <span className='text-sm text-gray-700 dark:text-gray-300'>
                      展开所有层级（子文件夹名称如：父文件夹/子文件夹）
                    </span>
                  </label>
                </div>
              </div>

              {/* 预览列表 */}
              <div>
                <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
                  将导入以下分类
                </label>
                <div className='max-h-48 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg'>
                  {getPreviewData().map((folder, index) => (
                    <div
                      key={index}
                      className='flex justify-between px-3 py-2 border-b border-gray-100 dark:border-gray-700 last:border-b-0'
                    >
                      <span className='text-sm text-gray-700 dark:text-gray-300 truncate'>
                        {folder.name}
                      </span>
                      <span className='text-sm text-gray-400 flex-shrink-0 ml-2'>
                        {folder.bookmarks.length} 个
                      </span>
                    </div>
                  ))}
                  {parsedResult.rootBookmarks.length > 0 && (
                    <div className='flex justify-between px-3 py-2'>
                      <span className='text-sm text-gray-500 dark:text-gray-400'>
                        未分类
                      </span>
                      <span className='text-sm text-gray-400'>
                        {parsedResult.rootBookmarks.length} 个
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {step === 'importing' && (
            <div className='text-center py-8'>
              <Loader2 className='h-12 w-12 mx-auto text-orange-500 animate-spin mb-4' />
              <p className='text-gray-600 dark:text-gray-400 mb-2'>
                正在导入书签...
              </p>
              <p className='text-sm text-gray-400 dark:text-gray-500 truncate px-4'>
                {progress.currentItem}
              </p>
              <div className='mt-4 bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden'>
                <div
                  className='bg-orange-500 h-full transition-all duration-300'
                  style={{
                    width: `${(progress.current / progress.total) * 100}%`,
                  }}
                />
              </div>
              <p className='text-sm text-gray-400 mt-2'>
                {progress.current} / {progress.total}
              </p>
            </div>
          )}

          {step === 'done' && (
            <div className='text-center py-8'>
              <CheckCircle className='h-12 w-12 mx-auto text-green-500 mb-4' />
              <p className='text-lg font-medium text-gray-900 dark:text-gray-100 mb-2'>
                导入完成！
              </p>
              <p className='text-gray-600 dark:text-gray-400'>
                新增 {importStats.categories} 个分类，{importStats.sites} 个站点
              </p>
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <div className='px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3'>
          {step === 'upload' && (
            <button
              className='px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors'
              onClick={handleClose}
            >
              取消
            </button>
          )}
          {step === 'preview' && (
            <>
              <button
                className='px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors'
                onClick={() => {
                  setStep('upload');
                  setParsedResult(null);
                }}
              >
                重新选择
              </button>
              <button
                className='px-4 py-2 text-sm font-medium text-white bg-orange-500 hover:bg-orange-600 rounded-lg transition-colors'
                onClick={handleImport}
              >
                开始导入
              </button>
            </>
          )}
          {step === 'done' && (
            <button
              className='px-4 py-2 text-sm font-medium text-white bg-orange-500 hover:bg-orange-600 rounded-lg transition-colors'
              onClick={handleClose}
            >
              完成
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
