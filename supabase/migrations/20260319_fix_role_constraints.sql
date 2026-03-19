-- Fix role check constraints to accept 'editor' and 'viewer'
-- Run this in Supabase SQL Editor

-- account_members: drop old constraint, add new one with all valid roles
ALTER TABLE account_members
  DROP CONSTRAINT IF EXISTS account_members_role_check;

ALTER TABLE account_members
  ADD CONSTRAINT account_members_role_check
  CHECK (role IN ('owner', 'editor', 'viewer', 'admin', 'manager', 'member'));

-- project_members: same fix
ALTER TABLE project_members
  DROP CONSTRAINT IF EXISTS project_members_role_check;

ALTER TABLE project_members
  ADD CONSTRAINT project_members_role_check
  CHECK (role IN ('owner', 'editor', 'viewer', 'admin', 'manager', 'member'));

-- invitations: same fix
ALTER TABLE invitations
  DROP CONSTRAINT IF EXISTS invitations_role_check;

ALTER TABLE invitations
  ADD CONSTRAINT invitations_role_check
  CHECK (role IN ('owner', 'editor', 'viewer', 'admin', 'manager', 'member'));

-- Also update update_member_role RPC to allow 'editor' role (not just 'owner'/'admin')
CREATE OR REPLACE FUNCTION update_member_role(p_member_id uuid, p_new_role text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_account_id uuid;
BEGIN
  SELECT account_id INTO v_account_id FROM account_members WHERE id = p_member_id;
  IF NOT EXISTS (
    SELECT 1 FROM account_members
    WHERE account_id = v_account_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin', 'editor')
  ) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF EXISTS (SELECT 1 FROM account_members WHERE id = p_member_id AND role = 'owner')
  THEN RAISE EXCEPTION 'Cannot change owner role'; END IF;
  UPDATE account_members SET role = p_new_role WHERE id = p_member_id;
END;
$$;
