import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { WorkspaceMember, Invitation } from '../types';

function memberFromRow(r: Record<string, unknown>): WorkspaceMember {
  return {
    id:        r.id as string,
    userId:    r.user_id as string,
    role:      r.role as WorkspaceMember['role'],
    joinedAt:  r.joined_at as string,
    email:     r.email as string,
    fullName:  (r.full_name as string) ?? '',
    avatarUrl: (r.avatar_url as string) ?? '',
  };
}

function invitationFromRow(r: Record<string, unknown>): Invitation {
  return {
    id:        r.id as string,
    email:     r.email as string,
    role:      r.role as Invitation['role'],
    createdAt: r.created_at as string,
    expiresAt: r.expires_at as string,
    projectId: (r.project_id as string) ?? null,
  };
}

export function useWorkspaceMembers(accountId: string | undefined) {
  const [members, setMembers]         = useState<WorkspaceMember[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    setError(null);
    try {
      const [{ data: mData }, { data: iData }] = await Promise.all([
        supabase.rpc('get_workspace_members', { p_account_id: accountId }),
        supabase.rpc('get_pending_invitations', { p_account_id: accountId }),
      ]);
      setMembers((mData ?? []).map((r: Record<string, unknown>) => memberFromRow(r)));
      setInvitations((iData ?? []).map((r: Record<string, unknown>) => invitationFromRow(r)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  async function inviteMember(email: string, role: Invitation['role'], projectId?: string) {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/invite-user`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ email, accountId, projectId: projectId ?? null, role }),
      },
    );
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? 'שגיאה בשליחת הזמנה');
    await load();
    return json.type as 'added_directly' | 'invite_sent';
  }

  async function updateRole(memberId: string, newRole: string) {
    await supabase.rpc('update_member_role', { p_member_id: memberId, p_new_role: newRole });
    setMembers(prev => prev.map(m => m.id === memberId ? { ...m, role: newRole as WorkspaceMember['role'] } : m));
  }

  async function removeMember(memberId: string) {
    await supabase.rpc('remove_member', { p_member_id: memberId });
    setMembers(prev => prev.filter(m => m.id !== memberId));
  }

  async function cancelInvitation(invitationId: string) {
    await supabase.rpc('cancel_invitation', { p_invitation_id: invitationId });
    setInvitations(prev => prev.filter(i => i.id !== invitationId));
  }

  return { members, invitations, loading, error, load, inviteMember, updateRole, removeMember, cancelInvitation };
}
