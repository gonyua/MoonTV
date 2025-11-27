export interface NavCategory {
  id: string;
  name: string;
  icon?: string;
  order: number;
  createdAt: number;
}

export interface NavSite {
  id: string;
  categoryId: string;
  name: string;
  url: string;
  description?: string;
  icon?: string;
  tags: string[];
  order: number;
  createdAt: number;
}

export interface NavsData {
  categories: NavCategory[];
  sites: NavSite[];
}
