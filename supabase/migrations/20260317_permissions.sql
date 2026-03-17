-- ══════════════════════════════════════════════════════════════
-- PERMISSIONS MIGRATION — run in Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════

-- ── 1. account_members ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS account_members (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       text NOT NULL DEFAULT 'member'
             CHECK (role IN ('owner', 'admin', 'manager', 'member')),
  invited_by uuid REFERENCES auth.users(id),
  joined_at  timestamptz DEFAULT now(),
  UNIQUE (account_id, user_id)
);

-- ── 2. project_members ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_members (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       text NOT NULL DEFAULT 'member'
             CHECK (role IN ('admin', 'manager', 'member')),
  invited_by uuid REFERENCES auth.users(id),
  joined_at  timestamptz DEFAULT now(),
  UNIQUE (project_id, user_id)
);

-- ── 3. invitations ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invitations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text NOT NULL,
  account_id uuid REFERENCES accounts(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  role       text NOT NULL DEFAULT 'member'
             CHECK (role IN ('admin', 'manager', 'member')),
  invited_by uuid REFERENCES auth.users(id),
  status     text NOT NULL DEFAULT 'pending'
             CHECK (status IN ('pending', 'accepted', 'expired')),
  expires_at timestamptz DEFAULT (now() + interval '7 days'),
  created_at timestamptz DEFAULT now()
);

-- ── 4. Enable RLS ─────────────────────────────────────────────
ALTER TABLE account_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations     ENABLE ROW LEVEL SECURITY;

-- ── 5. account_members policies ──────────────────────────────
DROP POLICY IF EXISTS "members can view workspace members" ON account_members;
CREATE POLICY "members can view workspace members" ON account_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM account_members am
      WHERE am.account_id = account_members.account_id
        AND am.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "admins can insert members" ON account_members;
CREATE POLICY "admins can insert members" ON account_members
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM account_members am
      WHERE am.account_id = account_members.account_id
        AND am.user_id = auth.uid()
        AND am.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "admins can update roles" ON account_members;
CREATE POLICY "admins can update roles" ON account_members
  FOR UPDATE USING (
    role != 'owner' AND
    EXISTS (
      SELECT 1 FROM account_members am
      WHERE am.account_id = account_members.account_id
        AND am.user_id = auth.uid()
        AND am.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "admins can remove members" ON account_members;
CREATE POLICY "admins can remove members" ON account_members
  FOR DELETE USING (
    role != 'owner' AND
    EXISTS (
      SELECT 1 FROM account_members am
      WHERE am.account_id = account_members.account_id
        AND am.user_id = auth.uid()
        AND am.role IN ('owner', 'admin')
    )
  );

-- ── 6. project_members policies ──────────────────────────────
DROP POLICY IF EXISTS "workspace members can view project members" ON project_members;
CREATE POLICY "workspace members can view project members" ON project_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN account_members am ON am.account_id = p.account_id
      WHERE p.id = project_members.project_id
        AND am.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "managers can manage project members" ON project_members;
CREATE POLICY "managers can manage project members" ON project_members
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN account_members am ON am.account_id = p.account_id
      WHERE p.id = project_members.project_id
        AND am.user_id = auth.uid()
        AND am.role IN ('owner', 'admin', 'manager')
    )
  );

-- ── 7. invitations policies ───────────────────────────────────
DROP POLICY IF EXISTS "admins can manage invitations" ON invitations;
CREATE POLICY "admins can manage invitations" ON invitations
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM account_members am
      WHERE am.account_id = invitations.account_id
        AND am.user_id = auth.uid()
        AND am.role IN ('owner', 'admin')
    )
  );

-- ── 8. Backfill: add existing account owners to account_members
INSERT INTO account_members (account_id, user_id, role)
SELECT id, owner_id, 'owner'
FROM accounts
ON CONFLICT (account_id, user_id) DO NOTHING;

-- ── 9. Trigger: auto-add owner when account is created ────────
CREATE OR REPLACE FUNCTION handle_account_created()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO account_members (account_id, user_id, role)
  VALUES (NEW.id, NEW.owner_id, 'owner')
  ON CONFLICT (account_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_account_created ON accounts;
CREATE TRIGGER on_account_created
  AFTER INSERT ON accounts
  FOR EACH ROW EXECUTE FUNCTION handle_account_created();

-- ── 10. Trigger: auto-add invited user when they sign up ──────
CREATE OR REPLACE FUNCTION handle_invite_accepted()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.raw_user_meta_data->>'account_id' IS NOT NULL THEN
    INSERT INTO account_members (account_id, user_id, role, invited_by)
    VALUES (
      (NEW.raw_user_meta_data->>'account_id')::uuid,
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'role', 'member'),
      (NEW.raw_user_meta_data->>'invited_by')::uuid
    )
    ON CONFLICT (account_id, user_id) DO NOTHING;

    UPDATE invitations
    SET status = 'accepted'
    WHERE email = NEW.email
      AND account_id = (NEW.raw_user_meta_data->>'account_id')::uuid
      AND status = 'pending';

    IF NEW.raw_user_meta_data->>'project_id' IS NOT NULL THEN
      INSERT INTO project_members (project_id, user_id, role, invited_by)
      VALUES (
        (NEW.raw_user_meta_data->>'project_id')::uuid,
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'role', 'member'),
        (NEW.raw_user_meta_data->>'invited_by')::uuid
      )
      ON CONFLICT (project_id, user_id) DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_invite_accepted ON auth.users;
CREATE TRIGGER on_invite_accepted
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_invite_accepted();

-- ── 11. Update get_my_account to use account_members ──────────
CREATE OR REPLACE FUNCTION get_my_account()
RETURNS TABLE (id uuid, name text, owner_id uuid, role text)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT a.id, a.name, a.owner_id, am.role
  FROM accounts a
  JOIN account_members am ON am.account_id = a.id AND am.user_id = auth.uid()
  LIMIT 1;
END;
$$;

-- ── 12. get_workspace_members RPC ────────────────────────────
CREATE OR REPLACE FUNCTION get_workspace_members(p_account_id uuid)
RETURNS TABLE (
  id        uuid,
  user_id   uuid,
  role      text,
  joined_at timestamptz,
  email     text,
  full_name text,
  avatar_url text
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM account_members
    WHERE account_id = p_account_id AND user_id = auth.uid()
  ) THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  RETURN QUERY
  SELECT am.id, am.user_id, am.role, am.joined_at,
         p.email, p.full_name, p.avatar_url
  FROM account_members am
  JOIN profiles p ON p.id = am.user_id
  WHERE am.account_id = p_account_id
  ORDER BY
    CASE am.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'manager' THEN 2 ELSE 3 END,
    am.joined_at;
END;
$$;

-- ── 13. get_pending_invitations RPC ──────────────────────────
CREATE OR REPLACE FUNCTION get_pending_invitations(p_account_id uuid)
RETURNS TABLE (
  id         uuid,
  email      text,
  role       text,
  created_at timestamptz,
  expires_at timestamptz,
  project_id uuid
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM account_members
    WHERE account_id = p_account_id AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
  ) THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  RETURN QUERY
  SELECT i.id, i.email, i.role, i.created_at, i.expires_at, i.project_id
  FROM invitations i
  WHERE i.account_id = p_account_id
    AND i.status = 'pending'
    AND i.expires_at > now()
  ORDER BY i.created_at DESC;
END;
$$;

-- ── 14. update_member_role RPC ───────────────────────────────
CREATE OR REPLACE FUNCTION update_member_role(p_member_id uuid, p_new_role text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_account_id uuid;
BEGIN
  SELECT account_id INTO v_account_id FROM account_members WHERE id = p_member_id;
  IF NOT EXISTS (
    SELECT 1 FROM account_members
    WHERE account_id = v_account_id AND user_id = auth.uid() AND role IN ('owner', 'admin')
  ) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF EXISTS (SELECT 1 FROM account_members WHERE id = p_member_id AND role = 'owner')
  THEN RAISE EXCEPTION 'Cannot change owner role'; END IF;
  UPDATE account_members SET role = p_new_role WHERE id = p_member_id;
END;
$$;

-- ── 15. remove_member RPC ────────────────────────────────────
CREATE OR REPLACE FUNCTION remove_member(p_member_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_account_id uuid;
BEGIN
  SELECT account_id INTO v_account_id FROM account_members WHERE id = p_member_id;
  IF NOT EXISTS (
    SELECT 1 FROM account_members
    WHERE account_id = v_account_id AND user_id = auth.uid() AND role IN ('owner', 'admin')
  ) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF EXISTS (SELECT 1 FROM account_members WHERE id = p_member_id AND role = 'owner')
  THEN RAISE EXCEPTION 'Cannot remove owner'; END IF;
  DELETE FROM account_members WHERE id = p_member_id;
END;
$$;

-- ── 16. cancel_invitation RPC ────────────────────────────────
CREATE OR REPLACE FUNCTION cancel_invitation(p_invitation_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_account_id uuid;
BEGIN
  SELECT account_id INTO v_account_id FROM invitations WHERE id = p_invitation_id;
  IF NOT EXISTS (
    SELECT 1 FROM account_members
    WHERE account_id = v_account_id AND user_id = auth.uid() AND role IN ('owner', 'admin')
  ) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  UPDATE invitations SET status = 'expired' WHERE id = p_invitation_id;
END;
$$;
