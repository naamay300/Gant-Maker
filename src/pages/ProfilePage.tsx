import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import styles from './ProfilePage.module.css';

interface Member {
  userId: string;
  email: string;
  fullName: string;
  role: string;
}

interface ProjectMember {
  userId: string;
  email: string;
  fullName: string;
}

interface Project {
  id: string;
  name: string;
  taskCount: number;
  members: ProjectMember[];
}

const ROLE_LABELS: Record<string, string> = {
  owner: 'בעלים',
  editor: 'עורך',
  viewer: 'צופה',
};

const ROLES: Array<{ value: string; label: string }> = [
  { value: 'owner', label: 'בעלים' },
  { value: 'editor', label: 'עורך' },
  { value: 'viewer', label: 'צופה' },
];

export function ProfilePage() {
  const { profile, account, session, updateProfile, signOut } = useAuth();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState(profile?.fullName ?? '');
  const [myEmail, setMyEmail] = useState(profile?.email ?? '');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile?.fullName) setFullName(profile.fullName);
  }, [profile?.fullName]);

  const [members, setMembers] = useState<Member[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [wsLoading, setWsLoading] = useState(true);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<string>('editor');
  const [inviting, setInviting] = useState(false);
  const [inviteMsg, setInviteMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [addingToProject, setAddingToProject] = useState<string | null>(null);
  const [editingRoleFor, setEditingRoleFor] = useState<string | null>(null);

  const isOwner = account?.role === 'owner';
  const isAdmin = isOwner || account?.role === 'editor';
  const hasChanges = fullName.trim() !== (profile?.fullName ?? '');

  useEffect(() => {
    if (!account) return;
    loadProfileData();
  }, [account?.id]);

  async function loadProfileData() {
    setWsLoading(true);
    const { data } = await supabase.rpc('get_profile_data');
    if (data) {
      if (data.myFullName) setFullName(data.myFullName);
      if (data.myEmail) setMyEmail(data.myEmail);
      setMembers((data.members ?? []).map((m: { userId: string; role: string; email: string; fullName: string }) => ({
        userId: m.userId, role: m.role, email: m.email, fullName: m.fullName,
      })));
      setProjects((data.projects ?? []).map((p: { id: string; name: string; taskCount: number; members: ProjectMember[] }) => ({
        id: p.id, name: p.name, taskCount: p.taskCount, members: p.members ?? [],
      })));
    }
    setWsLoading(false);
  }

  async function handleSave() {
    if (!hasChanges) return;
    setSaving(true);
    await updateProfile({ fullName: fullName.trim() });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    setSaving(false);
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
          body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole, accountId: account.id }),
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? json.message ?? JSON.stringify(json));
      setInviteMsg({ type: 'ok', text: 'הזמנה נשלחה במייל' });
      setInviteEmail('');
      await loadProfileData();
    } catch (err) {
      setInviteMsg({ type: 'err', text: (err as Error).message });
    } finally {
      setInviting(false);
    }
  }

  async function updateMemberRole(userId: string, newRole: string) {
    if (!account) return;
    await supabase.from('account_members')
      .update({ role: newRole })
      .eq('account_id', account.id)
      .eq('user_id', userId);
    setEditingRoleFor(null);
    await loadProfileData();
  }

  async function addMemberToProject(projectId: string, userId: string) {
    await supabase.from('project_members').insert({ project_id: projectId, user_id: userId });
    setAddingToProject(null);
    await loadProfileData();
  }

  async function removeMemberFromProject(projectId: string, userId: string) {
    await supabase.from('project_members').delete()
      .eq('project_id', projectId).eq('user_id', userId);
    await loadProfileData();
  }

  function getMembersNotInProject(project: Project) {
    const inProject = new Set(project.members.map((m: ProjectMember) => m.userId));
    return members.filter((m: Member) => !inProject.has(m.userId));
  }

  const initial = (fullName || myEmail || '?')[0].toUpperCase();

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.topBar}>
          <button className={styles.backBtn} onClick={() => navigate('/app')}>← חזרה</button>
          <h2 className={styles.pageTitle}>פרופיל</h2>
        </div>

        {/* Avatar */}
        <div className={styles.avatarRow}>
          {profile?.avatarUrl
            ? <img src={profile.avatarUrl} alt="avatar" className={styles.avatarImg} />
            : <div className={styles.avatarInitial}>{initial}</div>
          }
        </div>

        {/* ── Section 1: Personal ── */}
        <div className={styles.sectionLabel}>פרטים אישיים</div>
        <div className={styles.card}>
          <div className={styles.field}>
            <label className={styles.label}>שם מלא</label>
            <div className={styles.nameRow}>
              <input
                className={styles.input}
                type="text"
                value={fullName}
                onChange={(e: { target: { value: string } }) => setFullName(e.target.value)}
                placeholder="שמך המלא"
              />
              <button
                className={styles.saveBtnInline}
                onClick={handleSave}
                disabled={saving || !hasChanges}
              >
                {saved ? '✓' : saving ? '...' : 'שמור'}
              </button>
            </div>
          </div>
          <div className={styles.field}>
            <label className={styles.label}>מייל</label>
            <input
              className={styles.input}
              type="email"
              value={myEmail}
              disabled
              dir="ltr"
            />
          </div>
        </div>

        {/* ── Section 2: Workspace ── */}
        {account && (
          <>
            <div className={styles.sectionLabel}>
              סביבת עבודה — <span className={styles.wsName}>{account.name}</span>
              <span className={`${styles.roleBadge} ${styles['role_' + account.role]}`}>{ROLE_LABELS[account.role]}</span>
            </div>

            {wsLoading ? (
              <div className={styles.loading}>טוען...</div>
            ) : (
              <>
                {/* Members card */}
                <div className={styles.card}>
                  <div className={styles.cardTitle}>חברי הסביבה ({members.length})</div>
                  <div className={styles.memberList}>
                    {members.map((m: Member) => (
                      <div key={m.userId} className={styles.memberRow}>
                        <div className={styles.avatar}>{(m.fullName || m.email || '?')[0].toUpperCase()}</div>
                        <div className={styles.memberInfo}>
                          <span className={styles.memberName}>{m.fullName || m.email}</span>
                          {m.fullName && <span className={styles.memberEmail}>{m.email}</span>}
                        </div>
                        <div className={styles.roleWrap}>
                          <span
                            className={`${styles.roleTag} ${styles['role_' + m.role]} ${isOwner ? styles.roleTagClickable : ''}`}
                            onClick={() => isOwner && setEditingRoleFor(editingRoleFor === m.userId ? null : m.userId)}
                          >
                            {ROLE_LABELS[m.role] ?? m.role}{isOwner ? ' ▾' : ''}
                          </span>
                          {isOwner && editingRoleFor === m.userId && (
                            <div className={styles.roleDropdown}>
                              {ROLES.map(r => (
                                <button
                                  key={r.value}
                                  className={`${styles.roleDropdownItem} ${m.role === r.value ? styles.roleDropdownItemActive : ''}`}
                                  onClick={() => updateMemberRole(m.userId, r.value)}
                                >
                                  {r.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {isAdmin && (
                    <form onSubmit={handleInvite} className={styles.inviteForm}>
                      <input
                        className={styles.input}
                        type="email"
                        value={inviteEmail}
                        onChange={(e: { target: { value: string } }) => setInviteEmail(e.target.value)}
                        placeholder="+ הזמן משתמש חדש במייל..."
                        dir="ltr"
                      />
                      <select
                        className={styles.roleSelect}
                        value={inviteRole}
                        onChange={(e: { target: { value: string } }) => setInviteRole(e.target.value)}
                      >
                        <option value="editor">עורך</option>
                        <option value="viewer">צופה</option>
                      </select>
                      <button className={styles.inviteBtn} type="submit" disabled={inviting || !inviteEmail.trim()}>
                        {inviting ? '...' : 'שלח'}
                      </button>
                    </form>
                  )}
                  {inviteMsg && (
                    <div className={`${styles.inviteMsg} ${inviteMsg.type === 'err' ? styles.inviteMsgErr : styles.inviteMsgOk}`}>
                      {inviteMsg.text}
                    </div>
                  )}
                </div>

                {/* Projects card */}
                <div className={styles.card}>
                  <div className={styles.cardTitle}>פרויקטים ({projects.length})</div>
                  {projects.length === 0 && <div className={styles.empty}>אין פרויקטים עדיין</div>}
                  <div className={styles.projectList}>
                    {projects.map((p: Project) => (
                      <div key={p.id} className={styles.projectRow}>
                        <div className={styles.projectLeft}>
                          <div className={styles.projectName}>{p.name}</div>
                          <div className={styles.taskCount}>{p.taskCount} משימות</div>
                        </div>
                        <div className={styles.projectRight}>
                          {p.members.map((m: ProjectMember) => (
                            <div
                              key={m.userId}
                              className={styles.memberChip}
                              title={m.fullName || m.email}
                              onClick={() => isAdmin && removeMemberFromProject(p.id, m.userId)}
                            >
                              {(m.fullName || m.email || '?')[0].toUpperCase()}
                            </div>
                          ))}
                          {isAdmin && (
                            <div className={styles.addMemberWrap}>
                              <button
                                className={styles.addMemberBtn}
                                onClick={() => setAddingToProject(addingToProject === p.id ? null : p.id)}
                              >+</button>
                              {addingToProject === p.id && (
                                <div className={styles.memberDropdown}>
                                  {getMembersNotInProject(p).length === 0
                                    ? <div className={styles.dropdownEmpty}>כולם כבר משויכים</div>
                                    : getMembersNotInProject(p).map((m: Member) => (
                                      <button
                                        key={m.userId}
                                        className={styles.dropdownItem}
                                        onClick={() => addMemberToProject(p.id, m.userId)}
                                      >
                                        <div className={styles.avatarSm}>{(m.fullName || m.email || '?')[0].toUpperCase()}</div>
                                        <span>{m.fullName || m.email}</span>
                                      </button>
                                    ))
                                  }
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {/* Logout at bottom */}
        <button
          className={styles.logoutBtn}
          onClick={async () => { await signOut(); navigate('/login'); }}
        >
          יציאה מהחשבון
        </button>
      </div>
    </div>
  );
}
