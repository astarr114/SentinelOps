import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// PPT color palette: Tech & Night (#000814 navy dark, amber #FFB703, deep navy #003566)
const PALETTE = {
  bg:      "0a0e14",   // deep space background
  panel:   "151a21",   // elevated panel
  border:  "1f2937",   // border
  amber:   "f59e0b",   // primary accent / critical
  red:     "dc2626",   // critical red
  orange:  "f97316",   // high orange
  teal:    "14b8a6",   // success / low
  blue:    "3b82f6",   // info / demo mode
  white:   "ffffff",   // primary text
  gray1:   "94a3b8",   // secondary text
  gray2:   "475569",   // tertiary
  gray3:   "1e293b",   // card bg
};

const SEV_COLOR: Record<string, string> = {
  CRITICAL: "dc2626",
  HIGH:     "f97316",
  MEDIUM:   "f59e0b",
  LOW:      "14b8a6",
};

// Return confidence bar fill color
function confColor(c: number): string {
  if (c >= 0.8) return "dc2626";
  if (c >= 0.65) return "f97316";
  if (c >= 0.45) return "f59e0b";
  return "14b8a6";
}

function formatTs(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
  } catch { return iso; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "POST required" }), { status: 405, headers: { ...CORS, "Content-Type": "application/json" } });

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }); }

  const { analysis, incident } = body as {
    analysis: {
      incidentId: string;
      summary: string;
      generatedAt: string;
      hypotheses: Array<{ title: string; confidence: number; category: string; evidence: string[] }>;
      blastRadius: { services: string[]; endpoints: string[]; estimated_users_affected?: number; estimated_revenue_impact?: string };
      timeline: Array<{ timestamp: string; event: string; type: string; service?: string }>;
      recommendedActions: string[];
      openQuestions: string[];
      aiBrief?: { executiveSummary?: string; technicalFindings?: string; immediateRisk?: string };
    };
    incident: {
      id: string;
      title: string;
      severity: string;
      status: string;
      service: string;
      opened_at: string;
      time_window: string;
    };
  };

  if (!analysis || !incident) {
    return new Response(JSON.stringify({ error: "analysis and incident required" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
  }

  // Build PptxGenJS script as Node-compatible JS
  // We'll generate slides data as a JSON payload and build PPTX bytes using pptxgenjs via subprocess
  // Since edge functions can run Deno, we need to build the PPTX in JS and return as base64

  // Build the full slide generation script as a string, run with deno eval
  const script = buildPptScript(analysis, incident);

  // Write script to temp file and execute
  const tmpScript = `/tmp/ppt_gen_${Date.now()}.mjs`;
  const tmpOutput = `/tmp/ppt_out_${Date.now()}.pptx`;

  await Deno.writeTextFile(tmpScript, script.replace("OUTPUT_PATH", tmpOutput));

  const proc = new Deno.Command("node", {
    args: [tmpScript],
    stdout: "piped",
    stderr: "piped",
  });

  const result = await proc.output();
  if (!result.success) {
    const stderr = new TextDecoder().decode(result.stderr);
    console.error("PPT generation failed:", stderr);
    return new Response(JSON.stringify({ error: "PPT generation failed", details: stderr.slice(0, 500) }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  // Read generated PPTX bytes
  let pptxBytes: Uint8Array;
  try {
    pptxBytes = await Deno.readFile(tmpOutput);
  } catch (e) {
    return new Response(JSON.stringify({ error: "Failed to read generated file" }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  // Clean up
  try { await Deno.remove(tmpScript); await Deno.remove(tmpOutput); } catch { /* ignore */ }

  return new Response(pptxBytes, {
    headers: {
      ...CORS,
      "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "Content-Disposition": `attachment; filename="${incident.id}-briefing.pptx"`,
      "Content-Length": pptxBytes.length.toString(),
    },
  });
});

function buildPptScript(analysis: Record<string, unknown>, incident: Record<string, unknown>): string {
  const inc = incident as { id: string; title: string; severity: string; status: string; service: string; opened_at: string; time_window: string };
  const an = analysis as {
    incidentId: string; summary: string; generatedAt: string;
    hypotheses: Array<{ title: string; confidence: number; category: string; evidence: string[] }>;
    blastRadius: { services: string[]; endpoints: string[]; estimated_users_affected?: number; estimated_revenue_impact?: string };
    timeline: Array<{ timestamp: string; event: string; type: string; service?: string }>;
    recommendedActions: string[];
    openQuestions: string[];
    aiBrief?: { executiveSummary?: string; technicalFindings?: string; immediateRisk?: string };
  };

  const sevColor = SEV_COLOR[inc.severity] ?? "f59e0b";
  const briefSummary = an.aiBrief?.executiveSummary ?? an.summary ?? "";
  const technicalFindings = an.aiBrief?.technicalFindings ?? "";
  const immediateRisk = an.aiBrief?.immediateRisk ?? "";
  const genDate = formatTs(an.generatedAt ?? new Date().toISOString());

  // Truncate long strings
  const truncate = (s: string, n: number) => s.length > n ? s.slice(0, n - 1) + "…" : s;

  return `
const pptxgen = require('pptxgenjs');
const pres = new pptxgen();
pres.layout = 'LAYOUT_16x9';
pres.title = 'Incident Briefing ${inc.id}';
pres.author = 'SentinelOps';

const P = {
  bg:     '0a0e14',
  panel:  '151a21',
  border: '1f2937',
  amber:  'f59e0b',
  red:    'dc2626',
  orange: 'f97316',
  teal:   '14b8a6',
  blue:   '3b82f6',
  white:  'ffffff',
  gray1:  '94a3b8',
  gray2:  '475569',
  gray3:  '1e293b',
  sev:    '${sevColor}',
};

// ─── Slide 1: COVER ────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  s.background = { color: P.bg };

  // Left accent bar
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 0.22, h: 5.625, fill: { color: P.sev }, line: { color: P.sev, width: 0 } });

  // Brand header row
  s.addShape(pres.shapes.RECTANGLE, { x: 0.22, y: 0, w: 9.78, h: 0.55, fill: { color: P.panel }, line: { color: P.border, width: 1 } });
  s.addText('SentinelOps', { x: 0.4, y: 0, w: 4, h: 0.55, fontSize: 13, bold: true, color: P.amber, fontFace: 'Arial', valign: 'middle', margin: 0, shrinkText: true });
  s.addText('AGENTIC INCIDENT COMMANDER', { x: 4.4, y: 0, w: 5.4, h: 0.55, fontSize: 9, color: P.gray1, fontFace: 'Arial', align: 'right', valign: 'middle', charSpacing: 3, margin: 0, shrinkText: true });

  // Incident ID badge
  s.addShape(pres.shapes.RECTANGLE, { x: 0.5, y: 0.85, w: 2.0, h: 0.42, fill: { color: P.sev }, line: { color: P.sev, width: 0 }, rectRadius: 0.05 });
  s.addText('${inc.id}', { x: 0.5, y: 0.85, w: 2.0, h: 0.42, fontSize: 14, bold: true, color: P.white, fontFace: 'Arial', align: 'center', valign: 'middle', margin: 0, shrinkText: true });

  // Severity badge
  s.addShape(pres.shapes.RECTANGLE, { x: 2.65, y: 0.85, w: 1.6, h: 0.42, fill: { color: P.sev, transparency: 80 }, line: { color: P.sev, width: 1 }, rectRadius: 0.05 });
  s.addText('${inc.severity}', { x: 2.65, y: 0.85, w: 1.6, h: 0.42, fontSize: 11, bold: true, color: P.sev, fontFace: 'Arial', align: 'center', valign: 'middle', charSpacing: 2, margin: 0, shrinkText: true });

  // Title
  s.addText(${JSON.stringify(truncate(inc.title, 80))}, {
    x: 0.5, y: 1.48, w: 8.8, h: 1.5, fontSize: 26, bold: true, color: P.white, fontFace: 'Arial',
    valign: 'top', autoFit: true, margin: 0,
  });

  // Metadata row
  const metaY = 3.15;
  const metaItems = [
    { label: 'SERVICE', value: '${inc.service}' },
    { label: 'STATUS', value: '${inc.status}' },
    { label: 'OPENED', value: '${formatTs(inc.opened_at)}' },
    { label: 'WINDOW', value: '${inc.time_window.replace("last_", "Last ").replace("m", " min").replace("h", " hr")}' },
  ];
  metaItems.forEach((m, i) => {
    const bx = 0.5 + i * 2.28;
    s.addShape(pres.shapes.RECTANGLE, { x: bx, y: metaY, w: 2.1, h: 0.75, fill: { color: P.gray3 }, line: { color: P.border, width: 1 }, rectRadius: 0.05 });
    s.addText(m.label, { x: bx + 0.1, y: metaY + 0.06, w: 1.9, h: 0.22, fontSize: 8, color: P.gray1, fontFace: 'Arial', charSpacing: 2, shrinkText: true, margin: 0 });
    s.addText(m.value, { x: bx + 0.1, y: metaY + 0.3, w: 1.9, h: 0.3, fontSize: 11, bold: true, color: P.white, fontFace: 'Arial', shrinkText: true, margin: 0 });
  });

  // Divider
  s.addShape(pres.shapes.LINE, { x: 0.5, y: 4.1, w: 8.8, h: 0, line: { color: P.border, width: 1 } });
  s.addText('Generated by SentinelOps · Confidential · ${genDate}', {
    x: 0.5, y: 4.2, w: 8.8, h: 0.3, fontSize: 9, color: P.gray2, fontFace: 'Arial', align: 'center', shrinkText: true, margin: 0,
  });

  // Page indicator
  s.addText('1 / 6', { x: 9.3, y: 5.1, w: 0.6, h: 0.3, fontSize: 9, color: P.gray2, fontFace: 'Arial', align: 'right', shrinkText: true, margin: 0 });
}

// ─── Slide 2: INCIDENT SUMMARY ──────────────────────────────────────────────
{
  const s = pres.addSlide();
  s.background = { color: P.bg };

  // Header bar
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.6, fill: { color: P.panel }, line: { color: P.border, width: 1 } });
  s.addText('INCIDENT SUMMARY', { x: 0.4, y: 0, w: 6, h: 0.6, fontSize: 11, bold: true, color: P.amber, fontFace: 'Arial', valign: 'middle', charSpacing: 3, margin: 0, shrinkText: true });
  s.addText('${inc.id}', { x: 6, y: 0, w: 3.7, h: 0.6, fontSize: 11, color: P.gray1, fontFace: 'Arial', align: 'right', valign: 'middle', margin: 0, shrinkText: true });

  // Executive summary box
  s.addShape(pres.shapes.RECTANGLE, { x: 0.35, y: 0.85, w: 9.3, h: 1.55, fill: { color: P.gray3 }, line: { color: P.amber, width: 1 }, rectRadius: 0.07 });
  s.addText('Executive Summary', { x: 0.55, y: 0.92, w: 5, h: 0.28, fontSize: 9, color: P.amber, fontFace: 'Arial', bold: true, charSpacing: 2, shrinkText: true, margin: 0 });
  s.addText(${JSON.stringify(truncate(briefSummary, 400))}, {
    x: 0.55, y: 1.22, w: 9.0, h: 1.1, fontSize: 11, color: P.white, fontFace: 'Arial', autoFit: true, margin: 0,
  });

  // Technical findings (if present)
  if (${JSON.stringify(!!technicalFindings)}) {
    s.addShape(pres.shapes.RECTANGLE, { x: 0.35, y: 2.6, w: 9.3, h: 1.45, fill: { color: P.panel }, line: { color: P.border, width: 1 }, rectRadius: 0.07 });
    s.addText('Technical Findings', { x: 0.55, y: 2.67, w: 5, h: 0.28, fontSize: 9, color: P.gray1, fontFace: 'Arial', bold: true, charSpacing: 2, shrinkText: true, margin: 0 });
    s.addText(${JSON.stringify(truncate(technicalFindings, 350))}, {
      x: 0.55, y: 2.96, w: 9.0, h: 1.0, fontSize: 10, color: P.gray1, fontFace: 'Arial', autoFit: true, margin: 0,
    });
  }

  // Immediate risk warning
  if (${JSON.stringify(!!immediateRisk)}) {
    s.addShape(pres.shapes.RECTANGLE, { x: 0.35, y: 4.2, w: 9.3, h: 0.7, fill: { color: 'dc2626', transparency: 85 }, line: { color: P.red, width: 1 }, rectRadius: 0.07 });
    s.addText('⚠ IMMEDIATE RISK  ', { x: 0.55, y: 4.28, w: 2.2, h: 0.28, fontSize: 8, color: P.red, fontFace: 'Arial', bold: true, shrinkText: true, margin: 0 });
    s.addText(${JSON.stringify(truncate(immediateRisk, 200))}, { x: 2.55, y: 4.28, w: 6.9, h: 0.55, fontSize: 10, color: P.white, fontFace: 'Arial', autoFit: true, margin: 0 });
  }

  s.addText('2 / 6', { x: 9.3, y: 5.1, w: 0.6, h: 0.3, fontSize: 9, color: P.gray2, fontFace: 'Arial', align: 'right', shrinkText: true, margin: 0 });
}

// ─── Slide 3: ROOT CAUSE HYPOTHESES ─────────────────────────────────────────
{
  const s = pres.addSlide();
  s.background = { color: P.bg };

  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.6, fill: { color: P.panel }, line: { color: P.border, width: 1 } });
  s.addText('ROOT CAUSE HYPOTHESES', { x: 0.4, y: 0, w: 7, h: 0.6, fontSize: 11, bold: true, color: P.amber, fontFace: 'Arial', valign: 'middle', charSpacing: 3, margin: 0, shrinkText: true });
  s.addText('Ranked by confidence score', { x: 5.5, y: 0, w: 4.2, h: 0.6, fontSize: 9, color: P.gray1, fontFace: 'Arial', align: 'right', valign: 'middle', margin: 0, shrinkText: true });

  const hypotheses = ${JSON.stringify(an.hypotheses.slice(0, 3))};
  const rowH = 1.48;
  hypotheses.forEach((h, i) => {
    const ry = 0.75 + i * (rowH + 0.07);
    const pct = Math.round(h.confidence * 100);
    const barColor = ${JSON.stringify(an.hypotheses.map(h => confColor(h.confidence)))};
    const bc = barColor[i] || 'f59e0b';

    s.addShape(pres.shapes.RECTANGLE, { x: 0.35, y: ry, w: 9.3, h: rowH, fill: { color: P.panel }, line: { color: P.border, width: 1 }, rectRadius: 0.07 });

    // Rank badge
    s.addShape(pres.shapes.OVAL, { x: 0.5, y: ry + 0.08, w: 0.38, h: 0.38, fill: { color: bc }, line: { color: bc, width: 0 } });
    s.addText(String(i + 1), { x: 0.5, y: ry + 0.08, w: 0.38, h: 0.38, fontSize: 13, bold: true, color: P.white, fontFace: 'Arial', align: 'center', valign: 'middle', shrinkText: true, margin: 0 });

    // Title
    s.addText(h.title, { x: 1.02, y: ry + 0.08, w: 6.3, h: 0.38, fontSize: 12, bold: true, color: P.white, fontFace: 'Arial', shrinkText: true, margin: 0 });

    // Confidence % label
    s.addText(pct + '%', { x: 8.4, y: ry + 0.08, w: 1.1, h: 0.38, fontSize: 15, bold: true, color: bc, fontFace: 'Arial', align: 'right', valign: 'middle', shrinkText: true, margin: 0 });

    // Confidence bar background
    const barY = ry + 0.54;
    const barW = 8.5;
    s.addShape(pres.shapes.RECTANGLE, { x: 0.55, y: barY, w: barW, h: 0.14, fill: { color: P.gray2, transparency: 70 }, line: { color: P.border, width: 0 }, rectRadius: 0.07 });
    s.addShape(pres.shapes.RECTANGLE, { x: 0.55, y: barY, w: barW * h.confidence, h: 0.14, fill: { color: bc }, line: { color: bc, width: 0 }, rectRadius: 0.07 });

    // Evidence
    const ev0 = h.evidence[0] ? h.evidence[0].slice(0, 120) : '';
    const ev1 = h.evidence[1] ? h.evidence[1].slice(0, 120) : '';
    if (ev0) s.addText('· ' + ev0, { x: 0.6, y: ry + 0.76, w: 8.8, h: 0.25, fontSize: 9, color: P.gray1, fontFace: 'Arial', shrinkText: true, margin: 0 });
    if (ev1) s.addText('· ' + ev1, { x: 0.6, y: ry + 1.03, w: 8.8, h: 0.25, fontSize: 9, color: P.gray1, fontFace: 'Arial', shrinkText: true, margin: 0 });
  });

  s.addText('3 / 6', { x: 9.3, y: 5.1, w: 0.6, h: 0.3, fontSize: 9, color: P.gray2, fontFace: 'Arial', align: 'right', shrinkText: true, margin: 0 });
}

// ─── Slide 4: BLAST RADIUS ────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  s.background = { color: P.bg };

  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.6, fill: { color: P.panel }, line: { color: P.border, width: 1 } });
  s.addText('BLAST RADIUS', { x: 0.4, y: 0, w: 6, h: 0.6, fontSize: 11, bold: true, color: P.amber, fontFace: 'Arial', valign: 'middle', charSpacing: 3, margin: 0, shrinkText: true });
  s.addText('Impact Scope Assessment', { x: 5.5, y: 0, w: 4.2, h: 0.6, fontSize: 9, color: P.gray1, fontFace: 'Arial', align: 'right', valign: 'middle', margin: 0, shrinkText: true });

  const br = ${JSON.stringify(an.blastRadius)};
  const statCards = [
    { label: 'SERVICES AFFECTED', value: String(br.services.length), color: P.red },
    { label: 'ENDPOINTS HIT', value: String(br.endpoints.length), color: P.orange },
    { label: 'USERS IMPACTED', value: br.estimated_users_affected ? br.estimated_users_affected.toLocaleString() : 'N/A', color: P.amber },
    { label: 'REVENUE IMPACT', value: br.estimated_revenue_impact || 'Monitoring', color: P.gray1 },
  ];

  statCards.forEach((c, i) => {
    const cx = 0.35 + i * 2.36;
    s.addShape(pres.shapes.RECTANGLE, { x: cx, y: 0.8, w: 2.18, h: 1.05, fill: { color: P.gray3 }, line: { color: c.color, width: 1 }, rectRadius: 0.07 });
    s.addText(c.label, { x: cx + 0.1, y: 0.88, w: 2.0, h: 0.22, fontSize: 8, color: c.color, fontFace: 'Arial', bold: true, charSpacing: 1, shrinkText: true, margin: 0 });
    s.addText(c.value, { x: cx + 0.1, y: 1.14, w: 2.0, h: 0.55, fontSize: 20, bold: true, color: P.white, fontFace: 'Arial', shrinkText: true, margin: 0 });
  });

  // Services list
  s.addText('AFFECTED SERVICES', { x: 0.4, y: 2.05, w: 9, h: 0.28, fontSize: 9, color: P.gray1, bold: true, charSpacing: 2, fontFace: 'Arial', shrinkText: true, margin: 0 });
  s.addShape(pres.shapes.LINE, { x: 0.4, y: 2.34, w: 9.2, h: 0, line: { color: P.border, width: 1 } });

  const svcs = br.services.slice(0, 6);
  svcs.forEach((svc, i) => {
    const sy = 2.44 + i * 0.38;
    s.addShape(pres.shapes.RECTANGLE, { x: 0.4, y: sy, w: 4.25, h: 0.3, fill: { color: P.panel }, line: { color: P.border, width: 1 }, rectRadius: 0.04 });
    s.addShape(pres.shapes.OVAL, { x: 0.56, y: sy + 0.08, w: 0.14, h: 0.14, fill: { color: P.red }, line: { color: P.red, width: 0 } });
    s.addText(svc, { x: 0.78, y: sy + 0.02, w: 3.7, h: 0.26, fontSize: 10, color: P.white, fontFace: 'Arial', shrinkText: true, margin: 0 });
  });

  // Endpoints
  const eps = br.endpoints.slice(0, 5);
  if (eps.length > 0) {
    s.addText('AFFECTED ENDPOINTS', { x: 5.0, y: 2.05, w: 4.7, h: 0.28, fontSize: 9, color: P.gray1, bold: true, charSpacing: 2, fontFace: 'Arial', shrinkText: true, margin: 0 });
    s.addShape(pres.shapes.LINE, { x: 5.0, y: 2.34, w: 4.6, h: 0, line: { color: P.border, width: 1 } });
    eps.forEach((ep, i) => {
      const ey = 2.44 + i * 0.38;
      s.addShape(pres.shapes.RECTANGLE, { x: 5.0, y: ey, w: 4.6, h: 0.3, fill: { color: P.panel }, line: { color: P.border, width: 1 }, rectRadius: 0.04 });
      s.addText(ep, { x: 5.15, y: ey + 0.02, w: 4.3, h: 0.26, fontSize: 10, color: P.gray1, fontFace: 'Arial', shrinkText: true, margin: 0 });
    });
  }

  s.addText('4 / 6', { x: 9.3, y: 5.1, w: 0.6, h: 0.3, fontSize: 9, color: P.gray2, fontFace: 'Arial', align: 'right', shrinkText: true, margin: 0 });
}

// ─── Slide 5: EVENT TIMELINE ─────────────────────────────────────────────────
{
  const s = pres.addSlide();
  s.background = { color: P.bg };

  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.6, fill: { color: P.panel }, line: { color: P.border, width: 1 } });
  s.addText('EVENT TIMELINE', { x: 0.4, y: 0, w: 6, h: 0.6, fontSize: 11, bold: true, color: P.amber, fontFace: 'Arial', valign: 'middle', charSpacing: 3, margin: 0, shrinkText: true });
  s.addText('Chronological correlation of events', { x: 5.5, y: 0, w: 4.2, h: 0.6, fontSize: 9, color: P.gray1, fontFace: 'Arial', align: 'right', valign: 'middle', margin: 0, shrinkText: true });

  const tl = ${JSON.stringify(an.timeline.slice(0, 7))};
  const typeColors = { deploy: 'f97316', alert: 'dc2626', error: 'dc2626', recovery: '14b8a6', change: 'f59e0b', info: '3b82f6' };

  // Vertical timeline line
  s.addShape(pres.shapes.LINE, { x: 1.42, y: 0.75, w: 0, h: 4.6, line: { color: P.border, width: 2 } });

  tl.forEach((ev, i) => {
    const ey = 0.75 + i * 0.65;
    const ec = typeColors[ev.type] || '475569';

    // Timeline dot
    s.addShape(pres.shapes.OVAL, { x: 1.3, y: ey + 0.04, w: 0.24, h: 0.24, fill: { color: ec }, line: { color: ec, width: 0 } });

    // Timestamp
    const ts = (ev.timestamp || '').replace('T', ' ').slice(0, 16);
    s.addText(ts, { x: 0, y: ey, w: 1.2, h: 0.28, fontSize: 8, color: P.gray1, fontFace: 'Arial', align: 'right', shrinkText: true, margin: 0 });

    // Event card
    s.addShape(pres.shapes.RECTANGLE, { x: 1.72, y: ey, w: 7.9, h: 0.46, fill: { color: P.panel }, line: { color: ec, width: 1 }, rectRadius: 0.04 });

    // Type badge
    s.addShape(pres.shapes.RECTANGLE, { x: 1.72, y: ey, w: 0.85, h: 0.46, fill: { color: ec, transparency: 70 }, line: { color: ec, width: 0 }, rectRadius: 0.04 });
    s.addText((ev.type || '').toUpperCase(), { x: 1.72, y: ey, w: 0.85, h: 0.46, fontSize: 8, bold: true, color: P.white, fontFace: 'Arial', align: 'center', valign: 'middle', charSpacing: 1, shrinkText: true, margin: 0 });

    // Event text
    s.addText((ev.event || '').slice(0, 110), { x: 2.65, y: ey + 0.04, w: 6.8, h: 0.36, fontSize: 10, color: P.white, fontFace: 'Arial', shrinkText: true, margin: 0 });
  });

  s.addText('5 / 6', { x: 9.3, y: 5.1, w: 0.6, h: 0.3, fontSize: 9, color: P.gray2, fontFace: 'Arial', align: 'right', shrinkText: true, margin: 0 });
}

// ─── Slide 6: RECOMMENDED ACTIONS ───────────────────────────────────────────
{
  const s = pres.addSlide();
  s.background = { color: P.bg };

  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.6, fill: { color: P.panel }, line: { color: P.border, width: 1 } });
  s.addText('RECOMMENDED ACTIONS', { x: 0.4, y: 0, w: 7, h: 0.6, fontSize: 11, bold: true, color: P.amber, fontFace: 'Arial', valign: 'middle', charSpacing: 3, margin: 0, shrinkText: true });
  s.addText('Immediate next steps', { x: 6.5, y: 0, w: 3.2, h: 0.6, fontSize: 9, color: P.gray1, fontFace: 'Arial', align: 'right', valign: 'middle', margin: 0, shrinkText: true });

  const actions = ${JSON.stringify(an.recommendedActions.slice(0, 6))};
  const actionColors = [P.red, P.orange, P.amber, P.amber, P.gray1, P.gray1];

  actions.forEach((action, i) => {
    const ay = 0.8 + i * 0.73;
    const ac = actionColors[i] || P.gray1;
    s.addShape(pres.shapes.RECTANGLE, { x: 0.35, y: ay, w: 9.3, h: 0.6, fill: { color: P.panel }, line: { color: ac, width: 1 }, rectRadius: 0.06 });

    // Step number
    s.addShape(pres.shapes.RECTANGLE, { x: 0.35, y: ay, w: 0.55, h: 0.6, fill: { color: ac }, line: { color: ac, width: 0 }, rectRadius: 0.06 });
    s.addText(String(i + 1), { x: 0.35, y: ay, w: 0.55, h: 0.6, fontSize: 14, bold: true, color: P.white, fontFace: 'Arial', align: 'center', valign: 'middle', shrinkText: true, margin: 0 });

    // Action text
    s.addText(action.slice(0, 130), { x: 1.05, y: ay + 0.08, w: 8.4, h: 0.44, fontSize: 11, color: P.white, fontFace: 'Arial', shrinkText: true, margin: 0 });
  });

  // Footer
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 5.15, w: 10, h: 0.475, fill: { color: P.panel }, line: { color: P.border, width: 1 } });
  s.addText('SentinelOps — Agentic Incident Commander · Generated ${genDate} · CONFIDENTIAL', {
    x: 0.4, y: 5.2, w: 9.0, h: 0.3, fontSize: 8, color: P.gray2, fontFace: 'Arial', align: 'center', shrinkText: true, margin: 0,
  });
  s.addText('6 / 6', { x: 9.3, y: 5.1, w: 0.6, h: 0.3, fontSize: 9, color: P.gray2, fontFace: 'Arial', align: 'right', shrinkText: true, margin: 0 });
}

pres.writeFile({ fileName: 'OUTPUT_PATH' }).then(() => {
  process.exit(0);
}).catch(e => {
  console.error(e);
  process.exit(1);
});
`;
}
