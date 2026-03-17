import { useAuth } from '../contexts/AuthContext';

export function usePermissions() {
  const { account } = useAuth();
  const role = (account?.role ?? 'viewer') as 'owner' | 'editor' | 'viewer';

  const isOwner   = role === 'owner';
  const isAdmin   = role === 'owner' || role === 'editor';
  const isManager = role === 'owner' || role === 'editor';

  return {
    role,
    isOwner,
    isAdmin,
    isManager,
    canInviteToWorkspace:  isAdmin,
    canManageRoles:        isAdmin,
    canRemoveMembers:      isAdmin,
    canCreateProject:      isManager,
    canDeleteProject:      isAdmin,
    canManageStatuses:     isManager,
    canInviteToProject:    isManager,
  };
}
