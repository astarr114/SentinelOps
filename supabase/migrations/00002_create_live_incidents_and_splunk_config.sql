-- Live incidents table for real-time alerting
CREATE TABLE public.live_incidents (
  id text PRIMARY KEY,
  title text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'INVESTIGATING', 'RESOLVED')),
  service text NOT NULL,
  summary text,
  tags text[],
  opened_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.live_incidents ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read live incidents
CREATE POLICY "Authenticated users can view live incidents" ON public.live_incidents
  FOR SELECT TO authenticated USING (true);

-- Allow authenticated users to insert (for demo simulation)
CREATE POLICY "Authenticated users can insert live incidents" ON public.live_incidents
  FOR INSERT TO authenticated WITH CHECK (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_incidents;

-- Splunk configuration per user
CREATE TABLE public.splunk_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  splunk_host text,
  splunk_token text,
  mode text NOT NULL DEFAULT 'demo' CHECK (mode IN ('live', 'demo')),
  last_connected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.splunk_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own splunk config" ON public.splunk_configs
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Seed demo live incidents for testing realtime
INSERT INTO public.live_incidents (id, title, severity, status, service, summary, tags, opened_at)
VALUES
  ('INC-1001', 'checkout-service: P99 latency spike to 3241ms — DB pool exhaustion', 'CRITICAL', 'INVESTIGATING', 'checkout-service',
   'P99 latency degraded from 280ms baseline to 3241ms following v1.8.3 deployment at 10:37. 847 HikariCP connection timeout errors detected.',
   ARRAY['latency', 'database', 'deployment', 'checkout'], '2026-05-21 10:42:00+00'),
  ('INC-1002', 'payment-api: 5xx error rate at 23% — circuit breaker tripping', 'HIGH', 'OPEN', 'payment-api',
   'payment-api showing elevated HTTP 5xx error rate (23%). Circuit breaker triggered on checkout dependency.',
   ARRAY['5xx', 'circuit-breaker', 'payment'], '2026-05-21 10:47:00+00'),
  ('INC-1003', 'auth-service: P95 login latency elevated to 890ms', 'MEDIUM', 'INVESTIGATING', 'auth-service',
   'auth-service login endpoint latency spiked. Likely downstream from DB replica lag.',
   ARRAY['latency', 'auth', 'database'], '2026-05-21 10:55:00+00');