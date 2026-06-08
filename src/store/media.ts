import { create } from 'zustand';
import type { MediaItem } from '@/types';

export interface Upload {
  id: string;
  name: string;
  progress: number; // 0..1
  status: 'uploading' | 'done' | 'error';
  error?: string;
}

interface MediaState {
  list: MediaItem[];
  loaded: boolean;
  uploads: Upload[];
  setList: (list: MediaItem[]) => void;
  prepend: (item: MediaItem) => void;
  remove: (id: number) => void;
  addUpload: (u: Upload) => void;
  updateUpload: (id: string, patch: Partial<Upload>) => void;
  clearUpload: (id: string) => void;
}

export const useMediaStore = create<MediaState>((set) => ({
  list: [],
  loaded: false,
  uploads: [],
  setList: (list) => set({ list, loaded: true }),
  prepend: (item) =>
    set((s) => ({ list: [item, ...s.list.filter((m) => m.id !== item.id)] })),
  remove: (id) => set((s) => ({ list: s.list.filter((m) => m.id !== id) })),
  addUpload: (u) => set((s) => ({ uploads: [...s.uploads, u] })),
  updateUpload: (id, patch) =>
    set((s) => ({
      uploads: s.uploads.map((u) => (u.id === id ? { ...u, ...patch } : u)),
    })),
  clearUpload: (id) =>
    set((s) => ({ uploads: s.uploads.filter((u) => u.id !== id) })),
}));
