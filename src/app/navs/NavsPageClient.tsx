'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { getNavsData, subscribeToNavsUpdates } from '@/lib/navs.client';
import { NavCategory, NavsData, NavSite } from '@/lib/navs.types';

import NavsCategoryModal from '@/components/navs/NavsCategoryModal';
import NavsImportModal from '@/components/navs/NavsImportModal';
import NavsSidebar from '@/components/navs/NavsSidebar';
import NavsSiteList from '@/components/navs/NavsSiteList';
import NavsSiteModal from '@/components/navs/NavsSiteModal';

export default function NavsPageClient() {
  const [navsData, setNavsData] = useState<NavsData>({
    categories: [],
    sites: [],
  });
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [siteModalOpen, setSiteModalOpen] = useState(false);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [editingSite, setEditingSite] = useState<NavSite | null>(null);
  const [editingCategory, setEditingCategory] = useState<NavCategory | null>(
    null
  );
  const [defaultCategoryId, setDefaultCategoryId] = useState<string | null>(
    null
  );
  const siteListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadData = async () => {
      const data = await getNavsData();
      setNavsData(data);
      if (data.categories.length > 0 && !activeCategory) {
        setActiveCategory(data.categories[0].id);
      }
    };
    loadData();

    const unsubscribe = subscribeToNavsUpdates((newData) => {
      setNavsData(newData);
    });

    return unsubscribe;
  }, [activeCategory]);

  const handleCategoryClick = useCallback((categoryId: string) => {
    setActiveCategory(categoryId);
    setSelectedTag(null);
    const element = document.getElementById(`category-section-${categoryId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  const handleAddSite = useCallback((categoryId?: string) => {
    setEditingSite(null);
    setDefaultCategoryId(categoryId || null);
    setSiteModalOpen(true);
  }, []);

  const handleEditSite = useCallback((site: NavSite) => {
    setEditingSite(site);
    setDefaultCategoryId(null);
    setSiteModalOpen(true);
  }, []);

  const handleAddCategory = useCallback(() => {
    setEditingCategory(null);
    setCategoryModalOpen(true);
  }, []);

  const handleEditCategory = useCallback((category: NavCategory) => {
    setEditingCategory(category);
    setCategoryModalOpen(true);
  }, []);

  const handleImport = useCallback(() => {
    setImportModalOpen(true);
  }, []);

  const handleTagSelect = useCallback((tag: string | null) => {
    setSelectedTag(tag);
  }, []);

  const handleScroll = useCallback(() => {
    if (!siteListRef.current) return;

    const sections = siteListRef.current.querySelectorAll('[data-category-id]');
    const scrollTop = siteListRef.current.scrollTop;
    const offset = 100;

    for (let i = sections.length - 1; i >= 0; i--) {
      const section = sections[i] as HTMLElement;
      const sectionTop = section.offsetTop - offset;
      if (scrollTop >= sectionTop) {
        const categoryId = section.dataset.categoryId;
        if (categoryId && categoryId !== activeCategory) {
          setActiveCategory(categoryId);
        }
        break;
      }
    }
  }, [activeCategory]);

  return (
    <div className='flex h-screen bg-gray-50 dark:bg-gray-900'>
      <NavsSidebar
        categories={navsData.categories}
        activeCategory={activeCategory}
        onCategoryClick={handleCategoryClick}
        onAddSite={handleAddSite}
        onAddCategory={handleAddCategory}
        onEditCategory={handleEditCategory}
        onImport={handleImport}
      />

      <div
        ref={siteListRef}
        className='flex-1 overflow-y-auto'
        onScroll={handleScroll}
      >
        <NavsSiteList
          categories={navsData.categories}
          sites={navsData.sites}
          selectedTag={selectedTag}
          onTagSelect={handleTagSelect}
          onEditSite={handleEditSite}
          onAddSite={handleAddSite}
        />
      </div>

      <NavsSiteModal
        open={siteModalOpen}
        onClose={() => setSiteModalOpen(false)}
        site={editingSite}
        categories={navsData.categories}
        defaultCategoryId={defaultCategoryId}
      />

      <NavsCategoryModal
        open={categoryModalOpen}
        onClose={() => setCategoryModalOpen(false)}
        category={editingCategory}
      />

      <NavsImportModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
      />
    </div>
  );
}
