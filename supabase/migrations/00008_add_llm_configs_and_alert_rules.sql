
-- LLM provider configuration per user
CREATE TABLE public.llm_configs (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider    text        NOT NULL DEFAULT 'gemini'
                          CHECK (provider IN ('gemini','openai','anthropic','grok','deepseek')),
  api_key     text        NOT NULL DEFAULT '',
  model_id    text        NOT NULL DEFAULT '',
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);

ALTER TABLE public.llm_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own llm config"
  ON public.llm_configs FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Alert routing rules per user
CREATE TABLE public.alert_rules (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text        NOT NULL DEFAULT 'New rule',
  severities  text[]      NOT NULL DEFAULT '{}',
  services    text[]      NOT NULL DEFAULT '{}',
  action      text        NOT NULL DEFAULT 'toast'
                          CHECK (action IN ('toast','highlight','sound','toast_and_highlight','toast_and_sound','all')),
  enabled     boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.alert_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own alert rules"
  ON public.alert_rules FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
