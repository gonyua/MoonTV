export interface NoteItem {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  tags?: string[];
  pinned?: boolean;
  summary?: string | null;
  isArchived?: boolean;
  deletedAt?: number | null;
}

export interface NoteInput {
  title?: string;
  content?: string;
  tags?: string[];
  pinned?: boolean;
  summary?: string | null;
  isArchived?: boolean;
}
