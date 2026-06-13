// SplAutocomplete — shows command + field suggestions as the user types
// in the NL→SPL question box.
// Shows when: the user starts typing a word that matches a known SPL token,
// or when pressing Ctrl+Space anywhere in the field.

import { useState, useEffect, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';

// ── SPL command catalogue (same set as splValidator) ──────────────────────────
const SPL_COMMANDS = [
  'search', 'index', 'stats', 'timechart', 'chart', 'table', 'where',
  'eval', 'rex', 'regex', 'fields', 'rename', 'sort', 'dedup', 'top',
  'rare', 'head', 'tail', 'transaction', 'join', 'append', 'appendcols',
  'lookup', 'inputlookup', 'outputlookup', 'multikv', 'mvexpand',
  'fillnull', 'filldown', 'replace', 'convert', 'bucket', 'bin',
  'makeresults', 'gentimes', 'streamstats', 'eventstats', 'addtotals',
  'delta', 'predict', 'cluster', 'geostats', 'histogram', 'iplocation',
  'kmeans', 'metadata', 'metasearch', 'mvcombine', 'reltime', 'selfjoin',
  'set', 'trendline', 'union', 'untable', 'xyseries', 'from', 'collect',
];

// Common Splunk field names
const SPL_FIELDS = [
  'index', 'source', 'sourcetype', 'host', 'service', 'severity', 'status',
  'level', 'message', 'duration_ms', 'endpoint', 'method', 'user_id',
  'trace_id', 'span_id', 'error_code', 'response_time', 'bytes',
  'action', 'category', 'version', 'environment', 'region',
  'container_id', 'pod_name', 'namespace', 'cluster', 'node',
];

// Aggregation functions
const SPL_FUNCTIONS = [
  'count', 'sum', 'avg', 'min', 'max', 'stdev', 'var', 'range', 'median',
  'mode', 'p50', 'p90', 'p95', 'p99', 'first', 'last', 'list', 'values',
  'dc', 'earliest', 'latest', 'rate', 'sparkline',
];

// Common NL query patterns the user can expand
const NL_PATTERNS = [
  'Show error rate for {service} in last 30 minutes',
  'Find deployments before incident start time',
  'List top failing endpoints for {service}',
  'Show latency spike for {service} in last 1 hour',
  'Count errors by status code for {service}',
  'Show log volume over time for {service}',
  'Find CRITICAL errors in {service} in last 2 hours',
  'Show p99 response time for {service}',
  'List unique users affected by {service} errors',
  'Show error pattern frequency for {service}',
];

export interface AutocompleteSuggestion {
  value:    string;
  type:     'command' | 'field' | 'function' | 'pattern';
  label?:   string;
}

interface SplAutocompleteProps {
  value:        string;
  onChange:     (val: string) => void;
  onSubmit?:    () => void;
  service?:     string;
  placeholder?: string;
  className?:   string;
  disabled?:    boolean;
}

/** Extract the last "word token" from the cursor position in a string */
function getLastToken(text: string): string {
  const words = text.split(/\s+/);
  return words[words.length - 1] ?? '';
}

/** Build sorted suggestions for a given prefix token */
function getSuggestions(token: string, service: string): AutocompleteSuggestion[] {
  if (!token || token.length < 1) return [];
  const lc = token.toLowerCase();

  const results: AutocompleteSuggestion[] = [];

  // NL patterns if user typed >= 4 chars
  if (token.length >= 4) {
    NL_PATTERNS
      .filter(p => p.toLowerCase().includes(lc))
      .slice(0, 3)
      .forEach(p => results.push({
        value: service ? p.replace(/\{service\}/g, service) : p,
        type: 'pattern',
        label: 'pattern',
      }));
  }

  // SPL commands
  SPL_COMMANDS
    .filter(c => c.startsWith(lc))
    .slice(0, 4)
    .forEach(c => results.push({ value: c, type: 'command', label: 'cmd' }));

  // SPL fields
  SPL_FIELDS
    .filter(f => f.startsWith(lc))
    .slice(0, 4)
    .forEach(f => results.push({ value: f, type: 'field', label: 'field' }));

  // Aggregation functions
  SPL_FUNCTIONS
    .filter(fn => fn.startsWith(lc))
    .slice(0, 3)
    .forEach(fn => results.push({ value: fn, type: 'function', label: 'fn' }));

  return results.slice(0, 8);
}

const TYPE_COLORS: Record<AutocompleteSuggestion['type'], string> = {
  command:  'text-cyan-400  bg-cyan-400/10  border-cyan-500/30',
  field:    'text-green-400 bg-green-400/10 border-green-500/30',
  function: 'text-purple-400 bg-purple-400/10 border-purple-500/30',
  pattern:  'text-orange-400 bg-orange-400/10 border-orange-500/30',
};

export function SplAutocomplete({
  value, onChange, onSubmit, service = '', placeholder, className, disabled,
}: SplAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<AutocompleteSuggestion[]>([]);
  const [activeIdx,   setActiveIdx]   = useState(-1);
  const [forceOpen,   setForceOpen]   = useState(false);
  const inputRef    = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Rebuild suggestion list whenever value changes
  useEffect(() => {
    const token = getLastToken(value);
    if (forceOpen && !token) {
      // Ctrl+Space with no token → show all NL patterns
      setSuggestions(NL_PATTERNS.slice(0, 6).map(p => ({
        value:  service ? p.replace(/\{service\}/g, service) : p,
        type:   'pattern' as const,
        label:  'pattern',
      })));
      setActiveIdx(-1);
    } else {
      const s = getSuggestions(token, service);
      setSuggestions(s);
      setActiveIdx(-1);
      if (!token) setForceOpen(false);
    }
  }, [value, service, forceOpen]);

  const applySelection = useCallback((suggestion: AutocompleteSuggestion) => {
    if (suggestion.type === 'pattern') {
      // Replace entire value with the pattern
      onChange(suggestion.value);
    } else {
      // Replace only last token
      const words = value.split(/(\s+)/);
      words[words.length - 1] = suggestion.value;
      onChange(words.join(''));
    }
    setSuggestions([]);
    setForceOpen(false);
    inputRef.current?.focus();
  }, [value, onChange]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.ctrlKey && e.key === ' ') {
      e.preventDefault();
      setForceOpen(true);
      return;
    }
    if (!suggestions.length) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSubmit?.(); }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx(i => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, -1));
    } else if (e.key === 'Enter' && activeIdx >= 0) {
      e.preventDefault();
      applySelection(suggestions[activeIdx]);
    } else if (e.key === 'Tab' && suggestions.length) {
      e.preventDefault();
      applySelection(suggestions[activeIdx >= 0 ? activeIdx : 0]);
    } else if (e.key === 'Escape') {
      setSuggestions([]);
      setForceOpen(false);
    } else if (e.key === 'Enter' && !e.shiftKey && activeIdx < 0) {
      e.preventDefault();
      onSubmit?.();
    }
  };

  const showDropdown = suggestions.length > 0;

  return (
    <div className="relative w-full">
      <textarea
        ref={inputRef}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => { setSuggestions([]); setForceOpen(false); }, 150)}
        disabled={disabled}
        rows={2}
        placeholder={placeholder}
        spellCheck={false}
        className={cn(
          'w-full resize-none rounded-lg border border-border bg-secondary/30 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground',
          'focus:outline-none focus:ring-1 focus:ring-ring font-mono',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          className
        )}
      />
      {/* Ctrl+Space hint */}
      <span className="absolute bottom-1.5 right-2 text-[10px] text-muted-foreground/40 pointer-events-none select-none">
        Ctrl+Space
      </span>

      {/* Dropdown */}
      {showDropdown && (
        <div
          ref={dropdownRef}
          className="absolute z-50 top-full left-0 mt-1 w-full min-w-[220px] rounded-lg border border-border bg-popover shadow-lg overflow-hidden"
        >
          <div className="px-2 py-1 border-b border-border flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Suggestions</span>
            <span className="text-[10px] text-muted-foreground ml-auto">Tab/↵ to apply · Esc to close</span>
          </div>
          <ul className="py-0.5 max-h-52 overflow-y-auto">
            {suggestions.map((s, i) => (
              <li key={`${s.type}-${s.value}`}>
                <button
                  type="button"
                  onMouseDown={e => { e.preventDefault(); applySelection(s); }}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-left transition-colors',
                    i === activeIdx
                      ? 'bg-accent text-accent-foreground'
                      : 'hover:bg-accent/50 text-foreground'
                  )}
                >
                  <span className={cn(
                    'shrink-0 text-[10px] font-bold px-1 py-px rounded border',
                    TYPE_COLORS[s.type]
                  )}>
                    {s.label ?? s.type}
                  </span>
                  <span className={cn(
                    'flex-1 min-w-0 font-mono text-xs truncate',
                    s.type === 'pattern' ? 'font-sans text-[11px]' : ''
                  )}>
                    {s.value}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
