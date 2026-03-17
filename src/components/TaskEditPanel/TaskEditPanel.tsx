import { useEffect, useRef, useState } from 'react';
import { useProjectStore, useActiveProject, useSelectedTask, useAllAssignees } from '../../store/useProjectStore';
import { Assignee } from '../../types';
import { format, parseISO } from 'date-fns';
import { StatusManager } from '../StatusManager/StatusManager';
import styles from './TaskEditPanel.module.css';

const PALETTE = [
  '#6C63FF', '#FF6584', '#43B89C', '#F7971E', '#2193b0',
  '#c471ed', '#f64f59', '#12c2e9', '#f79d00', '#64b3f4',
  '#ff4757', '#2ed573', '#1e90ff', '#ffa502', '#a29bfe',
  '#00b894', '#fdcb6e', '#e17055', '#74b9ff', '#fd79a8',
];

function pickColor(existing: string[]): string {
  return PALETTE.find(c => !existing.includes(c)) ?? PALETTE[0];
}

function ColorPalette({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className={styles.palette}>
      {PALETTE.map(c => (
        <button
          key={c}
          className={`${styles.paletteColor} ${value === c ? styles.paletteSelected : ''}`}
          style={{ background: c }}
          onClick={() => onChange(c)}
          title={c}
        />
      ))}
    </div>
  );
}

export function TaskEditPanel() {
  const { updateTask, selectTask, statuses } = useProjectStore();
  const project = useActiveProject();
  const selectedTask = useSelectedTask();
  const knownAssignees = useAllAssignees();

  const [name, setName]             = useState('');
  const [assignees, setAssignees]   = useState<Assignee[]>([]);
  const [startDate, setStartDate]   = useState('');
  const [duration, setDuration]     = useState(7);
  const [statusId, setStatusId]     = useState('');
  const [dependencies, setDeps]     = useState<string[]>([]);
  const [saved, setSaved]           = useState(false);
  const [editingColorFor, setEditingColorFor] = useState<string | null>(null);

  // New assignee input
  const [newAssignee, setNewAssignee] = useState('');
  const [newAssigneeColor, setNewAssigneeColor] = useState(PALETTE[0]);
  const [showAssigneeAdd, setShowAssigneeAdd] = useState(false);
  const [showNewColorPalette, setShowNewColorPalette] = useState(false);
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
      setSaved(false);
      if (!selectedTask.name) setTimeout(() => nameRef.current?.focus(), 50);
    }
  }, [selectedTask?.id, selectedTask?.startDate, selectedTask?.duration]);

  if (!selectedTask || !project) return null;
  const otherTasks = project.tasks.filter(t => t.id !== selectedTask.id);

  // ── Save ────────────────────────────────────────────────────────────────────
  function markChanged() { setSaved(false); }

  function save(overrides?: Partial<typeof selectedTask>) {
    if (!selectedTask) return;
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    setSaved(false);
    saveTimeout.current = setTimeout(async () => {
      await updateTask(selectedTask.id, {
        name: (overrides?.name ?? name).trim() || selectedTask.name || 'משימה ללא שם',
        assignees: overrides?.assignees ?? assignees,
        startDate: overrides?.startDate ?? startDate,
        duration: Math.max(1, overrides?.duration ?? duration),
        statusId: overrides?.statusId ?? statusId,
        dependencies: overrides?.dependencies ?? dependencies,
      });
      setSaved(true);
    }, 300);
  }

  // ── Assignees ───────────────────────────────────────────────────────────────
  function removeAssignee(aName: string) {
    const next = assignees.filter(a => a.name !== aName);
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
    setShowNewColorPalette(false);
    setNewAssigneeColor(pickColor(next.map(x => x.color)));
    save({ assignees: next });
  }

  function updateAssigneeColor(aName: string, color: string) {
    const next = assignees.map(a => a.name === aName ? { ...a, color } : a);
    setAssignees(next);
    setEditingColorFor(null);
    save({ assignees: next });
  }

  // ── Status ──────────────────────────────────────────────────────────────────
  function handleStatusChange(id: string) {
    setStatusId(id);
    save({ statusId: id });
  }

  // ── Deps ────────────────────────────────────────────────────────────────────
  function addDep(taskId: string) {
    if (dependencies.includes(taskId)) return;
    const next = [...dependencies, taskId];
    setDeps(next);
    save({ dependencies: next });
  }

  function removeDep(taskId: string) {
    const next = dependencies.filter((d: string) => d !== taskId);
    setDeps(next);
    save({ dependencies: next });
  }

  // tasks that depend on this task (reverse dependencies) — read from project
  const dependentOnMe = otherTasks.filter(t => t.dependencies.includes(selectedTask.id));

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
              onChange={e => { setName(e.target.value); markChanged(); save({ name: e.target.value }); }}
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
                  <button
                    className={styles.tagDot}
                    style={{ background: a.color }}
                    onClick={() => setEditingColorFor(editingColorFor === a.name ? null : a.name)}
                    title="שנה צבע"
                  />
                  <span className={styles.tagName}>{a.name}</span>
                  <button
                    className={styles.removeTag}
                    onClick={() => removeAssignee(a.name)}
                  >×</button>
                  {editingColorFor === a.name && (
                    <div className={styles.palettePopup}>
                      <ColorPalette value={a.color} onChange={c => updateAssigneeColor(a.name, c)} />
                    </div>
                  )}
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
                <div className={styles.assigneeColorWrap}>
                  <button
                    className={styles.tagDotBtn}
                    style={{ background: newAssigneeColor }}
                    onClick={() => setShowNewColorPalette(v => !v)}
                    title="בחר צבע"
                  />
                  {showNewColorPalette && (
                    <div className={styles.palettePopup}>
                      <ColorPalette value={newAssigneeColor} onChange={c => { setNewAssigneeColor(c); setShowNewColorPalette(false); }} />
                    </div>
                  )}
                </div>
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
                onChange={e => { setStartDate(e.target.value); markChanged(); save({ startDate: e.target.value }); }}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>משך (ימים)</label>
              <div className={styles.durationRow}>
                <button className={styles.durationBtn} onClick={() => { const d = Math.max(1, duration - 1); setDuration(d); markChanged(); save({ duration: d }); }}>−</button>
                <input
                  className={`${styles.input} ${styles.durationInput}`}
                  type="number" min={1}
                  value={duration}
                  onChange={e => { const d = Number(e.target.value); setDuration(d); markChanged(); save({ duration: d }); }}
                />
                <button className={styles.durationBtn} onClick={() => { const d = duration + 1; setDuration(d); markChanged(); save({ duration: d }); }}>+</button>
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

          {/* Dependencies — תלויה במשימות */}
          {otherTasks.length > 0 && (
            <div className={styles.field}>
              <label className={styles.label}>תלויה במשימות</label>

              {/* Selected deps as tags */}
              <div className={styles.depTags}>
                {dependencies.map((depId: string) => {
                  const t = otherTasks.find(x => x.id === depId);
                  if (!t) return null;
                  const st = statuses.find(s => s.id === t.statusId);
                  return (
                    <span key={depId} className={styles.depTag}>
                      <span className={styles.depDot} style={{ background: st?.color ?? '#ccc' }} />
                      #{t.number} {t.name || 'ללא שם'}
                      <button className={styles.removeTag} onClick={() => removeDep(depId)}>×</button>
                    </span>
                  );
                })}
              </div>

              {/* Dropdown to add */}
              {otherTasks.filter(t => !dependencies.includes(t.id)).length > 0 && (
                <select
                  className={styles.depSelect}
                  value=""
                  onChange={(e: { target: { value: string } }) => { if (e.target.value) addDep(e.target.value); }}
                >
                  <option value="">+ הוסף תלות...</option>
                  {otherTasks
                    .filter(t => !dependencies.includes(t.id))
                    .map(t => (
                      <option key={t.id} value={t.id}>
                        #{t.number} {t.name || 'ללא שם'}
                      </option>
                    ))}
                </select>
              )}
            </div>
          )}

          {/* Reverse dependencies — משימות שתלויות בי */}
          {dependentOnMe.length > 0 && (
            <div className={styles.field}>
              <label className={styles.label}>משימות שתלויות בי</label>
              <div className={styles.depTags}>
                {dependentOnMe.map(t => {
                  const st = statuses.find(s => s.id === t.statusId);
                  return (
                    <span key={t.id} className={`${styles.depTag} ${styles.depTagReadonly}`}>
                      <span className={styles.depDot} style={{ background: st?.color ?? '#ccc' }} />
                      #{t.number} {t.name || 'ללא שם'}
                    </span>
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
          <button
            className={`${styles.saveBtn} ${saved ? styles.saveBtnSaved : ''}`}
            onClick={() => save()}
          >
            {saved ? '✓ נשמר' : 'שמור'}
          </button>
        </div>
      </div>

      {showStatusMgr && <StatusManager onClose={() => setShowStatusMgr(false)} />}
    </>
  );
}
