'use client';

import { X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { addCategory, updateCategory } from '@/lib/navs.client';
import { NavCategory } from '@/lib/navs.types';

interface NavsCategoryModalProps {
  open: boolean;
  onClose: () => void;
  category: NavCategory | null;
}

const EMOJI_OPTIONS = [
  '📁',
  '🎬',
  '🎮',
  '💻',
  '🔧',
  '📚',
  '🎨',
  '🎵',
  '📷',
  '🌐',
  '💡',
  '🔍',
  '📱',
  '🛠',
  '🎯',
  '⭐',
];

export default function NavsCategoryModal({
  open,
  onClose,
  category,
}: NavsCategoryModalProps) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');
  const [loading, setLoading] = useState(false);

  const isEditing = !!category;

  useEffect(() => {
    if (open) {
      if (category) {
        setName(category.name);
        setIcon(category.icon || '');
      } else {
        setName('');
        setIcon('');
      }
    }
  }, [open, category]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!name.trim()) return;

      setLoading(true);
      try {
        if (isEditing && category) {
          await updateCategory(category.id, {
            name: name.trim(),
            icon: icon || undefined,
          });
        } else {
          await addCategory({
            name: name.trim(),
            icon: icon || undefined,
          });
        }
        onClose();
      } finally {
        setLoading(false);
      }
    },
    [name, icon, isEditing, category, onClose]
  );

  if (!open) return null;

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center'>
      <div className='absolute inset-0 bg-black/50' onClick={onClose} />
      <div className='relative bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-sm mx-4'>
        <div className='flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700'>
          <h2 className='text-lg font-semibold text-gray-900 dark:text-gray-100'>
            {isEditing ? '编辑分类' : '新增分类'}
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
              分类名称 <span className='text-red-500'>*</span>
            </label>
            <input
              type='text'
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder='例如：常用工具'
              className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-orange-500 focus:border-transparent'
              required
              autoFocus
            />
          </div>

          <div>
            <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
              图标（可选）
            </label>
            <div className='flex flex-wrap gap-2 mb-2'>
              {EMOJI_OPTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type='button'
                  className={`w-9 h-9 flex items-center justify-center text-lg rounded-lg border transition-colors ${
                    icon === emoji
                      ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/30'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                  onClick={() => setIcon(emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>
            <input
              type='text'
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              placeholder='或输入自定义 emoji'
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
              disabled={loading || !name.trim()}
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
