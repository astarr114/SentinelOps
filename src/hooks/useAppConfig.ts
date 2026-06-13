import { useState, useEffect } from 'react';
import { supabase } from '@/db/supabase';

export interface AppConfig {
  mttr_threshold_enabled: boolean;
  mttr_threshold_minutes: number;
  auto_resolve_enabled: boolean;
  auto_resolve_hours: number;
}

const DEFAULTS: AppConfig = {
  mttr_threshold_enabled: false,
  mttr_threshold_minutes: 60,
  auto_resolve_enabled:   false,
  auto_resolve_hours:     4,
};

export function useAppConfig() {
  const [config, setConfig] = useState<AppConfig>(DEFAULTS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('app_config')
      .select('key, value')
      .then(({ data }) => {
        if (Array.isArray(data)) {
          const map = Object.fromEntries(data.map(r => [r.key, r.value]));
          setConfig({
            mttr_threshold_enabled: map.mttr_threshold_enabled === 'true',
            mttr_threshold_minutes: parseInt(map.mttr_threshold_minutes ?? '60', 10) || 60,
            auto_resolve_enabled:   map.auto_resolve_enabled === 'true',
            auto_resolve_hours:     parseInt(map.auto_resolve_hours ?? '4', 10) || 4,
          });
        }
        setLoading(false);
      });
  }, []);

  return { config, loading };
}
