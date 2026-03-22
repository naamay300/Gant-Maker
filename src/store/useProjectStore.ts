import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import { format, addDays, parseISO } from 'date-fns';
import { supabase } from '../lib/supabase';
import {
  Project, Task, CustomStatus, ColorMode,
  SortField, SortDirection, Assignee, TaskLink, TaskFile,
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
    description: (row.description as string) ?? '',
    links: (row.links as TaskLink[]) ?? [],
  };
}

function fileFromDB(row: Record<string, unknown>): TaskFile {
  return {
    id: row.id as string,
    taskId: row.task_id as string,
    fileName: row.file_name as string,
    filePath: row.file_path as string,
    fileSize: (row.file_size as number) ?? 0,
    createdAt: row.created_at as string,
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
  pixelsPerDay: number;
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
  propagateAssigneeColor: (assigneeName: string, color: string) => void;
  selectTask: (taskId: string | null) => void;

  // Files
  taskFiles: TaskFile[];
  fetchTaskFiles: (taskId: string) => Promise<void>;
  uploadTaskFile: (taskId: string, file: File) => Promise<void>;
  deleteTaskFile: (fileId: string, filePath: string) => Promise<void>;
  getFileUrl: (filePath: string) => Promise<string | null>;

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
  setPixelsPerDay: (ppd: number) => void;
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
      taskListWidth: 420,
      pixelsPerDay: 40,
      isLoading: false,
      taskFiles: [] as TaskFile[],

      // ── Initialization ────────────────────────────────────────────────────
      initializeApp: async (accountId: string) => {
        set({ isLoading: true, activeAccountId: accountId });
        await get().reloadProjects();
        const { projects } = get();
        if (projects.length > 0) {
          // If the user just accepted a project invite, open that project directly
          const pendingProjectId = localStorage.getItem('invite_project_id');
          localStorage.removeItem('invite_project_id');
          const targetId = (pendingProjectId && projects.find(p => p.id === pendingProjectId))
            ? pendingProjectId
            : projects[0].id;
          set({ activeProjectId: targetId });
          await get().loadProjectData(targetId);
        }
        set({ isLoading: false });
      },

      reloadProjects: async () => {
        const { activeAccountId, projects: existing } = get();
        if (!activeAccountId) return;
        const { data } = await supabase.rpc('get_my_projects', { p_account_id: activeAccountId });
        const projects: Project[] = (data ?? []).map((p: { id: string; name: string; account_id: string }) => {
          const prev = existing.find(ep => ep.id === p.id);
          return {
            id: p.id,
            name: p.name,
            accountId: p.account_id,
            tasks: prev?.tasks ?? [],   // ← preserve already-loaded tasks
          };
        });
        set({ projects });
      },

      loadProjectData: async (projectId: string) => {
        const [{ data: statusData }, { data: taskData }] = await Promise.all([
          supabase.from('project_statuses').select('*').eq('project_id', projectId).order('sort_order', { ascending: true }),
          supabase.from('tasks').select('*').eq('project_id', projectId).order('task_order', { ascending: true }),
        ]);

        if (statusData === null || taskData === null) return;

        const loadedStatuses = (statusData ?? []).map(s => statusFromDB(s as Record<string, unknown>));
        const loadedTasks = (taskData ?? []).map(t => taskFromDB(t as Record<string, unknown>));

        const { statuses: globalStatuses, projects: currentProjects } = get();

        // ── 1. Normalize statuses ────────────────────────────────────────────
        // First project: establish global canonical statuses.
        // Subsequent projects: keep global statuses, remap task statusIds by name.
        let canonicalStatuses = globalStatuses;
        let tasks = loadedTasks;

        if (globalStatuses.length === 0) {
          canonicalStatuses = loadedStatuses;
        } else {
          const nameToGlobalId = new Map(globalStatuses.map(s => [s.name, s.id]));
          tasks = loadedTasks.map(t => {
            const localStatus = loadedStatuses.find(s => s.id === t.statusId);
            if (!localStatus) return t;
            const globalId = nameToGlobalId.get(localStatus.name);
            return globalId ? { ...t, statusId: globalId } : t;
          });
        }

        // ── 2. Normalize assignee colors ─────────────────────────────────────
        // Build global color map from all already-loaded projects (first-seen wins).
        const globalColors = new Map<string, string>();
        currentProjects.forEach(p =>
          p.tasks.forEach(t =>
            t.assignees.forEach(a => {
              if (!globalColors.has(a.name)) globalColors.set(a.name, a.color);
            })
          )
        );

        // Remap tasks' assignee colors to match the global canonical color.
        // Also register any NEW assignee names seen in this project.
        tasks = tasks.map(t => ({
          ...t,
          assignees: t.assignees.map(a => {
            if (globalColors.has(a.name)) return { ...a, color: globalColors.get(a.name)! };
            globalColors.set(a.name, a.color); // first time we see this person
            return a;
          }),
        }));

        set(s => ({
          statuses: canonicalStatuses,
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

            // Sync global statuses into the new project:
            // delete the RPC-generated defaults and insert canonical ones (same IDs).
            const { statuses: globalStatuses } = get();
            if (globalStatuses.length > 0) {
              await supabase.from('project_statuses').delete().eq('project_id', projectId);
              await Promise.all(
                globalStatuses.map((s, i) =>
                  supabase.from('project_statuses').insert({
                    id: s.id,
                    project_id: projectId,
                    name: s.name,
                    color: s.color,
                    sort_order: i,
                  })
                )
              );
            }

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
          description: '',
          links: [],
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
        if (updates.description !== undefined) dbUpdates.description = updates.description;
        if (updates.links !== undefined) dbUpdates.links = updates.links;

        supabase.from('tasks').update(dbUpdates).eq('id', taskId)
          .then(({ error }) => { if (error) console.error(error); });
      },

      deleteTask: (taskId: string) => {
        const { activeProjectId, projects } = get();
        const project = projects.find(p => p.id === activeProjectId);
        const affectedTasks = (project?.tasks ?? []).filter(
          t => t.id !== taskId && t.dependencies.includes(taskId)
        );
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
        // Also clean up dangling dependency references in Supabase
        affectedTasks.forEach(t => {
          supabase.from('tasks')
            .update({ dependencies: t.dependencies.filter(d => d !== taskId) })
            .eq('id', t.id)
            .then(({ error }) => { if (error) console.error(error); });
        });
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

      propagateAssigneeColor: (assigneeName: string, color: string) => {
        // Update local state across ALL projects
        set(s => ({
          projects: s.projects.map(p => ({
            ...p,
            tasks: p.tasks.map(t => ({
              ...t,
              assignees: t.assignees.map(a => a.name === assigneeName ? { ...a, color } : a),
            })),
          })),
        }));
        // Persist to Supabase for every task that has this assignee
        const { projects } = get();
        projects.forEach(p => {
          p.tasks.forEach(t => {
            if (t.assignees.some(a => a.name === assigneeName)) {
              const updated = t.assignees.map(a => a.name === assigneeName ? { ...a, color } : a);
              supabase.from('tasks').update({ assignees: updated }).eq('id', t.id)
                .then(({ error }) => { if (error) console.error(error); });
            }
          });
        });
      },

      selectTask: (taskId: string | null) => {
        set({ selectedTaskId: taskId, taskFiles: [] });
        if (taskId) get().fetchTaskFiles(taskId);
      },

      // ── Files ─────────────────────────────────────────────────────────────
      fetchTaskFiles: async (taskId: string) => {
        const { data } = await supabase
          .from('task_files')
          .select('*')
          .eq('task_id', taskId)
          .order('created_at', { ascending: true });
        set({ taskFiles: (data ?? []).map((r: Record<string, unknown>) => fileFromDB(r)) });
      },

      uploadTaskFile: async (taskId: string, file: File) => {
        const path = `${taskId}/${uuidv4()}_${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from('task-files')
          .upload(path, file);
        if (uploadError) { console.error(uploadError); return; }
        await supabase.from('task_files').insert({
          task_id: taskId,
          file_name: file.name,
          file_path: path,
          file_size: file.size,
        });
        await get().fetchTaskFiles(taskId);
      },

      deleteTaskFile: async (fileId: string, filePath: string) => {
        await supabase.storage.from('task-files').remove([filePath]);
        await supabase.from('task_files').delete().eq('id', fileId);
        const { selectedTaskId } = get();
        if (selectedTaskId) await get().fetchTaskFiles(selectedTaskId);
      },

      getFileUrl: async (filePath: string) => {
        const { data } = await supabase.storage
          .from('task-files')
          .createSignedUrl(filePath, 3600);
        return data?.signedUrl ?? null;
      },

      // ── Statuses ──────────────────────────────────────────────────────────
      addStatus: (name: string, color: string) => {
        const { projects } = get();
        const newStatus: CustomStatus = { id: uuidv4(), name, color };
        set(s => ({ statuses: [...s.statuses, newStatus] }));

        const sortOrder = get().statuses.length - 1;
        // Insert the SAME status (same UUID) into every project so statusId references stay valid
        Promise.all(
          projects.map(p =>
            supabase.from('project_statuses').insert({
              id: newStatus.id,
              project_id: p.id,
              name,
              color,
              sort_order: sortOrder,
            }).then(({ error }) => { if (error) console.error(error); })
          )
        );

        return newStatus;
      },

      updateStatus: (id: string, updates: Partial<Omit<CustomStatus, 'id'>>) => {
        const { statuses, projects } = get();
        const statusName = statuses.find(s => s.id === id)?.name;
        set(s => ({ statuses: s.statuses.map(st => st.id === id ? { ...st, ...updates } : st) }));
        // Update canonical row
        supabase.from('project_statuses').update(updates).eq('id', id)
          .then(({ error }) => { if (error) console.error(error); });
        // Also update same-named statuses in all other projects
        if (statusName) {
          projects.forEach(p => {
            supabase.from('project_statuses')
              .update(updates)
              .eq('project_id', p.id)
              .eq('name', statusName)
              .then(({ error }) => { if (error) console.error(error); });
          });
        }
      },

      deleteStatus: (id: string) => {
        const { statuses, projects } = get();
        const statusName = statuses.find(s => s.id === id)?.name;
        set(s => ({ statuses: s.statuses.filter(st => st.id !== id) }));
        supabase.from('project_statuses').delete().eq('id', id)
          .then(({ error }) => { if (error) console.error(error); });
        // Also delete same-named statuses in all other projects
        if (statusName) {
          projects.forEach(p => {
            supabase.from('project_statuses')
              .delete()
              .eq('project_id', p.id)
              .eq('name', statusName)
              .then(({ error }) => { if (error) console.error(error); });
          });
        }
      },

      // ── Settings ──────────────────────────────────────────────────────────
      setColorMode: (mode) => set({ colorMode: mode }),
      setFilters: (f) => set(s => ({ filters: { ...s.filters, ...f } })),
      setSortField: (field) => set({ sortField: field }),
      setSortDirection: (dir) => set({ sortDirection: dir }),
      setTaskListWidth: (width) => set({ taskListWidth: Math.min(600, Math.max(360, width)) }),
      setPixelsPerDay: (ppd) => set({ pixelsPerDay: ppd }),
    }),
    {
      name: 'gantt-ui-v3',
      partialize: (state) => ({
        colorMode: state.colorMode,
        filters: state.filters,
        sortField: state.sortField,
        sortDirection: state.sortDirection,
        taskListWidth: state.taskListWidth,
        pixelsPerDay: state.pixelsPerDay,
      }),
      merge: (persisted: unknown, current: ProjectStore) => ({
        ...current,
        ...(persisted as object),
        taskListWidth: Math.max(360, (persisted as { taskListWidth?: number }).taskListWidth ?? 420),
        pixelsPerDay: (persisted as { pixelsPerDay?: number }).pixelsPerDay ?? 40,
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
  const { projects } = useProjectStore();
  const map = new Map<string, string>();
  projects.forEach(p => p.tasks.forEach(t => t.assignees.forEach(a => map.set(a.name, a.color))));
  return Array.from(map.entries()).map(([name, color]) => ({ name, color }));
}
