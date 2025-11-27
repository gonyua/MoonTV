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
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { ChevronRight, Plus, Tag, X } from 'lucide-react';
import { useCallback, useMemo } from 'react';

import { deleteSite, getCategoryTags, reorderSites } from '@/lib/navs.client';
import { NavCategory, NavSite } from '@/lib/navs.types';

import NavsSiteCard from './NavsSiteCard';

interface NavsSiteListProps {
  categories: NavCategory[];
  sites: NavSite[];
  selectedTag: string | null;
  onTagSelect: (tag: string | null) => void;
  onEditSite: (site: NavSite) => void;
  onAddSite: (categoryId?: string) => void;
}

export default function NavsSiteList({
  categories,
  sites,
  selectedTag,
  onTagSelect,
  onEditSite,
  onAddSite,
}: NavsSiteListProps) {
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

  const handleDeleteSite = useCallback((id: string) => {
    if (window.confirm('确定要删除该站点吗？')) {
      deleteSite(id);
    }
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent, categoryId: string) => {
      const { active, over } = event;
      if (over && active.id !== over.id) {
        const categorySites = sites
          .filter((s) => s.categoryId === categoryId)
          .sort((a, b) => a.order - b.order);
        const oldIndex = categorySites.findIndex((s) => s.id === active.id);
        const newIndex = categorySites.findIndex((s) => s.id === over.id);
        const newOrder = arrayMove(categorySites, oldIndex, newIndex);
        reorderSites(
          categoryId,
          newOrder.map((s) => s.id)
        );
      }
    },
    [sites]
  );

  // 根据标签筛选站点
  const filteredSites = useMemo(() => {
    if (!selectedTag) return sites;
    return sites.filter((s) => s.tags.includes(selectedTag));
  }, [sites, selectedTag]);

  // 按分类分组站点
  const groupedSites = useMemo(() => {
    const groups: Record<string, NavSite[]> = {};
    categories.forEach((cat) => {
      groups[cat.id] = filteredSites
        .filter((s) => s.categoryId === cat.id)
        .sort((a, b) => a.order - b.order);
    });
    return groups;
  }, [categories, filteredSites]);

  if (categories.length === 0) {
    return (
      <div className='flex-1 flex items-center justify-center'>
        <div className='text-center text-gray-500 dark:text-gray-400'>
          <p className='text-lg'>暂无导航数据</p>
          <p className='mt-2 text-sm'>请先在左侧添加分类</p>
        </div>
      </div>
    );
  }

  return (
    <div className='p-6 space-y-8'>
      {/* 标签筛选提示 */}
      {selectedTag && (
        <div className='flex items-center gap-2 px-4 py-2 bg-orange-50 dark:bg-orange-900/20 rounded-lg'>
          <Tag className='h-4 w-4 text-orange-500' />
          <span className='text-sm text-orange-700 dark:text-orange-300'>
            正在筛选标签: <strong>{selectedTag}</strong>
          </span>
          <button
            className='ml-auto p-1 hover:bg-orange-100 dark:hover:bg-orange-900/40 rounded'
            onClick={() => onTagSelect(null)}
          >
            <X className='h-4 w-4 text-orange-500' />
          </button>
        </div>
      )}

      {categories.map((category) => {
        const categorySites = groupedSites[category.id] || [];
        const categoryTags = getCategoryTags(category.id);

        return (
          <section
            key={category.id}
            id={`category-section-${category.id}`}
            data-category-id={category.id}
            className='scroll-mt-6'
          >
            {/* 分类标题 */}
            <div className='flex items-center justify-between mb-4'>
              <div className='flex items-center gap-2'>
                <h2 className='text-lg font-semibold text-gray-900 dark:text-gray-100'>
                  {category.name}
                </h2>
                <span className='text-sm text-gray-400'>
                  {categorySites.length} 个站点
                </span>
                <ChevronRight className='h-4 w-4 text-gray-400' />

                {/* 分类下的标签 */}
                {categoryTags.length > 0 && (
                  <div className='flex items-center gap-1 ml-2'>
                    {categoryTags.slice(0, 5).map((tag) => (
                      <button
                        key={tag}
                        className={`px-2 py-0.5 text-xs rounded-full transition-colors ${
                          selectedTag === tag
                            ? 'bg-orange-500 text-white'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-orange-100 hover:text-orange-600 dark:hover:bg-orange-900/30 dark:hover:text-orange-400'
                        }`}
                        onClick={() =>
                          onTagSelect(selectedTag === tag ? null : tag)
                        }
                      >
                        {tag}
                      </button>
                    ))}
                    {categoryTags.length > 5 && (
                      <span className='text-xs text-gray-400'>
                        +{categoryTags.length - 5}
                      </span>
                    )}
                  </div>
                )}
              </div>

              <button
                className='flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-orange-500 dark:hover:text-orange-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors'
                onClick={() => onAddSite(category.id)}
              >
                <Plus className='h-4 w-4' />
                添加
              </button>
            </div>

            {/* 站点网格 */}
            {categorySites.length > 0 ? (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={(e) => handleDragEnd(e, category.id)}
              >
                <SortableContext
                  items={categorySites.map((s) => s.id)}
                  strategy={rectSortingStrategy}
                >
                  <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4'>
                    {categorySites.map((site) => (
                      <NavsSiteCard
                        key={site.id}
                        site={site}
                        onEdit={() => onEditSite(site)}
                        onDelete={() => handleDeleteSite(site.id)}
                        onTagClick={onTagSelect}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            ) : (
              <div className='text-center py-8 text-gray-400 dark:text-gray-500 text-sm border border-dashed border-gray-200 dark:border-gray-700 rounded-lg'>
                {selectedTag
                  ? `该分类下没有标签为 "${selectedTag}" 的站点`
                  : '暂无站点，点击上方"添加"按钮添加'}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
