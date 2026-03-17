import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import styles from './WorkspaceSettingsPage.module.css';

interface Member {
  userId: string;
  email: string;
  fullName: string;
  role: string;
}

interface Project {
  id: string;
  name: string;
  taskCount: number;
  assignees: string[];
}

const ROLE_LABELS: Record<string, string> = {
  owner: 'בעלים',
  admin: 'אדמין',
  manager: 'מנהל',
  member: 'חבר',
};

export function WorkspaceSettingsPage() {
  const navigate = useNavigate();
  const { account, session } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteMsg, setInviteMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const isAdmin = account?.role === 'owner' || account?.role === 'admin';

  useEffect(() => {
    if (!account) return;
    Promise.all([loadMembers(), loadProjects()]).then(() => setLoading(false));
  }, [account?.id]);

  async function loadMembers() {
    if (!account) return;
    const { data } = await supabase
      .from('account_members')
      .select('user_id, role, profiles(email, full_name)')
      .eq('account_id', account.id);
    setMembers(
      (data ?? []).map(m => {
        const p = m.profiles as unknown as { email: string; full_name: string } | null;
        return { userId: m.user_id, email: p?.email ?? '', fullName: p?.full_name ?? '', role: m.role };
      })
    );
  }

  async function loadProjects() {
    if (!account) return;
    const { data } = await supabase
      .from('projects')
      .select('id, name, tasks(id, assignee)')
      .eq('account_id', account.id);
    setProjects(
      (data ?? []).map(p => {
        const tasks = (p.tasks as unknown as { id: string; assignee: string }[]) ?? [];
        const assignees = [...new Set(tasks.map(t => t.assignee).filter(Boolean))];
        return { id: p.id, name: p.name, taskCount: tasks.length, assignees };
      })
    );
  }

  async function handleInvite(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!inviteEmail.trim() || !account || !session) return;
    setInviting(true);
    setInviteMsg(null);
    try {
      const res = await fetch(
        'https://bqrfjdwniwlwaixpzscw.supabase.co/functions/v1/invite-user',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ email: inviteEmail.trim(), role: 'member', accountId: account.id }),
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'שגיאה');
      setInviteMsg({ type: 'ok', text: 'הזמנה נשלחה במייל' });
      setInviteEmail('');
    } catch (err) {
      setInviteMsg({ type: 'err', text: (err as Error).message });
    } finally {
      setInviting(false);
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

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <div className={styles.topBar}>
          <button className={styles.backBtn} onClick={() => navigate('/profile')}>← חזרה</button>
          <h2 className={styles.pageTitle}>ניהול סביבת עבודה</h2>
        </div>

        {/* Workspace Info */}
        <div className={styles.section}>
          <div className={styles.workspaceInfo}>
            <span className={styles.workspaceIcon}>📁</span>
            <div>
              <div className={styles.workspaceName}>{account.name}</div>
              <div className={styles.workspaceRole}>
                תפקיד שלך: <strong>{ROLE_LABELS[account.role] ?? account.role}</strong>
              </div>
            </div>
          </div>
        </div>

        {loading ? (
          <div className={styles.loading}>טוען...</div>
        ) : (
          <>
            {/* Members */}
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>חברי סביבת העבודה ({members.length})</h3>
              <div className={styles.list}>
                {members.map(m => (
                  <div key={m.userId} className={styles.memberRow}>
                    <div className={styles.avatar}>{(m.fullName || m.email || '?')[0].toUpperCase()}</div>
                    <div className={styles.memberInfo}>
                      <div className={styles.memberName}>{m.fullName || '—'}</div>
                      <div className={styles.memberEmail}>{m.email}</div>
                    </div>
                    <span className={`${styles.roleBadge} ${styles['role_' + m.role]}`}>
                      {ROLE_LABELS[m.role] ?? m.role}
                    </span>
                    {isAdmin && m.role !== 'owner' && (
                      <button className={styles.removeBtn} onClick={() => removeMember(m.userId)}>✕</button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Invite */}
            {isAdmin && (
              <div className={styles.section}>
                <h3 className={styles.sectionTitle}>הזמן משתמש חדש</h3>
                <form onSubmit={handleInvite} className={styles.inviteForm}>
                  <input
                    className={styles.input}
                    type="email"
                    value={inviteEmail}
                    onChange={(e: { target: { value: string } }) => setInviteEmail(e.target.value)}
                    placeholder="כתובת מייל..."
                    dir="ltr"
                  />
                  <button className={styles.inviteBtn} type="submit" disabled={inviting}>
                    {inviting ? '...' : 'שלח הזמנה'}
                  </button>
                </form>
                {inviteMsg && (
                  <div className={`${styles.inviteMsg} ${inviteMsg.type === 'err' ? styles.inviteMsgErr : styles.inviteMsgOk}`}>
                    {inviteMsg.text}
                  </div>
                )}
              </div>
            )}

            {/* Projects */}
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>פרויקטים ({projects.length})</h3>
              <div className={styles.list}>
                {projects.length === 0 && <div className={styles.empty}>אין פרויקטים עדיין</div>}
                {projects.map(p => (
                  <div key={p.id} className={styles.projectRow}>
                    <div className={styles.projectName}>{p.name}</div>
                    <div className={styles.projectMeta}>
                      <span className={styles.taskCount}>{p.taskCount} משימות</span>
                      {p.assignees.length > 0 && (
                        <div className={styles.assigneeList}>
                          {p.assignees.map(a => (
                            <span key={a} className={styles.assigneeChip}>{a}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
