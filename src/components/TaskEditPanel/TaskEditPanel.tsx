import { useEffect, useRef, useState } from 'react';
import { useProjectStore, useActiveProject, useSelectedTask, useAllAssignees } from '../../store/useProjectStore';
import { Assignee } from '../../types';
import { format, parseISO } from 'date-fns';
import { StatusManager } from '../StatusManager/StatusManager';
import styles from './TaskEditPanel.module.css';

const PRESET_COLORS = [
  '#6C63FF', '#FF6584', '#43B89C', '#F7971E', '#2193b0',
  '#c471ed', '#f64f59', '#12c2e9', '#f79d00', '#64b3f4',
];

function pickColor(existing: string[]): string {
  return PRESET_COLORS.find(c => !existing.includes(c)) ?? PRESET_COLORS[0];
}

export function TaskEditPanel() {
  const { updateTask, deleteTask, selectTask, statuses } = useProjectStore();
  const project = useActiveProject();
  const selectedTask = useSelectedTask();
  const knownAssignees = useAllAssignees();

  const [name, setName]             = useState('');
  const [assignees, setAssignees]   = useState<Assignee[]>([]);
  const [startDate, setStartDate]   = useState('');
  const [duration, setDuration]     = useState(7);
  const [statusId, setStatusId]     = useState('');
  const [dependencies, setDeps]     = useState<string[]>([]);

  // New assignee input
  const [newAssignee, setNewAssignee] = useState('');
  const [newAssigneeColor, setNewAssigneeColor] = useState(PRESET_COLORS[0]);
  const [showAssigneeAdd, setShowAssigneeAdd] = useState(false);
  const [suggestions, setSuggestions] = useState<Assignee[]>([]);

  // New status inline
  const [showStatusMgr, setShowStatusMgr] = useState(false);

  const nameRef = useRef<HTMLInputElement>(null);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Sync form when task changes ─────────────────────────────────────────────
  useEffect(() => {
    if (selectedTask) {
      setName(selectedTask.name);
      setAssignees(selectedTask.assignees);
      setStartDate(selectedTask.startDate);
      setDuration(selectedTask.duration);
      setStatusId(selectedTask.statusId);
      setDeps(selectedTask.dependencies);
      // Auto-focus name if empty (new task)
      if (!selectedTask.name) setTimeout(() => nameRef.current?.focus(), 50);
    }
  }, [selectedTask?.id]);

  if (!selectedTask || !project) return null;
  const otherTasks = project.tasks.filter(t => t.id !== selectedTask.id);

  // ── Auto-save ───────────────────────────────────────────────────────────────
  function save(overrides?: Partial<typeof selectedTask>) {
    if (!selectedTask) return;
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => {
      updateTask(selectedTask.id, {
        name: (overrides?.name ?? name).trim() || selectedTask.name || 'משימה ללא שם',
        assignees: overrides?.assignees ?? assignees,
        startDate: overrides?.startDate ?? startDate,
        duration: Math.max(1, overrides?.duration ?? duration),
        statusId: overrides?.statusId ?? statusId,
        dependencies: overrides?.dependencies ?? dependencies,
      });
    }, 300);
  }

  // ── Assignees ───────────────────────────────────────────────────────────────
  function removeAssignee(name: string) {
    const next = assignees.filter(a => a.name !== name);
    setAssignees(next);
    save({ assignees: next });
  }

  function handleAssigneeInput(val: string) {
    setNewAssignee(val);
    if (val.trim()) {
      const q = val.toLowerCase();
      setSuggestions(
        knownAssignees.filter(a =>
          a.name.toLowerCase().includes(q) &&
          !assignees.some(ea => ea.name === a.name)
        )
      );
    } else {
      setSuggestions([]);
    }
  }

  function addAssigneeFromSuggestion(a: Assignee) {
    const next = [...assignees, a];
    setAssignees(next);
    setNewAssignee('');
    setSuggestions([]);
    setShowAssigneeAdd(false);
    save({ assignees: next });
  }

  function addNewAssignee() {
    const trimmed = newAssignee.trim();
    if (!trimmed) return;
    const existing = knownAssignees.find(a => a.name === trimmed);
    const color = existing ? existing.color : newAssigneeColor;
    const a: Assignee = { name: trimmed, color };
    const next = [...assignees, a];
    setAssignees(next);
    setNewAssignee('');
    setSuggestions([]);
    setShowAssigneeAdd(false);
    setNewAssigneeColor(pickColor(next.map(x => x.color)));
    save({ assignees: next });
  }

  function updateAssigneeColor(aName: string, color: string) {
    const next = assignees.map(a => a.name === aName ? { ...a, color } : a);
    setAssignees(next);
    save({ assignees: next });
  }

  // ── Status ──────────────────────────────────────────────────────────────────
  function handleStatusChange(id: string) {
    setStatusId(id);
    save({ statusId: id });
  }

  // ── Deps ────────────────────────────────────────────────────────────────────
  function toggleDep(taskId: string) {
    const next = dependencies.includes(taskId)
      ? dependencies.filter(d => d !== taskId)
      : [...dependencies, taskId];
    setDeps(next);
    save({ dependencies: next });
  }

  // ── Delete ──────────────────────────────────────────────────────────────────
  function handleDelete() {
    if (!selectedTask) return;
    if (confirm(`למחוק את המשימה "${selectedTask.name || '#' + selectedTask.number}"?`)) {
      deleteTask(selectedTask.id);
    }
  }

  const createdAtFormatted = selectedTask.createdAt
    ? format(parseISO(selectedTask.createdAt), 'dd.MM.yyyy HH:mm')
    : null;

  return (
    <>
      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <h3 className={styles.title}>
            <span className={styles.taskNum}>#{selectedTask.number}</span>
            עריכת משימה
          </h3>
          <button className={styles.closeBtn} onClick={() => selectTask(null)}>×</button>
        </div>

        <div className={styles.fields}>

          {/* Name */}
          <div className={styles.field}>
            <label className={styles.label}>שם המשימה</label>
            <input
              ref={nameRef}
              className={styles.input}
              value={name}
              onChange={e => { setName(e.target.value); save({ name: e.target.value }); }}
              placeholder="שם המשימה..."
            />
          </div>

          {/* Assignees */}
          <div className={styles.field}>
            <label className={styles.label}>אחראים</label>

            {/* Tags */}
            <div className={styles.assigneeTags}>
              {assignees.map(a => (
                <span key={a.name} className={styles.assigneeTag} style={{ background: a.color + '30', borderColor: a.color + '80' }}>
                  <input
                    type="color"
                    value={a.color}
                    onChange={e => updateAssigneeColor(a.name, e.target.value)}
                    className={styles.inlineColorPicker}
                    title="שנה צבע"
                  />
                  <span className={styles.tagDot} style={{ background: a.color }} />
                  <span className={styles.tagName}>{a.name}</span>
                  <button
                    className={styles.removeTag}
                    onClick={() => removeAssignee(a.name)}
                  >×</button>
                </span>
              ))}

              {!showAssigneeAdd && (
                <button className={styles.addAssigneeBtn} onClick={() => setShowAssigneeAdd(true)}>
                  + הוסף
                </button>
              )}
            </div>

            {/* New assignee input */}
            {showAssigneeAdd && (
              <div className={styles.assigneeAddRow}>
                <input
                  type="color"
                  value={newAssigneeColor}
                  onChange={e => setNewAssigneeColor(e.target.value)}
                  className={styles.colorInput}
                />
                <div className={styles.assigneeInputWrap}>
                  <input
                    autoFocus
                    value={newAssignee}
                    onChange={e => handleAssigneeInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') addNewAssignee();
                      if (e.key === 'Escape') setShowAssigneeAdd(false);
                    }}
                    placeholder="שם האחראי..."
                    className={styles.input}
                  />
                  {suggestions.length > 0 && (
                    <div className={styles.suggestions}>
                      {suggestions.map(s => (
                        <button
                          key={s.name}
                          className={styles.suggestion}
                          onClick={() => addAssigneeFromSuggestion(s)}
                        >
                          <span className={styles.tagDot} style={{ background: s.color }} />
                          {s.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button className={styles.addBtn} onClick={addNewAssignee}>+</button>
                <button className={styles.cancelSmall} onClick={() => setShowAssigneeAdd(false)}>✕</button>
              </div>
            )}
          </div>

          {/* Dates */}
          <div className={styles.row2}>
            <div className={styles.field}>
              <label className={styles.label}>תאריך התחלה</label>
              <input
                className={styles.input}
                type="date"
                value={startDate}
                onChange={e => { setStartDate(e.target.value); save({ startDate: e.target.value }); }}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>משך (ימים)</label>
              <div className={styles.durationRow}>
                <button className={styles.durationBtn} onClick={() => { const d = Math.max(1, duration - 1); setDuration(d); save({ duration: d }); }}>−</button>
                <input
                  className={`${styles.input} ${styles.durationInput}`}
                  type="number" min={1}
                  value={duration}
                  onChange={e => { const d = Number(e.target.value); setDuration(d); save({ duration: d }); }}
                />
                <button className={styles.durationBtn} onClick={() => { const d = duration + 1; setDuration(d); save({ duration: d }); }}>+</button>
              </div>
            </div>
          </div>

          {/* Status */}
          <div className={styles.field}>
            <div className={styles.labelRow}>
              <label className={styles.label}>סטטוס</label>
              <button className={styles.manageLink} onClick={() => setShowStatusMgr(true)}>⚙ נהל</button>
            </div>
            <div className={styles.statusGrid}>
              {statuses.map(s => (
                <button
                  key={s.id}
                  className={`${styles.statusOption} ${statusId === s.id ? styles.statusSelected : ''}`}
                  style={statusId === s.id ? { borderColor: s.color, color: s.color, background: s.color + '20' } : {}}
                  onClick={() => handleStatusChange(s.id)}
                >
                  <span className={styles.statusDot} style={{ background: s.color }} />
                  {s.name}
                </button>
              ))}
              <button className={styles.addStatusInline} onClick={() => setShowStatusMgr(true)}>
                + סטטוס
              </button>
            </div>
          </div>

          {/* Dependencies */}
          {otherTasks.length > 0 && (
            <div className={styles.field}>
              <label className={styles.label}>תלויות</label>
              <div className={styles.depList}>
                {otherTasks.map(t => {
                  const st = statuses.find(s => s.id === t.statusId);
                  return (
                    <label key={t.id} className={styles.depItem}>
                      <input
                        type="checkbox"
                        checked={dependencies.includes(t.id)}
                        onChange={() => toggleDep(t.id)}
                        className={styles.checkbox}
                      />
                      <span className={styles.depDot} style={{ background: st?.color ?? '#ccc' }} />
                      <span className={styles.depName}>#{t.number} {t.name || 'ללא שם'}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Created at */}
          {createdAtFormatted && (
            <div className={styles.createdAt}>
              נוצר: {createdAtFormatted}
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <button className={styles.deleteBtn} onClick={handleDelete}>🗑 מחק</button>
          <button className={styles.saveBtn} onClick={() => save()}>שמור</button>
        </div>
      </div>

      {showStatusMgr && <StatusManager onClose={() => setShowStatusMgr(false)} />}
    </>
  );
}
