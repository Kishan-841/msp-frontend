import { create } from 'zustand';
import api from '@/lib/axios';
import { TASKS, type TaskKey } from '@/lib/tasks';

interface TaskState {
  tasks: { key: TaskKey; count: number }[];
  /** Badge per sidebar section — only work that's on the user ("waiting" items excluded) */
  badges: Record<string, number>;
  fetchCounts: () => Promise<void>;
  reset: () => void;
}

let inflight: Promise<void> | null = null;
let dirty = false;

export const useTaskStore = create<TaskState>((set) => ({
  tasks: [],
  badges: {},
  reset: () => set({ tasks: [], badges: {} }),

  // Called on load and whenever the socket says data changed. Concurrent calls share one request;
  // a call that arrives while one is running marks it dirty so it runs once more afterwards
  // (that request may have read the data before the change).
  fetchCounts: () => {
    if (inflight) {
      dirty = true;
      return inflight;
    }
    inflight = (async () => {
      try {
        const { data } = await api.get('/tasks/counts');
        const tasks = (data.data ?? []) as { key: TaskKey; count: number }[];
        const badges: Record<string, number> = {};
        for (const t of tasks) {
          const info = TASKS[t.key];
          if (info && !info.waiting && t.count > 0) {
            badges[info.section] = (badges[info.section] ?? 0) + t.count;
          }
        }
        set({ tasks, badges });
      } catch {
        // silently keep the last counts
      } finally {
        inflight = null;
        if (dirty) {
          dirty = false;
          void useTaskStore.getState().fetchCounts();
        }
      }
    })();
    return inflight;
  },
}));
