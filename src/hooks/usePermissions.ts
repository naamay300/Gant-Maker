import { useAuth } from '../contexts/AuthContext';

export function usePermissions() {
  const { account } = useAuth();
  const role = (account?.role ?? 'member') as 'owner' | 'admin' | 'manager' | 'member';

  const isOwner   = role === 'owner';
  const isAdmin   = role === 'owner' || role === 'admin';
  const isManager = role === 'owner' || role === 'admin' || role === 'manager';

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
