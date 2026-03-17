import { useState } from 'react';
import { useProjectStore } from '../../store/useProjectStore';
import { CustomStatus } from '../../types';
import styles from './StatusManager.module.css';

interface Props {
  onClose: () => void;
}

const PRESET_COLORS = [
  '#6C63FF', '#FF6584', '#43B89C', '#F7971E', '#2193b0',
  '#c471ed', '#f64f59', '#12c2e9', '#f79d00', '#64b3f4',
  '#9ea3c0', '#ff5c8a', '#00b09b', '#e96c1a', '#7f53ac',
];

export function StatusManager({ onClose }: Props) {
  const { statuses, addStatus, updateStatus, deleteStatus } = useProjectStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
  const [adding, setAdding] = useState(false);

  function startEdit(s: CustomStatus) {
    setEditingId(s.id);
    setEditName(s.name);
    setEditColor(s.color);
  }

  function saveEdit() {
    if (editingId && editName.trim()) {
      updateStatus(editingId, { name: editName.trim(), color: editColor });
    }
    setEditingId(null);
  }

  function handleAdd() {
    if (newName.trim()) {
      addStatus(newName.trim(), newColor);
      setNewName('');
      setNewColor(PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)]);
      setAdding(false);
    }
  }

  function handleDelete(id: string) {
    if (statuses.length <= 1) return;
    deleteStatus(id);
  }

  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2 className={styles.title}>ניהול סטטוסים</h2>
          <button className={styles.closeBtn} onClick={onClose}>×</button>
        </div>

        <div className={styles.list}>
          {statuses.map(s => (
            <div key={s.id} className={styles.item}>
              {editingId === s.id ? (
                <div className={styles.editRow}>
                  <input
                    type="color"
                    value={editColor}
                    onChange={e => setEditColor(e.target.value)}
                    className={styles.colorInput}
                  />
                  <input
                    autoFocus
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingId(null); }}
                    className={styles.nameInput}
                  />
                  <button className={styles.saveBtn} onClick={saveEdit}>שמור</button>
                  <button className={styles.cancelBtn} onClick={() => setEditingId(null)}>ביטול</button>
                </div>
              ) : (
                <div className={styles.viewRow}>
                  <div className={styles.dot} style={{ background: s.color }} />
                  <span className={styles.statusName}>{s.name}</span>
                  <div className={styles.actions}>
                    <button className={styles.editBtn} onClick={() => startEdit(s)}>✏️</button>
                    <button
                      className={styles.deleteBtn}
                      onClick={() => handleDelete(s.id)}
                      disabled={statuses.length <= 1}
                      title={statuses.length <= 1 ? 'חייב להיות לפחות סטטוס אחד' : 'מחק'}
                    >
                      🗑
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {adding ? (
          <div className={styles.addRow}>
            <input
              type="color"
              value={newColor}
              onChange={e => setNewColor(e.target.value)}
              className={styles.colorInput}
            />
            <input
              autoFocus
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setAdding(false); }}
              placeholder="שם הסטטוס..."
              className={styles.nameInput}
            />
            <button className={styles.saveBtn} onClick={handleAdd}>הוסף</button>
            <button className={styles.cancelBtn} onClick={() => setAdding(false)}>ביטול</button>
          </div>
        ) : (
          <button className={styles.addStatusBtn} onClick={() => setAdding(true)}>
            + סטטוס חדש
          </button>
        )}
      </div>
    </div>
  );
}
