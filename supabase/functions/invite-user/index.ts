import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { email, accountId, projectId, role } = await req.json();

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Verify caller permissions
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await adminClient.auth.getUser(token);
    if (userError || !user) throw new Error('Unauthorized');

    const { data: caller } = await adminClient
      .from('account_members')
      .select('role')
      .eq('account_id', accountId)
      .eq('user_id', user.id)
      .single();

    if (!caller || !['owner', 'editor'].includes(caller.role)) {
      throw new Error('Insufficient permissions');
    }

    // Check if user already exists
    const { data: existingProfile } = await adminClient
      .from('profiles')
      .select('id')
      .eq('email', email.toLowerCase().trim())
      .single();

    if (existingProfile) {
      // Add directly — no email needed
      await adminClient.from('account_members').upsert(
        { account_id: accountId, user_id: existingProfile.id, role, invited_by: user.id },
        { onConflict: 'account_id,user_id' },
      );

      if (projectId) {
        await adminClient.from('project_members').upsert(
          { project_id: projectId, user_id: existingProfile.id, role, invited_by: user.id },
          { onConflict: 'project_id,user_id' },
        );
      }

      await adminClient.from('invitations').insert({
        email, account_id: accountId, project_id: projectId ?? null,
        role, invited_by: user.id, status: 'accepted',
      });

      return new Response(JSON.stringify({ type: 'added_directly' }), {
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    // New user — send invite email via Supabase Auth
    const origin = req.headers.get('origin') ?? 'https://localhost:5173';
    const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: { account_id: accountId, project_id: projectId ?? null, role, invited_by: user.id },
      redirectTo: `${origin}/auth/callback?type=invite`,
    });
    if (inviteError) throw inviteError;

    await adminClient.from('invitations').insert({
      email, account_id: accountId, project_id: projectId ?? null,
      role, invited_by: user.id, status: 'pending',
    });

    return new Response(JSON.stringify({ type: 'invite_sent' }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
