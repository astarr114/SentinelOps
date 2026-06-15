import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/db/supabase';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import type { AnalysisResult } from '@/types/types';
import { MessageSquare, Send, Loader2, Zap, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { readLlmSseStream, parseLlmErrorResponse } from '@/lib/llmStream';
import { useLlm } from '@/contexts/LlmContext';

const QUICK_PROMPTS = [
  'What changed before the spike?',
  'Show top failing endpoints',
  'What services are affected?',
  'Draft a stakeholder update',
  'Generate SPL query for this issue',
  'What is the recommended rollback plan?',
];

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface FollowUpPanelProps {
  analysis?: AnalysisResult & { aiBrief?: Record<string, string> };
}

export function FollowUpPanel({ analysis }: FollowUpPanelProps) {
  const { activeLlm, buildFallbackChain } = useLlm();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendQuestion = async (question: string) => {
    if (!question.trim() || streaming) return;

    const userMsg: Message = { role: 'user', content: question };
    const assistantMsg: Message = { role: 'assistant', content: '' };
    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setInputText('');
    setStreaming(true);

    abortRef.current = new AbortController();

    try {
      const incidentContext = analysis ? {
        incidentId:    analysis.incidentId,
        service:       analysis.metadata?.name ?? 'unknown',
        severity:      'CRITICAL',
        summary:       analysis.summary,
        topHypothesis: analysis.hypotheses?.[0]?.title ?? '',
        blastServices: analysis.blastRadius?.services ?? [],
      } : {};

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/incident-followup`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ question, incidentContext, llmProvider: activeLlm.provider, llmApiKey: activeLlm.apiKey, llmModel: activeLlm.modelId, llmFallbackChain: buildFallbackChain() }),
          signal: abortRef.current.signal,
        }
      );

      if (!response.ok || !response.body) {
        const errText = await response.text();
        throw new Error(parseLlmErrorResponse(errText, response.status));
      }

      const hasContent = await readLlmSseStream(response.body, (text) => {
        setMessages(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role !== 'assistant') return prev;
          updated[updated.length - 1] = { ...last, content: last.content + text };
          return updated;
        });
      });

      if (!hasContent) {
        setMessages(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role !== 'assistant') return prev;
          updated[updated.length - 1] = {
            ...last,
            content: 'No response received. Check your LLM API key in Settings → AI Model, then try again.',
          };
          return updated;
        });
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      const message = err instanceof Error ? err.message : 'Unknown error';
      toast.error('Follow-up request failed', { description: message.slice(0, 120) });
      console.error(err);
      setMessages(prev => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.role !== 'assistant') return prev;
        updated[updated.length - 1] = {
          ...last,
          content: message.includes('No LLM provider')
            ? `${message} Add an API key in Settings → AI Model.`
            : 'Sorry, I encountered an error processing your request. Please try again.',
        };
        return updated;
      });
    } finally {
      setStreaming(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendQuestion(inputText);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Follow-up Investigation</h3>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">Ask follow-up questions about this incident</p>
      </div>

      {/* Quick prompts */}
      {messages.length === 0 && (
        <div className="p-3 border-b border-border shrink-0">
          {!analysis && (
            <div className="mb-2.5 rounded-lg border border-border bg-secondary/30 px-3 py-2 flex items-start gap-2">
              <Zap className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
              <p className="text-[11px] text-muted-foreground leading-relaxed text-pretty">
                Run <span className="font-semibold text-foreground">Analyze</span> on the incident for AI-powered context, or ask any question freely below.
              </p>
            </div>
          )}
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Quick prompts</p>
          <div className="grid grid-cols-2 gap-1.5">
            {QUICK_PROMPTS.map(prompt => (
              <button
                key={prompt}
                onClick={() => sendQuestion(prompt)}
                disabled={streaming}
                className="text-left rounded-md border border-border bg-secondary/30 px-2.5 py-2 text-xs text-muted-foreground hover:text-foreground hover:border-border/80 hover:bg-secondary transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-pretty leading-relaxed"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto min-h-0 p-3 space-y-3">
        {messages.map((msg, i) => (
          <div key={i} className={cn('flex gap-2', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
            {msg.role === 'assistant' && (
              <div className="shrink-0 h-6 w-6 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center mt-0.5">
                <Zap className="h-3 w-3 text-primary" />
              </div>
            )}
            <div className={cn(
              'max-w-[85%] rounded-lg px-3 py-2 text-xs leading-relaxed text-pretty',
              msg.role === 'user'
                ? 'bg-primary/20 text-foreground border border-primary/20'
                : 'bg-secondary/50 text-foreground border border-border'
            )}>
              {msg.content || (streaming && i === messages.length - 1 && (
                <span className="inline-flex gap-1">
                  <span className="animate-bounce" style={{ animationDelay: '0ms' }}>·</span>
                  <span className="animate-bounce" style={{ animationDelay: '150ms' }}>·</span>
                  <span className="animate-bounce" style={{ animationDelay: '300ms' }}>·</span>
                </span>
              ))}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {messages.length > 0 && (
        <div className="px-3 py-1.5 border-t border-border shrink-0">
          <button
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setMessages([])}
          >
            <ChevronDown className="h-3 w-3" />
            Clear conversation
          </button>
        </div>
      )}

      {/* Input */}
      <div className="p-3 border-t border-border shrink-0">
        <div className="relative">
          <Textarea
            placeholder="Ask a follow-up question... (Enter to send)"
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={streaming}
            rows={2}
            className="bg-input border-border text-sm placeholder:text-muted-foreground/50 resize-none pr-10 text-base"
          />
          <Button
            size="sm"
            className="absolute right-2 bottom-2 h-7 w-7 p-0 bg-primary hover:bg-primary/90"
            onClick={() => sendQuestion(inputText)}
            disabled={!inputText.trim() || streaming}
          >
            {streaming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
