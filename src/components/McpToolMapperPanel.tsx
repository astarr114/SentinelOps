// McpToolMapperPanel — displays all discovered Splunk MCP tools as interactive cards.
// Each card shows: name, description, default args editor, and a Run button.
// Results are shown inline below the card. Handles all 10 Splunk MCP tools.
// Includes a collapsible testing walkthrough guide for each tool.

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Search, Database, Info, Users, User, FileText,
  BookOpen, Box, BookMarked, ChevronDown, ChevronRight,
  Loader2, CheckCircle2, XCircle, Play, RotateCcw,
  BookCheck, ListOrdered, Lightbulb, ArrowRight,
} from 'lucide-react';
import { supabase } from '@/db/supabase';
import type { McpTool } from '@/contexts/SplunkContext';

// ─── Default sample arguments for each known Splunk MCP tool ─────────────────
const TOOL_DEFAULTS: Record<string, Record<string, unknown>> = {
  splunk_run_query:             { query: 'index=_internal | head 5', earliest_time: '-1h', latest_time: 'now', max_results: 10 },
  splunk_run_search:            { search: 'index=_internal | head 5', earliest_time: '-1h', latest_time: 'now', max_count: 10 },
  splunk_get_info:              {},
  splunk_get_indexes:           {},
  splunk_get_index_info:        { index: 'main' },
  splunk_get_user_list:         {},
  splunk_get_user_info:         { username: 'admin' },
  splunk_get_metadata:          { index: 'main', type: 'sourcetypes' },
  splunk_get_kv_store_collections: { app: 'search' },
  splunk_get_knowledge_objects: { object_type: 'savedsearches', app: 'search' },
  splunk_run_saved_search:      { saved_search_name: '' },
};

// ─── Icon map per tool ────────────────────────────────────────────────────────
const TOOL_ICON: Record<string, React.ElementType> = {
  splunk_run_query:             Search,
  splunk_run_search:            Search,
  splunk_get_info:              Info,
  splunk_get_indexes:           Database,
  splunk_get_index_info:        Database,
  splunk_get_user_list:         Users,
  splunk_get_user_info:         User,
  splunk_get_metadata:          FileText,
  splunk_get_kv_store_collections: Box,
  splunk_get_knowledge_objects: BookOpen,
  splunk_run_saved_search:      BookMarked,
};

// ─── Category grouping ────────────────────────────────────────────────────────
const TOOL_CATEGORY: Record<string, string> = {
  splunk_run_query:             'Search',
  splunk_run_search:            'Search',
  splunk_get_info:              'Server',
  splunk_get_indexes:           'Indexes',
  splunk_get_index_info:        'Indexes',
  splunk_get_user_list:         'Users',
  splunk_get_user_info:         'Users',
  splunk_get_metadata:          'Metadata',
  splunk_get_kv_store_collections: 'KV Store',
  splunk_get_knowledge_objects: 'Knowledge',
  splunk_run_saved_search:      'Saved Searches',
};

const CATEGORY_COLORS: Record<string, string> = {
  'Search':       'bg-blue-500/15 text-blue-400 border-blue-500/30',
  'Server':       'bg-purple-500/15 text-purple-400 border-purple-500/30',
  'Indexes':      'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
  'Users':        'bg-green-500/15 text-green-400 border-green-500/30',
  'Metadata':     'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  'KV Store':     'bg-orange-500/15 text-orange-400 border-orange-500/30',
  'Knowledge':    'bg-rose-500/15 text-rose-400 border-rose-500/30',
  'Saved Searches':'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
};

// ─── Props ────────────────────────────────────────────────────────────────────
interface McpToolMapperPanelProps {
  tools: McpTool[];
  mcpUrl: string;
  mcpToken: string;
  mcpAuthMethod?: 'bearer' | 'basic';
  mcpUsername?: string;
  mcpPassword?: string;
}

// ─── Single tool card ─────────────────────────────────────────────────────────
interface ToolCardState {
  argsText: string;
  isRunning: boolean;
  result: unknown | null;
  error: string;
  isOpen: boolean;
  hasRun: boolean;
}

function ToolCard({
  tool,
  mcpUrl,
  mcpToken,
  mcpAuthMethod = 'bearer',
  mcpUsername = '',
  mcpPassword = '',
}: {
  tool: McpTool;
  mcpUrl: string;
  mcpToken: string;
  mcpAuthMethod?: 'bearer' | 'basic';
  mcpUsername?: string;
  mcpPassword?: string;
}) {
  const defaultArgs = TOOL_DEFAULTS[tool.name] ?? {};
  const [state, setState] = useState<ToolCardState>({
    argsText: JSON.stringify(defaultArgs, null, 2),
    isRunning: false,
    result: null,
    error: '',
    isOpen: false,
    hasRun: false,
  });

  const Icon = TOOL_ICON[tool.name] ?? Search;
  const category = TOOL_CATEGORY[tool.name] ?? 'Tool';
  const categoryColor = CATEGORY_COLORS[category] ?? 'bg-muted text-muted-foreground border-border';

  async function runTool() {
    let toolArgs: Record<string, unknown> = {};
    try {
      toolArgs = JSON.parse(state.argsText || '{}');
    } catch {
      setState(s => ({ ...s, error: 'Invalid JSON in arguments field.', hasRun: true }));
      return;
    }
    setState(s => ({ ...s, isRunning: true, error: '', result: null, isOpen: true }));
    try {
      const { data, error } = await supabase.functions.invoke('splunk-mcp', {
        body: {
          mode: 'tool-call',
          toolName: tool.name,
          toolArgs,
          mcpUrl,
          mcpToken,
          mcpAuthMethod,
          mcpUsername,
          mcpPassword,
        },
      });
      if (error) {
        let msg = error.message;
        try { const raw = await error?.context?.text?.(); if (raw) { const p = JSON.parse(raw); msg = p?.error ?? p?.message ?? raw; } } catch { /* ignore */ }
        setState(s => ({ ...s, isRunning: false, error: msg || 'Tool call failed.', hasRun: true }));
        return;
      }
      setState(s => ({ ...s, isRunning: false, result: data?.toolResult ?? data?.result ?? data, hasRun: true }));
    } catch (e) {
      setState(s => ({ ...s, isRunning: false, error: e instanceof Error ? e.message : 'Unknown error.', hasRun: true }));
    }
  }

  function resetTool() {
    setState(s => ({ ...s, argsText: JSON.stringify(defaultArgs, null, 2), result: null, error: '', hasRun: false }));
  }

  const resultStr = state.result != null ? JSON.stringify(state.result, null, 2) : '';

  return (
    <Card className="bg-card border border-border">
      <CardHeader className="p-3 pb-2">
        <div className="flex items-start justify-between gap-2 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <Icon className="h-4 w-4 text-primary shrink-0" />
            <div className="min-w-0">
              <div className="font-mono text-xs font-semibold text-foreground truncate">{tool.name}</div>
              {tool.description && (
                <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{tool.description}</div>
              )}
            </div>
          </div>
          <Badge variant="outline" className={`shrink-0 text-[10px] px-1.5 py-0 border ${categoryColor}`}>
            {category}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="p-3 pt-0 space-y-2">
        {/* Arguments editor */}
        <div>
          <div className="text-[10px] text-muted-foreground mb-1 font-medium uppercase tracking-wide">Arguments (JSON)</div>
          <Textarea
            value={state.argsText}
            onChange={e => setState(s => ({ ...s, argsText: e.target.value }))}
            className="font-mono text-xs min-h-[72px] resize-y bg-background/50 border-border"
            spellCheck={false}
          />
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          <Button
            size="sm"
            className="flex-1 h-8 text-xs"
            onClick={runTool}
            disabled={state.isRunning || !mcpUrl}
          >
            {state.isRunning ? (
              <><Loader2 className="h-3 w-3 mr-1.5 animate-spin" />Running…</>
            ) : (
              <><Play className="h-3 w-3 mr-1.5" />Run Tool</>
            )}
          </Button>
          {state.hasRun && (
            <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={resetTool} title="Reset">
              <RotateCcw className="h-3 w-3" />
            </Button>
          )}
        </div>

        {/* Result / Error */}
        {state.hasRun && (
          <Collapsible open={state.isOpen} onOpenChange={o => setState(s => ({ ...s, isOpen: o }))}>
            <CollapsibleTrigger asChild>
              <button className="flex items-center gap-1.5 text-xs w-full text-left">
                {state.error ? (
                  <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                )}
                <span className={state.error ? 'text-destructive' : 'text-green-500'}>
                  {state.error ? 'Error' : 'Result'}
                </span>
                {state.isOpen ? <ChevronDown className="h-3 w-3 ml-auto text-muted-foreground" /> : <ChevronRight className="h-3 w-3 ml-auto text-muted-foreground" />}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <pre className="mt-1.5 text-[10px] leading-relaxed bg-background/60 border border-border rounded p-2 max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-foreground">
                {state.error || resultStr || '(no output)'}
              </pre>
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Testing walkthrough guide ────────────────────────────────────────────────
interface WalkthroughStep {
  tool: string;
  category: string;
  purpose: string;
  exampleArgs: string;
  expectedShape: string;
  tip?: string;
}

const WALKTHROUGH_STEPS: WalkthroughStep[] = [
  {
    tool: 'splunk_get_info',
    category: 'Server',
    purpose: 'Confirm MCP connection is alive and retrieve Splunk server metadata (version, OS, hostname).',
    exampleArgs: '{}',
    expectedShape: '{ serverName, version, os, build, ... }',
    tip: 'Always run this first — a successful response confirms auth + endpoint are both correct.',
  },
  {
    tool: 'splunk_get_indexes',
    category: 'Indexes',
    purpose: 'List all indexes available to the authenticated user.',
    exampleArgs: '{}',
    expectedShape: '[ { name, totalEventCount, currentDBSizeMB, ... }, ... ]',
    tip: 'Use the returned index names as the "index" arg in splunk_get_index_info and splunk_run_query.',
  },
  {
    tool: 'splunk_get_index_info',
    category: 'Indexes',
    purpose: 'Get size, event count, and retention policy for a specific index.',
    exampleArgs: '{ "index": "main" }',
    expectedShape: '{ name, totalEventCount, currentDBSizeMB, frozenTimePeriodInSecs, ... }',
    tip: 'Replace "main" with any index name from splunk_get_indexes.',
  },
  {
    tool: 'splunk_run_query',
    category: 'Search',
    purpose: 'Execute a raw SPL query and return up to max_results events.',
    exampleArgs: '{ "query": "index=_internal | head 5", "earliest_time": "-1h", "latest_time": "now", "max_results": 5 }',
    expectedShape: '{ results: [ { _time, _raw, ... }, ... ] }',
    tip: 'Start with index=_internal for a safe, always-available dataset. Increase max_results carefully — large result sets can time out.',
  },
  {
    tool: 'splunk_run_search',
    category: 'Search',
    purpose: 'Alternate search tool name used by some Splunk MCP deployments (synonym of splunk_run_query).',
    exampleArgs: '{ "search": "index=_internal | head 5", "earliest_time": "-1h", "latest_time": "now", "max_count": 5 }',
    expectedShape: '{ results: [ { _time, _raw, ... }, ... ] }',
    tip: 'If splunk_run_query is not in the tool list, SentinelOps automatically falls back to this tool name.',
  },
  {
    tool: 'splunk_get_user_list',
    category: 'Users',
    purpose: 'List all Splunk users visible to the authenticated account.',
    exampleArgs: '{}',
    expectedShape: '[ { name, roles, email, ... }, ... ]',
    tip: 'Requires the authenticated user to have list_users capability (admin or power role).',
  },
  {
    tool: 'splunk_get_user_info',
    category: 'Users',
    purpose: 'Get roles, capabilities, and email for a single Splunk user.',
    exampleArgs: '{ "username": "admin" }',
    expectedShape: '{ name, roles, capabilities, email, ... }',
    tip: 'Replace "admin" with any username from splunk_get_user_list.',
  },
  {
    tool: 'splunk_get_metadata',
    category: 'Metadata',
    purpose: 'Discover sourcetypes, sources, or hosts present in an index.',
    exampleArgs: '{ "index": "main", "type": "sourcetypes" }',
    expectedShape: '[ { value, count, recentTime, ... }, ... ]',
    tip: '"type" must be one of: "sourcetypes", "sources", or "hosts".',
  },
  {
    tool: 'splunk_get_kv_store_collections',
    category: 'KV Store',
    purpose: 'List all KV Store collections in a Splunk app.',
    exampleArgs: '{ "app": "search" }',
    expectedShape: '[ { name, fields, ... }, ... ]',
    tip: 'Use "search" for the built-in Search app, or specify a custom app name.',
  },
  {
    tool: 'splunk_get_knowledge_objects',
    category: 'Knowledge',
    purpose: 'Enumerate knowledge objects (saved searches, lookups, transforms, etc.) in a Splunk app.',
    exampleArgs: '{ "object_type": "savedsearches", "app": "search" }',
    expectedShape: '[ { name, search, schedule, ... }, ... ]',
    tip: 'object_type can be: "savedsearches", "transforms", "lookups", "eventtypes", "tags", "macros".',
  },
  {
    tool: 'splunk_run_saved_search',
    category: 'Saved Searches',
    purpose: 'Trigger an existing saved search by name and return its results.',
    exampleArgs: '{ "saved_search_name": "My Alert" }',
    expectedShape: '{ results: [ ... ] }',
    tip: 'Get a list of valid saved search names first using splunk_get_knowledge_objects with object_type="savedsearches".',
  },
];

const STEP_CATEGORY_COLORS: Record<string, string> = CATEGORY_COLORS;

function WalkthroughGuide() {
  const [open, setOpen] = useState(false);
  const [expandedStep, setExpandedStep] = useState<string | null>(null);

  return (
    <div className="rounded-lg border border-border bg-secondary/10">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <BookCheck className="h-3.5 w-3.5 text-emerald-400" />
          <span className="font-medium text-foreground">Testing Guide</span>
          <span className="text-muted-foreground">— step-by-step walkthrough for all 10 tools</span>
        </span>
        <ChevronRight className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>

      {open && (
        <div className="border-t border-border px-3 pb-4 pt-3 space-y-3">
          {/* Header */}
          <div className="flex items-start gap-2 rounded-lg border border-emerald-700/30 bg-emerald-950/20 px-3 py-2">
            <Lightbulb className="h-3.5 w-3.5 text-emerald-400 mt-0.5 shrink-0" />
            <p className="text-[11px] text-emerald-300/90 leading-relaxed">
              Follow these steps in order to validate your ngrok endpoint and bearer token against every Splunk MCP tool.
              Start with <strong className="text-emerald-300">splunk_get_info</strong> to confirm connectivity,
              then work through each category. Click a step to expand args and expected response shape.
            </p>
          </div>

          {/* Recommended order hint */}
          <div className="flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
            <span className="font-medium text-foreground">Recommended order:</span>
            {['Server', 'Indexes', 'Search', 'Users', 'Metadata', 'KV Store', 'Knowledge', 'Saved Searches'].map((cat, i, arr) => (
              <span key={cat} className="flex items-center gap-1">
                <span className={`px-1.5 py-0 rounded-full border text-[10px] ${STEP_CATEGORY_COLORS[cat] ?? ''}`}>{cat}</span>
                {i < arr.length - 1 && <ArrowRight className="h-2.5 w-2.5 text-muted-foreground/50" />}
              </span>
            ))}
          </div>

          {/* Steps */}
          <div className="space-y-1.5">
            {WALKTHROUGH_STEPS.map((step, idx) => {
              const isExpanded = expandedStep === step.tool;
              const catColor = STEP_CATEGORY_COLORS[step.category] ?? 'bg-muted/20 text-muted-foreground border-border';
              return (
                <div key={step.tool} className="rounded-lg border border-border bg-secondary/5 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setExpandedStep(isExpanded ? null : step.tool)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-secondary/20 transition-colors"
                  >
                    {/* Step number */}
                    <span className="shrink-0 flex items-center justify-center h-5 w-5 rounded-full bg-primary/20 text-primary text-[10px] font-bold">
                      {idx + 1}
                    </span>
                    {/* Tool name */}
                    <code className="flex-1 min-w-0 text-[11px] font-mono text-foreground truncate">
                      {step.tool}
                    </code>
                    {/* Category badge */}
                    <span className={`shrink-0 text-[9px] px-1.5 py-0.5 rounded-full border ${catColor}`}>
                      {step.category}
                    </span>
                    <ChevronDown className={`shrink-0 h-3 w-3 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </button>

                  {isExpanded && (
                    <div className="border-t border-border px-3 pb-3 pt-2 space-y-2">
                      {/* Purpose */}
                      <p className="text-[11px] text-muted-foreground leading-relaxed">{step.purpose}</p>

                      {/* Example args */}
                      <div className="space-y-1">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                          <ListOrdered className="h-3 w-3" /> Example arguments
                        </p>
                        <pre className="text-[10px] font-mono bg-secondary/40 border border-border rounded px-2 py-1.5 text-foreground whitespace-pre-wrap break-all">
                          {step.exampleArgs}
                        </pre>
                      </div>

                      {/* Expected response shape */}
                      <div className="space-y-1">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Expected response shape
                        </p>
                        <pre className="text-[10px] font-mono bg-secondary/40 border border-border rounded px-2 py-1.5 text-foreground whitespace-pre-wrap break-all">
                          {step.expectedShape}
                        </pre>
                      </div>

                      {/* Tip */}
                      {step.tip && (
                        <div className="flex items-start gap-1.5 rounded border border-amber-700/30 bg-amber-950/15 px-2 py-1.5">
                          <Lightbulb className="h-3 w-3 text-amber-400 mt-0.5 shrink-0" />
                          <p className="text-[10px] text-amber-300/90 leading-relaxed">{step.tip}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────
export function McpToolMapperPanel({
  tools,
  mcpUrl,
  mcpToken,
  mcpAuthMethod = 'bearer',
  mcpUsername = '',
  mcpPassword = '',
}: McpToolMapperPanelProps) {
  const [activeCategory, setActiveCategory] = useState<string>('All');

  if (!mcpUrl) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
        Configure MCP Server URL above to enable tool explorer.
      </div>
    );
  }

  if (tools.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
        No tools discovered yet — click <strong className="mx-1">Test MCP Connection</strong> to fetch the tool list.
      </div>
    );
  }

  // Build category filter list
  const categories = ['All', ...Array.from(new Set(tools.map(t => TOOL_CATEGORY[t.name] ?? 'Tool')))];
  const filtered = activeCategory === 'All'
    ? tools
    : tools.filter(t => (TOOL_CATEGORY[t.name] ?? 'Tool') === activeCategory);

  return (
    <div className="space-y-3">
      {/* Category filter pills */}
      <div className="flex flex-wrap gap-1.5">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-2.5 py-0.5 rounded-full text-xs border transition-colors ${
              activeCategory === cat
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-transparent text-muted-foreground border-border hover:border-primary/50 hover:text-foreground'
            }`}
          >
            {cat}
            {cat === 'All' ? ` (${tools.length})` : ` (${tools.filter(t => (TOOL_CATEGORY[t.name] ?? 'Tool') === cat).length})`}
          </button>
        ))}
      </div>

      {/* Tool cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {filtered.map(tool => (
          <ToolCard
            key={tool.name}
            tool={tool}
            mcpUrl={mcpUrl}
            mcpToken={mcpToken}
            mcpAuthMethod={mcpAuthMethod}
            mcpUsername={mcpUsername}
            mcpPassword={mcpPassword}
          />
        ))}
      </div>

      {/* Testing walkthrough guide — always visible regardless of active category filter */}
      <WalkthroughGuide />
    </div>
  );
}
