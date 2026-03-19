import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function inviteEmailHtml(
  inviterName: string,
  workspaceName: string,
  inviteUrl: string,
  projectName?: string | null,
): string {
  const isProject = !!projectName;
  const title = isProject ? `הוזמנת לפרויקט "${projectName}"` : `הוזמנת לסביבת עבודה`;
  const desc = isProject
    ? `<strong>${inviterName}</strong> הזמין/ה אותך לצפות בפרויקט <strong style="color:#00b4d8;">${projectName}</strong> בסביבת העבודה <strong>${workspaceName}</strong>.`
    : `<strong>${inviterName}</strong> הזמין/ה אותך להצטרף לסביבת העבודה <strong style="color:#00b4d8;">${workspaceName}</strong> ב-Gantt Maker.`;
  const cta = isProject ? 'כניסה לפרויקט →' : 'קבל/י את ההזמנה →';
  const sub = isProject
    ? 'לחץ/י על הכפתור כדי להיכנס לפרויקט.'
    : 'לחץ/י על הכפתור כדי לאשר את ההזמנה וצור/י חשבון בחינם.';

  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:Arial,Helvetica,sans-serif;direction:rtl;">
  <div style="max-width:520px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#00b4d8,#0077a8);padding:28px 32px;text-align:center;">
      <div style="color:#fff;font-size:24px;font-weight:700;letter-spacing:-0.5px;">📋 Gantt Maker</div>
    </div>
    <div style="padding:32px;">
      <h2 style="margin:0 0 16px;color:#1a1a2e;font-size:22px;font-weight:700;">${title} 🎉</h2>
      <p style="color:#555;font-size:15px;line-height:1.7;margin:0 0 8px;">${desc}</p>
      <p style="color:#555;font-size:15px;line-height:1.7;margin:0 0 28px;">${sub}</p>
      <div style="text-align:center;margin:28px 0;">
        <a href="${inviteUrl}"
           style="display:inline-block;background:#00b4d8;color:#fff;text-decoration:none;padding:14px 36px;border-radius:8px;font-size:16px;font-weight:700;">
          ${cta}
        </a>
      </div>
      <p style="color:#bbb;font-size:12px;margin:24px 0 0;text-align:center;line-height:1.6;">
        אם לא ביקשת הזמנה זו, ניתן להתעלם ממייל זה בבטחה.<br>
        הקישור תקף ל-24 שעות.
      </p>
    </div>
    <div style="background:#f8f9fb;padding:14px 32px;text-align:center;border-top:1px solid #eee;">
      <span style="color:#ccc;font-size:11px;">Gantt Maker · ${workspaceName}</span>
    </div>
  </div>
</body>
</html>`;
}

async function sendEmail(
  resendKey: string,
  fromEmail: string,
  to: string,
  subject: string,
  html: string,
): Promise<void> {
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: fromEmail, to, subject, html }),
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { email, accountId, projectId, role } = await req.json();

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const resendKey = Deno.env.get('RESEND_API_KEY');
    const fromEmail = Deno.env.get('RESEND_FROM_EMAIL') ?? 'onboarding@resend.dev';

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Verify caller
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) throw new Error('Missing authorization token');

    const { data: userData, error: userError } = await adminClient.auth.getUser(token);
    if (userError || !userData?.user) throw new Error('Auth failed: ' + (userError?.message ?? 'no user'));
    const callerId = userData.user.id;

    const { data: callerMember, error: memberError } = await adminClient
      .from('account_members')
      .select('role')
      .eq('account_id', accountId)
      .eq('user_id', callerId)
      .single();
    if (memberError || !callerMember) throw new Error(`Not a member: ${memberError?.message ?? 'no row'}`);
    if (!['owner', 'editor'].includes(callerMember.role)) throw new Error(`Role not allowed: ${callerMember.role}`);

    // Fetch inviter name, workspace name (parallel)
    const [{ data: inviterProfile }, { data: workspaceData }] = await Promise.all([
      adminClient.from('profiles').select('full_name, email').eq('id', callerId).single(),
      adminClient.from('accounts').select('name').eq('id', accountId).single(),
    ]);
    const inviterName = inviterProfile?.full_name || inviterProfile?.email || 'מנהל';
    const workspaceName = workspaceData?.name || 'סביבת העבודה';

    let projectName: string | null = null;
    if (projectId) {
      const { data: projectData } = await adminClient
        .from('projects').select('name').eq('id', projectId).single();
      projectName = projectData?.name ?? null;
    }

    const origin = req.headers.get('origin') ?? 'https://gant-maker.vercel.app';
    const appUrl = `${origin}/app`;

    // Check if user already exists in profiles
    const { data: existingProfile } = await adminClient
      .from('profiles')
      .select('id')
      .eq('email', email.toLowerCase().trim())
      .maybeSingle();

    if (existingProfile) {
      const { data: existingMember } = await adminClient
        .from('account_members')
        .select('role')
        .eq('account_id', accountId)
        .eq('user_id', existingProfile.id)
        .maybeSingle();

      if (existingMember) {
        // Already a workspace member
        if (projectId) {
          // Add to project and send notification
          await adminClient.from('project_members').upsert(
            { project_id: projectId, user_id: existingProfile.id, role, invited_by: callerId },
            { onConflict: 'project_id,user_id' },
          );
          if (resendKey) {
            await sendEmail(
              resendKey, fromEmail, email,
              `${inviterName} הוסיף/ה אותך לפרויקט "${projectName ?? ''}"`,
              inviteEmailHtml(inviterName, workspaceName, appUrl, projectName),
            );
          }
          return new Response(JSON.stringify({ type: 'added_to_project' }), {
            headers: { ...cors, 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({ error: 'המשתמש כבר חבר בסביבת העבודה' }), {
          status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
        });
      }

      // Exists but not a workspace member → add directly
      await adminClient.from('account_members').insert(
        { account_id: accountId, user_id: existingProfile.id, role },
      );
      if (projectId) {
        await adminClient.from('project_members').upsert(
          { project_id: projectId, user_id: existingProfile.id, role, invited_by: callerId },
          { onConflict: 'project_id,user_id' },
        );
      }
      await adminClient.from('invitations').insert({
        email, account_id: accountId, role, invited_by: callerId, status: 'accepted',
      });
      if (resendKey) {
        await sendEmail(
          resendKey, fromEmail, email,
          `${inviterName} הוסיף/ה אותך ל${projectName ? `פרויקט "${projectName}"` : workspaceName}`,
          inviteEmailHtml(inviterName, workspaceName, appUrl, projectName),
        );
      }
      return new Response(JSON.stringify({ type: 'added_directly' }), {
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    // New user — generate invite link or use built-in
    let invitedUserId: string | undefined;

    if (resendKey) {
      const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
        type: 'invite',
        email,
        options: {
          data: { account_id: accountId, project_id: projectId ?? null, role, invited_by: callerId },
          redirectTo: `${origin}/auth/callback?type=invite`,
        },
      });
      if (linkError) throw new Error(`Generate link error: ${linkError.message}`);
      invitedUserId = linkData?.user?.id;
      const inviteUrl = linkData?.properties?.action_link;
      if (inviteUrl) {
        await sendEmail(
          resendKey, fromEmail, email,
          `${inviterName} הזמין/ה אותך ל${projectName ? `פרויקט "${projectName}"` : workspaceName}`,
          inviteEmailHtml(inviterName, workspaceName, inviteUrl, projectName),
        );
      }
    } else {
      const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
        data: { account_id: accountId, project_id: projectId ?? null, role, invited_by: callerId },
        redirectTo: `${origin}/auth/callback?type=invite`,
      });
      if (inviteError) throw new Error(`Invite error: ${inviteError.message}`);
      invitedUserId = inviteData?.user?.id;
    }

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

    await adminClient.from('invitations').insert({
      email, account_id: accountId, role, invited_by: callerId, status: 'pending',
    });

    return new Response(JSON.stringify({ type: 'invite_sent' }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
