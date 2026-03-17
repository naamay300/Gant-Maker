import { useRef, useState } from 'react';
import { Task, SortField } from '../../types';
import { useProjectStore, useSortedFilteredTasks, useActiveProject } from '../../store/useProjectStore';
import styles from './TaskList.module.css';

const ROW_HEIGHT = 48;

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: 'manual',    label: 'מספר משימה' },
  { value: 'status',    label: 'סטטוס' },
  { value: 'assignee',  label: 'אחראי' },
  { value: 'startDate', label: 'תאריך התחלה' },
  { value: 'endDate',   label: 'תאריך סיום' },
];

interface Props {
  tasks: Task[];
  ganttScrollRef: React.RefObject<HTMLDivElement | null>;
}

export function TaskList({ ganttScrollRef }: Props) {
  const {
    selectTask, selectedTaskId, sortField, sortDirection,
    setSortField, setSortDirection, reorderTasks, statuses, addTask, deleteTask,
  } = useProjectStore();
  const project = useActiveProject();
  const tasks = useSortedFilteredTasks();
  const allTasks = project?.tasks ?? [];

  const [showSort, setShowSort] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const dragOrigIndex = useRef(0);

  // ── Dependency helpers ────────────────────────────────────────────────────
  function isBlocked(task: Task): boolean {
    if (!task.dependencies.length) return false;
    return task.dependencies.some(depId => {
      const dep = allTasks.find(t => t.id === depId);
      if (!dep) return false;
      const depStatus = statuses.find(s => s.id === dep.statusId);
      return depStatus?.name !== 'הושלם';
    });
  }

  function isKeyTask(task: Task): boolean {
    return allTasks.some(t => t.id !== task.id && t.dependencies.includes(task.id));
  }

  // ── Drag to reorder ───────────────────────────────────────────────────────
  function onHandleMouseDown(e: React.MouseEvent, task: Task) {
    e.preventDefault();
    e.stopPropagation();
    if (sortField !== 'manual') setSortField('manual');
    setDraggingId(task.id);
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

  // ── Sync scroll ───────────────────────────────────────────────────────────
  function syncScroll(e: React.UIEvent<HTMLDivElement>) {
    if (ganttScrollRef.current) {
      ganttScrollRef.current.scrollTop = e.currentTarget.scrollTop;
    }
  }

  const confirmTask = confirmDeleteId ? allTasks.find(t => t.id === confirmDeleteId) : null;

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.colHandle} />
        <div className={styles.colNum}>#</div>
        <div className={styles.colName}>משימה</div>
        <div className={styles.colAssignee}>אחראי</div>
        <div className={styles.colStatus}>סטטוס</div>
        <div className={styles.colDep} />
        <div className={styles.colDelete} />
        <div className={styles.sortWrap}>
          <button
            className={`${styles.sortBtn} ${sortField !== 'manual' ? styles.sortBtnActive : ''}`}
            onClick={() => setShowSort(v => !v)}
          >
            מיין ▾
          </button>
          {showSort && (
            <>
              <div className={styles.sortBackdrop} onClick={() => setShowSort(false)} />
              <div className={styles.sortDropdown}>
                {SORT_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    className={`${styles.sortItem} ${sortField === opt.value ? styles.sortItemActive : ''}`}
                    onClick={() => {
                      if (sortField === opt.value && opt.value !== 'manual') {
                        setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                      } else {
                        setSortField(opt.value);
                        setSortDirection('asc');
                      }
                      setShowSort(false);
                    }}
                  >
                    {opt.label}
                    {sortField === opt.value && opt.value !== 'manual' && (
                      <span>{sortDirection === 'asc' ? ' ↑' : ' ↓'}</span>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Rows */}
      <div className={styles.rows} onScroll={syncScroll} ref={listRef}>
        {tasks.map((task, i) => {
          const status = statuses.find(s => s.id === task.statusId);
          const isDragging = draggingId === task.id;
          const isDropTarget = dragOverIndex === i && draggingId !== null;
          const blocked = isBlocked(task);
          const keyTask = isKeyTask(task);

          return (
            <div key={task.id} className={styles.rowWrapper}>
              {isDropTarget && <div className={styles.dropLine} />}
              <div
                className={`${styles.row} ${task.id === selectedTaskId ? styles.selected : ''} ${isDragging ? styles.draggingRow : ''}`}
                onClick={() => selectTask(task.id === selectedTaskId ? null : task.id)}
              >
                <div
                  className={styles.colHandle}
                  onMouseDown={(e) => onHandleMouseDown(e, task)}
                  title="גרור לשינוי סדר"
                >⋮⋮</div>

                <div className={styles.colNum}>
                  <span className={styles.taskNum}>#{task.number}</span>
                </div>

                <div className={styles.colName}>
                  <span className={styles.taskName}>{task.name || <em className={styles.unnamed}>ללא שם</em>}</span>
                </div>

                <div className={styles.colAssignee}>
                  <div className={styles.assigneeDots}>
                    {task.assignees.slice(0, 3).map(a => (
                      <span key={a.name} className={styles.assigneeDot} style={{ background: a.color }} title={a.name} />
                    ))}
                    {task.assignees.length > 3 && <span className={styles.moreAssignees}>+{task.assignees.length - 3}</span>}
                  </div>
                </div>

                <div className={styles.colStatus}>
                  {status && (
                    <span className={styles.statusBadge} style={{ color: status.color, borderColor: status.color + '55' }}>
                      {status.name}
                    </span>
                  )}
                </div>

                <div className={styles.colDep}>
                  {blocked && <span className={styles.depIcon} title="חסומה — מחכה למשימה אחרת">🔒</span>}
                  {keyTask && <span className={styles.depIcon} title="משימות אחרות מחכות לה">🔑</span>}
                </div>

                <div className={styles.colDelete}>
                  <button
                    className={styles.deleteXBtn}
                    onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(task.id); }}
                    title="מחק משימה"
                  >✕</button>
                </div>
              </div>
            </div>
          );
        })}

        {tasks.length === 0 && <div className={styles.empty}>אין משימות</div>}

        <button
          className={styles.addTaskBtn}
          onClick={() => { const id = addTask(); if (id) selectTask(id); }}
        >
          + הוסף משימה
        </button>
      </div>

      {/* Delete confirmation */}
      {confirmDeleteId && (
        <div className={styles.confirmOverlay}>
          <div className={styles.confirmBox}>
            <p className={styles.confirmText}>
              האם אתה בטוח שברצונך למחוק את המשימה<br />
              <strong>"{confirmTask?.name || '#' + confirmTask?.number}"</strong>?
            </p>
            <div className={styles.confirmActions}>
              <button
                className={styles.confirmDelete}
                onClick={() => { deleteTask(confirmDeleteId); setConfirmDeleteId(null); }}
              >מחק</button>
              <button className={styles.confirmCancel} onClick={() => setConfirmDeleteId(null)}>ביטול</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
