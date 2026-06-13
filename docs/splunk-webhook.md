# SentinelOps — Splunk Webhook Integration

This document explains how to configure Splunk Enterprise 10.x to send alert
webhooks directly to SentinelOps, creating real-time incidents via Supabase
Realtime.

---

## How it works

```
Splunk alert fires
  └─► Webhook POST → https://<project>.supabase.co/functions/v1/splunk-alert-webhook?secret=<value>
        └─► Edge Function validates ?secret=, maps payload → live_incidents row
              └─► Supabase Realtime notifies SentinelOps UI → incident banner + dashboard update
```

---

## 1. Set the webhook secret (Supabase side)

The Edge Function reads a shared secret from the `SPLUNK_WEBHOOK_SECRET`
environment variable. Set it via the Supabase dashboard:

1. Go to **Supabase Dashboard → Edge Functions → splunk-alert-webhook → Secrets**.
2. Add a secret:
   - **Name**: `SPLUNK_WEBHOOK_SECRET`
   - **Value**: a strong random string, e.g. `openssl rand -hex 32`
3. Re-deploy or the secret will be picked up automatically on the next invocation.

> **Dev mode**: If `SPLUNK_WEBHOOK_SECRET` is not set, the function logs a
> warning and accepts all requests. Always set this in production.

---

## 2. Configure the Webhook URL in Splunk

Splunk Enterprise 10.x Webhook alert actions support **only a URL field** —
custom HTTP headers are not supported. The shared secret is therefore passed
as a `?secret=` query parameter.

### Webhook URL format

```
https://<project-ref>.supabase.co/functions/v1/splunk-alert-webhook?secret=<YOUR_SECRET>
```

Replace:
- `<project-ref>` — your Supabase project reference ID
- `<YOUR_SECRET>` — the value you set for `SPLUNK_WEBHOOK_SECRET` above

You can copy the base URL from **SentinelOps → Settings → Splunk REST API
Connection → Splunk Webhook Integration**.

### Steps in Splunk

1. Open the saved search you want to alert on.
2. Click **Edit → Edit Alert**.
3. Under **Trigger Actions**, click **Add Actions → Webhook**.
4. Set **URL** to the full webhook URL including `?secret=…`.
5. Leave **HTTP Method** as `POST`.
6. Leave **Payload** as the default JSON format.
7. Save.

### Add to Webhook allow list (Splunk 9 / 10)

Splunk requires webhook URLs to be explicitly allowed:

1. Go to **Settings → Server settings → Webhook allow list**.
2. Add the base URL (without `?secret=`):
   ```
   https://<project-ref>.supabase.co/functions/v1/splunk-alert-webhook
   ```
3. Save.

---

## 3. Expected Splunk payload

SentinelOps maps the standard Splunk Webhook JSON payload:

```json
{
  "result": {
    "_time": "2025-01-15T10:30:00.000+00:00",
    "service": "checkout-service",
    "severity": "CRITICAL",
    "message": "Error rate exceeded threshold",
    "host": "prod-web-01"
  },
  "sid": "scheduler_admin__RMD5d8ab...",
  "results_link": "https://splunk.example.com/app/search/@go?sid=...",
  "search_name": "SentinelOps - High error rate",
  "owner": "admin",
  "app": "search"
}
```

| Splunk field | Mapped to |
|---|---|
| `result.service` / `result.host` | `live_incidents.service` |
| `result.severity` | `live_incidents.severity` (CRITICAL/HIGH/MEDIUM/LOW) |
| `result.message` | incident summary |
| `search_name` | incident title |
| `sid` | incident ID prefix `INC-SPLUNK-<SID_SLUG>` |
| `results_link` | `live_incidents.splunk_results_link` |

---

## 4. Security notes

- The `?secret=` parameter is included in the URL. Ensure the Splunk Webhook
  allow list entry uses HTTPS to prevent secret exposure in transit.
- The Edge Function performs a **constant-time string comparison** to prevent
  timing attacks.
- Rotate `SPLUNK_WEBHOOK_SECRET` by updating the Supabase secret and the
  Splunk Webhook URL simultaneously.
- The `x-splunk-secret` header (used in older SentinelOps versions) is no
  longer supported — update any existing Splunk Webhook URLs to use `?secret=`.
