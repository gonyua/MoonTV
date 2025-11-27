// 导航分类
export interface NavCategory {
  id: string;
  username?: string;
  name: string;
  icon?: string;
  description?: string;
  color?: string;
  parentId?: string;
  order: number;
  sortBy?: 'order' | 'name' | 'visit' | 'created' | 'updated';
  isCollapsed?: boolean;
  isVisible?: boolean;
  isPrivate?: boolean;
  password?: string;
  createdAt: number;
  updatedAt?: number;
  deletedAt?: number;
}

// 导航站点
export interface NavSite {
  id: string;
  username?: string;
  categoryId: string;
  name: string;
  url: string;
  backupUrl?: string;
  description?: string;
  keywords?: string;
  icon?: string;
  iconType?: 'auto' | 'url' | 'emoji' | 'letter';
  iconBgColor?: string;
  tags: string[];
  order: number;
  isPinned?: boolean;
  isVisible?: boolean;
  isPrivate?: boolean;
  password?: string;
  target?: '_blank' | '_self';
  status?: number;
  statusCheckAt?: number;
  visitCount?: number;
  lastVisitAt?: number;
  rating?: number;
  notes?: string;
  images?: string[];
  createdAt: number;
  updatedAt?: number;
  deletedAt?: number;
}

// 导航数据
export interface NavsData {
  categories: NavCategory[];
  sites: NavSite[];
}

// 分类创建参数
export interface CreateCategoryParams {
  name: string;
  icon?: string;
  description?: string;
  color?: string;
  parentId?: string;
  isPrivate?: boolean;
  password?: string;
}

// 分类更新参数
export interface UpdateCategoryParams {
  name?: string;
  icon?: string;
  description?: string;
  color?: string;
  parentId?: string;
  order?: number;
  sortBy?: 'order' | 'name' | 'visit' | 'created' | 'updated';
  isCollapsed?: boolean;
  isVisible?: boolean;
  isPrivate?: boolean;
  password?: string;
}

// 站点创建参数
export interface CreateSiteParams {
  categoryId: string;
  name: string;
  url: string;
  backupUrl?: string;
  description?: string;
  keywords?: string;
  icon?: string;
  iconType?: 'auto' | 'url' | 'emoji' | 'letter';
  iconBgColor?: string;
  tags?: string[];
  isPrivate?: boolean;
  password?: string;
  target?: '_blank' | '_self';
  notes?: string;
  images?: string[];
}

// 站点更新参数
export interface UpdateSiteParams {
  categoryId?: string;
  name?: string;
  url?: string;
  backupUrl?: string;
  description?: string;
  keywords?: string;
  icon?: string;
  iconType?: 'auto' | 'url' | 'emoji' | 'letter';
  iconBgColor?: string;
  tags?: string[];
  order?: number;
  isPinned?: boolean;
  isVisible?: boolean;
  isPrivate?: boolean;
  password?: string;
  target?: '_blank' | '_self';
  rating?: number;
  notes?: string;
  images?: string[];
}
