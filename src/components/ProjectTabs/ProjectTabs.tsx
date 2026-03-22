import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProjectStore, useActiveProjectMembers } from '../../store/useProjectStore';
import { useAuth, usePermissions } from '../../contexts/AuthContext';
import styles from './ProjectTabs.module.css';

export function ProjectTabs() {
  const { projects, activeProjectId, addProject, setActiveProject, deleteProject } = useProjectStore();
  const { user, profile, account, signOut } = useAuth();
  const { canManage } = usePermissions();
  const navigate = useNavigate();
  const projectMembers = useActiveProjectMembers();

  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [shareProjectId, setShareProjectId] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [showMembersPopup, setShowMembersPopup] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);
  const membersRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
      if (membersRef.current && !membersRef.current.contains(e.target as Node)) {
        setShowMembersPopup(false);
      }
    }
    if (showUserMenu || showMembersPopup) document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [showUserMenu, showMembersPopup]);

  const MEMBER_COLORS = ['#4e8ef7','#f76e4e','#4ecf8e','#f7c94e','#a34ef7','#f74e9d','#4ed0f7','#f7a24e'];
  function memberColor(userId: string) {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
    return MEMBER_COLORS[hash % MEMBER_COLORS.length];
  }
  function memberInitial(m: { fullName: string; email: string }) {
    return (m.fullName || m.email || '?')[0].toUpperCase();
  }
  function memberLabel(m: { fullName: string; email: string }) {
    return m.fullName || m.email;
  }

  function handleAdd() {
    const name = newName.trim();
    if (name) addProject(name);
    setAdding(false);
    setNewName('');
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleAdd();
    if (e.key === 'Escape') { setAdding(false); setNewName(''); }
  }

  function handleCopyLink() {
    navigator.clipboard.writeText(window.location.href);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
  }

  const initial = (profile?.fullName || profile?.email || user?.email || '?')[0].toUpperCase();
  const shareProject = shareProjectId ? projects.find(p => p.id === shareProjectId) : null;

  return (
    <>
      <header className={styles.header}>
        <div className={styles.logo}>
          <span className={styles.logoIcon}>📋</span>
          <span className={styles.logoText}>Gantt Maker</span>
          {account && <span className={styles.accountName}>{account.name}</span>}
        </div>

        <nav className={styles.tabs}>
          {projects.map((project) => (
            <div
              key={project.id}
              className={`${styles.tab} ${project.id === activeProjectId ? styles.active : ''}`}
              onClick={() => setActiveProject(project.id)}
            >
              <span className={styles.tabName}>{project.name}</span>
              {project.id === activeProjectId && (
                <button
                  className={styles.shareTabBtn}
                  onClick={(e) => { e.stopPropagation(); setShareProjectId(project.id); }}
                  title="שתף פרויקט"
                >
                  ↗
                </button>
              )}
              {canManage && projects.length > 1 && (
                <button
                  className={styles.deleteTab}
                  onClick={(e) => { e.stopPropagation(); deleteProject(project.id); }}
                  title="מחק פרויקט"
                >
                  ×
                </button>
              )}
            </div>
          ))}

          {canManage && (adding ? (
            <div className={styles.addingTab}>
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={handleAdd}
                placeholder="שם הפרויקט..."
                className={styles.addInput}
              />
            </div>
          ) : (
            <button className={styles.addTab} onClick={() => setAdding(true)}>
              + פרויקט חדש
            </button>
          ))}
        </nav>

        {/* Member avatars */}
        {projectMembers.length > 0 && (
          <div className={styles.membersArea} ref={membersRef}>
            <div
              className={styles.memberDots}
              onClick={() => setShowMembersPopup(v => !v)}
              title="חברי צוות"
            >
              {projectMembers.slice(0, 5).map((m, i) => (
                <div
                  key={m.userId}
                  className={styles.memberDot}
                  style={{ background: memberColor(m.userId), zIndex: 10 - i }}
                  title={memberLabel(m)}
                >
                  {memberInitial(m)}
                </div>
              ))}
              {projectMembers.length > 5 && (
                <div className={styles.memberMore}>+{projectMembers.length - 5}</div>
              )}
            </div>

            {showMembersPopup && (
              <div className={styles.membersPopup}>
                <div className={styles.membersPopupTitle}>חברי צוות</div>
                {projectMembers.map(m => (
                  <div key={m.userId} className={styles.membersPopupRow}>
                    <div className={styles.membersPopupDot} style={{ background: memberColor(m.userId) }}>
                      {memberInitial(m)}
                    </div>
                    <span className={styles.membersPopupName}>{memberLabel(m)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* User menu */}
        <div className={styles.userArea} ref={menuRef}>
          <button className={styles.userBtn} onClick={() => setShowUserMenu(v => !v)}>
            {profile?.avatarUrl
              ? <img src={profile.avatarUrl} alt="" className={styles.userAvatar} />
              : <span className={styles.userInitial}>{initial}</span>
            }
          </button>

          {showUserMenu && (
            <div className={styles.userMenu}>
              <div className={styles.userMenuInfo}>
                <div className={styles.userMenuName}>{profile?.fullName || 'משתמש'}</div>
                <div className={styles.userMenuEmail}>{profile?.email || user?.email}</div>
              </div>
              <div className={styles.userMenuDivider} />
              <button className={styles.userMenuItem} onClick={() => { navigate('/profile'); setShowUserMenu(false); }}>
                פרופיל
              </button>
              <div className={styles.userMenuDivider} />
              <button className={`${styles.userMenuItem} ${styles.userMenuLogout}`} onClick={() => signOut()}>
                יציאה
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Share modal */}
      {shareProject && (
        <div className={styles.shareOverlay} onClick={() => setShareProjectId(null)}>
          <div className={styles.shareModal} onClick={e => e.stopPropagation()}>
            <div className={styles.shareTitle}>שיתוף פרויקט</div>
            <div className={styles.shareProjectName}>📋 {shareProject.name}</div>
            <div className={styles.shareDesc}>שתף את הקישור הבא עם חברי הצוות:</div>
            <div className={styles.shareRow}>
              <input
                className={styles.shareInput}
                readOnly
                value={window.location.href}
                onFocus={e => e.target.select()}
              />
              <button className={styles.shareCopyBtn} onClick={handleCopyLink}>
                {shareCopied ? '✓ הועתק' : 'העתק'}
              </button>
            </div>
            <button className={styles.shareClose} onClick={() => setShareProjectId(null)}>
              סגור
            </button>
          </div>
        </div>
      )}
    </>
  );
}
