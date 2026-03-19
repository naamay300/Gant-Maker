import { useMemo, useRef, useState, useCallback } from 'react';
import { Task } from '../../types';
import {
  ROW_HEIGHT,
  getTimelineStartDate, getTimelineEndDate, generateDays,
  pixelOffsetToDate, isWeekend, isSameDay,
  formatDayLabel, formatMonthLabel,
} from '../../utils/dateUtils';
import { useProjectStore, useSortedFilteredTasks, useActiveProject } from '../../store/useProjectStore';
import { usePermissions } from '../../contexts/AuthContext';
import { DependencyArrows } from './DependencyArrows';
import { addDays, parseISO, format, startOfDay, differenceInDays } from 'date-fns';
import styles from './GanttChart.module.css';

const MIN_DURATION = 1;
const TIMELINE_BUFFER_DAYS = 30;

type DragType = 'move' | 'resize-right' | 'resize-left';

interface DragState {
  taskId: string;
  type: DragType;
  startX: number;
  originalStartDate: string;
  originalDuration: number;
  originalStartPx: number;
}

interface PreviewState {
  taskId: string;
  startPx: number;
  widthPx: number;
}

export function GanttChart() {
  const { canEdit } = usePermissions();
  const { updateTask, selectTask, selectedTaskId, statuses, colorMode, pixelsPerDay } = useProjectStore();
  const tasks = useSortedFilteredTasks();
  const project = useActiveProject();
  const allTasks = project?.tasks ?? [];

  function isBlocked(task: Task): boolean {
    if (!task.dependencies.length) return false;
    return task.dependencies.some(depId => {
      const dep = allTasks.find(t => t.id === depId);
      if (!dep) return false;
      const depStatus = statuses.find((s: { id: string; name: string }) => s.id === dep.statusId);
      return depStatus?.name !== 'הושלם';
    });
  }

  function isKeyTask(task: Task): boolean {
    return allTasks.some(t => t.id !== task.id && t.dependencies.includes(task.id));
  }
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const today = useMemo(() => startOfDay(new Date()), []);

  // ── Timeline bounds ─────────────────────────────────────────────────────────
  const timelineStart = useMemo(() => {
    const base = getTimelineStartDate(tasks);
    return addDays(base, -TIMELINE_BUFFER_DAYS);
  }, [tasks]);

  const timelineEnd = useMemo(() => {
    const base = getTimelineEndDate(tasks);
    return addDays(base, TIMELINE_BUFFER_DAYS);
  }, [tasks]);

  const days = useMemo(() => {
    const count = Math.ceil((timelineEnd.getTime() - timelineStart.getTime()) / 86400000) + 1;
    return generateDays(timelineStart, Math.max(count, 90));
  }, [timelineStart, timelineEnd]);

  const totalWidth = days.length * pixelsPerDay;

  const todayOffset = useMemo(
    () => differenceInDays(today, startOfDay(timelineStart)) * pixelsPerDay,
    [today, timelineStart]
  );

  // ── Month groups ────────────────────────────────────────────────────────────
  const monthGroups = useMemo(() => {
    const groups: { label: string; startIdx: number; count: number }[] = [];
    days.forEach((d, i) => {
      const label = `${formatMonthLabel(d)} ${d.getFullYear()}`;
      if (!groups.length || groups[groups.length - 1].label !== label) {
        groups.push({ label, startIdx: i, count: 1 });
      } else {
        groups[groups.length - 1].count++;
      }
    });
    return groups;
  }, [days]);

  // ── Bar color ───────────────────────────────────────────────────────────────
  function getBarColor(task: Task): string {
    if (colorMode === 'status') {
      return statuses.find(s => s.id === task.statusId)?.color ?? '#6c63ff';
    }
    return task.assignees[0]?.color ?? '#6c63ff';
  }

  // ── Pixel helpers ───────────────────────────────────────────────────────────
  function taskStartPx(task: Task) {
    return differenceInDays(startOfDay(parseISO(task.startDate)), startOfDay(timelineStart)) * pixelsPerDay;
  }
  function taskWidthPx(task: Task) {
    return task.duration * pixelsPerDay;
  }

  // ── Drag start ──────────────────────────────────────────────────────────────
  const startDrag = useCallback((e: React.MouseEvent, task: Task, type: DragType) => {
    e.stopPropagation();
    e.preventDefault();
    selectTask(task.id);
    const sPx = taskStartPx(task);
    const wPx = taskWidthPx(task);
    const dragState: DragState = {
      taskId: task.id,
      type,
      startX: e.clientX,
      originalStartDate: task.startDate,
      originalDuration: task.duration,
      originalStartPx: sPx,
    };
    setDrag(dragState);
    setPreview({ taskId: task.id, startPx: sPx, widthPx: wPx });
    document.body.style.cursor = 'grabbing';

    function onMove(ev: MouseEvent) {
      const deltaX = ev.clientX - dragState.startX;
      if (dragState.type === 'move') {
        setPreview({ taskId: dragState.taskId, startPx: dragState.originalStartPx + deltaX, widthPx: dragState.originalDuration * pixelsPerDay });
      } else if (dragState.type === 'resize-right') {
        const newWidthPx = Math.max(MIN_DURATION * pixelsPerDay, dragState.originalDuration * pixelsPerDay + deltaX);
        setPreview({ taskId: dragState.taskId, startPx: dragState.originalStartPx, widthPx: newWidthPx });
      } else if (dragState.type === 'resize-left') {
        const endPx = dragState.originalStartPx + dragState.originalDuration * pixelsPerDay;
        const newStartPx = Math.min(endPx - MIN_DURATION * pixelsPerDay, dragState.originalStartPx + deltaX);
        setPreview({ taskId: dragState.taskId, startPx: newStartPx, widthPx: endPx - newStartPx });
      }
    }

    function onUp(ev: MouseEvent) {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      const deltaX = ev.clientX - dragState.startX;
      const deltaDays = Math.round(deltaX / pixelsPerDay);

      if (dragState.type === 'move' && deltaDays !== 0) {
        const newStartDate = pixelOffsetToDate(dragState.originalStartPx + deltaX, timelineStart);
        updateTask(dragState.taskId, { startDate: newStartDate });
      } else if (dragState.type === 'resize-right' && deltaDays !== 0) {
        const newDuration = Math.max(MIN_DURATION, dragState.originalDuration + deltaDays);
        updateTask(dragState.taskId, { duration: newDuration });
      } else if (dragState.type === 'resize-left' && deltaDays !== 0) {
        const newDuration = Math.max(MIN_DURATION, dragState.originalDuration - deltaDays);
        const endDate = addDays(parseISO(dragState.originalStartDate), dragState.originalDuration);
        const newStartDate = format(addDays(endDate, -newDuration), 'yyyy-MM-dd');
        updateTask(dragState.taskId, { startDate: newStartDate, duration: newDuration });
      }
      setDrag(null);
      setPreview(null);
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [selectTask, pixelsPerDay, timelineStart, updateTask]);

  return (
    <div
      className={styles.wrapper}
      style={{ cursor: drag ? 'grabbing' : 'default' }}
      ref={wrapperRef}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className={styles.header} style={{ width: totalWidth }}>
        <div className={styles.monthRow}>
          {monthGroups.map(g => (
            <div
              key={g.label + g.startIdx}
              className={styles.monthCell}
              style={{ width: g.count * pixelsPerDay }}
            >
              {g.label}
            </div>
          ))}
        </div>
        <div className={styles.dayRow}>
          {days.map((d, i) => (
            <div
              key={i}
              className={`${styles.dayCell} ${isWeekend(d) ? styles.weekend : ''} ${isSameDay(d, today) ? styles.todayCell : ''}`}
              style={{ width: pixelsPerDay }}
            >
              {formatDayLabel(d)}
            </div>
          ))}
        </div>
      </div>

      {/* ── Grid ───────────────────────────────────────────────────────────── */}
      <div className={styles.grid} style={{ width: totalWidth, minHeight: Math.max(tasks.length * ROW_HEIGHT + 60, 900) }}>
        {/* Column backgrounds */}
        {days.map((d, i) => (
          <div
            key={i}
            className={`${styles.col} ${isWeekend(d) ? styles.weekendCol : ''}`}
            style={{ left: i * pixelsPerDay, width: pixelsPerDay }}
          />
        ))}

        {/* Today line */}
        <div className={styles.todayLine} style={{ left: todayOffset + pixelsPerDay / 2 }}>
          <span className={styles.todayLabel}>היום</span>
        </div>

        {/* Row backgrounds */}
        {tasks.map((task, i) => (
          <div
            key={task.id + '-row'}
            className={`${styles.rowBg} ${task.id === selectedTaskId ? styles.selectedRow : ''}`}
            style={{ top: i * ROW_HEIGHT, height: ROW_HEIGHT }}
          />
        ))}

        {/* Dependency arrows */}
        <DependencyArrows tasks={tasks} timelineStart={timelineStart} />

        {/* Task bars */}
        {tasks.map((task, i) => {
          const isPreview = preview?.taskId === task.id;
          const startPx = isPreview ? preview!.startPx : taskStartPx(task);
          const widthPx = isPreview ? preview!.widthPx : taskWidthPx(task);
          const top = i * ROW_HEIGHT + (ROW_HEIGHT - 28) / 2;
          const barColor = getBarColor(task);

          // Multi-assignee stripe gradient (if colorMode = assignee and multiple)
          let barStyle: React.CSSProperties = {
            left: startPx,
            top,
            width: Math.max(widthPx, 8),
            background: barColor,
            opacity: task.statusId === statuses.find(s => s.name === 'הושלם')?.id ? 0.6 : 1,
          };

          if (colorMode === 'assignee' && task.assignees.length > 1) {
            const stripes = task.assignees.map(a => a.color);
            const pct = 100 / stripes.length;
            const grad = stripes
              .map((c, idx) => `${c} ${idx * pct}%, ${c} ${(idx + 1) * pct}%`)
              .join(', ');
            barStyle = { ...barStyle, background: `linear-gradient(90deg, ${grad})` };
          }

          return (
            <div
              key={task.id}
              className={`${styles.bar} ${isPreview && drag ? styles.dragging : ''}`}
              style={{ ...barStyle, cursor: canEdit ? 'grab' : 'default' }}
              onMouseDown={canEdit ? (e) => startDrag(e, task, 'move') : undefined}
            >
              {/* Left resize handle */}
              <div
                className={`${styles.resizeHandle} ${styles.resizeLeft}`}
                onMouseDown={canEdit ? (e) => startDrag(e, task, 'resize-left') : undefined}
              />

              <span className={styles.barLabel}>
                {isBlocked(task) && <span title="חסומה">🔒</span>}
                {isKeyTask(task) && <span title="משימות אחרות מחכות לה">🔑</span>}
                #{task.number} {task.name}
              </span>

              {/* Right resize handle */}
              {canEdit && (
                <div
                  className={`${styles.resizeHandle} ${styles.resizeRight}`}
                  onMouseDown={(e) => startDrag(e, task, 'resize-right')}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
