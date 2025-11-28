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

type FileType = 'html' | 'json';
type ImportMode = 'flatten' | 'simplify';
type ImportStep = 'upload' | 'preview' | 'importing' | 'done';

interface ImportProgress {
  current: number;
  total: number;
  currentItem: string;
}

// JSON 导入格式
interface JsonImportSite {
  站点名称: string;
  站点地址: string;
  描述?: string;
  图标?: string;
  标签?: string[];
}

interface JsonImportData {
  [categoryName: string]: JsonImportSite[];
}

// 统一的预览数据格式
interface PreviewCategory {
  name: string;
  sites: Array<{ name: string; url: string }>;
}

export default function NavsImportModal({
  open,
  onClose,
}: NavsImportModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<ImportStep>('upload');
  const [fileType, setFileType] = useState<FileType | null>(null);
  const [parsedHtmlResult, setParsedHtmlResult] =
    useState<ParsedBookmarksResult | null>(null);
  const [parsedJsonResult, setParsedJsonResult] =
    useState<JsonImportData | null>(null);
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
      const isJson = file.name.endsWith('.json');

      if (isJson) {
        try {
          const jsonData = JSON.parse(text) as JsonImportData;
          setParsedJsonResult(jsonData);
          setFileType('json');
          setStep('preview');
        } catch {
          alert('JSON 文件格式错误');
        }
      } else {
        const result = parseBookmarksHtml(text);
        setParsedHtmlResult(result);
        setFileType('html');
        setStep('preview');
      }
    },
    []
  );

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    const isJson = file.name.endsWith('.json');
    const isHtml = file.name.endsWith('.html');
    if (!isJson && !isHtml) return;

    const text = await file.text();

    if (isJson) {
      try {
        const jsonData = JSON.parse(text) as JsonImportData;
        setParsedJsonResult(jsonData);
        setFileType('json');
        setStep('preview');
      } catch {
        alert('JSON 文件格式错误');
      }
    } else {
      const result = parseBookmarksHtml(text);
      setParsedHtmlResult(result);
      setFileType('html');
      setStep('preview');
    }
  }, []);

  // 获取预览数据（统一格式）
  const getPreviewData = useCallback((): PreviewCategory[] => {
    if (fileType === 'json' && parsedJsonResult) {
      return Object.entries(parsedJsonResult).map(([name, sites]) => ({
        name,
        sites: sites.map((s) => ({ name: s.站点名称, url: s.站点地址 })),
      }));
    }

    if (fileType === 'html' && parsedHtmlResult) {
      const folders =
        importMode === 'simplify'
          ? simplifyFolders(parsedHtmlResult.folders)
          : flattenFolders(parsedHtmlResult.folders);

      const result: PreviewCategory[] = folders.map((f) => ({
        name: f.name,
        sites: f.bookmarks.map((b) => ({ name: b.title, url: b.url })),
      }));

      if (parsedHtmlResult.rootBookmarks.length > 0) {
        result.unshift({
          name: '未分类',
          sites: parsedHtmlResult.rootBookmarks.map((b) => ({
            name: b.title,
            url: b.url,
          })),
        });
      }

      return result;
    }

    return [];
  }, [fileType, parsedJsonResult, parsedHtmlResult, importMode]);

  // 获取统计数据
  const getStats = useCallback(() => {
    const preview = getPreviewData();
    const totalCategories = preview.length;
    const totalSites = preview.reduce((sum, c) => sum + c.sites.length, 0);
    return { totalCategories, totalSites };
  }, [getPreviewData]);

  const handleImport = useCallback(async () => {
    setStep('importing');

    const previewData = getPreviewData();
    const totalSites = previewData.reduce((sum, c) => sum + c.sites.length, 0);
    setProgress({ current: 0, total: totalSites, currentItem: '' });

    let importedCategories = 0;
    let importedSites = 0;
    let processedCount = 0;

    // 获取现有分类
    const existingCats = await getCategories();
    const categoryMap = new Map<string, string>();
    existingCats.forEach((c) => categoryMap.set(c.name, c.id));

    for (const category of previewData) {
      // 查找或创建分类
      let categoryId = categoryMap.get(category.name);
      if (!categoryId) {
        const newCat = await addCategory({ name: category.name });
        if (newCat) {
          categoryId = newCat.id;
          categoryMap.set(category.name, categoryId);
          importedCategories++;
        }
      }

      if (!categoryId) continue;

      // 获取 JSON 中的额外信息
      const jsonSites =
        fileType === 'json' && parsedJsonResult
          ? parsedJsonResult[category.name]
          : null;

      // 导入站点
      for (let i = 0; i < category.sites.length; i++) {
        const site = category.sites[i];
        setProgress({
          current: processedCount,
          total: totalSites,
          currentItem: site.name,
        });

        // 获取图标
        const icon = (await fetchFavicon(site.url)) || undefined;

        // 获取 JSON 中的额外字段
        const jsonSite = jsonSites?.[i];

        await addSite({
          categoryId,
          name: site.name,
          url: site.url,
          icon: jsonSite?.图标 || icon,
          description: jsonSite?.描述,
          tags: jsonSite?.标签,
        });

        importedSites++;
        processedCount++;
      }
    }

    setImportStats({ categories: importedCategories, sites: importedSites });
    setStep('done');
  }, [getPreviewData, fileType, parsedJsonResult]);

  const handleClose = useCallback(() => {
    setStep('upload');
    setFileType(null);
    setParsedHtmlResult(null);
    setParsedJsonResult(null);
    setProgress({ current: 0, total: 0, currentItem: '' });
    setImportStats({ categories: 0, sites: 0 });
    onClose();
  }, [onClose]);

  const handleReset = useCallback(() => {
    setStep('upload');
    setFileType(null);
    setParsedHtmlResult(null);
    setParsedJsonResult(null);
  }, []);

  if (!open) return null;

  const stats = getStats();
  const previewData = getPreviewData();

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
            导入站点
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
                拖拽文件到这里，或点击选择文件
              </p>
              <p className='text-sm text-gray-400 dark:text-gray-500'>
                支持浏览器书签 HTML 或 JSON 格式
              </p>
              <input
                ref={fileInputRef}
                type='file'
                accept='.html,.json'
                className='hidden'
                onChange={handleFileSelect}
              />
            </div>
          )}

          {step === 'preview' && (
            <div className='space-y-4'>
              {/* 文件类型标识 */}
              <div className='flex items-center gap-2'>
                <span
                  className={`px-2 py-0.5 text-xs rounded-full ${
                    fileType === 'json'
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                      : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  }`}
                >
                  {fileType === 'json' ? 'JSON 格式' : 'HTML 书签'}
                </span>
              </div>

              {/* 统计信息 */}
              <div className='bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4'>
                <div className='flex justify-between text-sm'>
                  <span className='text-gray-600 dark:text-gray-400'>
                    分类数量:
                  </span>
                  <span className='font-medium text-gray-900 dark:text-gray-100'>
                    {stats.totalCategories} 个
                  </span>
                </div>
                <div className='flex justify-between text-sm mt-1'>
                  <span className='text-gray-600 dark:text-gray-400'>
                    站点数量:
                  </span>
                  <span className='font-medium text-gray-900 dark:text-gray-100'>
                    {stats.totalSites} 个
                  </span>
                </div>
              </div>

              {/* HTML 导入模式选择 */}
              {fileType === 'html' && (
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
              )}

              {/* 预览列表 */}
              <div>
                <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
                  将导入以下分类
                </label>
                <div className='max-h-48 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg'>
                  {previewData.map((category, index) => (
                    <div
                      key={index}
                      className='flex justify-between px-3 py-2 border-b border-gray-100 dark:border-gray-700 last:border-b-0'
                    >
                      <span className='text-sm text-gray-700 dark:text-gray-300 truncate'>
                        {category.name}
                      </span>
                      <span className='text-sm text-gray-400 flex-shrink-0 ml-2'>
                        {category.sites.length} 个
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 'importing' && (
            <div className='text-center py-8'>
              <Loader2 className='h-12 w-12 mx-auto text-orange-500 animate-spin mb-4' />
              <p className='text-gray-600 dark:text-gray-400 mb-2'>
                正在导入...
              </p>
              <p className='text-sm text-gray-400 dark:text-gray-500 truncate px-4'>
                {progress.currentItem}
              </p>
              <div className='mt-4 bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden'>
                <div
                  className='bg-orange-500 h-full transition-all duration-300'
                  style={{
                    width: `${
                      progress.total > 0
                        ? (progress.current / progress.total) * 100
                        : 0
                    }%`,
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
                onClick={handleReset}
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
