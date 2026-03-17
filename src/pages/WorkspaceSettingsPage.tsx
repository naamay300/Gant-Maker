import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { useWorkspaceMembers } from '../hooks/useWorkspaceMembers';
import { WorkspaceMember, Invitation } from '../types';
import styles from './WorkspaceSettingsPage.module.css';

const ROLE_LABELS: Record<string, string> = {
  owner:   'בעלים',
  admin:   'אדמין',
  manager: 'מנהל',
  member:  'חבר',
};

const ROLE_OPTIONS: { value: Invitation['role']; label: string }[] = [
  { value: 'admin',   label: 'אדמין' },
  { value: 'manager', label: 'מנהל' },
  { value: 'member',  label: 'חבר' },
];

function Avatar({ member }: { member: WorkspaceMember }) {
  const initial = (member.fullName || member.email || '?')[0].toUpperCase();
  return member.avatarUrl
    ? <img src={member.avatarUrl} className={styles.avatar} alt={member.fullName} />
    : <div className={styles.avatarInitial}>{initial}</div>;
}

export function WorkspaceSettingsPage() {
  const navigate  = useNavigate();
  const { account } = useAuth();
  const perms     = usePermissions();
  const ws        = useWorkspaceMembers(account?.id);

  const [tab, setTab]               = useState<'members' | 'invitations'>('members');
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail]   = useState('');
  const [inviteRole, setInviteRole]     = useState<Invitation['role']>('member');
  const [inviting, setInviting]         = useState(false);
  const [inviteMsg, setInviteMsg]       = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => { ws.load(); }, [ws.load]);

  async function handleInvite(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setInviteMsg(null);
    try {
      const type = await ws.inviteMember(inviteEmail.trim(), inviteRole);
      setInviteMsg({
        type: 'ok',
        text: type === 'added_directly' ? 'המשתמש נוסף ישירות לסביבת העבודה' : 'הזמנה נשלחה במייל',
      });
      setInviteEmail('');
      setInviteRole('member');
    } catch (err) {
      setInviteMsg({ type: 'err', text: (err as Error).message });
    } finally {
      setInviting(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>

        {/* Header */}
        <div className={styles.topBar}>
          <button className={styles.backBtn} onClick={() => navigate('/profile')}>← חזרה</button>
          <h2 className={styles.pageTitle}>חברי סביבת העבודה</h2>
          <span className={styles.workspaceName}>{account?.name}</span>
        </div>

        {/* Tabs */}
        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${tab === 'members' ? styles.tabActive : ''}`}
            onClick={() => setTab('members')}
          >
            חברים ({ws.members.length})
          </button>
          {perms.isAdmin && (
            <button
              className={`${styles.tab} ${tab === 'invitations' ? styles.tabActive : ''}`}
              onClick={() => setTab('invitations')}
            >
              הזמנות ממתינות ({ws.invitations.length})
            </button>
          )}
        </div>

        {/* Invite form */}
        {perms.isAdmin && (
          <div className={styles.inviteSection}>
            {!showInvite ? (
              <button className={styles.inviteToggleBtn} onClick={() => setShowInvite(true)}>
                + הזמן חבר חדש
              </button>
            ) : (
              <form className={styles.inviteForm} onSubmit={handleInvite}>
                <input
                  className={styles.inviteInput}
                  type="email"
                  placeholder="כתובת מייל..."
                  value={inviteEmail}
                  onChange={(e: { target: { value: string } }) => setInviteEmail(e.target.value)}
                  autoFocus
                  dir="ltr"
                />
                <select
                  className={styles.roleSelect}
                  value={inviteRole}
                  onChange={(e: { target: { value: string } }) => setInviteRole(e.target.value as Invitation['role'])}
                >
                  {ROLE_OPTIONS.map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
                <button className={styles.inviteBtn} type="submit" disabled={inviting}>
                  {inviting ? '...' : 'שלח'}
                </button>
                <button type="button" className={styles.cancelBtn} onClick={() => { setShowInvite(false); setInviteMsg(null); }}>
                  ביטול
                </button>
              </form>
            )}
            {inviteMsg && (
              <div className={`${styles.inviteMsg} ${inviteMsg.type === 'err' ? styles.inviteMsgErr : styles.inviteMsgOk}`}>
                {inviteMsg.text}
              </div>
            )}
          </div>
        )}

        {/* Content */}
        {ws.loading && <div className={styles.loading}>טוען...</div>}
        {ws.error  && <div className={styles.errorMsg}>{ws.error}</div>}

        {!ws.loading && tab === 'members' && (
          <div className={styles.list}>
            {ws.members.map(member => (
              <div key={member.id} className={styles.memberRow}>
                <Avatar member={member} />
                <div className={styles.memberInfo}>
                  <span className={styles.memberName}>{member.fullName || '—'}</span>
                  <span className={styles.memberEmail} dir="ltr">{member.email}</span>
                </div>
                <div className={styles.memberActions}>
                  {perms.isAdmin && member.role !== 'owner' ? (
                    <select
                      className={`${styles.roleBadge} ${styles.roleEditable}`}
                      value={member.role}
                      onChange={(e: { target: { value: string } }) => ws.updateRole(member.id, e.target.value)}
                    >
                      {ROLE_OPTIONS.map(r => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                  ) : (
                    <span className={`${styles.roleBadge} ${styles['role_' + member.role]}`}>
                      {ROLE_LABELS[member.role]}
                    </span>
                  )}
                  {perms.isAdmin && member.role !== 'owner' && (
                    <button
                      className={styles.removeBtn}
                      onClick={() => ws.removeMember(member.id)}
                      title="הסר מהסביבה"
                    >✕</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {!ws.loading && tab === 'invitations' && (
          <div className={styles.list}>
            {ws.invitations.length === 0 && (
              <div className={styles.empty}>אין הזמנות ממתינות</div>
            )}
            {ws.invitations.map(inv => (
              <div key={inv.id} className={styles.memberRow}>
                <div className={styles.avatarInitial}>✉</div>
                <div className={styles.memberInfo}>
                  <span className={styles.memberEmail} dir="ltr">{inv.email}</span>
                  <span className={styles.inviteExpiry}>
                    פג תוקף: {new Date(inv.expiresAt).toLocaleDateString('he-IL')}
                  </span>
                </div>
                <div className={styles.memberActions}>
                  <span className={`${styles.roleBadge} ${styles['role_' + inv.role]}`}>
                    {ROLE_LABELS[inv.role]}
                  </span>
                  <button
                    className={styles.removeBtn}
                    onClick={() => ws.cancelInvitation(inv.id)}
                    title="בטל הזמנה"
                  >✕</button>
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
