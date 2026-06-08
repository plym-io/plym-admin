import { create } from 'zustand';
import type { PostListItem } from '@/types';

interface PostsState {
  /** List cache for the posts page + command palette. */
  list: PostListItem[];
  loaded: boolean;
  setList: (list: PostListItem[]) => void;
  upsert: (post: PostListItem) => void;
  remove: (id: number) => void;
  patch: (id: number, patch: Partial<PostListItem>) => void;
}

export const usePostsStore = create<PostsState>((set) => ({
  list: [],
  loaded: false,
  setList: (list) => set({ list, loaded: true }),
  upsert: (post) =>
    set((s) => {
      const idx = s.list.findIndex((p) => p.id === post.id);
      if (idx === -1) return { list: [post, ...s.list] };
      const next = [...s.list];
      next[idx] = post;
      return { list: next };
    }),
  remove: (id) => set((s) => ({ list: s.list.filter((p) => p.id !== id) })),
  patch: (id, patch) =>
    set((s) => ({
      list: s.list.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    })),
}));
