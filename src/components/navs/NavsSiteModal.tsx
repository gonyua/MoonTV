'use client';

import { X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { addSite, fetchFavicon, updateSite } from '@/lib/navs.client';
import { NavCategory, NavSite } from '@/lib/navs.types';

interface NavsSiteModalProps {
  open: boolean;
  onClose: () => void;
  site: NavSite | null;
  categories: NavCategory[];
  defaultCategoryId: string | null;
}

export default function NavsSiteModal({
  open,
  onClose,
  site,
  categories,
  defaultCategoryId,
}: NavsSiteModalProps) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [icon, setIcon] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchingIcon, setFetchingIcon] = useState(false);

  const isEditing = !!site;

  useEffect(() => {
    if (open) {
      if (site) {
        setName(site.name);
        setUrl(site.url);
        setDescription(site.description || '');
        setCategoryId(site.categoryId);
        setIcon(site.icon || '');
        setTagsInput(site.tags.join(', '));
      } else {
        setName('');
        setUrl('');
        setDescription('');
        setCategoryId(defaultCategoryId || categories[0]?.id || '');
        setIcon('');
        setTagsInput('');
      }
    }
  }, [open, site, defaultCategoryId, categories]);

  const handleUrlBlur = useCallback(async () => {
    if (!url || icon) return;
    setFetchingIcon(true);
    try {
      const faviconUrl = await fetchFavicon(url);
      if (faviconUrl) {
        setIcon(faviconUrl);
      }
    } catch {
      // 忽略错误
    } finally {
      setFetchingIcon(false);
    }
  }, [url, icon]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!name.trim() || !url.trim() || !categoryId) return;

      setLoading(true);
      try {
        const tags = tagsInput
          .split(/[,，]/)
          .map((t) => t.trim())
          .filter(Boolean);

        if (isEditing && site) {
          await updateSite(site.id, {
            name: name.trim(),
            url: url.trim(),
            description: description.trim() || undefined,
            categoryId,
            icon: icon.trim() || undefined,
            tags,
          });
        } else {
          await addSite({
            categoryId,
            name: name.trim(),
            url: url.trim(),
            description: description.trim() || undefined,
            icon: icon.trim() || undefined,
            tags,
          });
        }
        onClose();
      } finally {
        setLoading(false);
      }
    },
    [
      name,
      url,
      description,
      categoryId,
      icon,
      tagsInput,
      isEditing,
      site,
      onClose,
    ]
  );

  if (!open) return null;

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center'>
      <div className='absolute inset-0 bg-black/50' onClick={onClose} />
      <div className='relative bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto'>
        <div className='flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700'>
          <h2 className='text-lg font-semibold text-gray-900 dark:text-gray-100'>
            {isEditing ? '编辑站点' : '新增站点'}
          </h2>
          <button
            className='p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors'
            onClick={onClose}
          >
            <X className='h-5 w-5 text-gray-500' />
          </button>
        </div>

        <form onSubmit={handleSubmit} className='p-6 space-y-4'>
          <div>
            <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'>
              分类 <span className='text-red-500'>*</span>
            </label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-orange-500 focus:border-transparent'
              required
            >
              <option value=''>请选择分类</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'>
              站点名称 <span className='text-red-500'>*</span>
            </label>
            <input
              type='text'
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder='例如：Google'
              className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-orange-500 focus:border-transparent'
              required
            />
          </div>

          <div>
            <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'>
              站点地址 <span className='text-red-500'>*</span>
            </label>
            <input
              type='url'
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onBlur={handleUrlBlur}
              placeholder='https://example.com'
              className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-orange-500 focus:border-transparent'
              required
            />
          </div>

          <div>
            <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'>
              描述
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder='简短描述该站点'
              rows={2}
              className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-orange-500 focus:border-transparent resize-none'
            />
          </div>

          <div>
            <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'>
              图标地址
              {fetchingIcon && (
                <span className='ml-2 text-xs text-gray-400'>获取中...</span>
              )}
            </label>
            <input
              type='url'
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              placeholder='留空则自动获取或显示首字母'
              className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-orange-500 focus:border-transparent'
            />
          </div>

          <div>
            <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'>
              标签
            </label>
            <input
              type='text'
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder='多个标签用逗号分隔，如：gpt, ai, 工具'
              className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-orange-500 focus:border-transparent'
            />
          </div>

          <div className='flex justify-end gap-3 pt-4'>
            <button
              type='button'
              onClick={onClose}
              className='px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors'
            >
              取消
            </button>
            <button
              type='submit'
              disabled={loading || !name.trim() || !url.trim() || !categoryId}
              className='px-4 py-2 text-sm font-medium text-white bg-orange-500 hover:bg-orange-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
            >
              {loading ? '保存中...' : isEditing ? '保存' : '添加'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
