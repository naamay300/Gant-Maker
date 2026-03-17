-- ============================================================
-- Gantt Manager - Database Schema (Full Reset + Setup)
-- Run this in Supabase SQL Editor
-- ============================================================

-- Drop existing objects (safe reset)
DROP TABLE IF EXISTS public.tasks CASCADE;
DROP TABLE IF EXISTS public.project_statuses CASCADE;
DROP TABLE IF EXISTS public.project_members CASCADE;
DROP TABLE IF EXISTS public.projects CASCADE;
DROP TABLE IF EXISTS public.account_members CASCADE;
DROP TABLE IF EXISTS public.accounts CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

DROP FUNCTION IF EXISTS public.create_project(UUID, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.create_account(TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.add_project_member(UUID, TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.add_account_member(UUID, TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── profiles (extends auth.users) ────────────────────────────────────────────
CREATE TABLE public.profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      TEXT NOT NULL,
  full_name  TEXT DEFAULT '',
  avatar_url TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── accounts (workspaces) ────────────────────────────────────────────────────
CREATE TABLE public.accounts (
  id         UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name       TEXT NOT NULL,
  owner_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── account_members ──────────────────────────────────────────────────────────
CREATE TABLE public.account_members (
  id         UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'member'
               CHECK (role IN ('owner', 'admin', 'member')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(account_id, user_id)
);

-- ── projects ─────────────────────────────────────────────────────────────────
CREATE TABLE public.projects (
  id         UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── project_members ──────────────────────────────────────────────────────────
CREATE TABLE public.project_members (
  id         UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'member'
               CHECK (role IN ('admin', 'member')),
  invited_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, user_id)
);

-- ── project_statuses ─────────────────────────────────────────────────────────
CREATE TABLE public.project_statuses (
  id         UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  color      TEXT NOT NULL DEFAULT '#9ea3c0',
  sort_order INT DEFAULT 0
);

-- ── tasks ────────────────────────────────────────────────────────────────────
CREATE TABLE public.tasks (
  id           UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id   UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  number       INT NOT NULL DEFAULT 1,
  name         TEXT NOT NULL DEFAULT '',
  assignees    JSONB DEFAULT '[]'::jsonb,
  start_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  duration     INT NOT NULL DEFAULT 7,
  dependencies TEXT[] DEFAULT '{}',
  status_id    UUID REFERENCES public.project_statuses(id) ON DELETE SET NULL,
  task_order   INT DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ════════════════════════════════════════════════════════════════════
-- Row Level Security
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE public.profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks            ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- accounts
CREATE POLICY "accounts_select" ON public.accounts FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.account_members WHERE account_id = accounts.id AND user_id = auth.uid())
);
CREATE POLICY "accounts_insert" ON public.accounts FOR INSERT WITH CHECK (owner_id = auth.uid());
CREATE POLICY "accounts_update" ON public.accounts FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.account_members WHERE account_id = accounts.id AND user_id = auth.uid() AND role IN ('owner', 'admin'))
);
CREATE POLICY "accounts_delete" ON public.accounts FOR DELETE USING (owner_id = auth.uid());

-- account_members
CREATE POLICY "account_members_select" ON public.account_members FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.account_members am WHERE am.account_id = account_members.account_id AND am.user_id = auth.uid())
);
CREATE POLICY "account_members_insert" ON public.account_members FOR INSERT WITH CHECK (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.account_members am WHERE am.account_id = account_members.account_id AND am.user_id = auth.uid() AND am.role IN ('owner', 'admin'))
);
CREATE POLICY "account_members_delete" ON public.account_members FOR DELETE USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.account_members am WHERE am.account_id = account_members.account_id AND am.user_id = auth.uid() AND am.role IN ('owner', 'admin'))
);

-- projects
CREATE POLICY "projects_select" ON public.projects FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.project_members WHERE project_id = projects.id AND user_id = auth.uid())
);
CREATE POLICY "projects_insert" ON public.projects FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.account_members WHERE account_id = projects.account_id AND user_id = auth.uid())
);
CREATE POLICY "projects_update" ON public.projects FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.project_members WHERE project_id = projects.id AND user_id = auth.uid() AND role = 'admin')
  OR EXISTS (SELECT 1 FROM public.account_members WHERE account_id = projects.account_id AND user_id = auth.uid() AND role IN ('owner', 'admin'))
);
CREATE POLICY "projects_delete" ON public.projects FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.account_members WHERE account_id = projects.account_id AND user_id = auth.uid() AND role IN ('owner', 'admin'))
);

-- project_members
CREATE POLICY "project_members_select" ON public.project_members FOR SELECT USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.project_members pm WHERE pm.project_id = project_members.project_id AND pm.user_id = auth.uid())
);
CREATE POLICY "project_members_insert" ON public.project_members FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.account_members am
    JOIN public.projects p ON p.account_id = am.account_id
    WHERE p.id = project_members.project_id AND am.user_id = auth.uid()
  )
  OR EXISTS (SELECT 1 FROM public.project_members pm WHERE pm.project_id = project_members.project_id AND pm.user_id = auth.uid() AND pm.role = 'admin')
);
CREATE POLICY "project_members_delete" ON public.project_members FOR DELETE USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.project_members pm WHERE pm.project_id = project_members.project_id AND pm.user_id = auth.uid() AND pm.role = 'admin')
);

-- project_statuses
CREATE POLICY "statuses_select" ON public.project_statuses FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.project_members WHERE project_id = project_statuses.project_id AND user_id = auth.uid())
);
CREATE POLICY "statuses_insert" ON public.project_statuses FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.project_members WHERE project_id = project_statuses.project_id AND user_id = auth.uid())
);
CREATE POLICY "statuses_update" ON public.project_statuses FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.project_members WHERE project_id = project_statuses.project_id AND user_id = auth.uid())
);
CREATE POLICY "statuses_delete" ON public.project_statuses FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.project_members WHERE project_id = project_statuses.project_id AND user_id = auth.uid())
);

-- tasks
CREATE POLICY "tasks_select" ON public.tasks FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.project_members WHERE project_id = tasks.project_id AND user_id = auth.uid())
);
CREATE POLICY "tasks_insert" ON public.tasks FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.project_members WHERE project_id = tasks.project_id AND user_id = auth.uid())
);
CREATE POLICY "tasks_update" ON public.tasks FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.project_members WHERE project_id = tasks.project_id AND user_id = auth.uid())
);
CREATE POLICY "tasks_delete" ON public.tasks FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.project_members WHERE project_id = tasks.project_id AND user_id = auth.uid())
);

-- ════════════════════════════════════════════════════════════════════
-- Database Functions (SECURITY DEFINER to bypass RLS safely)
-- ════════════════════════════════════════════════════════════════════

-- Auto-create profile when a new user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture', '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create a new workspace + add creator as owner
CREATE OR REPLACE FUNCTION public.create_account(p_name TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_account_id UUID;
BEGIN
  INSERT INTO public.accounts (name, owner_id)
  VALUES (p_name, auth.uid())
  RETURNING id INTO v_account_id;

  INSERT INTO public.account_members (account_id, user_id, role)
  VALUES (v_account_id, auth.uid(), 'owner');

  RETURN v_account_id;
END;
$$;

-- Create a new project with default statuses and add creator as admin
CREATE OR REPLACE FUNCTION public.create_project(p_account_id UUID, p_name TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_project_id UUID;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.account_members
    WHERE account_id = p_account_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  INSERT INTO public.projects (account_id, name, created_by)
  VALUES (p_account_id, p_name, auth.uid())
  RETURNING id INTO v_project_id;

  INSERT INTO public.project_members (project_id, user_id, role)
  VALUES (v_project_id, auth.uid(), 'admin');

  INSERT INTO public.project_statuses (project_id, name, color, sort_order) VALUES
    (v_project_id, 'לביצוע', '#9ea3c0', 0),
    (v_project_id, 'בתהליך', '#f7971e', 1),
    (v_project_id, 'הושלם',  '#43b89c', 2);

  RETURN v_project_id;
END;
$$;

-- Add a user to a project by email
CREATE OR REPLACE FUNCTION public.add_project_member(p_project_id UUID, p_email TEXT, p_role TEXT DEFAULT 'member')
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id    UUID;
  v_account_id UUID;
BEGIN
  SELECT account_id INTO v_account_id FROM public.projects WHERE id = p_project_id;

  IF NOT (
    EXISTS (SELECT 1 FROM public.project_members WHERE project_id = p_project_id AND user_id = auth.uid() AND role = 'admin')
    OR EXISTS (SELECT 1 FROM public.account_members WHERE account_id = v_account_id AND user_id = auth.uid() AND role IN ('owner', 'admin'))
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT id INTO v_user_id FROM public.profiles WHERE email = p_email;

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'user_not_found', 'message', 'משתמש לא נמצא עם כתובת מייל זו');
  END IF;

  INSERT INTO public.project_members (project_id, user_id, role, invited_by)
  VALUES (p_project_id, v_user_id, p_role, auth.uid())
  ON CONFLICT (project_id, user_id) DO UPDATE SET role = p_role;

  RETURN jsonb_build_object('success', true, 'user_id', v_user_id);
END;
$$;

-- Add a user to an account/workspace by email
CREATE OR REPLACE FUNCTION public.add_account_member(p_account_id UUID, p_email TEXT, p_role TEXT DEFAULT 'member')
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id UUID;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.account_members
    WHERE account_id = p_account_id AND user_id = auth.uid() AND role IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT id INTO v_user_id FROM public.profiles WHERE email = p_email;

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'user_not_found', 'message', 'משתמש לא נמצא עם כתובת מייל זו');
  END IF;

  INSERT INTO public.account_members (account_id, user_id, role)
  VALUES (p_account_id, v_user_id, p_role)
  ON CONFLICT (account_id, user_id) DO UPDATE SET role = p_role;

  RETURN jsonb_build_object('success', true, 'user_id', v_user_id);
END;
$$;
