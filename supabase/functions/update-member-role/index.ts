import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { targetUserId, accountId, newRole } = await req.json();

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Verify caller is owner/editor of the account
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: userError } = await adminClient.auth.getUser(token);
    if (userError || !userData?.user) throw new Error('Auth failed');

    const { data: callerRow } = await adminClient
      .from('account_members')
      .select('role')
      .eq('account_id', accountId)
      .eq('user_id', userData.user.id)
      .single();
    if (!callerRow || !['owner', 'admin', 'editor'].includes(callerRow.role)) {
      throw new Error('Unauthorized');
    }

    // Prevent changing the owner
    const { data: targetRow } = await adminClient
      .from('account_members')
      .select('role')
      .eq('account_id', accountId)
      .eq('user_id', targetUserId)
      .single();
    if (!targetRow) throw new Error('Member not found');
    if (targetRow.role === 'owner') throw new Error('Cannot change owner role');

    // Update using service role — bypasses RLS
    const { error: updateError } = await adminClient
      .from('account_members')
      .update({ role: newRole })
      .eq('account_id', accountId)
      .eq('user_id', targetUserId);

    if (updateError) throw new Error(updateError.message);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
