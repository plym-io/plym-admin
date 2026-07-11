import { create } from 'zustand';
import type { Faq } from '@/types';

interface FaqState {
  list: Faq[];
  loaded: boolean;
  setList: (list: Faq[]) => void;
  prepend: (item: Faq) => void;
  update: (item: Faq) => void;
  remove: (id: number) => void;
}

export const useFaqStore = create<FaqState>((set) => ({
  list: [],
  loaded: false,
  setList: (list) => set({ list, loaded: true }),
  prepend: (item) =>
    set((s) => ({ list: [item, ...s.list.filter((f) => f.id !== item.id)] })),
  update: (item) =>
    set((s) => ({ list: s.list.map((f) => (f.id === item.id ? item : f)) })),
  remove: (id) => set((s) => ({ list: s.list.filter((f) => f.id !== id) })),
}));
