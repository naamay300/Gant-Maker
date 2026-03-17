import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import styles from './AccountSetupPage.module.css';

export function AccountSetupPage() {
  const { profile, signOut } = useAuth();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setLoading(true);
    setError('');

    const { error: err } = await supabase.rpc('create_account', { p_name: trimmed });
    if (err) {
      setError(err.message || 'שגיאה ביצירת סביבת העבודה. נסה שוב.');
      setLoading(false);
      return;
    }

    window.location.href = '/app';
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}>
          <span>📋</span>
          <h1 className={styles.title}>ברוך הבא ל-Gantt Manager</h1>
        </div>

        <p className={styles.subtitle}>
          שלום {profile?.fullName || profile?.email}!<br />
          צור סביבת עבודה לניהול הפרויקטים שלך.
        </p>

        <form onSubmit={handleCreate} className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label}>שם סביבת העבודה</label>
            <input
              className={styles.input}
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="למשל: חברת X, צוות Y..."
              required
              autoFocus
            />
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <button className={styles.btn} type="submit" disabled={loading || !name.trim()}>
            {loading ? 'יוצר...' : 'צור סביבת עבודה'}
          </button>
        </form>

        <button className={styles.logoutLink} onClick={signOut}>
          יציאה
        </button>
      </div>
    </div>
  );
}
