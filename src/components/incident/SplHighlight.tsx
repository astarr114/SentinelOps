/**
 * SplHighlight — zero-dependency SPL syntax highlighter
 *
 * Token colours (matches Splunk's own UI palette for familiarity):
 *   command   → cyan-300      e.g. index, search, stats, timechart, eval, where
 *   pipe      → orange-400    |
 *   field     → green-300     known field names & lhs of `=` after `BY` / `AS`
 *   string    → amber-300     "…" / '…'
 *   number    → teal-300      integers and floats
 *   keyword   → purple-300    BY, AS, NOT, AND, OR, OVER, WHERE, IN, LIKE, earliest, latest
 *   operator  → rose-300/dim  = != < > <= >= , ( )
 *   comment   → muted         `backtick` macro references
 *   default   → purple-200    everything else (unrecognised tokens)
 */

import { useMemo } from 'react';
import { cn } from '@/lib/utils';

// ── Token definitions ─────────────────────────────────────────────────────────

const SPL_COMMANDS = new Set([
  'index', 'search', 'stats', 'timechart', 'chart', 'table', 'top', 'rare',
  'head', 'tail', 'sort', 'dedup', 'eval', 'where', 'fields', 'rename',
  'rex', 'regex', 'lookup', 'inputlookup', 'outputlookup', 'join', 'append',
  'appendcols', 'transaction', 'bin', 'bucket', 'tstats', 'mstats',
  'metricsfwd', 'predict', 'anomalydetection', 'cluster', 'kmeans',
  'streamstats', 'eventstats', 'fillnull', 'filldown', 'delta', 'accum',
  'autoregress', 'convert', 'extract', 'kv', 'kvform', 'multikv',
  'outputtext', 'crawl', 'metadata', 'dbinspect', 'inputcsv', 'outputcsv',
  'makeresults', 'sendemail', 'sendalert', 'collect', 'mcollect',
  'typelearner', 'typer', 'xmlkv', 'xmlunescape', 'xpath',
  'map', 'return', 'set', 'union', 'format', 'mvexpand', 'mvkv',
  'nomv', 'makemv', 'mvcombine', 'mvjoin', 'sichart', 'sitimechart',
  'xyseries', 'untable', 'transpose', 'pivot',
]);

const SPL_KEYWORDS = new Set([
  'by', 'as', 'not', 'and', 'or', 'over', 'where', 'in', 'like',
  'earliest', 'latest', 'span', 'count', 'values', 'list', 'avg', 'sum',
  'min', 'max', 'median', 'mode', 'var', 'stdev', 'range', 'dc',
  'first', 'last', 'perc', 'p50', 'p75', 'p90', 'p95', 'p99',
  'true', 'false', 'null', 'now',
]);

const SPL_FIELDS = new Set([
  // Common Splunk fields
  'source', 'sourcetype', 'host', 'index', 'splunk_server', 'linecount',
  'punct', 'timeendpos', 'timestartpos', '_time', '_raw', '_bkt',
  '_cd', '_si', '_indextime', '_sourcetype', '_kv', '_serial',
  // Common app fields
  'status', 'method', 'uri', 'endpoint', 'url', 'path', 'service',
  'duration', 'duration_ms', 'latency', 'latency_ms', 'response_time',
  'level', 'severity', 'message', 'msg', 'error', 'exception',
  'user', 'user_id', 'session_id', 'request_id', 'trace_id', 'span_id',
  'http_status', 'status_code', 'bytes', 'bytes_in', 'bytes_out',
  'ip', 'client_ip', 'server_ip', 'dest', 'src', 'dvc',
  'action', 'event', 'event_type', 'category', 'namespace', 'pod',
  'container', 'node', 'cluster', 'region', 'zone', 'environment', 'env',
  'version', 'build', 'release', 'deploy', 'commit',
]);

// ── Tokenizer ─────────────────────────────────────────────────────────────────

type TokenKind = 'command' | 'keyword' | 'field' | 'string' | 'number' | 'pipe' | 'operator' | 'macro' | 'default';

interface Token { kind: TokenKind; text: string; }

/**
 * Tokenise a raw SPL string into an array of typed tokens.
 * Uses a single-pass regex split so that whitespace is preserved verbatim.
 */
function tokenise(spl: string): Token[] {
  // Master regex — order matters (most-specific first)
  const TOKEN_RE = /(`[^`]*`)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|([-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)|(earliest=|latest=|-\d+[mhdw]@?[mhdw]?)|([ \t\n\r]+)|(\|)|([()\[\]{}])|(=|!=|<=?|>=?|,)|([\w.]+)/g;

  const tokens: Token[] = [];
  let prevMeaningful: TokenKind | null = null;  // track context for field detection

  for (const m of spl.matchAll(TOKEN_RE)) {
    const [, macro, str, num, timemod, ws, pipe, bracket, op, word] = m;

    if (ws) {
      tokens.push({ kind: 'default', text: ws });
      continue;
    }
    if (macro) { tokens.push({ kind: 'macro', text: macro }); prevMeaningful = 'macro'; continue; }
    if (str)   { tokens.push({ kind: 'string', text: str }); prevMeaningful = 'string'; continue; }
    if (num || timemod) { tokens.push({ kind: 'number', text: num || timemod }); prevMeaningful = 'number'; continue; }
    if (pipe)  { tokens.push({ kind: 'pipe', text: pipe }); prevMeaningful = 'pipe'; continue; }
    if (bracket) { tokens.push({ kind: 'operator', text: bracket }); prevMeaningful = 'operator'; continue; }
    if (op)    { tokens.push({ kind: 'operator', text: op }); prevMeaningful = 'operator'; continue; }

    if (word) {
      const lower = word.toLowerCase();
      // Command: immediately after pipe OR at very start (prevMeaningful === null / 'pipe')
      if (SPL_COMMANDS.has(lower) && (prevMeaningful === null || prevMeaningful === 'pipe')) {
        tokens.push({ kind: 'command', text: word });
        prevMeaningful = 'command';
        continue;
      }
      // Keyword
      if (SPL_KEYWORDS.has(lower)) {
        tokens.push({ kind: 'keyword', text: word });
        prevMeaningful = 'keyword';
        continue;
      }
      // Known field names
      if (SPL_FIELDS.has(lower)) {
        tokens.push({ kind: 'field', text: word });
        prevMeaningful = 'field';
        continue;
      }
      // Heuristic: lhs of = that isn't a keyword/command → treat as field
      // We peek ahead by scanning the remaining match index, but easiest is:
      // if the previous non-ws token was an operator '=' or the word appears
      // before '=' in a BY / EVAL clause.
      // Simple approach: if it matches \w+ and is followed by '=' mark as field.
      // We'll do a 2-pass: first tokenise conservatively, then re-classify.
      tokens.push({ kind: 'default', text: word });
      prevMeaningful = 'default';
    }
  }

  // ── 2nd pass: reclassify `word =` patterns as field ──────────────────────
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].kind !== 'default') continue;
    // Skip whitespace tokens ahead to find next meaningful token
    let j = i + 1;
    while (j < tokens.length && tokens[j].kind === 'default' && /^\s+$/.test(tokens[j].text)) j++;
    if (j < tokens.length && tokens[j].text === '=') {
      tokens[i] = { kind: 'field', text: tokens[i].text };
    }
  }

  return tokens;
}

// ── Token → className mapping ─────────────────────────────────────────────────

const TOKEN_CLASS: Record<TokenKind, string> = {
  command:  'text-cyan-300 font-semibold',
  keyword:  'text-purple-300 font-medium',
  field:    'text-green-300',
  string:   'text-amber-300',
  number:   'text-teal-300',
  pipe:     'text-orange-400 font-bold',
  operator: 'text-rose-300/70',
  macro:    'text-muted-foreground italic',
  default:  'text-purple-200',
};

// ── Public component ──────────────────────────────────────────────────────────

interface SplHighlightProps {
  spl: string;
  className?: string;
}

export function SplHighlight({ spl, className }: SplHighlightProps) {
  const tokens = useMemo(() => tokenise(spl), [spl]);

  return (
    <pre
      className={cn(
        'text-[11px] font-mono whitespace-pre-wrap break-words leading-relaxed select-text',
        className,
      )}
      aria-label="Generated SPL query"
    >
      {tokens.map((tok, i) => (
        <span key={i} className={TOKEN_CLASS[tok.kind]}>{tok.text}</span>
      ))}
    </pre>
  );
}
