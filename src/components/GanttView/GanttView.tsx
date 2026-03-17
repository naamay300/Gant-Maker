import { useRef } from 'react';
import { useActiveProject, useProjectStore } from '../../store/useProjectStore';
import { TaskList } from '../TaskList/TaskList';
import { GanttChart } from '../GanttChart/GanttChart';
import { TaskEditPanel } from '../TaskEditPanel/TaskEditPanel';
import { Toolbar } from '../Toolbar/Toolbar';
import styles from './GanttView.module.css';

export function GanttView() {
  const project = useActiveProject();
  const { selectedTaskId, taskListWidth, setTaskListWidth } = useProjectStore();
  const ganttScrollRef = useRef<HTMLDivElement>(null);
  const isDraggingDivider = useRef(false);

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
        <p>אין פרויקטים. צור פרויקט חדש למעלה.</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Toolbar ganttScrollRef={ganttScrollRef} />

      <div className={styles.main}>
        {/* Left panel: task list */}
        <div className={styles.taskListPane} style={{ width: taskListWidth }}>
          <TaskList tasks={project.tasks} ganttScrollRef={ganttScrollRef} />
        </div>

        {/* Resizable divider */}
        <div className={styles.divider} onMouseDown={onDividerMouseDown} />

        {/* Right panel: gantt */}
        <div className={styles.ganttPane} ref={ganttScrollRef}>
          <GanttChart />
        </div>

        {/* Side edit panel */}
        {selectedTaskId && <TaskEditPanel />}
      </div>
    </div>
  );
}
