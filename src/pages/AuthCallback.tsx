import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        navigate('/login', { replace: true });
        return;
      }

      const user = session.user;

      // Ensure profile exists (invited users may not have one yet)
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .maybeSingle();

      if (!existingProfile) {
        await supabase.from('profiles').insert({
          id: user.id,
          email: user.email,
          full_name: user.user_metadata?.full_name ?? '',
        });
      }

      // If invited to a specific project, remember it so /app can select it
      const projectId = user.user_metadata?.project_id as string | undefined;
      if (projectId) {
        localStorage.setItem('invite_project_id', projectId);
      }

      navigate('/app', { replace: true });
    });
  }, [navigate]);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100vh', background: 'var(--bg-primary)', color: 'var(--text-muted)',
      fontSize: '16px',
    }}>
      מתחבר...
    </div>
  );
}
