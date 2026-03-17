import { useRef, useState, RefObject } from 'react';
import { useProjectStore, useSortedFilteredTasks, useAllAssignees } from '../../store/useProjectStore';
import { StatusManager } from '../StatusManager/StatusManager';
import { PIXELS_PER_DAY, getTimelineStartDate, dateToPixelOffset } from '../../utils/dateUtils';
import { SortField, SortDirection } from '../../types';
import styles from './Toolbar.module.css';

interface Props {
  ganttScrollRef: RefObject<HTMLDivElement | null>;
}

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: 'manual',    label: 'סדר ידני' },
  { value: 'startDate', label: 'תאריך התחלה' },
  { value: 'endDate',   label: 'תאריך סיום' },
  { value: 'createdAt', label: 'תאריך יצירה' },
  { value: 'assignee',  label: 'אחראי' },
  { value: 'status',    label: 'סטטוס' },
];

export function Toolbar({ ganttScrollRef }: Props) {
  const {
    statuses, colorMode, filters, sortField, sortDirection,
    setColorMode, setFilters, setSortField, setSortDirection,
  } = useProjectStore();

  const tasks = useSortedFilteredTasks();
  const allAssignees = useAllAssignees();

  const [showStatusManager, setShowStatusManager] = useState(false);
  const [showStatusFilter, setShowStatusFilter] = useState(false);
  const [showAssigneeFilter, setShowAssigneeFilter] = useState(false);
  const [showSort, setShowSort] = useState(false);

  const statusFilterRef = useRef<HTMLDivElement>(null);
  const assigneeFilterRef = useRef<HTMLDivElement>(null);
  const sortRef = useRef<HTMLDivElement>(null);

  // ── Navigation ──────────────────────────────────────────────────────────────
  function scrollToToday() {
    if (!ganttScrollRef.current) return;
    const timelineStart = getTimelineStartDate(tasks);
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

  // ── Filters ─────────────────────────────────────────────────────────────────
  function toggleStatusFilter(id: string) {
    const cur = filters.statusIds;
    setFilters({ statusIds: cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id] });
  }

  function toggleAssigneeFilter(name: string) {
    const cur = filters.assignees;
    setFilters({ assignees: cur.includes(name) ? cur.filter(x => x !== name) : [...cur, name] });
  }

  const activeFilterCount = filters.statusIds.length + filters.assignees.length;

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

        {/* ── Filters ── */}
        <div className={styles.group}>
          {/* Status filter */}
          <div className={styles.dropdownWrap} ref={statusFilterRef}>
            <button
              className={`${styles.filterBtn} ${filters.statusIds.length > 0 ? styles.active : ''}`}
              onClick={() => { setShowStatusFilter(v => !v); setShowAssigneeFilter(false); setShowSort(false); }}
            >
              סטטוס
              {filters.statusIds.length > 0 && <span className={styles.badge}>{filters.statusIds.length}</span>}
              <span className={styles.arrow}>▾</span>
            </button>
            {showStatusFilter && (
              <div className={styles.dropdown}>
                {statuses.map(s => (
                  <label key={s.id} className={styles.checkItem}>
                    <input
                      type="checkbox"
                      checked={filters.statusIds.includes(s.id)}
                      onChange={() => toggleStatusFilter(s.id)}
                      className={styles.checkbox}
                    />
                    <span className={styles.checkDot} style={{ background: s.color }} />
                    <span>{s.name}</span>
                  </label>
                ))}
                {filters.statusIds.length > 0 && (
                  <button className={styles.clearBtn} onClick={() => setFilters({ statusIds: [] })}>נקה הכל</button>
                )}
              </div>
            )}
          </div>

          {/* Assignee filter */}
          <div className={styles.dropdownWrap} ref={assigneeFilterRef}>
            <button
              className={`${styles.filterBtn} ${filters.assignees.length > 0 ? styles.active : ''}`}
              onClick={() => { setShowAssigneeFilter(v => !v); setShowStatusFilter(false); setShowSort(false); }}
            >
              אחראי
              {filters.assignees.length > 0 && <span className={styles.badge}>{filters.assignees.length}</span>}
              <span className={styles.arrow}>▾</span>
            </button>
            {showAssigneeFilter && (
              <div className={styles.dropdown}>
                {allAssignees.length === 0 && <div className={styles.emptyMsg}>אין אחראים</div>}
                {allAssignees.map(a => (
                  <label key={a.name} className={styles.checkItem}>
                    <input
                      type="checkbox"
                      checked={filters.assignees.includes(a.name)}
                      onChange={() => toggleAssigneeFilter(a.name)}
                      className={styles.checkbox}
                    />
                    <span className={styles.checkDot} style={{ background: a.color }} />
                    <span>{a.name}</span>
                  </label>
                ))}
                {filters.assignees.length > 0 && (
                  <button className={styles.clearBtn} onClick={() => setFilters({ assignees: [] })}>נקה הכל</button>
                )}
              </div>
            )}
          </div>

          {activeFilterCount > 0 && (
            <button className={styles.clearAllBtn} onClick={() => setFilters({ statusIds: [], assignees: [] })}>
              ✕ נקה פילטרים ({activeFilterCount})
            </button>
          )}
        </div>

        <div className={styles.sep} />

        {/* ── Sort ── */}
        <div className={styles.dropdownWrap} ref={sortRef}>
          <button
            className={`${styles.filterBtn} ${sortField !== 'manual' ? styles.active : ''}`}
            onClick={() => { setShowSort(v => !v); setShowStatusFilter(false); setShowAssigneeFilter(false); }}
          >
            מיין: {SORT_OPTIONS.find(o => o.value === sortField)?.label}
            {sortField !== 'manual' && (
              <span className={styles.sortArrow}>{sortDirection === 'asc' ? ' ↑' : ' ↓'}</span>
            )}
            <span className={styles.arrow}>▾</span>
          </button>
          {showSort && (
            <div className={styles.dropdown}>
              {SORT_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  className={`${styles.sortItem} ${sortField === opt.value ? styles.sortActive : ''}`}
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
          )}
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

      {/* Click outside to close dropdowns */}
      {(showStatusFilter || showAssigneeFilter || showSort) && (
        <div
          className={styles.backdrop}
          onClick={() => { setShowStatusFilter(false); setShowAssigneeFilter(false); setShowSort(false); }}
        />
      )}

      {showStatusManager && <StatusManager onClose={() => setShowStatusManager(false)} />}
    </>
  );
}
