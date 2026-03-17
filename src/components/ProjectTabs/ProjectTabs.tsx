import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProjectStore } from '../../store/useProjectStore';
import { useAuth } from '../../contexts/AuthContext';
import styles from './ProjectTabs.module.css';

export function ProjectTabs() {
  const { projects, activeProjectId, addProject, setActiveProject, deleteProject } = useProjectStore();
  const { profile, account, signOut } = useAuth();
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [showUserMenu, setShowUserMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    }
    if (showUserMenu) document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [showUserMenu]);

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

  const initial = (profile?.fullName || profile?.email || '?')[0].toUpperCase();

  return (
    <header className={styles.header}>
      <div className={styles.logo}>
        <span className={styles.logoIcon}>📋</span>
        <span className={styles.logoText}>Gant Maker</span>
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
            {projects.length > 1 && (
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

        {adding ? (
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
        )}
      </nav>

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
              <div className={styles.userMenuName}>{profile?.fullName || '—'}</div>
              <div className={styles.userMenuEmail}>{profile?.email}</div>
            </div>
            <div className={styles.userMenuDivider} />
            <button className={styles.userMenuItem} onClick={() => { navigate('/profile'); setShowUserMenu(false); }}>
              פרופיל
            </button>
            {(account?.role === 'owner' || account?.role === 'editor') && (
              <button className={styles.userMenuItem} onClick={() => { navigate('/admin'); setShowUserMenu(false); }}>
                ניהול סביבת עבודה
              </button>
            )}
            <div className={styles.userMenuDivider} />
            <button className={`${styles.userMenuItem} ${styles.userMenuLogout}`} onClick={() => signOut()}>
              יציאה
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
