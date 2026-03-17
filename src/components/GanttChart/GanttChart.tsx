import { useMemo, useRef, useState, useCallback } from 'react';
import { Task } from '../../types';
import {
  PIXELS_PER_DAY, ROW_HEIGHT,
  getTimelineStartDate, getTimelineEndDate, generateDays,
  dateToPixelOffset, pixelOffsetToDate, isWeekend, isSameDay,
  formatDayLabel, formatMonthLabel,
} from '../../utils/dateUtils';
import { useProjectStore, useSortedFilteredTasks } from '../../store/useProjectStore';
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
  const { updateTask, selectTask, selectedTaskId, statuses, colorMode } = useProjectStore();
  const tasks = useSortedFilteredTasks();
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

  const totalWidth = days.length * PIXELS_PER_DAY;

  const todayOffset = useMemo(
    () => differenceInDays(today, startOfDay(timelineStart)) * PIXELS_PER_DAY,
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
    return dateToPixelOffset(task.startDate, timelineStart);
  }
  function taskWidthPx(task: Task) {
    return task.duration * PIXELS_PER_DAY;
  }

  // ── Drag start ──────────────────────────────────────────────────────────────
  const startDrag = useCallback((e: React.MouseEvent, task: Task, type: DragType) => {
    e.stopPropagation();
    e.preventDefault();
    selectTask(task.id);
    const sPx = taskStartPx(task);
    const wPx = taskWidthPx(task);
    setDrag({
      taskId: task.id,
      type,
      startX: e.clientX,
      originalStartDate: task.startDate,
      originalDuration: task.duration,
      originalStartPx: sPx,
    });
    setPreview({ taskId: task.id, startPx: sPx, widthPx: wPx });
  }, [selectTask]);

  // ── Mouse move ──────────────────────────────────────────────────────────────
  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!drag) return;
    const deltaX = e.clientX - drag.startX;
    const deltaDays = Math.round(deltaX / PIXELS_PER_DAY);

    if (drag.type === 'move') {
      const newStartPx = drag.originalStartPx + deltaX;
      setPreview({ taskId: drag.taskId, startPx: newStartPx, widthPx: drag.originalDuration * PIXELS_PER_DAY });
    } else if (drag.type === 'resize-right') {
      const newDuration = Math.max(MIN_DURATION, drag.originalDuration + deltaDays);
      setPreview({ taskId: drag.taskId, startPx: drag.originalStartPx, widthPx: newDuration * PIXELS_PER_DAY });
    } else if (drag.type === 'resize-left') {
      // Moving start date, keeping end date fixed
      const newDuration = Math.max(MIN_DURATION, drag.originalDuration - deltaDays);
      const endPx = drag.originalStartPx + drag.originalDuration * PIXELS_PER_DAY;
      const newStartPx = endPx - newDuration * PIXELS_PER_DAY;
      setPreview({ taskId: drag.taskId, startPx: newStartPx, widthPx: newDuration * PIXELS_PER_DAY });
    }
  }, [drag]);

  // ── Mouse up ─────────────────────────────────────────────────────────────────
  const onMouseUp = useCallback((e: React.MouseEvent) => {
    if (!drag) return;
    const deltaX = e.clientX - drag.startX;
    const deltaDays = Math.round(deltaX / PIXELS_PER_DAY);

    if (drag.type === 'move' && deltaDays !== 0) {
      const newStartDate = pixelOffsetToDate(drag.originalStartPx + deltaX, timelineStart);
      updateTask(drag.taskId, { startDate: newStartDate });
    } else if (drag.type === 'resize-right' && deltaDays !== 0) {
      const newDuration = Math.max(MIN_DURATION, drag.originalDuration + deltaDays);
      updateTask(drag.taskId, { duration: newDuration });
    } else if (drag.type === 'resize-left' && deltaDays !== 0) {
      const newDuration = Math.max(MIN_DURATION, drag.originalDuration - deltaDays);
      const endDate = addDays(parseISO(drag.originalStartDate), drag.originalDuration);
      const newStartDate = format(addDays(endDate, -newDuration), 'yyyy-MM-dd');
      updateTask(drag.taskId, { startDate: newStartDate, duration: newDuration });
    }
    setDrag(null);
    setPreview(null);
  }, [drag, timelineStart, updateTask]);

  const onMouseLeave = useCallback(() => {
    if (drag) {
      setDrag(null);
      setPreview(null);
    }
  }, [drag]);

  return (
    <div
      className={styles.wrapper}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseLeave}
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
              style={{ width: g.count * PIXELS_PER_DAY }}
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
              style={{ width: PIXELS_PER_DAY }}
            >
              {formatDayLabel(d)}
            </div>
          ))}
        </div>
      </div>

      {/* ── Grid ───────────────────────────────────────────────────────────── */}
      <div className={styles.grid} style={{ width: totalWidth }}>
        {/* Column backgrounds */}
        {days.map((d, i) => (
          <div
            key={i}
            className={`${styles.col} ${isWeekend(d) ? styles.weekendCol : ''}`}
            style={{ left: i * PIXELS_PER_DAY, width: PIXELS_PER_DAY }}
          />
        ))}

        {/* Today line */}
        <div className={styles.todayLine} style={{ left: todayOffset + PIXELS_PER_DAY / 2 }}>
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
              style={barStyle}
              onMouseDown={(e) => startDrag(e, task, 'move')}
            >
              {/* Left resize handle */}
              <div
                className={`${styles.resizeHandle} ${styles.resizeLeft}`}
                onMouseDown={(e) => startDrag(e, task, 'resize-left')}
              />

              <span className={styles.barLabel}>
                #{task.number} {task.name}
              </span>

              {/* Right resize handle */}
              <div
                className={`${styles.resizeHandle} ${styles.resizeRight}`}
                onMouseDown={(e) => startDrag(e, task, 'resize-right')}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
