import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import { format, addDays, parseISO } from 'date-fns';
import { supabase } from '../lib/supabase';
import {
  Project, Task, CustomStatus, ColorMode,
  SortField, SortDirection, Assignee,
} from '../types';

// ─── DB conversion helpers ────────────────────────────────────────────────────

function taskFromDB(row: Record<string, unknown>): Task {
  return {
    id: row.id as string,
    number: row.number as number,
    name: row.name as string,
    assignees: (row.assignees as Assignee[]) ?? [],
    startDate: row.start_date as string,
    duration: row.duration as number,
    dependencies: (row.dependencies as string[]) ?? [],
    statusId: (row.status_id as string) ?? '',
    createdAt: row.created_at as string,
    order: row.task_order as number,
  };
}

function statusFromDB(row: Record<string, unknown>): CustomStatus {
  return {
    id: row.id as string,
    name: row.name as string,
    color: row.color as string,
  };
}

// ─── Filters / sort helpers ───────────────────────────────────────────────────
export interface Filters {
  statusIds: string[];
  assignees: string[];
}

export function applyFiltersAndSort(
  tasks: Task[],
  filters: Filters,
  sortField: SortField,
  sortDirection: SortDirection,
  statuses: CustomStatus[],
): Task[] {
  let result = [...tasks];

  if (filters.statusIds.length > 0)
    result = result.filter(t => filters.statusIds.includes(t.statusId));

  if (filters.assignees.length > 0)
    result = result.filter(t => t.assignees.some(a => filters.assignees.includes(a.name)));

  if (sortField === 'manual') {
    result.sort((a, b) => a.order - b.order);
  } else if (sortField === 'startDate') {
    result.sort((a, b) => {
      const cmp = a.startDate.localeCompare(b.startDate);
      return sortDirection === 'asc' ? cmp : -cmp;
    });
  } else if (sortField === 'endDate') {
    result.sort((a, b) => {
      const ea = format(addDays(parseISO(a.startDate), a.duration), 'yyyy-MM-dd');
      const eb = format(addDays(parseISO(b.startDate), b.duration), 'yyyy-MM-dd');
      const cmp = ea.localeCompare(eb);
      return sortDirection === 'asc' ? cmp : -cmp;
    });
  } else if (sortField === 'createdAt') {
    result.sort((a, b) => {
      const cmp = a.createdAt.localeCompare(b.createdAt);
      return sortDirection === 'asc' ? cmp : -cmp;
    });
  } else if (sortField === 'assignee') {
    result.sort((a, b) => {
      const na = a.assignees[0]?.name ?? '';
      const nb = b.assignees[0]?.name ?? '';
      const cmp = na.localeCompare(nb, 'he');
      return sortDirection === 'asc' ? cmp : -cmp;
    });
  } else if (sortField === 'status') {
    result.sort((a, b) => {
      const ia = statuses.findIndex(s => s.id === a.statusId);
      const ib = statuses.findIndex(s => s.id === b.statusId);
      const cmp = ia - ib;
      return sortDirection === 'asc' ? cmp : -cmp;
    });
  }

  return result;
}

// ─── Store interface ──────────────────────────────────────────────────────────
interface ProjectStore {
  projects: Project[];
  activeProjectId: string | null;
  activeAccountId: string | null;
  selectedTaskId: string | null;
  statuses: CustomStatus[];
  colorMode: ColorMode;
  filters: Filters;
  sortField: SortField;
  sortDirection: SortDirection;
  taskListWidth: number;
  isLoading: boolean;

  // Initialization
  initializeApp: (accountId: string) => Promise<void>;
  loadProjectData: (projectId: string) => Promise<void>;
  reloadProjects: () => Promise<void>;
  setActiveAccount: (accountId: string) => void;
  reset: () => void;

  // Project
  addProject: (name: string) => void;
  renameProject: (id: string, name: string) => void;
  deleteProject: (id: string) => void;
  setActiveProject: (id: string) => void;

  // Task
  addTask: () => string;
  updateTask: (taskId: string, updates: Partial<Omit<Task, 'id' | 'number' | 'createdAt'>>) => void;
  deleteTask: (taskId: string) => void;
  reorderTasks: (orderedIds: string[]) => void;
  selectTask: (taskId: string | null) => void;

  // Status
  addStatus: (name: string, color: string) => CustomStatus;
  updateStatus: (id: string, updates: Partial<Omit<CustomStatus, 'id'>>) => void;
  deleteStatus: (id: string) => void;

  // Settings
  setColorMode: (mode: ColorMode) => void;
  setFilters: (filters: Partial<Filters>) => void;
  setSortField: (field: SortField) => void;
  setSortDirection: (dir: SortDirection) => void;
  setTaskListWidth: (width: number) => void;
}

// ─── Store ────────────────────────────────────────────────────────────────────
export const useProjectStore = create<ProjectStore>()(
  persist(
    (set, get) => ({
      projects: [],
      activeProjectId: null,
      activeAccountId: null,
      selectedTaskId: null,
      statuses: [],
      colorMode: 'status',
      filters: { statusIds: [], assignees: [] },
      sortField: 'manual',
      sortDirection: 'asc',
      taskListWidth: 320,
      isLoading: false,

      // ── Initialization ────────────────────────────────────────────────────
      initializeApp: async (accountId: string) => {
        set({ isLoading: true, activeAccountId: accountId });
        await get().reloadProjects();
        const { projects } = get();
        if (projects.length > 0) {
          const firstId = projects[0].id;
          set({ activeProjectId: firstId });
          await get().loadProjectData(firstId);
        }
        set({ isLoading: false });
      },

      reloadProjects: async () => {
        const { activeAccountId } = get();
        if (!activeAccountId) return;
        const { data } = await supabase.rpc('get_my_projects', { p_account_id: activeAccountId });
        const projects: Project[] = (data ?? []).map((p: { id: string; name: string; account_id: string }) => ({
          id: p.id,
          name: p.name,
          accountId: p.account_id,
          tasks: [],
        }));
        set({ projects });
      },

      loadProjectData: async (projectId: string) => {
        const { data } = await supabase.rpc('get_project_data', { p_project_id: projectId });
        const result = data as { statuses: Record<string, unknown>[] | null; tasks: Record<string, unknown>[] | null } | null;
        const statuses = (result?.statuses ?? []).map(s => statusFromDB(s));
        const tasks = (result?.tasks ?? []).map(t => taskFromDB(t));

        set(s => ({
          statuses,
          projects: s.projects.map(p =>
            p.id === projectId ? { ...p, tasks } : p
          ),
        }));
      },

      setActiveAccount: (accountId: string) => set({ activeAccountId: accountId }),

      reset: () => set({
        projects: [],
        activeProjectId: null,
        activeAccountId: null,
        selectedTaskId: null,
        statuses: [],
        isLoading: false,
      }),

      // ── Projects ──────────────────────────────────────────────────────────
      addProject: (name: string) => {
        const { activeAccountId } = get();
        if (!activeAccountId) return;
        supabase.rpc('create_project', { p_account_id: activeAccountId, p_name: name })
          .then(async ({ data: projectId, error }) => {
            if (error || !projectId) { console.error(error); return; }
            await get().reloadProjects();
            set({ activeProjectId: projectId });
            await get().loadProjectData(projectId as string);
          });
      },

      renameProject: (id: string, name: string) => {
        set(s => ({ projects: s.projects.map(p => p.id === id ? { ...p, name } : p) }));
        supabase.from('projects').update({ name }).eq('id', id).then(({ error }) => {
          if (error) console.error(error);
        });
      },

      deleteProject: (id: string) => {
        set(s => {
          const rest = s.projects.filter(p => p.id !== id);
          const nextActive = rest[0]?.id ?? null;
          return { projects: rest, activeProjectId: nextActive, selectedTaskId: null };
        });
        supabase.from('projects').delete().eq('id', id).then(({ error }) => {
          if (error) console.error(error);
        });
        const nextActive = get().activeProjectId;
        if (nextActive) get().loadProjectData(nextActive);
      },

      setActiveProject: (id: string) => {
        set({ activeProjectId: id, selectedTaskId: null });
        get().loadProjectData(id);
      },

      // ── Tasks ─────────────────────────────────────────────────────────────
      addTask: () => {
        const { activeProjectId, projects, statuses } = get();
        const project = projects.find(p => p.id === activeProjectId);
        if (!project || !activeProjectId) return '';

        const maxOrder = project.tasks.reduce((m, t) => Math.max(m, t.order), -1);
        const maxNumber = project.tasks.reduce((m, t) => Math.max(m, t.number), 0);
        const defaultStatusId = statuses[0]?.id ?? null;
        const newId = uuidv4();
        const now = new Date().toISOString();

        const newTask: Task = {
          id: newId,
          number: maxNumber + 1,
          name: '',
          assignees: [],
          startDate: format(new Date(), 'yyyy-MM-dd'),
          duration: 7,
          dependencies: [],
          statusId: defaultStatusId ?? '',
          createdAt: now,
          order: maxOrder + 1,
        };

        set(s => ({
          projects: s.projects.map(p =>
            p.id === activeProjectId ? { ...p, tasks: [...p.tasks, newTask] } : p
          ),
          selectedTaskId: newId,
        }));

        supabase.from('tasks').insert({
          id: newId,
          project_id: activeProjectId,
          number: newTask.number,
          name: newTask.name,
          assignees: newTask.assignees,
          start_date: newTask.startDate,
          duration: newTask.duration,
          dependencies: newTask.dependencies,
          status_id: defaultStatusId,
          task_order: newTask.order,
          created_at: now,
        }).then(({ error }) => { if (error) console.error(error); });

        return newId;
      },

      updateTask: (taskId: string, updates: Partial<Omit<Task, 'id' | 'number' | 'createdAt'>>) => {
        const { activeProjectId } = get();
        set(s => ({
          projects: s.projects.map(p =>
            p.id !== activeProjectId ? p : {
              ...p,
              tasks: p.tasks.map(t => t.id === taskId ? { ...t, ...updates } : t),
            }
          ),
        }));

        const dbUpdates: Record<string, unknown> = {};
        if (updates.name !== undefined) dbUpdates.name = updates.name;
        if (updates.assignees !== undefined) dbUpdates.assignees = updates.assignees;
        if (updates.startDate !== undefined) dbUpdates.start_date = updates.startDate;
        if (updates.duration !== undefined) dbUpdates.duration = updates.duration;
        if (updates.statusId !== undefined) dbUpdates.status_id = updates.statusId || null;
        if (updates.dependencies !== undefined) dbUpdates.dependencies = updates.dependencies;
        if (updates.order !== undefined) dbUpdates.task_order = updates.order;

        supabase.from('tasks').update(dbUpdates).eq('id', taskId)
          .then(({ error }) => { if (error) console.error(error); });
      },

      deleteTask: (taskId: string) => {
        const { activeProjectId } = get();
        set(s => ({
          projects: s.projects.map(p =>
            p.id !== activeProjectId ? p : {
              ...p,
              tasks: p.tasks
                .filter(t => t.id !== taskId)
                .map(t => ({ ...t, dependencies: t.dependencies.filter(d => d !== taskId) })),
            }
          ),
          selectedTaskId: s.selectedTaskId === taskId ? null : s.selectedTaskId,
        }));
        supabase.from('tasks').delete().eq('id', taskId)
          .then(({ error }) => { if (error) console.error(error); });
      },

      reorderTasks: (orderedIds: string[]) => {
        const { activeProjectId } = get();
        set(s => ({
          projects: s.projects.map(p => {
            if (p.id !== activeProjectId) return p;
            const taskMap = new Map(p.tasks.map(t => [t.id, t]));
            const reordered = orderedIds
              .map((id, idx) => {
                const t = taskMap.get(id);
                return t ? { ...t, order: idx, number: idx + 1 } : null;
              })
              .filter((t): t is Task => t !== null);
            const inList = new Set(orderedIds);
            const rest = p.tasks
              .filter(t => !inList.has(t.id))
              .map((t, i) => ({ ...t, order: reordered.length + i, number: reordered.length + i + 1 }));
            return { ...p, tasks: [...reordered, ...rest] };
          }),
        }));

        // Background update in Supabase
        const allTasks = get().projects.find(p => p.id === activeProjectId)?.tasks ?? [];
        Promise.all(
          allTasks.map(t =>
            supabase.from('tasks').update({ task_order: t.order, number: t.number }).eq('id', t.id)
          )
        ).then(results => {
          results.forEach(({ error }) => { if (error) console.error(error); });
        });
      },

      selectTask: (taskId: string | null) => set({ selectedTaskId: taskId }),

      // ── Statuses ──────────────────────────────────────────────────────────
      addStatus: (name: string, color: string) => {
        const { activeProjectId } = get();
        const newStatus: CustomStatus = { id: uuidv4(), name, color };
        set(s => ({ statuses: [...s.statuses, newStatus] }));

        if (activeProjectId) {
          supabase.from('project_statuses').insert({
            id: newStatus.id,
            project_id: activeProjectId,
            name,
            color,
            sort_order: get().statuses.length - 1,
          }).then(({ error }) => { if (error) console.error(error); });
        }

        return newStatus;
      },

      updateStatus: (id: string, updates: Partial<Omit<CustomStatus, 'id'>>) => {
        set(s => ({ statuses: s.statuses.map(st => st.id === id ? { ...st, ...updates } : st) }));
        supabase.from('project_statuses').update(updates).eq('id', id)
          .then(({ error }) => { if (error) console.error(error); });
      },

      deleteStatus: (id: string) => {
        set(s => ({ statuses: s.statuses.filter(st => st.id !== id) }));
        supabase.from('project_statuses').delete().eq('id', id)
          .then(({ error }) => { if (error) console.error(error); });
      },

      // ── Settings ──────────────────────────────────────────────────────────
      setColorMode: (mode) => set({ colorMode: mode }),
      setFilters: (f) => set(s => ({ filters: { ...s.filters, ...f } })),
      setSortField: (field) => set({ sortField: field }),
      setSortDirection: (dir) => set({ sortDirection: dir }),
      setTaskListWidth: (width) => set({ taskListWidth: Math.min(600, Math.max(200, width)) }),
    }),
    {
      name: 'gantt-ui-v3',
      partialize: (state) => ({
        colorMode: state.colorMode,
        filters: state.filters,
        sortField: state.sortField,
        sortDirection: state.sortDirection,
        taskListWidth: state.taskListWidth,
      }),
    }
  )
);

// ─── Selectors ────────────────────────────────────────────────────────────────
export function useActiveProject(): Project | undefined {
  const { projects, activeProjectId } = useProjectStore();
  return projects.find(p => p.id === activeProjectId);
}

export function useSelectedTask(): Task | undefined {
  const { selectedTaskId } = useProjectStore();
  const project = useActiveProject();
  return project?.tasks.find(t => t.id === selectedTaskId);
}

export function useSortedFilteredTasks(): Task[] {
  const { filters, sortField, sortDirection, statuses } = useProjectStore();
  const project = useActiveProject();
  if (!project) return [];
  return applyFiltersAndSort(project.tasks, filters, sortField, sortDirection, statuses);
}

export function useAllAssignees(): Assignee[] {
  const project = useActiveProject();
  if (!project) return [];
  const map = new Map<string, string>();
  project.tasks.forEach(t => t.assignees.forEach(a => map.set(a.name, a.color)));
  return Array.from(map.entries()).map(([name, color]) => ({ name, color }));
}
