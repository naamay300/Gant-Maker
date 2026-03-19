import { useState, useEffect, RefObject, useRef } from 'react';
import { useProjectStore, useSortedFilteredTasks, useActiveProject } from '../../store/useProjectStore';
import { usePermissions } from '../../contexts/AuthContext';
import { StatusManager } from '../StatusManager/StatusManager';
import { getTimelineStartDate } from '../../utils/dateUtils';
import { addDays, differenceInDays, startOfDay } from 'date-fns';
import { supabase } from '../../lib/supabase';
import styles from './Toolbar.module.css';

interface Props {
  ganttScrollRef: RefObject<HTMLDivElement | null>;
  mainRef: RefObject<HTMLDivElement | null>;
}

const ZOOM_LEVELS = [
  { label: 'חודש', ppd: 14 },
  { label: 'שבוע', ppd: 40 },
  { label: 'יום',  ppd: 80 },
];

export function Toolbar({ ganttScrollRef, mainRef }: Props) {
  const { canManage } = usePermissions();
  const { colorMode, setColorMode, pixelsPerDay, setPixelsPerDay } = useProjectStore();
  const tasks = useSortedFilteredTasks();
  const project = useActiveProject();
  const [showStatusManager, setShowStatusManager] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [shareEmail, setShareEmail] = useState('');
  const [shareSending, setShareSending] = useState(false);
  const [shareEmailMsg, setShareEmailMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [sharePos, setSharePos] = useState({ top: 0, left: 0 });
  const shareRef = useRef<HTMLDivElement>(null);
  const shareBtnRef = useRef<HTMLButtonElement>(null);

  function scrollToToday(ppd = pixelsPerDay) {
    if (!ganttScrollRef.current) return;
    const timelineStart = addDays(getTimelineStartDate(tasks), -30);
    const todayOffset = differenceInDays(startOfDay(new Date()), startOfDay(timelineStart)) * ppd;
    const viewWidth = ganttScrollRef.current.clientWidth;
    ganttScrollRef.current.scrollLeft = Math.max(0, todayOffset - viewWidth / 2);
  }

  // Scroll to today whenever zoom level changes
  useEffect(() => {
    // Use requestAnimationFrame to wait for the DOM to update with new pixelsPerDay
    const raf = requestAnimationFrame(() => scrollToToday(pixelsPerDay));
    return () => cancelAnimationFrame(raf);
  }, [pixelsPerDay]);

  function openShare() {
    if (shareBtnRef.current) {
      const rect = shareBtnRef.current.getBoundingClientRect();
      setSharePos({ top: rect.bottom + 6, left: rect.left });
    }
    setShowShare(v => !v);
  }

  function handleCopyLink() {
    const url = window.location.href;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).catch(() => fallbackCopy(url));
    } else {
      fallbackCopy(url);
    }
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
  }

  function fallbackCopy(text: string) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }

  async function handleSendEmail() {
    if (!shareEmail.trim() || !project) return;
    setShareSending(true);
    setShareEmailMsg(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('invite-user', {
        body: {
          email: shareEmail.trim(),
          role: 'viewer',
          accountId: project.accountId,
          projectId: project.id,
        },
      });
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
      setShareEmailMsg({ type: 'ok', text: 'ההזמנה נשלחה בהצלחה ✓' });
      setShareEmail('');
    } catch (err) {
      setShareEmailMsg({ type: 'err', text: (err as Error).message });
    } finally {
      setShareSending(false);
    }
  }

  function scrollByMonth(dir: 1 | -1) {
    if (!ganttScrollRef.current) return;
    ganttScrollRef.current.scrollLeft += dir * 30 * pixelsPerDay;
  }

  return (
    <>
      <div className={styles.toolbar}>
        {/* ── Navigation ── */}
        <div className={styles.group}>
          <button className={styles.navBtn} onClick={() => scrollByMonth(-1)} title="חודש אחורה">‹</button>
          <button className={styles.todayBtn} onClick={() => scrollToToday()}>היום</button>
          <button className={styles.navBtn} onClick={() => scrollByMonth(1)} title="חודש קדימה">›</button>
        </div>

        <div className={styles.sep} />

        {/* ── Zoom ── */}
        <div className={styles.colorToggle}>
          {ZOOM_LEVELS.map(z => (
            <button
              key={z.ppd}
              className={`${styles.toggleBtn} ${pixelsPerDay === z.ppd ? styles.toggleActive : ''}`}
              onClick={() => { setPixelsPerDay(z.ppd); }}
            >
              {z.label}
            </button>
          ))}
        </div>

        <div className={styles.sep} />

        {/* ── Color mode toggle ── */}
        <div className={styles.colorToggle}>
          <button
            className={`${styles.toggleBtn} ${colorMode === 'status' ? styles.toggleActive : ''}`}
            onClick={() => setColorMode('status')}
          >
            🏷 סטטוס
          </button>
          <button
            className={`${styles.toggleBtn} ${colorMode === 'assignee' ? styles.toggleActive : ''}`}
            onClick={() => setColorMode('assignee')}
          >
            👤 אחראי
          </button>
        </div>

        <div className={styles.sep} />

        {/* ── Share ── */}
        <div className={styles.shareWrap} ref={shareRef}>
          <button ref={shareBtnRef} className={styles.statusMgrBtn} onClick={openShare}>
            ↗ שיתוף
          </button>
          {showShare && (
            <>
              <div className={styles.shareBackdrop} onClick={() => setShowShare(false)} />
              <div className={styles.sharePopup} style={{ position: 'fixed', top: sharePos.top, left: sharePos.left }}>
                <div className={styles.sharePopupTitle}>שיתוף פרויקט</div>
                {project && (
                  <div className={styles.sharePopupProject}>📋 {project.name}</div>
                )}
                <div className={styles.shareSection}>
                  <div className={styles.shareSectionLabel}>העתקת קישור</div>
                  <div className={styles.shareRow}>
                    <input
                      className={styles.shareInput}
                      readOnly
                      value={window.location.href}
                      onFocus={e => e.target.select()}
                    />
                    <button className={styles.shareCopyBtn} onClick={handleCopyLink}>
                      {shareCopied ? '✓' : 'העתק'}
                    </button>
                  </div>
                </div>
                <div className={styles.shareDivider} />
                <div className={styles.shareSection}>
                  <div className={styles.shareSectionLabel}>הזמן לפרויקט במייל</div>
                  <div className={styles.shareRow}>
                    <input
                      className={styles.shareInput}
                      type="email"
                      placeholder="הכנס כתובת מייל..."
                      value={shareEmail}
                      onChange={e => { setShareEmail(e.target.value); setShareEmailMsg(null); }}
                      onKeyDown={e => e.key === 'Enter' && handleSendEmail()}
                      disabled={shareSending}
                    />
                    <button
                      className={styles.shareSendBtn}
                      onClick={handleSendEmail}
                      disabled={shareSending || !shareEmail.trim()}
                    >
                      {shareSending ? '...' : 'שלח'}
                    </button>
                  </div>
                  {shareEmailMsg && (
                    <div style={{
                      marginTop: 6, fontSize: 11, padding: '4px 2px',
                      color: shareEmailMsg.type === 'ok' ? '#22c55e' : '#e2445c',
                    }}>
                      {shareEmailMsg.text}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* ── Statuses management ── */}
        {canManage && (
          <button className={styles.statusMgrBtn} onClick={() => setShowStatusManager(true)}>
            ⚙ סטטוסים
          </button>
        )}
      </div>

      {showStatusManager && <StatusManager onClose={() => setShowStatusManager(false)} />}
    </>
  );
}
