'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import Image from 'next/image';
import { useState } from 'react';

import { generateBgColor } from '@/lib/navs.client';
import { NavSite } from '@/lib/navs.types';

interface NavsSiteCardProps {
  site: NavSite;
  onEdit: () => void;
  onDelete: () => void;
  onTagClick: (tag: string) => void;
}

export default function NavsSiteCard({
  site,
  onEdit,
  onDelete,
  onTagClick,
}: NavsSiteCardProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [iconError, setIconError] = useState(false);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: site.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const bgColor = generateBgColor(site.name);

  const handleClick = () => {
    window.open(site.url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className='group relative bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600 transition-all cursor-pointer'
      onClick={handleClick}
    >
      {/* 拖拽手柄 */}
      <div
        {...attributes}
        {...listeners}
        className='absolute top-2 left-2 cursor-grab opacity-0 group-hover:opacity-100 transition-opacity'
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className='h-4 w-4 text-gray-400' />
      </div>

      {/* 更多操作 */}
      <div className='absolute top-2 right-2'>
        <button
          className='p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gray-100 dark:hover:bg-gray-700'
          onClick={(e) => {
            e.stopPropagation();
            setShowMenu(!showMenu);
          }}
        >
          <MoreHorizontal className='h-4 w-4 text-gray-400' />
        </button>

        {showMenu && (
          <>
            <div
              className='fixed inset-0 z-10'
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(false);
              }}
            />
            <div className='absolute right-0 top-full mt-1 w-28 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-20'>
              <button
                className='w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2'
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMenu(false);
                  onEdit();
                }}
              >
                <Pencil className='h-4 w-4' />
                编辑
              </button>
              <button
                className='w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2'
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMenu(false);
                  onDelete();
                }}
              >
                <Trash2 className='h-4 w-4' />
                删除
              </button>
            </div>
          </>
        )}
      </div>

      <div className='flex items-start gap-3'>
        {/* 图标 */}
        <div className='flex-shrink-0'>
          {site.icon && !iconError ? (
            <div className='w-10 h-10 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700 flex items-center justify-center'>
              <Image
                src={site.icon}
                alt={site.name}
                width={40}
                height={40}
                className='object-contain'
                onError={() => setIconError(true)}
              />
            </div>
          ) : (
            <div
              className='w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-lg'
              style={{ backgroundColor: bgColor }}
            >
              {site.name.charAt(0).toUpperCase()}
            </div>
          )}
        </div>

        {/* 内容 */}
        <div className='flex-1 min-w-0'>
          <h3 className='text-sm font-medium text-gray-900 dark:text-gray-100 truncate'>
            {site.name}
          </h3>
          {site.description && (
            <p className='mt-0.5 text-xs text-gray-500 dark:text-gray-400 line-clamp-2'>
              {site.description}
            </p>
          )}

          {/* 标签 */}
          {site.tags.length > 0 && (
            <div className='mt-2 flex flex-wrap gap-1'>
              {site.tags.map((tag) => (
                <span
                  key={tag}
                  className='inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-orange-100 hover:text-orange-600 dark:hover:bg-orange-900/30 dark:hover:text-orange-400 cursor-pointer transition-colors'
                  onClick={(e) => {
                    e.stopPropagation();
                    onTagClick(tag);
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
