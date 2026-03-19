import { useRef, useState } from 'react';
import { useActiveProject, useProjectStore } from '../../store/useProjectStore';
import { TaskList } from '../TaskList/TaskList';
import { GanttChart } from '../GanttChart/GanttChart';
import { TaskEditPanel } from '../TaskEditPanel/TaskEditPanel';
import { Toolbar } from '../Toolbar/Toolbar';
import styles from './GanttView.module.css';

export function GanttView() {
  const project = useActiveProject();
  const { selectedTaskId, taskListWidth, setTaskListWidth, pixelsPerDay } = useProjectStore();
  const ganttScrollRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const isDraggingDivider = useRef(false);
  const [collapsed, setCollapsed] = useState(false);
  const isPanningRef = useRef(false);
  const panStartX = useRef(0);
  const panStartScrollLeft = useRef(0);

  function onGanttMouseDown(e: React.MouseEvent) {
    if (e.button !== 0 || !ganttScrollRef.current) return;
    isPanningRef.current = true;
    panStartX.current = e.clientX;
    panStartScrollLeft.current = ganttScrollRef.current.scrollLeft;
    ganttScrollRef.current.style.cursor = 'grabbing';
  }

  function onGanttMouseMove(e: React.MouseEvent) {
    if (!isPanningRef.current || !ganttScrollRef.current) return;
    ganttScrollRef.current.scrollLeft = panStartScrollLeft.current - (e.clientX - panStartX.current);
  }

  function onGanttMouseUp() {
    isPanningRef.current = false;
    if (ganttScrollRef.current) ganttScrollRef.current.style.cursor = 'grab';
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!ganttScrollRef.current) return;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      ganttScrollRef.current.scrollLeft -= pixelsPerDay * 7;
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      ganttScrollRef.current.scrollLeft += pixelsPerDay * 7;
    }
  }

  function onDividerMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    isDraggingDivider.current = true;
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';

    function onMove(ev: MouseEvent) {
      if (!isDraggingDivider.current) return;
      // In RTL layout, mouse moving right = increasing left-side width
      // taskList is on the right visually but left in DOM (border-left separator)
      setTaskListWidth(ev.clientX > window.innerWidth / 2
        ? window.innerWidth - ev.clientX
        : ev.clientX
      );
    }

    function onUp() {
      isDraggingDivider.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  if (!project) {
    return (
      <div className={styles.empty}>
        <div className={styles.emptyIcon}>📋</div>
        <h2 className={styles.emptyTitle}>אין פרויקטים עדיין</h2>
        <p className={styles.emptyDesc}>לחץ על "+ פרויקט חדש" בסרגל הלשוניות למעלה כדי להתחיל</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Toolbar ganttScrollRef={ganttScrollRef} mainRef={mainRef} />

      <div className={styles.main} ref={mainRef}>
        {/* Left panel: task list */}
        <div
          className={styles.taskListPane}
          style={{ width: collapsed ? 0 : taskListWidth, minWidth: collapsed ? 0 : undefined, overflow: 'hidden' }}
        >
          <TaskList tasks={project.tasks} ganttScrollRef={ganttScrollRef} />
        </div>

        {/* Resizable divider + collapse toggle */}
        <div className={styles.dividerWrap}>
          <div className={styles.divider} onMouseDown={collapsed ? undefined : onDividerMouseDown} />
          <button
            className={styles.collapseBtn}
            onClick={() => setCollapsed(v => !v)}
            title={collapsed ? 'הרחב רשימת משימות' : 'כווץ רשימת משימות'}
          >
            {collapsed ? '›' : '‹'}
          </button>
        </div>

        {/* Right panel: gantt */}
        <div
          className={styles.ganttPane}
          ref={ganttScrollRef}
          tabIndex={0}
          onKeyDown={onKeyDown}
          onMouseDown={onGanttMouseDown}
          onMouseMove={onGanttMouseMove}
          onMouseUp={onGanttMouseUp}
          onMouseLeave={onGanttMouseUp}
          style={{ outline: 'none', cursor: 'grab' }}
        >
          <GanttChart />
        </div>

        {/* Side edit panel */}
        {selectedTaskId && <TaskEditPanel />}
      </div>
    </div>
  );
}
