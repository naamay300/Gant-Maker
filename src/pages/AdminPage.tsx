import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import styles from './AdminPage.module.css';

interface MemberRow {
  userId: string;
  email: string;
  fullName: string;
  role: string;
}

interface ProjectRow {
  id: string;
  name: string;
  memberCount: number;
}

export function AdminPage() {
  const { account } = useAuth();
  const navigate = useNavigate();
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('viewer');
  const [inviteMsg, setInviteMsg] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!account) return;
    Promise.all([loadMembers(), loadProjects()]).then(() => setLoading(false));
  }, [account]);

  async function loadMembers() {
    if (!account) return;
    const { data } = await supabase
      .from('account_members')
      .select('user_id, role, profiles(email, full_name)')
      .eq('account_id', account.id);

    setMembers(
      (data ?? []).map((m) => {
        const p = m.profiles as unknown as { email: string; full_name: string } | null;
        return { userId: m.user_id, email: p?.email ?? '', fullName: p?.full_name ?? '', role: m.role };
      })
    );
  }

  async function loadProjects() {
    if (!account) return;
    const { data } = await supabase
      .from('projects')
      .select('id, name, project_members(count)')
      .eq('account_id', account.id);

    setProjects(
      (data ?? []).map(p => ({
        id: p.id,
        name: p.name,
        memberCount: (p.project_members as unknown as { count: number }[])[0]?.count ?? 0,
      }))
    );
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!account || !inviteEmail.trim()) return;
    setInviteMsg('');
    const { data } = await supabase.rpc('add_account_member', {
      p_account_id: account.id,
      p_email: inviteEmail.trim(),
      p_role: inviteRole,
    });
    if (data?.error) {
      setInviteMsg(data.message ?? 'שגיאה');
    } else {
      setInviteMsg('המשתמש נוסף בהצלחה!');
      setInviteEmail('');
      await loadMembers();
    }
  }

  async function removeMember(userId: string) {
    if (!account) return;
    if (!confirm('להסיר את המשתמש מסביבת העבודה?')) return;
    await supabase
      .from('account_members')
      .delete()
      .eq('account_id', account.id)
      .eq('user_id', userId);
    await loadMembers();
  }

  if (!account) return null;
  const isOwnerOrAdmin = account.role === 'owner' || account.role === 'editor';

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <div className={styles.topBar}>
          <button className={styles.backBtn} onClick={() => navigate('/app')}>← חזרה</button>
          <h2 className={styles.pageTitle}>ניהול סביבת עבודה</h2>
        </div>

        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>📁 {account.name}</h3>
          <p className={styles.sectionSub}>תפקיד שלך: <strong>{account.role === 'owner' ? 'בעלים' : account.role === 'editor' ? 'עורך' : 'צופה'}</strong></p>
        </div>

        {loading ? (
          <div className={styles.loading}>טוען...</div>
        ) : (
          <>
            {/* Members */}
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>חברי סביבת העבודה ({members.length})</h3>
              <div className={styles.memberList}>
                {members.map(m => (
                  <div key={m.userId} className={styles.memberRow}>
                    <div className={styles.memberAvatar}>
                      {(m.fullName || m.email || '?')[0].toUpperCase()}
                    </div>
                    <div className={styles.memberInfo}>
                      <div className={styles.memberName}>{m.fullName || '—'}</div>
                      <div className={styles.memberEmail}>{m.email}</div>
                    </div>
                    <span className={styles.roleTag}>{m.role === 'owner' ? 'בעלים' : m.role === 'editor' ? 'עורך' : 'צופה'}</span>
                    {isOwnerOrAdmin && m.role !== 'owner' && (
                      <button className={styles.removeBtn} onClick={() => removeMember(m.userId)}>הסר</button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Invite */}
            {isOwnerOrAdmin && (
              <div className={styles.section}>
                <h3 className={styles.sectionTitle}>הזמן משתמש</h3>
                <form onSubmit={handleInvite} className={styles.inviteForm}>
                  <input
                    className={styles.input}
                    type="email"
                    value={inviteEmail}
                    onChange={e => setInviteEmail(e.target.value)}
                    placeholder="כתובת מייל"
                    required
                    dir="ltr"
                  />
                  <select
                    className={styles.select}
                    value={inviteRole}
                    onChange={e => setInviteRole(e.target.value)}
                  >
                    <option value="member">חבר</option>
                    <option value="admin">מנהל</option>
                  </select>
                  <button className={styles.inviteBtn} type="submit">הזמן</button>
                </form>
                {inviteMsg && <p className={styles.inviteMsg}>{inviteMsg}</p>}
                <p className={styles.hint}>המשתמש חייב להיות רשום במערכת כבר</p>
              </div>
            )}

            {/* Projects */}
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>פרויקטים ({projects.length})</h3>
              <div className={styles.projectList}>
                {projects.map(p => (
                  <div key={p.id} className={styles.projectRow}>
                    <span className={styles.projectName}>{p.name}</span>
                    <span className={styles.projectMeta}>{p.memberCount} חברים</span>
                  </div>
                ))}
                {projects.length === 0 && <p className={styles.empty}>אין פרויקטים עדיין</p>}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
