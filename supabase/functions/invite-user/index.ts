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

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Admin client for privileged operations
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Get caller identity from JWT using admin client
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) throw new Error('Missing authorization token');

    const { data: userData, error: userError } = await adminClient.auth.getUser(token);
    if (userError || !userData?.user) throw new Error('Auth failed: ' + (userError?.message ?? 'no user'));

    const callerId = userData.user.id;

    // Check membership using service role (bypasses RLS)
    const { data: callerMember, error: memberError } = await adminClient
      .from('account_members')
      .select('role')
      .eq('account_id', accountId)
      .eq('user_id', callerId)
      .single();

    if (memberError || !callerMember) throw new Error(`Not a member: callerId=${callerId}, accountId=${accountId}, err=${memberError?.message ?? 'no row'}`);
    if (!['owner', 'editor'].includes(callerMember.role)) throw new Error(`Role not allowed: ${callerMember.role}`);

    // Check if user already exists in profiles
    const { data: existingProfile } = await adminClient
      .from('profiles')
      .select('id')
      .eq('email', email.toLowerCase().trim())
      .maybeSingle();

    if (existingProfile) {
      // Check if already a member
      const { data: existingMember } = await adminClient
        .from('account_members')
        .select('role')
        .eq('account_id', accountId)
        .eq('user_id', existingProfile.id)
        .maybeSingle();

      if (existingMember) {
        return new Response(JSON.stringify({ error: 'המשתמש כבר חבר בסביבת העבודה' }), {
          status: 400,
          headers: { ...cors, 'Content-Type': 'application/json' },
        });
      }

      const { error: amErr } = await adminClient.from('account_members').insert(
        { account_id: accountId, user_id: existingProfile.id, role },
      );
      if (amErr) throw new Error(`account_members insert failed: ${amErr.message}`);

      const { error: invErr } = await adminClient.from('invitations').insert({
        email, account_id: accountId,
        role, invited_by: callerId, status: 'accepted',
      });
      if (invErr) throw new Error(`invitations insert failed: ${invErr.message}`);

      return new Response(JSON.stringify({ type: 'added_directly' }), {
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    // New user — send invite email via Supabase Auth
    const origin = req.headers.get('origin') ?? 'https://localhost:5173';
    const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: { account_id: accountId, project_id: projectId ?? null, role, invited_by: callerId },
      redirectTo: `${origin}/auth/callback?type=invite`,
    });
    if (inviteError) throw new Error(`Invite error: ${inviteError.message}`);

    // Add invited user to account_members immediately
    const invitedUserId = inviteData?.user?.id;
    if (invitedUserId) {
      await adminClient.from('account_members').upsert(
        { account_id: accountId, user_id: invitedUserId, role },
        { onConflict: 'account_id,user_id' },
      );
      if (projectId) {
        await adminClient.from('project_members').upsert(
          { project_id: projectId, user_id: invitedUserId, role, invited_by: callerId },
          { onConflict: 'project_id,user_id' },
        );
      }
    }

    const { error: invErr2 } = await adminClient.from('invitations').insert({
      email, account_id: accountId,
      role, invited_by: callerId, status: 'pending',
    });
    if (invErr2) throw new Error(`invitations insert failed: ${invErr2.message}`);

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
