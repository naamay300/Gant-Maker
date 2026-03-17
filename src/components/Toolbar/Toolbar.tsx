import { useState, RefObject } from 'react';
import { useProjectStore, useSortedFilteredTasks } from '../../store/useProjectStore';
import { StatusManager } from '../StatusManager/StatusManager';
import { PIXELS_PER_DAY, getTimelineStartDate, dateToPixelOffset } from '../../utils/dateUtils';
import { addDays } from 'date-fns';
import styles from './Toolbar.module.css';

interface Props {
  ganttScrollRef: RefObject<HTMLDivElement | null>;
}

export function Toolbar({ ganttScrollRef }: Props) {
  const { colorMode, setColorMode } = useProjectStore();
  const tasks = useSortedFilteredTasks();
  const [showStatusManager, setShowStatusManager] = useState(false);

  function scrollToToday() {
    if (!ganttScrollRef.current) return;
    const timelineStart = addDays(getTimelineStartDate(tasks), -30);
    const todayOffset = dateToPixelOffset(
      new Date().toISOString().split('T')[0],
      timelineStart
    );
    const viewWidth = ganttScrollRef.current.clientWidth;
    ganttScrollRef.current.scrollLeft = Math.max(0, todayOffset - viewWidth / 2);
  }

  function scrollByMonth(dir: 1 | -1) {
    if (!ganttScrollRef.current) return;
    ganttScrollRef.current.scrollLeft += dir * 30 * PIXELS_PER_DAY;
  }

  return (
    <>
      <div className={styles.toolbar}>
        {/* ── Navigation ── */}
        <div className={styles.group}>
          <button className={styles.navBtn} onClick={() => scrollByMonth(-1)} title="חודש אחורה">‹</button>
          <button className={styles.todayBtn} onClick={scrollToToday}>היום</button>
          <button className={styles.navBtn} onClick={() => scrollByMonth(1)} title="חודש קדימה">›</button>
        </div>

        <div className={styles.sep} />

        {/* ── Color mode toggle ── */}
        <div className={styles.colorToggle}>
          <button
            className={`${styles.toggleBtn} ${colorMode === 'status' ? styles.toggleActive : ''}`}
            onClick={() => setColorMode('status')}
          >
            🏷 סטטוס
          </button>
          <button
            className={`${styles.toggleBtn} ${colorMode === 'assignee' ? styles.toggleActive : ''}`}
            onClick={() => setColorMode('assignee')}
          >
            👤 אחראי
          </button>
        </div>

        <div className={styles.sep} />

        {/* ── Statuses management ── */}
        <button className={styles.statusMgrBtn} onClick={() => setShowStatusManager(true)}>
          ⚙ סטטוסים
        </button>
      </div>

      {showStatusManager && <StatusManager onClose={() => setShowStatusManager(false)} />}
    </>
  );
}
