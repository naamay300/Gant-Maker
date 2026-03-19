import { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProjectStore, useActiveProject } from '../../store/useProjectStore';
import { useAuth, usePermissions } from '../../contexts/AuthContext';
import styles from './ProjectTabs.module.css';

export function ProjectTabs() {
  const { projects, activeProjectId, addProject, setActiveProject, deleteProject } = useProjectStore();
  const { user, profile, account, signOut } = useAuth();
  const { canManage } = usePermissions();
  const navigate = useNavigate();
  const activeProject = useActiveProject();

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

  // Unique assignees from active project
  const uniqueAssignees = useMemo(() => {
    if (!activeProject) return [];
    const seen = new Set<string>();
    const result: { name: string; color: string }[] = [];
    for (const task of activeProject.tasks) {
      for (const a of task.assignees) {
        if (!seen.has(a.name)) {
          seen.add(a.name);
          result.push(a);
        }
      }
    }
    return result;
  }, [activeProject]);

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
        {uniqueAssignees.length > 0 && (
          <div className={styles.membersArea} ref={membersRef}>
            <div
              className={styles.memberDots}
              onClick={() => setShowMembersPopup(v => !v)}
              title="חברי צוות"
            >
              {uniqueAssignees.slice(0, 5).map((a, i) => (
                <div
                  key={a.name}
                  className={styles.memberDot}
                  style={{ background: a.color, zIndex: 10 - i }}
                  title={a.name}
                >
                  {a.name[0].toUpperCase()}
                </div>
              ))}
              {uniqueAssignees.length > 5 && (
                <div className={styles.memberMore}>+{uniqueAssignees.length - 5}</div>
              )}
            </div>

            {showMembersPopup && (
              <div className={styles.membersPopup}>
                <div className={styles.membersPopupTitle}>חברי צוות</div>
                {uniqueAssignees.map(a => (
                  <div key={a.name} className={styles.membersPopupRow}>
                    <div className={styles.membersPopupDot} style={{ background: a.color }}>
                      {a.name[0].toUpperCase()}
                    </div>
                    <span className={styles.membersPopupName}>{a.name}</span>
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
