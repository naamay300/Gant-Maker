import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import styles from './LoginPage.module.css';

export function LoginPage() {
  const { signIn, signUp, signInWithGoogle } = useAuth();
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);

    if (tab === 'login') {
      const err = await signIn(email, password);
      if (err) setError(err);
    } else {
      const err = await signUp(email, password, fullName);
      if (err) {
        setError(err);
      } else {
        setInfo('נשלח אימות למייל שלך. לחץ על הקישור להמשיך.');
      }
    }
    setLoading(false);
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}>
          <span className={styles.logoIcon}>📋</span>
          <h1 className={styles.logoText}>Gant Maker</h1>
        </div>

        <div className={styles.tabs}>
          <button
            className={`${styles.tabBtn} ${tab === 'login' ? styles.tabActive : ''}`}
            onClick={() => { setTab('login'); setError(''); setInfo(''); }}
          >
            כניסה
          </button>
          <button
            className={`${styles.tabBtn} ${tab === 'register' ? styles.tabActive : ''}`}
            onClick={() => { setTab('register'); setError(''); setInfo(''); }}
          >
            הרשמה
          </button>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          {tab === 'register' && (
            <div className={styles.field}>
              <label className={styles.label}>שם מלא</label>
              <input
                className={styles.input}
                type="text"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                placeholder="ישראל ישראלי"
                required
              />
            </div>
          )}

          <div className={styles.field}>
            <label className={styles.label}>כתובת מייל</label>
            <input
              className={styles.input}
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              dir="ltr"
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>סיסמה</label>
            <input
              className={styles.input}
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="לפחות 6 תווים"
              required
              minLength={6}
              dir="ltr"
            />
          </div>

          {error && <p className={styles.error}>{error}</p>}
          {info && <p className={styles.info}>{info}</p>}

          <button className={styles.submitBtn} type="submit" disabled={loading}>
            {loading ? '...' : tab === 'login' ? 'כניסה' : 'הרשמה'}
          </button>
        </form>

        <div className={styles.divider}>
          <span>או המשך עם</span>
        </div>

        <div className={styles.oauthBtns}>
          <button className={styles.oauthBtn} onClick={signInWithGoogle}>
            <svg viewBox="0 0 24 24" className={styles.oauthIcon}>
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Google
          </button>
        </div>
      </div>
    </div>
  );
}
