// SPL (Splunk Processing Language) client-side syntax validator
// Checks for structural errors before query execution

export interface SplValidationError {
  severity: 'error' | 'warning';
  message:  string;
  detail?:  string;
}

// Known valid top-level SPL commands (common subset)
const KNOWN_COMMANDS = new Set([
  'search', 'index', 'stats', 'timechart', 'chart', 'table', 'where',
  'eval', 'rex', 'regex', 'fields', 'rename', 'sort', 'dedup', 'top',
  'rare', 'head', 'tail', 'transaction', 'join', 'append', 'appendcols',
  'lookup', 'inputlookup', 'outputlookup', 'multikv', 'mvexpand',
  'fillnull', 'filldown', 'replace', 'convert', 'bucket', 'bin',
  'makeresults', 'gentimes', 'streamstats', 'eventstats', 'sistats',
  'addtotals', 'addcoltotals', 'delta', 'predict', 'anomalydetection',
  'cluster', 'typer', 'categorize', 'highlight', 'format', 'map',
  'sendemail', 'outputtext', 'kvform', 'sitimechart', 'sitop', 'sirare',
  'abstract', 'accum', 'associate', 'autoregress', 'contingency',
  'correlate', 'diff', 'erex', 'findtypes', 'folderize', 'gauge',
  'geostats', 'histogram', 'iconify', 'iplocation', 'kmeans',
  'loadjob', 'localize', 'metadata', 'metasearch', 'mvcombine',
  'rangemap', 'reltime', 'relevancy', 'reversedns', 'script',
  'selfjoin', 'set', 'settags', 'sichart', 'tags', 'trendline',
  'tscollect', 'typelearner', 'typer', 'union', 'untable', 'walklex',
  'xmlkv', 'xmlunescape', 'xpath', 'xyseries',
  // macros / common shortcuts
  'from', 'collect', 'sendalert',
]);

// Commands that look like SPL but are commonly misspelled
const COMMON_MISSPELLINGS: Record<string, string> = {
  'statistic': 'stats', 'statictics': 'stats', 'stat': 'stats',
  'timeseries': 'timechart', 'timechart': 'timechart',
  'evaluate': 'eval', 'evaluates': 'eval',
  'tabel': 'table', 'tables': 'table',
  'searh': 'search', 'serach': 'search',
  'feilds': 'fields', 'field': 'fields',
  'sor': 'sort', 'shorts': 'sort',
  'were': 'where',
  'grup': 'stats',
  'count': 'stats count',
  'agg': 'stats',
  'grp': 'stats',
};

/**
 * Validates an SPL query string and returns any errors/warnings.
 * Returns empty array if the query looks valid.
 */
export function validateSpl(spl: string): SplValidationError[] {
  const errors: SplValidationError[] = [];
  if (!spl.trim()) return errors;

  // ── 1. Balanced quotes ──────────────────────────────────────────────────────
  const doubleQuoteCount = (spl.match(/"/g) ?? []).length;
  const singleQuoteCount = (spl.match(/'/g) ?? []).length;
  if (doubleQuoteCount % 2 !== 0) {
    errors.push({ severity: 'error', message: 'Unbalanced double quotes', detail: 'Each opening " needs a matching closing ".' });
  }
  if (singleQuoteCount % 2 !== 0) {
    errors.push({ severity: 'error', message: 'Unbalanced single quotes', detail: "Each opening ' needs a matching closing '." });
  }

  // ── 2. Balanced brackets ────────────────────────────────────────────────────
  const openBrackets  = (spl.match(/\[/g) ?? []).length;
  const closeBrackets = (spl.match(/\]/g) ?? []).length;
  if (openBrackets !== closeBrackets) {
    errors.push({ severity: 'error', message: 'Unbalanced square brackets', detail: `Found ${openBrackets} opening and ${closeBrackets} closing brackets.` });
  }
  const openParens  = (spl.match(/\(/g) ?? []).length;
  const closeParens = (spl.match(/\)/g) ?? []).length;
  if (openParens !== closeParens) {
    errors.push({ severity: 'error', message: 'Unbalanced parentheses', detail: `Found ${openParens} opening and ${closeParens} closing parens.` });
  }

  // ── 3. Split into pipe segments ─────────────────────────────────────────────
  // Strip quoted strings first to avoid splitting on pipes inside quotes
  const stripped = spl.replace(/"[^"]*"/g, '""').replace(/'[^']*'/g, "''");
  const segments = stripped.split('|').map((_, i) => spl.split('|')[i].trim());

  // ── 4. Leading/trailing/consecutive pipe check ──────────────────────────────
  if (spl.trimStart().startsWith('|')) {
    // Only flag if the very first pipe isn't a subsearch [ | ... ]
    const firstNonWs = spl.trim();
    if (!firstNonWs.startsWith('[')) {
      errors.push({ severity: 'error', message: 'Query starts with a pipe (|)', detail: 'The first search segment must be a search command or index selector, not a pipe.' });
    }
  }
  if (spl.trimEnd().endsWith('|')) {
    errors.push({ severity: 'error', message: 'Trailing pipe at end of query', detail: 'Remove the trailing | or add a command after it.' });
  }
  segments.forEach((seg, idx) => {
    if (idx > 0 && seg.trim() === '') {
      errors.push({ severity: 'error', message: `Empty pipe segment at position ${idx + 1}`, detail: 'Remove the consecutive || or add a command between the pipes.' });
    }
  });

  // ── 5. Check each pipe segment's leading command ───────────────────────────
  segments.forEach((seg, idx) => {
    const trimmed = seg.trim();
    if (!trimmed) return;

    // First segment can start with index=, source=, sourcetype=, or a bare keyword
    if (idx === 0) {
      // OK: starts with "search", "index=", "source=", "sourcetype=", or a known command
      if (
        trimmed.startsWith('index=') ||
        trimmed.startsWith('source=') ||
        trimmed.startsWith('sourcetype=') ||
        trimmed.startsWith('*') ||
        trimmed.startsWith('"') ||
        trimmed.startsWith("'")
      ) return;
    }

    const cmdToken = trimmed.split(/\s+/)[0].toLowerCase();
    if (!cmdToken) return;

    // Skip subsearch brackets
    if (cmdToken === '[' || cmdToken.startsWith('[')) return;

    if (!KNOWN_COMMANDS.has(cmdToken)) {
      const suggestion = COMMON_MISSPELLINGS[cmdToken];
      if (suggestion) {
        errors.push({
          severity: 'error',
          message:  `Unknown command "${cmdToken}"`,
          detail:   `Did you mean "${suggestion}"? Segment ${idx + 1}: "${trimmed.slice(0, 60)}${trimmed.length > 60 ? '…' : ''}"`,
        });
      } else if (cmdToken.length > 2 && !cmdToken.includes('=')) {
        // Only warn for token-like strings, not "key=value" pairs
        errors.push({
          severity: 'warning',
          message:  `Unrecognized command "${cmdToken}"`,
          detail:   `"${cmdToken}" is not a known SPL command. Segment ${idx + 1}: "${trimmed.slice(0, 60)}${trimmed.length > 60 ? '…' : ''}"`,
        });
      }
    }
  });

  // ── 6. Stats/timechart without BY or aggregation ───────────────────────────
  if (/\|\s*(stats|timechart)\s*\|/i.test(spl)) {
    errors.push({ severity: 'error', message: 'stats/timechart with no aggregation', detail: 'stats and timechart require at least one aggregation function (count, avg, sum, max, min, …).' });
  }

  // ── 7. eval without assignment ────────────────────────────────────────────
  if (/\|\s*eval\s+(?![\w]+\s*=)/i.test(spl)) {
    errors.push({ severity: 'warning', message: 'eval without assignment', detail: 'eval requires "field = expression" syntax, e.g. | eval status_code = tonumber(status).' });
  }

  return errors;
}
