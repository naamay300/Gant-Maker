import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { UserProfile, Account } from '../types';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  account: Account | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string, fullName: string) => Promise<string | null>;
  signInWithGoogle: () => Promise<void>;
  signInWithGitHub: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshAccount: () => Promise<Account | null>;
  updateProfile: (updates: { fullName?: string; avatarUrl?: string }) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetchProfile(userId: string): Promise<UserProfile | null> {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (!data) return null;
    return { id: data.id, email: data.email, fullName: data.full_name, avatarUrl: data.avatar_url };
  }

  async function fetchAccount(userId: string): Promise<Account | null> {
    const { data } = await supabase
      .from('account_members')
      .select('role, accounts(id, name, owner_id)')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(1)
      .single();
    if (!data || !data.accounts) return null;
    const acc = data.accounts as unknown as { id: string; name: string; owner_id: string };
    return { id: acc.id, name: acc.name, ownerId: acc.owner_id, role: data.role as Account['role'] };
  }

  async function refreshAccount(): Promise<Account | null> {
    if (!user) return null;
    const acc = await fetchAccount(user.id);
    setAccount(acc);
    return acc;
  }

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: string, session: Session | null) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (!session?.user) {
        setProfile(null);
        setAccount(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      fetchProfile(user.id),
      fetchAccount(user.id),
    ]).then(([p, a]) => {
      setProfile(p);
      setAccount(a);
      setLoading(false);
    });
  }, [user?.id]);

  async function signIn(email: string, password: string): Promise<string | null> {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? error.message : null;
  }

  async function signUp(email: string, password: string, fullName: string): Promise<string | null> {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    return error ? error.message : null;
  }

  async function signInWithGoogle(): Promise<void> {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  async function signInWithGitHub(): Promise<void> {
    await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  async function signOut(): Promise<void> {
    await supabase.auth.signOut();
  }

  async function updateProfile(updates: { fullName?: string; avatarUrl?: string }): Promise<void> {
    if (!user) return;
    const patch: Record<string, string> = {};
    if (updates.fullName !== undefined) patch.full_name = updates.fullName;
    if (updates.avatarUrl !== undefined) patch.avatar_url = updates.avatarUrl;
    await supabase.from('profiles').update(patch).eq('id', user.id);
    setProfile((p: UserProfile | null) => p ? { ...p, fullName: updates.fullName ?? p.fullName, avatarUrl: updates.avatarUrl ?? p.avatarUrl } : null);
  }

  return (
    <AuthContext.Provider value={{ user, session, profile, account, loading, signIn, signUp, signInWithGoogle, signInWithGitHub, signOut, refreshAccount, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
