/**
 * auto-resolve-incidents
 *
 * Resolves OPEN/INVESTIGATING incidents that have not been updated within the
 * configured timeout.  Can be called:
 *   - Via a Supabase cron job (pg_cron) every N minutes
 *   - On-demand from the Settings page "Run Now" button
 *
 * POST / (no body required — reads config from app_config table)
 * GET  /  (same, convenient for manual trigger)
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl  = Deno.env.get('SUPABASE_URL')!;
    const serviceKey   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase     = createClient(supabaseUrl, serviceKey);

    // ── 1. Read config ──────────────────────────────────────────────────────
    const { data: configRows } = await supabase
      .from('app_config')
      .select('key, value');

    const cfg: Record<string, string> = {};
    if (Array.isArray(configRows)) {
      for (const row of configRows) cfg[row.key] = row.value;
    }

    const enabled = cfg.auto_resolve_enabled === 'true';
    const hours   = Math.max(1, parseInt(cfg.auto_resolve_hours ?? '4', 10) || 4);

    if (!enabled) {
      return new Response(
        JSON.stringify({ skipped: true, reason: 'auto_resolve_enabled is false' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
      );
    }

    // ── 2. Find stale incidents ─────────────────────────────────────────────
    const cutoff = new Date(Date.now() - hours * 3_600_000).toISOString();

    const { data: stale, error: fetchErr } = await supabase
      .from('live_incidents')
      .select('id, title, service, updated_at')
      .in('status', ['OPEN', 'INVESTIGATING'])
      .lt('updated_at', cutoff);

    if (fetchErr) throw fetchErr;

    const staleIds: string[] = Array.isArray(stale) ? stale.map(r => r.id) : [];

    if (staleIds.length === 0) {
      return new Response(
        JSON.stringify({ resolved: 0, message: 'No stale incidents found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
      );
    }

    // ── 3. Resolve them ─────────────────────────────────────────────────────
    const now = new Date().toISOString();
    const { error: updateErr } = await supabase
      .from('live_incidents')
      .update({ status: 'RESOLVED', resolved_at: now })
      .in('id', staleIds);

    if (updateErr) throw updateErr;

    console.log(`auto-resolve: resolved ${staleIds.length} stale incident(s) (cutoff=${cutoff})`);

    return new Response(
      JSON.stringify({
        resolved: staleIds.length,
        ids: staleIds,
        cutoff,
        timeout_hours: hours,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
    );

  } catch (err) {
    console.error('auto-resolve error:', err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 },
    );
  }
});
