'use client';

import {
  closestCenter,
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  FolderPlus,
  GripVertical,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useState } from 'react';

import { deleteCategory, reorderCategories } from '@/lib/navs.client';
import { NavCategory } from '@/lib/navs.types';

import { useSite } from '../SiteProvider';

interface SortableCategoryItemProps {
  category: NavCategory;
  isActive: boolean;
  onClick: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function SortableCategoryItem({
  category,
  isActive,
  onClick,
  onEdit,
  onDelete,
}: SortableCategoryItemProps) {
  const [showMenu, setShowMenu] = useState(false);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: category.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative flex items-center rounded-lg px-3 py-2.5 cursor-pointer transition-all ${
        isActive
          ? 'bg-orange-500 text-white'
          : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
      }`}
      onClick={onClick}
    >
      <div
        {...attributes}
        {...listeners}
        className='mr-2 cursor-grab opacity-0 group-hover:opacity-100 transition-opacity'
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className='h-4 w-4 text-gray-400' />
      </div>

      {category.icon ? (
        <span className='mr-2 text-lg'>{category.icon}</span>
      ) : (
        <span
          className={`mr-2 w-5 h-5 rounded flex items-center justify-center text-xs font-medium ${
            isActive ? 'bg-white/20' : 'bg-gray-200 dark:bg-gray-700'
          }`}
        >
          {category.name.charAt(0)}
        </span>
      )}

      <span className='flex-1 truncate text-sm font-medium'>
        {category.name}
      </span>

      <div className='relative'>
        <button
          className={`p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity ${
            isActive
              ? 'hover:bg-white/20'
              : 'hover:bg-gray-200 dark:hover:bg-gray-700'
          }`}
          onClick={(e) => {
            e.stopPropagation();
            setShowMenu(!showMenu);
          }}
        >
          <MoreHorizontal className='h-4 w-4' />
        </button>

        {showMenu && (
          <>
            <div
              className='fixed inset-0 z-10'
              onClick={() => setShowMenu(false)}
            />
            <div className='absolute right-0 top-full mt-1 w-32 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-20'>
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
    </div>
  );
}

interface NavsSidebarProps {
  categories: NavCategory[];
  activeCategory: string | null;
  onCategoryClick: (categoryId: string) => void;
  onAddSite: (categoryId?: string) => void;
  onAddCategory: () => void;
  onEditCategory: (category: NavCategory) => void;
  onImport: () => void;
}

export default function NavsSidebar({
  categories,
  activeCategory,
  onCategoryClick,
  onAddSite,
  onAddCategory,
  onEditCategory,
  onImport,
}: NavsSidebarProps) {
  const { siteName } = useSite();
  const [showAddMenu, setShowAddMenu] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (over && active.id !== over.id) {
        const oldIndex = categories.findIndex((c) => c.id === active.id);
        const newIndex = categories.findIndex((c) => c.id === over.id);
        const newOrder = arrayMove(categories, oldIndex, newIndex);
        await reorderCategories(newOrder.map((c) => c.id));
      }
    },
    [categories]
  );

  const handleDeleteCategory = useCallback(async (id: string) => {
    if (window.confirm('确定要删除该分类及其下所有站点吗？')) {
      await deleteCategory(id);
    }
  }, []);

  return (
    <aside className='w-56 h-screen bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col'>
      {/* 顶部标题和新增按钮 */}
      <div className='h-14 px-4 flex items-center justify-between border-b border-gray-200 dark:border-gray-800'>
        <Link href='/' className='text-lg font-bold text-orange-500'>
          {siteName}
        </Link>
        <div className='relative'>
          <button
            className='p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors'
            onClick={() => setShowAddMenu(!showAddMenu)}
          >
            <Plus className='h-5 w-5 text-gray-600 dark:text-gray-400' />
          </button>

          {showAddMenu && (
            <>
              <div
                className='fixed inset-0 z-10'
                onClick={() => setShowAddMenu(false)}
              />
              <div className='absolute right-0 top-full mt-1 w-36 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-20'>
                <button
                  className='w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2'
                  onClick={() => {
                    setShowAddMenu(false);
                    onAddSite();
                  }}
                >
                  <Plus className='h-4 w-4' />
                  新增站点
                </button>
                <button
                  className='w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2'
                  onClick={() => {
                    setShowAddMenu(false);
                    onAddCategory();
                  }}
                >
                  <FolderPlus className='h-4 w-4' />
                  新增分类
                </button>
                <div className='border-t border-gray-200 dark:border-gray-700 my-1' />
                <button
                  className='w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2'
                  onClick={() => {
                    setShowAddMenu(false);
                    onImport();
                  }}
                >
                  <Upload className='h-4 w-4' />
                  导入书签
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 分类列表 */}
      <div className='flex-1 overflow-y-auto py-2 px-2'>
        {categories.length === 0 ? (
          <div className='text-center py-8 text-gray-500 dark:text-gray-400 text-sm'>
            <p>暂无分类</p>
            <button
              className='mt-2 text-orange-500 hover:text-orange-600'
              onClick={onAddCategory}
            >
              点击新增
            </button>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={categories.map((c) => c.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className='space-y-1'>
                {categories.map((category) => (
                  <SortableCategoryItem
                    key={category.id}
                    category={category}
                    isActive={activeCategory === category.id}
                    onClick={() => onCategoryClick(category.id)}
                    onEdit={() => onEditCategory(category)}
                    onDelete={() => handleDeleteCategory(category.id)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </aside>
  );
}
