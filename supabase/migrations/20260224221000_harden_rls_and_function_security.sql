-- Security hardening for Supabase Security Advisor findings:
-- 1) Enable RLS on user insight tables that are exposed to PostgREST
-- 2) Add explicit service_role-only policies
-- 3) Harden SECURITY DEFINER function with fixed search_path

-- 1) RLS: enable on tables flagged as "RLS Disabled in Public"
ALTER TABLE IF EXISTS public.user_completion_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.recommendation_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.user_preferences ENABLE ROW LEVEL SECURITY;

-- Keep access model explicit: only service_role can read/write these tables.
-- (Your app currently uses SUPABASE_SERVICE_ROLE_KEY on the server.)
DROP POLICY IF EXISTS service_role_all_user_completion_events ON public.user_completion_events;
CREATE POLICY service_role_all_user_completion_events
ON public.user_completion_events
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS service_role_all_recommendation_log ON public.recommendation_log;
CREATE POLICY service_role_all_recommendation_log
ON public.recommendation_log
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS service_role_all_user_preferences ON public.user_preferences;
CREATE POLICY service_role_all_user_preferences
ON public.user_preferences
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Optional cleanup: remove "RLS enabled, no policy" info warning for tasks as well.
DROP POLICY IF EXISTS service_role_all_tasks ON public.tasks;
CREATE POLICY service_role_all_tasks
ON public.tasks
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 2) Function hardening: fix mutable search_path warning for SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.toggle_task(p_task_id uuid, p_user_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.tasks
  SET completed = NOT completed
  WHERE id = p_task_id AND user_id = p_user_id;
END;
$$;
