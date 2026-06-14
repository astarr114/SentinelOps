/**
 * Voice & Natural Language Command Center
 * - Browser SpeechRecognition (Web Audio API) with language selector
 * - Text NL queries → Gemini 2.5 Flash via large-language-model edge function
 * - Streaming AI response with action suggestions
 * - Action types: resolve, status, query, escalate, scale, notify
 * - Action execution history panel
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '@/hooks/useTheme';
import { cn } from '@/lib/utils';
import { supabase } from '@/db/supabase';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft, Sun, Moon, Mic, MicOff, Send, Bot, User,
  Loader2, RefreshCw, Zap, CheckCircle2, AlertTriangle,
  Activity, Server, Terminal, Sparkles, Volume2, X,
  History, TrendingUp, Bell, ChevronRight, Clock, Trash2,
} from 'lucide-react';
import { sendStreamRequest } from '@/lib/sse';

// ── Browser SpeechRecognition type shim ───────────────────────────────────────
interface ISpeechRecognition extends EventTarget {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  start(): void;
  stop(): void;
}
type ISpeechRecognitionCtor = new () => ISpeechRecognition;

// ── Types ─────────────────────────────────────────────────────────────────────
interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  streaming?: boolean;
  timestamp: string;
  actions?: ActionSuggestion[];
}

interface ActionSuggestion {
  type: 'resolve' | 'status' | 'query' | 'escalate' | 'scale' | 'notify';
  label: string;
  incidentId?: string;
  service?: string;
  target?: string;
}

interface ActionHistoryEntry {
  id: string;
  action: ActionSuggestion;
  executedAt: string;
  prompt: string;
}

interface LiveIncidentRow {
  id: string;
  title: string;
  service: string;
  severity: string;
  status: string;
  opened_at: string;
}

// ── Voice languages ────────────────────────────────────────────────────────────
const VOICE_LANGUAGES: { code: string; label: string }[] = [
  { code: 'en-US', label: '🇺🇸 English (US)' },
  { code: 'en-GB', label: '🇬🇧 English (UK)' },
  { code: 'en-IN', label: '🇮🇳 English (India)' },
  { code: 'es-ES', label: '🇪🇸 Spanish' },
  { code: 'fr-FR', label: '🇫🇷 French' },
  { code: 'de-DE', label: '🇩🇪 German' },
  { code: 'ja-JP', label: '🇯🇵 Japanese' },
  { code: 'zh-CN', label: '🇨🇳 Chinese (Mandarin)' },
  { code: 'pt-BR', label: '🇧🇷 Portuguese (Brazil)' },
  { code: 'ko-KR', label: '🇰🇷 Korean' },
];

// ── System prompt ──────────────────────────────────────────────────────────────
function buildSystemPrompt(incidents: LiveIncidentRow[]): string {
  const incidentSummary = incidents.slice(0, 10).map(i =>
    `• ${i.id} [${i.severity}] ${i.service}: "${i.title}" (${i.status})`
  ).join('\n');

  return `You are SentinelOps Command, an expert incident response AI assistant integrated into a real-time operations platform.

Current open incidents:
${incidentSummary || '• No open incidents'}

Your role:
- Answer questions about incidents, services, metrics, and system health
- Suggest concrete remediation actions (restart, scale, rollback, notify, escalate)
- Help the on-call engineer prioritise and resolve incidents quickly
- Parse natural language commands like "resolve checkout incident", "scale auth-service to 5 replicas", "notify the payments team"

Response style:
- Concise, direct, and actionable — you are talking to a tired on-call engineer
- Use bullet points for lists; keep responses under 200 words unless detail is explicitly requested
- For each response that suggests an action, end with a JSON block:
  {"actions":[{"type":"resolve|status|query|escalate|scale|notify","label":"...","incidentId":"...","service":"...","target":"..."}]}
- Do NOT include markdown headers (##, ###); use **bold** for emphasis`;
}

// ── Parse / strip actions ──────────────────────────────────────────────────────
function parseActions(text: string): ActionSuggestion[] {
  try {
    const match = text.match(/\{"actions":\s*(\[.*?\])\s*\}/s);
    if (!match) return [];
    return JSON.parse(`{"actions":${match[1]}}`).actions ?? [];
  } catch { return []; }
}

function stripActionBlock(text: string): string {
  return text.replace(/\{"actions":\s*\[.*?\]\s*\}/s, '').trim();
}

// ── Quick command chips ────────────────────────────────────────────────────────
const QUICK_COMMANDS = [
  'Show all critical incidents',
  'What services are failing in production?',
  'Summarise the last 3 incidents',
  'Scale checkout-service to handle increased load',
  'Notify the on-call team about the payment outage',
];

// ── Action metadata map ────────────────────────────────────────────────────────
const ACTION_META: Record<string, { color: string; bg: string; Icon: React.ElementType; label: string }> = {
  resolve:  { color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/25', Icon: CheckCircle2,  label: 'Resolve'  },
  status:   { color: 'text-blue-400',    bg: 'bg-blue-500/10 border-blue-500/25',       Icon: Activity,      label: 'Status'   },
  query:    { color: 'text-primary',     bg: 'bg-primary/10 border-primary/25',         Icon: Terminal,      label: 'Query'    },
  escalate: { color: 'text-red-400',     bg: 'bg-red-500/10 border-red-500/25',         Icon: AlertTriangle, label: 'Escalate' },
  scale:    { color: 'text-orange-400',  bg: 'bg-orange-500/10 border-orange-500/25',   Icon: TrendingUp,    label: 'Scale'    },
  notify:   { color: 'text-violet-400',  bg: 'bg-violet-500/10 border-violet-500/25',   Icon: Bell,          label: 'Notify'   },
};
const DEFAULT_META = { color: 'text-muted-foreground', bg: 'bg-muted/30 border-border', Icon: Zap, label: 'Action' };

// ── Action card button ─────────────────────────────────────────────────────────
function ActionCard({ action, onExecute }: { action: ActionSuggestion; onExecute: (a: ActionSuggestion) => void }) {
  const meta = ACTION_META[action.type] ?? DEFAULT_META;
  return (
    <button onClick={() => onExecute(action)}
      className={cn('inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-[11px] font-semibold border transition-colors hover:opacity-80', meta.bg, meta.color)}>
      <meta.Icon className="h-3 w-3 shrink-0" />
      {action.label}
    </button>
  );
}

// ── Message bubble ─────────────────────────────────────────────────────────────
function MessageBubble({ msg, onExecuteAction }: { msg: Message; onExecuteAction: (a: ActionSuggestion) => void }) {
  const isUser = msg.role === 'user';
  const displayText = stripActionBlock(msg.text);
  const actions = msg.actions ?? parseActions(msg.text);

  return (
    <div className={cn('flex gap-3', isUser ? 'flex-row-reverse' : 'flex-row')}>
      <div className={cn('h-7 w-7 rounded-full flex items-center justify-center shrink-0 mt-0.5',
        isUser ? 'bg-primary/20' : 'bg-blue-500/20')}>
        {isUser ? <User className="h-3.5 w-3.5 text-primary" /> : <Bot className="h-3.5 w-3.5 text-blue-400" />}
      </div>
      <div className={cn('max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
        isUser
          ? 'bg-primary/20 text-foreground rounded-tr-sm'
          : 'bg-card border border-border text-foreground rounded-tl-sm')}>
        <div className="whitespace-pre-wrap text-pretty">{displayText}</div>
        {msg.streaming && (
          <span className="inline-block w-1.5 h-4 bg-primary ml-0.5 animate-pulse rounded-sm" />
        )}
        {!msg.streaming && actions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2.5 pt-2 border-t border-border/50">
            {actions.map((a, i) => <ActionCard key={i} action={a} onExecute={onExecuteAction} />)}
          </div>
        )}
        <div className="text-[9px] text-muted-foreground/40 mt-1">
          {new Date(msg.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
        </div>
      </div>
    </div>
  );
}

// ── Action history panel ───────────────────────────────────────────────────────
function ActionHistoryPanel({
  history,
  onClear,
  onClose,
}: {
  history: ActionHistoryEntry[];
  onClear: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col h-full border-l border-border bg-card/60 w-72 shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Action History</span>
          {history.length > 0 && (
            <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{history.length}</Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          {history.length > 0 && (
            <Button variant="ghost" size="sm" onClick={onClear}
              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" title="Clear history">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onClose}
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Entries */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {history.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2 text-center">
            <History className="h-8 w-8 text-muted-foreground/30" />
            <p className="text-xs text-muted-foreground">No actions executed yet.</p>
            <p className="text-[10px] text-muted-foreground/60">Click an action suggestion<br />in the chat to execute it.</p>
          </div>
        ) : (
          [...history].reverse().map(entry => {
            const meta = ACTION_META[entry.action.type] ?? DEFAULT_META;
            return (
              <div key={entry.id}
                className="rounded-lg border border-border bg-background/50 p-3 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <span className={cn('inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border', meta.bg, meta.color)}>
                    <meta.Icon className="h-2.5 w-2.5" />
                    {meta.label}
                  </span>
                  <span className="text-[10px] font-medium text-foreground truncate flex-1">{entry.action.label}</span>
                </div>
                {entry.action.service && (
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Server className="h-2.5 w-2.5 shrink-0" />
                    <span className="truncate font-mono">{entry.action.service}</span>
                  </div>
                )}
                {entry.action.target && (
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <ChevronRight className="h-2.5 w-2.5 shrink-0" />
                    <span className="truncate">{entry.action.target}</span>
                  </div>
                )}
                <div className="flex items-center gap-1 text-[9px] text-muted-foreground/50">
                  <Clock className="h-2.5 w-2.5 shrink-0" />
                  {new Date(entry.executedAt).toLocaleTimeString('en-US', {
                    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function CommandCenterPage() {
  const { theme, toggleTheme } = useTheme();
  const [messages, setMessages] = useState<Message[]>([{
    id: 'welcome',
    role: 'assistant',
    text: 'Hello! I\'m SentinelOps Command — your AI incident response assistant.\n\nYou can type or speak commands like:\n• "Show all critical incidents"\n• "Scale checkout-service to handle spike"\n• "Notify the on-call payments team"\n• "Escalate INC-1001 to P0"\n\nHow can I help you today?',
    timestamp: new Date().toISOString(),
  }]);
  const [input, setInput]               = useState('');
  const [streaming, setStreaming]       = useState(false);
  const [listening, setListening]       = useState(false);
  const [voiceLang, setVoiceLang]       = useState('en-US');
  const [incidents, setIncidents]       = useState<LiveIncidentRow[]>([]);
  const [showHistory, setShowHistory]   = useState(false);
  const [actionHistory, setActionHistory] = useState<ActionHistoryEntry[]>([]);
  const bottomRef    = useRef<HTMLDivElement>(null);
  const abortRef     = useRef<AbortController | null>(null);
  const recognitionRef = useRef<ISpeechRecognition | null>(null);

  // Load current incidents for context
  const loadIncidents = useCallback(async () => {
    const { data } = await supabase
      .from('live_incidents')
      .select('id, title, service, severity, status, opened_at')
      .neq('status', 'RESOLVED')
      .order('opened_at', { ascending: false })
      .limit(20);
    setIncidents(Array.isArray(data) ? data as LiveIncidentRow[] : []);
  }, []);

  useEffect(() => { loadIncidents(); }, [loadIncidents]);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Build conversation history for LLM (last 10 turns)
  const buildContents = useCallback((userText: string) => {
    const history = messages.slice(-10).map(m => ({
      role: m.role === 'user' ? 'user' as const : 'model' as const,
      parts: [{ text: stripActionBlock(m.text) }],
    }));
    return [
      { role: 'user' as const, parts: [{ text: buildSystemPrompt(incidents) }] },
      { role: 'model' as const, parts: [{ text: 'Understood. I\'m ready to assist with incident response.' }] },
      ...history,
      { role: 'user' as const, parts: [{ text: userText }] },
    ];
  }, [messages, incidents]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || streaming) return;
    const userMsg: Message = { id: Date.now().toString(), role: 'user', text: text.trim(), timestamp: new Date().toISOString() };
    const assistantId = (Date.now() + 1).toString();
    const assistantMsg: Message = { id: assistantId, role: 'assistant', text: '', streaming: true, timestamp: new Date().toISOString() };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setInput('');
    setStreaming(true);
    abortRef.current = new AbortController();

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const anonKey     = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
      const fnUrl       = `${supabaseUrl}/functions/v1/large-language-model`;

      let fullText = '';
      await sendStreamRequest({
        functionUrl: fnUrl,
        requestBody: { contents: buildContents(text) },
        supabaseAnonKey: anonKey,
        signal: abortRef.current.signal,
        onData: (chunk: string) => {
          try {
            const frame = JSON.parse(chunk);
            const part = frame?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (part) {
              fullText += part;
              setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, text: fullText } : m));
            }
          } catch { /* incomplete frame */ }
        },
        onComplete: () => {
          setMessages(prev => prev.map(m => m.id === assistantId
            ? { ...m, text: fullText, streaming: false, actions: parseActions(fullText) }
            : m));
          setStreaming(false);
        },
        onError: (err: Error) => {
          if (abortRef.current?.signal.aborted) return;
          console.error('Command center LLM error:', err);
          setMessages(prev => prev.map(m => m.id === assistantId
            ? { ...m, text: 'Sorry, I encountered an error. Please try again.', streaming: false }
            : m));
          setStreaming(false);
          toast.error('AI response failed');
        },
      });
    } catch (e) {
      console.error('sendMessage error:', e);
      setStreaming(false);
    }
  }, [streaming, buildContents]);

  // Voice input — uses selected language
  const toggleVoice = useCallback(() => {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const SR = (window as unknown as { SpeechRecognition?: ISpeechRecognitionCtor; webkitSpeechRecognition?: ISpeechRecognitionCtor }).SpeechRecognition
      ?? (window as unknown as { webkitSpeechRecognition?: ISpeechRecognitionCtor }).webkitSpeechRecognition;
    if (!SR) { toast.error('Speech recognition is not supported in this browser. Use Chrome or Edge.'); return; }
    const recognition = new SR();
    recognition.lang             = voiceLang;
    recognition.interimResults   = false;
    recognition.maxAlternatives  = 1;
    recognition.onstart  = () => setListening(true);
    recognition.onend    = () => setListening(false);
    recognition.onerror  = () => { setListening(false); toast.error('Voice input error'); };
    recognition.onresult = (e: SpeechRecognitionEvent) => {
      const transcript = e.results[0][0].transcript;
      setInput(transcript);
      sendMessage(transcript);
    };
    recognitionRef.current = recognition;
    recognition.start();
  }, [listening, voiceLang, sendMessage]);

  // Execute action card — logs to history
  const handleExecuteAction = useCallback(async (action: ActionSuggestion) => {
    let prompt = '';
    switch (action.type) {
      case 'resolve':
        prompt = action.incidentId
          ? `Please mark incident ${action.incidentId} as resolved and confirm the action.`
          : `Resolve the incident: ${action.label}`;
        break;
      case 'status':
        prompt = action.service
          ? `Give me the current status of ${action.service}.`
          : `Get status: ${action.label}`;
        break;
      case 'escalate':
        prompt = action.incidentId
          ? `Escalate incident ${action.incidentId} — what are the escalation steps?`
          : `Escalate: ${action.label}`;
        break;
      case 'scale':
        prompt = action.service
          ? `Scale ${action.service}${action.target ? ` — ${action.target}` : ''}. What are the recommended scaling steps and risk considerations?`
          : `Scale action: ${action.label}`;
        break;
      case 'notify':
        prompt = action.target
          ? `Send a notification to ${action.target}${action.service ? ` about the ${action.service} incident` : ''}. Draft the message and confirm.`
          : `Notify: ${action.label}`;
        break;
      case 'query':
      default:
        prompt = action.label;
        break;
    }

    // Record in action history
    const historyEntry: ActionHistoryEntry = {
      id: Date.now().toString(),
      action,
      executedAt: new Date().toISOString(),
      prompt,
    };
    setActionHistory(prev => [...prev, historyEntry]);

    // Auto-open history panel when first action is executed
    setShowHistory(true);

    sendMessage(prompt);
  }, [sendMessage]);

  const handleStop = () => {
    abortRef.current?.abort();
    setStreaming(false);
    setMessages(prev => prev.map(m => m.streaming ? { ...m, streaming: false } : m));
  };

  const openCount = incidents.length;
  const selectedLangLabel = VOICE_LANGUAGES.find(l => l.code === voiceLang)?.label ?? voiceLang;

  return (
    <div className="flex flex-col h-screen w-full overflow-hidden bg-background">
      {/* Header */}
      <header className="shrink-0 h-13 border-b border-border header-gradient flex items-center px-4 gap-3">
        <Link to="/"><Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <div className="flex items-center gap-2">
          <img src="/images/logo/sentinelops-logo.png" alt="SentinelOps" className="h-7 w-7 object-contain shrink-0" />
          <div className="hidden sm:flex flex-col leading-none">
            <span className="text-sm font-bold text-foreground tracking-tight">SentinelOps</span>
            <span className="text-[9px] text-muted-foreground/70 font-mono tracking-widest uppercase">Incident Commander</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 ml-2">
          <div className="h-4 w-px bg-border" />
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Command Center</span>
        </div>
        <div className="flex-1" />
        <div className="hidden md:flex items-center gap-3 text-xs">
          <span className="text-muted-foreground">
            Context: <span className={openCount > 0 ? 'text-red-400 font-semibold' : 'text-emerald-400 font-semibold'}>
              {openCount} open incident{openCount !== 1 ? 's' : ''}
            </span>
          </span>
          <div className={cn('h-2 w-2 rounded-full', streaming ? 'bg-primary animate-pulse' : 'bg-emerald-500')} />
          <span className="text-muted-foreground">{streaming ? 'Thinking…' : 'Ready'}</span>
        </div>
        <Button variant="ghost" size="sm" onClick={loadIncidents} className="h-8 w-8 p-0 text-muted-foreground"><RefreshCw className="h-4 w-4" /></Button>
        {/* History toggle */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowHistory(v => !v)}
          className={cn('h-8 w-8 p-0 relative', showHistory ? 'text-primary' : 'text-muted-foreground hover:text-foreground')}
          title="Action history"
        >
          <History className="h-4 w-4" />
          {actionHistory.length > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-primary text-[8px] font-bold text-primary-foreground flex items-center justify-center">
              {actionHistory.length > 9 ? '9+' : actionHistory.length}
            </span>
          )}
        </Button>
        <Button variant="ghost" size="sm" onClick={toggleTheme} className="h-8 w-8 p-0 text-muted-foreground">
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
      </header>

      {/* Body: chat + optional history panel */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Messages */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <main className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
            {messages.map(msg => (
              <MessageBubble key={msg.id} msg={msg} onExecuteAction={handleExecuteAction} />
            ))}
            <div ref={bottomRef} />
          </main>

          {/* Quick commands */}
          {messages.length <= 2 && (
            <div className="shrink-0 px-4 pb-2 flex gap-2 overflow-x-auto">
              {QUICK_COMMANDS.map(cmd => (
                <button key={cmd} onClick={() => sendMessage(cmd)} disabled={streaming}
                  className="shrink-0 text-[11px] px-3 py-1.5 rounded-full border border-border bg-card hover:bg-accent/30 text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap">
                  {cmd}
                </button>
              ))}
            </div>
          )}

          {/* Input bar */}
          <div className="shrink-0 border-t border-border bg-card/40 px-4 py-3">
            <div className="flex items-center gap-2 max-w-4xl mx-auto">
              {/* Language selector */}
              <Select value={voiceLang} onValueChange={setVoiceLang}>
                <SelectTrigger className="h-10 w-10 p-0 shrink-0 border-0 bg-transparent focus:ring-0 [&>svg]:hidden"
                  title={`Voice language: ${selectedLangLabel}`}>
                  <SelectValue>
                    <Volume2 className="h-4 w-4 text-muted-foreground" />
                  </SelectValue>
                </SelectTrigger>
                <SelectContent align="start" className="min-w-[200px]">
                  {VOICE_LANGUAGES.map(l => (
                    <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Voice button */}
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleVoice}
                className={cn('h-10 w-10 p-0 shrink-0 transition-colors',
                  listening
                    ? 'text-red-400 bg-red-500/15 hover:bg-red-500/20 animate-pulse'
                    : 'text-muted-foreground hover:text-foreground')}
                title={listening ? `Stop listening (${selectedLangLabel})` : `Start voice input — ${selectedLangLabel}`}
              >
                {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </Button>

              {/* Text input */}
              <div className="relative flex-1">
                <Input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
                  placeholder={listening ? `🎤 Listening (${selectedLangLabel})…` : 'Ask anything about your incidents, services, or metrics…'}
                  className="h-10 text-sm bg-secondary/30 pr-10"
                  disabled={streaming || listening}
                />
                {input && !streaming && (
                  <button onClick={() => setInput('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Send / Stop */}
              {streaming ? (
                <Button size="sm" onClick={handleStop}
                  className="h-10 w-10 p-0 shrink-0 bg-red-600 hover:bg-red-700 text-white">
                  <X className="h-4 w-4" />
                </Button>
              ) : (
                <Button size="sm" onClick={() => sendMessage(input)} disabled={!input.trim()}
                  className="h-10 w-10 p-0 shrink-0 bg-primary text-primary-foreground hover:bg-primary/90">
                  <Send className="h-4 w-4" />
                </Button>
              )}
            </div>
            <p className="text-center text-[10px] text-muted-foreground/50 mt-1.5">
              Powered by Gemini 2.5 Flash · {openCount} live incident{openCount !== 1 ? 's' : ''} in context · Press Enter to send
            </p>
          </div>
        </div>

        {/* Action history panel (slide in) */}
        {showHistory && (
          <ActionHistoryPanel
            history={actionHistory}
            onClear={() => setActionHistory([])}
            onClose={() => setShowHistory(false)}
          />
        )}
      </div>
    </div>
  );
}
