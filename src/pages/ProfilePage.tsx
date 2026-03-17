import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import styles from './ProfilePage.module.css';

export function ProfilePage() {
  const { profile, account, updateProfile, refreshAccount, signOut } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState(profile?.fullName ?? '');
  const [accountName, setAccountName] = useState(account?.name ?? '');
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  const canEditAccount = account?.role === 'owner' || account?.role === 'admin';

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await updateProfile({ fullName: fullName.trim() });
    if (canEditAccount && accountName.trim() && accountName.trim() !== account?.name) {
      await supabase.from('accounts').update({ name: accountName.trim() }).eq('id', account!.id);
      await refreshAccount();
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    setLoading(false);
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.topBar}>
          <button className={styles.backBtn} onClick={() => navigate('/app')}>← חזרה</button>
          <h2 className={styles.pageTitle}>פרופיל</h2>
        </div>

        <div className={styles.avatar}>
          {profile?.avatarUrl
            ? <img src={profile.avatarUrl} alt="avatar" className={styles.avatarImg} />
            : <div className={styles.avatarInitial}>{(profile?.fullName || profile?.email || '?')[0].toUpperCase()}</div>
          }
        </div>

        <form onSubmit={handleSave} className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label}>שם מלא</label>
            <input
              className={styles.input}
              type="text"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              placeholder="שמך המלא"
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>מייל</label>
            <input
              className={styles.input}
              type="email"
              value={profile?.email ?? ''}
              disabled
              dir="ltr"
            />
          </div>

          {account && (
            <div className={styles.field}>
              <label className={styles.label}>סביבת עבודה {canEditAccount && <span className={styles.roleTag}>{account.role}</span>}</label>
              <input
                className={styles.input}
                type="text"
                value={accountName}
                onChange={e => setAccountName(e.target.value)}
                disabled={!canEditAccount}
              />
            </div>
          )}

          <div className={styles.actions}>
            <button className={styles.saveBtn} type="submit" disabled={loading}>
              {saved ? '✓ נשמר' : loading ? '...' : 'שמור'}
            </button>
            <button
              type="button"
              className={styles.logoutBtn}
              onClick={async () => { await signOut(); navigate('/login'); }}
            >
              יציאה
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
