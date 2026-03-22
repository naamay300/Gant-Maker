import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import styles from './ProfilePage.module.css';

interface Invitation {
  id: string;
  email: string;
  role: string;
  status: 'pending' | 'accepted';
}

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
  role: string;
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
  const { profile, account, updateProfile, signOut } = useAuth();
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
  const [inviteMessage, setInviteMessage] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteMsg, setInviteMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [resendingFor, setResendingFor] = useState<string | null>(null);

  const [addingToProject, setAddingToProject] = useState<string | null>(null);
  const [editingRoleFor, setEditingRoleFor] = useState<string | null>(null);
  const [roleUpdateErr, setRoleUpdateErr] = useState<string | null>(null);
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [editingProjectRoleFor, setEditingProjectRoleFor] = useState<{ projectId: string; userId: string } | null>(null);

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
    let loadedProjects: Project[] = [];
    let loadedMembers: Member[] = [];
    if (data) {
      if (data.myFullName) setFullName(data.myFullName);
      if (data.myEmail) setMyEmail(data.myEmail);
      loadedMembers = (data.members ?? []).map((m: { userId: string; role: string; email: string; fullName: string }) => ({
        userId: m.userId, role: m.role, email: m.email, fullName: m.fullName,
      }));
      setMembers(loadedMembers);
      loadedProjects = (data.projects ?? []).map((p: { id: string; name: string; taskCount: number }) => ({
        id: p.id, name: p.name, taskCount: p.taskCount, members: [],
      }));
    }

    // Build project members = workspace members + project-specific members
    // Workspace members appear in ALL projects (with their workspace role)
    // project_members rows override role if a specific project role exists
    if (loadedProjects.length > 0) {
      const projectIds = loadedProjects.map(p => p.id);
      const { data: pmData } = await supabase
        .from('project_members')
        .select('project_id, user_id, role')
        .in('project_id', projectIds);

      // Build projectMembersMap: projectId → { userId → role }
      const projectRoleMap: Record<string, Record<string, string>> = {};
      (pmData ?? []).forEach((r: { project_id: string; user_id: string; role: string }) => {
        if (!projectRoleMap[r.project_id]) projectRoleMap[r.project_id] = {};
        projectRoleMap[r.project_id][r.user_id] = r.role;
      });

      // Collect all user IDs we need profiles for (workspace members + project-only members)
      const projectOnlyUserIds = [...new Set((pmData ?? []).map((r: { user_id: string }) => r.user_id))];
      const wsUserIds = loadedMembers.map((m: Member) => m.userId);
      const allNeeded = [...new Set([...projectOnlyUserIds, ...wsUserIds])];

      let profilesById: Record<string, { email: string; full_name: string }> = {};
      if (allNeeded.length > 0) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('id, email, full_name')
          .in('id', allNeeded);
        (profileData ?? []).forEach((p: { id: string; email: string; full_name: string }) => {
          profilesById[p.id] = { email: p.email, full_name: p.full_name };
        });
      }

      loadedProjects = loadedProjects.map(proj => {
        const projectRoles = projectRoleMap[proj.id] ?? {};

        // Start with all workspace members
        const wsMemberRows: ProjectMember[] = loadedMembers.map((m: Member) => ({
          userId: m.userId,
          email: m.email,
          fullName: m.fullName,
          role: projectRoles[m.userId] ?? m.role, // project-specific role overrides ws role
        }));

        // Add project-only members (not in workspace)
        const wsIds = new Set(loadedMembers.map((m: Member) => m.userId));
        const projectOnlyRows: ProjectMember[] = Object.keys(projectRoles)
          .filter(uid => !wsIds.has(uid))
          .map(uid => ({
            userId: uid,
            email: profilesById[uid]?.email ?? '',
            fullName: profilesById[uid]?.full_name ?? '',
            role: projectRoles[uid],
          }));

        return { ...proj, members: [...wsMemberRows, ...projectOnlyRows] };
      });
    }
    setProjects(loadedProjects);

    if (account) {
      const { data: invData } = await supabase
        .from('invitations')
        .select('id, email, role, status')
        .eq('account_id', account.id)
        .order('created_at', { ascending: false });
      setInvitations((invData ?? []) as Invitation[]);
    }
    setWsLoading(false);
  }

  async function handleResend(email: string, role: string) {
    if (!account) return;
    setResendingFor(email);
    try {
      await supabase.functions.invoke('invite-user', {
        body: { email, role, accountId: account.id },
      });
    } finally {
      setResendingFor(null);
    }
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
    if (!inviteEmail.trim() || !account) return;
    // Duplicate check
    if (members.some(m => m.email.toLowerCase() === inviteEmail.trim().toLowerCase())) {
      setInviteMsg({ type: 'err', text: 'משתמש זה כבר חבר בסביבת העבודה' });
      return;
    }
    setInviting(true);
    setInviteMsg(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('invite-user', {
        body: { email: inviteEmail.trim(), role: inviteRole, accountId: account.id, message: inviteMessage.trim() || undefined },
      });
      // fnError can contain the JSON body for non-2xx responses
      if (fnError) {
        const ctx = (fnError as { context?: unknown }).context;
        let msg = (fnError as { message?: string }).message ?? String(fnError);
        if (ctx instanceof Response) {
          try { const j = await ctx.json(); msg = j.error ?? msg; } catch { /* ignore */ }
        } else if (ctx && typeof ctx === 'object' && 'error' in ctx) {
          msg = (ctx as { error: string }).error;
        }
        throw new Error(msg);
      }
      if (data?.error) throw new Error(data.error);
      setInviteMsg({ type: 'ok', text: 'הזמנה נשלחה במייל' });
      setInviteEmail('');
      setInviteMessage('');
      await loadProfileData();
    } catch (err) {
      setInviteMsg({ type: 'err', text: (err as Error).message });
    } finally {
      setInviting(false);
    }
  }

  async function updateMemberRole(userId: string, newRole: string) {
    if (!account) return;
    setRoleUpdateErr(null);
    setEditingRoleFor(null);
    const { error } = await supabase.rpc('update_member_role', {
      p_account_id: account.id,
      p_user_id: userId,
      p_role: newRole,
    });
    if (error) { setRoleUpdateErr(error.message); return; }
    await loadProfileData();
  }

  async function removeMemberFromWorkspace(userId: string) {
    if (!account) return;
    await supabase.rpc('remove_member', { p_account_id: account.id, p_user_id: userId });
    await loadProfileData();
  }

  async function addMemberToProject(projectId: string, userId: string) {
    await supabase.from('project_members').insert({ project_id: projectId, user_id: userId });
    setAddingToProject(null);
    await loadProfileData();
  }

  async function updateProjectMemberRole(projectId: string, userId: string, newRole: string) {
    setEditingProjectRoleFor(null);
    await supabase.rpc('update_project_member_role', {
      p_project_id: projectId,
      p_user_id: userId,
      p_role: newRole,
    });
    await loadProfileData();
  }

  function toggleProject(projectId: string) {
    setExpandedProjects(prev => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId); else next.add(projectId);
      return next;
    });
  }

  async function removeMemberFromProject(projectId: string, userId: string) {
    await supabase.rpc('remove_project_member', { p_project_id: projectId, p_user_id: userId });
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
                  {roleUpdateErr && (
                    <div className={`${styles.inviteMsg} ${styles.inviteMsgErr}`}>{roleUpdateErr}</div>
                  )}
                  <div className={styles.memberList}>
                    {members.map((m: Member) => (
                      <div key={m.userId} className={styles.memberRow}>
                        <div className={styles.avatar}>{(m.fullName || m.email || '?')[0].toUpperCase()}</div>
                        <div className={styles.memberInfo}>
                          <span className={styles.memberName}>{m.fullName || m.email}</span>
                          {m.fullName && <span className={styles.memberEmail}>{m.email}</span>}
                        </div>
                        {(() => {
                          const inv = invitations.find(i => i.email === m.email);
                          if (!inv) return null;
                          return (
                            <>
                              <span className={`${styles.invitationStatus} ${inv.status === 'accepted' ? styles.statusAccepted : styles.statusPending}`}>
                                {inv.status === 'accepted' ? '✓ אישר' : 'ממתין'}
                              </span>
                              {isAdmin && (
                                <button
                                  className={styles.resendBtn}
                                  onClick={() => handleResend(inv.email, inv.role)}
                                  disabled={resendingFor === inv.email}
                                  title="שלח הזמנה חוזרת"
                                >
                                  {resendingFor === inv.email ? '...' : '↻ שלח שוב'}
                                </button>
                              )}
                            </>
                          );
                        })()}
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
                        {isOwner && (
                          <button
                            className={styles.removeMemberBtn}
                            onClick={() => removeMemberFromWorkspace(m.userId)}
                            title="הסר מסביבת העבודה"
                          >✕</button>
                        )}
                      </div>
                    ))}
                  </div>

                  {isAdmin && (
                    <form onSubmit={handleInvite} className={styles.inviteForm}>
                      <div className={styles.inviteRow}>
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
                      </div>
                      <textarea
                        className={styles.inviteMessageInput}
                        value={inviteMessage}
                        onChange={(e: { target: { value: string } }) => setInviteMessage(e.target.value)}
                        placeholder="הוסף הודעה אישית (אופציונלי)..."
                        rows={2}
                      />
                    </form>
                  )}
                  {inviteMsg && (
                    <div className={`${styles.inviteMsg} ${inviteMsg.type === 'err' ? styles.inviteMsgErr : styles.inviteMsgOk}`}>
                      {inviteMsg.text}
                    </div>
                  )}

                </div>

                {/* Projects section label */}
                <div className={styles.sectionLabel}>פרויקטים</div>

                {projects.length === 0 && (
                  <div className={styles.card}><div className={styles.empty}>אין פרויקטים עדיין</div></div>
                )}

                {projects.map((p: Project) => {
                  const isExpanded = expandedProjects.has(p.id);
                  return (
                    <div key={p.id} className={styles.card}>
                      {/* Collapsible header */}
                      <div className={styles.cardTitle} onClick={() => toggleProject(p.id)} style={{ cursor: 'pointer' }}>
                        <span className={styles.collapseIcon}>{isExpanded ? '▾' : '▸'}</span>
                        {p.name}
                        <span className={styles.projectTaskCount}>{p.taskCount} משימות · {p.members.length} חברים</span>
                      </div>

                      {isExpanded && (
                        <>
                          <div className={styles.memberList}>
                            {p.members.map((m: ProjectMember) => {
                              const inv = invitations.find(i => i.email === m.email);
                              const isEditingRole = editingProjectRoleFor?.projectId === p.id && editingProjectRoleFor?.userId === m.userId;
                              return (
                                <div key={m.userId} className={styles.memberRow}>
                                  <div className={styles.avatar}>{(m.fullName || m.email || '?')[0].toUpperCase()}</div>
                                  <div className={styles.memberInfo}>
                                    <span className={styles.memberName}>{m.fullName || m.email}</span>
                                    {m.fullName && <span className={styles.memberEmail}>{m.email}</span>}
                                  </div>
                                  {inv && (
                                    <>
                                      <span className={`${styles.invitationStatus} ${inv.status === 'accepted' ? styles.statusAccepted : styles.statusPending}`}>
                                        {inv.status === 'accepted' ? '✓ אישר' : 'ממתין'}
                                      </span>
                                      {isAdmin && (
                                        <button
                                          className={styles.resendBtn}
                                          onClick={() => handleResend(inv.email, inv.role)}
                                          disabled={resendingFor === inv.email}
                                          title="שלח הזמנה חוזרת"
                                        >
                                          {resendingFor === inv.email ? '...' : '↻ שלח שוב'}
                                        </button>
                                      )}
                                    </>
                                  )}
                                  <div className={styles.roleWrap}>
                                    <span
                                      className={`${styles.roleTag} ${styles['role_' + m.role]} ${isOwner ? styles.roleTagClickable : ''}`}
                                      onClick={() => isOwner && setEditingProjectRoleFor(isEditingRole ? null : { projectId: p.id, userId: m.userId })}
                                    >
                                      {ROLE_LABELS[m.role] ?? m.role}{isOwner ? ' ▾' : ''}
                                    </span>
                                    {isEditingRole && (
                                      <div className={styles.roleDropdown}>
                                        {ROLES.map(r => (
                                          <button
                                            key={r.value}
                                            className={`${styles.roleDropdownItem} ${m.role === r.value ? styles.roleDropdownItemActive : ''}`}
                                            onClick={() => updateProjectMemberRole(p.id, m.userId, r.value)}
                                          >
                                            {r.label}
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                  {isOwner && (
                                    <button
                                      className={styles.removeMemberBtn}
                                      onClick={() => removeMemberFromProject(p.id, m.userId)}
                                      title="הסר מהפרויקט"
                                    >✕</button>
                                  )}
                                </div>
                              );
                            })}
                            {p.members.length === 0 && <div className={styles.empty}>אין חברים בפרויקט</div>}
                          </div>
                          {isAdmin && (
                            <div className={styles.addMemberWrap} style={{ position: 'relative', marginTop: 8 }}>
                              <button
                                className={styles.addMemberBtn}
                                onClick={() => setAddingToProject(addingToProject === p.id ? null : p.id)}
                              >+ הוסף חבר לפרויקט</button>
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
                        </>
                      )}
                    </div>
                  );
                })}
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
