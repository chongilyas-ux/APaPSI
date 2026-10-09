-- Roles -----------------------------------------------------------------
CREATE TYPE public.app_role AS ENUM ('admin', 'asisten');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_read" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_write_own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_roles_read" ON public.user_roles FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Core domain ------------------------------------------------------------
CREATE TABLE public.rombels (
  id integer PRIMARY KEY CHECK (id BETWEEN 1 AND 4),
  name text NOT NULL
);
GRANT SELECT ON public.rombels TO authenticated;
GRANT ALL ON public.rombels TO service_role;
ALTER TABLE public.rombels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rombels_read" ON public.rombels FOR SELECT TO authenticated USING (true);

CREATE TABLE public.assessment_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number integer UNIQUE NOT NULL,
  label text NOT NULL,
  config jsonb NOT NULL,
  state text NOT NULL CHECK (state IN ('active','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);
GRANT SELECT, INSERT, UPDATE ON public.assessment_versions TO authenticated;
GRANT ALL ON public.assessment_versions TO service_role;
ALTER TABLE public.assessment_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "versions_read" ON public.assessment_versions FOR SELECT TO authenticated USING (true);
CREATE POLICY "versions_insert" ON public.assessment_versions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "versions_update" ON public.assessment_versions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  npm text UNIQUE NOT NULL CHECK (npm ~ '^[0-9]{10}$'),
  name text NOT NULL,
  rombel_id integer NOT NULL REFERENCES public.rombels(id),
  study_case text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX student_rombel ON public.students(rombel_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.students TO authenticated;
GRANT ALL ON public.students TO service_role;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
CREATE POLICY "students_all" ON public.students FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER students_touch BEFORE UPDATE ON public.students
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.configuration_drafts (
  id integer PRIMARY KEY CHECK (id = 1),
  config jsonb NOT NULL,
  base_version uuid NOT NULL REFERENCES public.assessment_versions(id),
  revision integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.configuration_drafts TO authenticated;
GRANT ALL ON public.configuration_drafts TO service_role;
ALTER TABLE public.configuration_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "drafts_all" ON public.configuration_drafts FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL UNIQUE REFERENCES public.students(id) ON DELETE CASCADE,
  version_id uuid NOT NULL REFERENCES public.assessment_versions(id),
  data jsonb NOT NULL,
  state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','verified')),
  revision integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assessments TO authenticated;
GRANT ALL ON public.assessments TO service_role;
ALTER TABLE public.assessments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "assessments_all" ON public.assessments FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  report jsonb NOT NULL,
  actor_id uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.import_batches TO authenticated;
GRANT ALL ON public.import_batches TO service_role;
ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "imports_read" ON public.import_batches FOR SELECT TO authenticated USING (true);
CREATE POLICY "imports_insert" ON public.import_batches FOR INSERT TO authenticated WITH CHECK (true);

-- AI assistant -----------------------------------------------------------
CREATE TABLE public.ai_workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  context jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_workspaces TO authenticated;
GRANT ALL ON public.ai_workspaces TO service_role;
ALTER TABLE public.ai_workspaces ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_workspaces_own" ON public.ai_workspaces FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.ai_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  revision integer NOT NULL DEFAULT 1,
  state text NOT NULL DEFAULT 'awaiting_review' CHECK (state IN ('awaiting_review','executed','cancelled','expired','conflicted')),
  command text NOT NULL,
  payload jsonb NOT NULL,
  payload_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  result jsonb
);
CREATE INDEX ai_plans_user_state ON public.ai_plans(user_id, state);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_plans TO authenticated;
GRANT ALL ON public.ai_plans TO service_role;
ALTER TABLE public.ai_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_plans_own" ON public.ai_plans FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ai_plans_admin_read" ON public.ai_plans FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.ai_audit_events (
  id bigserial PRIMARY KEY,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid,
  plan_id uuid REFERENCES public.ai_plans(id),
  command text NOT NULL DEFAULT '',
  intent text NOT NULL DEFAULT '',
  tool text NOT NULL DEFAULT '',
  status text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_audit_actor_time ON public.ai_audit_events(actor_id, created_at DESC);
GRANT SELECT, INSERT ON public.ai_audit_events TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.ai_audit_events_id_seq TO authenticated;
GRANT ALL ON public.ai_audit_events TO service_role;
GRANT ALL ON SEQUENCE public.ai_audit_events_id_seq TO service_role;
ALTER TABLE public.ai_audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_audit_own" ON public.ai_audit_events FOR ALL TO authenticated USING (auth.uid() = actor_id) WITH CHECK (auth.uid() = actor_id);
CREATE POLICY "ai_audit_admin_read" ON public.ai_audit_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.assessment_logs (
  id bigserial PRIMARY KEY,
  actor_id uuid REFERENCES auth.users(id),
  student_id uuid REFERENCES public.students(id) ON DELETE SET NULL,
  component text NOT NULL,
  before_value jsonb,
  after_value jsonb,
  reason text NOT NULL DEFAULT '',
  ai_plan_id uuid REFERENCES public.ai_plans(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX assessment_logs_student_time ON public.assessment_logs(student_id, created_at DESC);
GRANT SELECT, INSERT ON public.assessment_logs TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.assessment_logs_id_seq TO authenticated;
GRANT ALL ON public.assessment_logs TO service_role;
GRANT ALL ON SEQUENCE public.assessment_logs_id_seq TO service_role;
ALTER TABLE public.assessment_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "logs_read" ON public.assessment_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "logs_insert" ON public.assessment_logs FOR INSERT TO authenticated WITH CHECK (true);

-- Reference data ---------------------------------------------------------
INSERT INTO public.rombels(id, name) VALUES (1,'Rombel 1'),(2,'Rombel 2'),(3,'Rombel 3'),(4,'Rombel 4');