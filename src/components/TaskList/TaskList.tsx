import { useRef, useState } from 'react';
import { Task } from '../../types';
import { useProjectStore, useSortedFilteredTasks } from '../../store/useProjectStore';
import styles from './TaskList.module.css';

const ROW_HEIGHT = 48;

interface Props {
  tasks: Task[];
  ganttScrollRef: React.RefObject<HTMLDivElement | null>;
}

export function TaskList({ ganttScrollRef }: Props) {
  const { selectTask, selectedTaskId, sortField, reorderTasks, statuses } = useProjectStore();
  const tasks = useSortedFilteredTasks();

  // ── Vertical drag reorder ──────────────────────────────────────────────────
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef(0);
  const dragOrigIndex = useRef(0);

  function onHandleMouseDown(e: React.MouseEvent, task: Task) {
    if (sortField !== 'manual') return;
    e.preventDefault();
    e.stopPropagation();
    setDraggingId(task.id);
    dragStartY.current = e.clientY;
    dragOrigIndex.current = tasks.findIndex(t => t.id === task.id);

    function onMove(ev: MouseEvent) {
      if (!listRef.current) return;
      const rect = listRef.current.getBoundingClientRect();
      const relY = ev.clientY - rect.top + listRef.current.scrollTop;
      const idx = Math.min(Math.max(0, Math.floor(relY / ROW_HEIGHT)), tasks.length - 1);
      setDragOverIndex(idx);
    }

    function onUp() {
      setDraggingId(null);
      setDragOverIndex(di => {
        if (di !== null && di !== dragOrigIndex.current) {
          const newOrder = [...tasks.map(t => t.id)];
          const [removed] = newOrder.splice(dragOrigIndex.current, 1);
          newOrder.splice(di, 0, removed);
          reorderTasks(newOrder);
        }
        return null;
      });
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  // ── Sync scroll with gantt ─────────────────────────────────────────────────
  function syncScroll(e: React.UIEvent<HTMLDivElement>) {
    if (ganttScrollRef.current) {
      ganttScrollRef.current.scrollTop = e.currentTarget.scrollTop;
    }
  }

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.colHandle} />
        <div className={styles.colNum}>#</div>
        <div className={styles.colName}>משימה</div>
        <div className={styles.colAssignee}>אחראי</div>
        <div className={styles.colStatus}>סטטוס</div>
      </div>

      {/* Rows */}
      <div className={styles.rows} onScroll={syncScroll} ref={listRef}>
        {tasks.map((task, i) => {
          const status = statuses.find(s => s.id === task.statusId);
          const isDragging = draggingId === task.id;
          const isDropTarget = dragOverIndex === i && draggingId !== null;

          return (
            <div key={task.id} className={styles.rowWrapper}>
              {isDropTarget && <div className={styles.dropLine} />}
              <div
                className={`${styles.row} ${task.id === selectedTaskId ? styles.selected : ''} ${isDragging ? styles.draggingRow : ''}`}
                onClick={() => selectTask(task.id === selectedTaskId ? null : task.id)}
              >
                {/* Drag handle */}
                <div
                  className={`${styles.colHandle} ${sortField !== 'manual' ? styles.handleDisabled : ''}`}
                  onMouseDown={(e) => onHandleMouseDown(e, task)}
                  title={sortField !== 'manual' ? 'השבת מיון ידני כדי לסדר' : 'גרור לשינוי סדר'}
                >
                  ⋮⋮
                </div>

                {/* Number */}
                <div className={styles.colNum}>
                  <span className={styles.taskNum}>#{task.number}</span>
                </div>

                {/* Name */}
                <div className={styles.colName}>
                  <span className={styles.taskName}>{task.name || <em className={styles.unnamed}>ללא שם</em>}</span>
                  {task.dependencies.length > 0 && (
                    <span className={styles.depBadge} title={`תלוי ב-${task.dependencies.length} משימות`}>
                      ⬡{task.dependencies.length}
                    </span>
                  )}
                </div>

                {/* Assignees */}
                <div className={styles.colAssignee}>
                  <div className={styles.assigneeDots}>
                    {task.assignees.slice(0, 3).map(a => (
                      <span
                        key={a.name}
                        className={styles.assigneeDot}
                        style={{ background: a.color }}
                        title={a.name}
                      />
                    ))}
                    {task.assignees.length > 3 && (
                      <span className={styles.moreAssignees}>+{task.assignees.length - 3}</span>
                    )}
                  </div>
                </div>

                {/* Status */}
                <div className={styles.colStatus}>
                  {status && (
                    <span
                      className={styles.statusBadge}
                      style={{ color: status.color, borderColor: status.color + '55' }}
                    >
                      {status.name}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {tasks.length === 0 && (
          <div className={styles.empty}>אין משימות{(useProjectStore.getState().filters.statusIds.length > 0 || useProjectStore.getState().filters.assignees.length > 0) ? ' (יש פילטרים פעילים)' : ''}</div>
        )}

        {/* Creation date tooltip shown in edit panel */}
      </div>
    </div>
  );
}
