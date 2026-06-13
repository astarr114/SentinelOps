import { useState } from 'react';
import { supabase } from '@/db/supabase';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Zap, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type Severity = 'CRITICAL' | 'HIGH';

const TITLES: Record<Severity, (svc: string) => string> = {
  CRITICAL: (svc) => `${svc}: critical failure — cascading errors detected`,
  HIGH:     (svc) => `${svc}: high error rate spike above threshold`,
};

const SUMMARIES: Record<Severity, (svc: string) => string> = {
  CRITICAL: (svc) => `Automated detection: ${svc} is returning critical-level errors. Immediate triage required.`,
  HIGH:     (svc) => `Automated detection: ${svc} error rate exceeded alert threshold. Investigation recommended.`,
};

// Simple counter to generate unique IDs within a session
let simCounter = Math.floor(Math.random() * 900) + 100;

interface SimulateAlertDialogProps {
  /** Compact variant for dashboard header */
  compact?: boolean;
}

export function SimulateAlertDialog({ compact = false }: SimulateAlertDialogProps) {
  const [open, setOpen] = useState(false);
  const [severity, setSeverity] = useState<Severity>('CRITICAL');
  const [service, setService] = useState('checkout-service');
  const [inserting, setInserting] = useState(false);

  const handleInsert = async () => {
    if (!severity) return;
    setInserting(true);
    const svc = service.trim() || 'test-service';
    const incId = `INC-SIM-${++simCounter}`;
    const title = TITLES[severity](svc);
    const summary = SUMMARIES[severity](svc);

    try {
      const { error } = await supabase.from('live_incidents').insert({
        id: incId,
        title,
        severity,
        status: 'OPEN',
        service: svc,
        summary,
        opened_at: new Date().toISOString(),
      });
      if (error) throw error;

      toast.success(`Test incident ${incId} inserted`, {
        description: `${severity} · ${svc} — Realtime alert should appear now.`,
        duration: 6000,
      });
      setOpen(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Insert failed';
      toast.error('Simulate Alert failed', { description: msg.slice(0, 120) });
    } finally {
      setInserting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {compact ? (
        <DialogTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 gap-1 text-[11px] font-semibold text-orange-400 hover:text-orange-300 hover:bg-orange-950/40 border border-orange-700/35 transition-all"
            title="Simulate a CRITICAL/HIGH alert to test Realtime pipeline"
          >
            <Zap className="h-3 w-3" />
            <span className="hidden sm:inline">Simulate</span>
          </Button>
        </DialogTrigger>
      ) : (
        <DialogTrigger asChild>
          <Button variant="secondary" size="sm" className="h-9 gap-2 text-xs">
            <Zap className="h-3.5 w-3.5 text-orange-400" />
            Simulate Alert
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5 text-base text-balance">
            <div className="h-7 w-7 rounded-lg bg-orange-500/10 border border-orange-500/25 flex items-center justify-center shrink-0">
              <Zap className="h-3.5 w-3.5 text-orange-400" />
            </div>
            Simulate Critical Incident Alert
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <p className="text-[12px] text-muted-foreground leading-relaxed text-pretty bg-secondary/20 border border-border rounded-lg px-3 py-2.5">
            Inserts a real row into the <code className="font-mono bg-secondary px-1.5 py-0.5 rounded text-[11px]">live_incidents</code> table
            and triggers the live Realtime pipeline — end-to-end alert test.
          </p>

          <div className="space-y-1.5">
            <label className="text-sm font-normal text-foreground">Severity</label>
            <Select value={severity} onValueChange={v => setSeverity(v as Severity)}>
              <SelectTrigger className="h-10 bg-secondary/30 border-border text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CRITICAL">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-red-500 inline-block" />
                    CRITICAL
                  </span>
                </SelectItem>
                <SelectItem value="HIGH">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-orange-500 inline-block" />
                    HIGH
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-normal text-foreground">Service Name</label>
            <Input
              value={service}
              onChange={e => setService(e.target.value)}
              placeholder="checkout-service"
              className="h-10 bg-secondary/30 border-border font-mono text-sm"
            />
            <p className="text-[11px] text-muted-foreground">Defaults to checkout-service if blank.</p>
          </div>

          {/* Preview */}
          <div className={cn(
            'rounded-xl border p-3.5 space-y-1.5',
            severity === 'CRITICAL' ? 'border-red-700/35 bg-red-950/15' : 'border-orange-700/35 bg-orange-950/15'
          )}>
            <div className="flex items-center gap-1.5 mb-1">
              <span className={cn('text-[9px] font-bold uppercase tracking-widest', severity === 'CRITICAL' ? 'text-red-400/70' : 'text-orange-400/70')}>
                Preview
              </span>
            </div>
            <p className="font-mono text-[11px] text-muted-foreground/60">INC-SIM-{simCounter + 1}</p>
            <p className={cn('text-[13px] font-semibold text-pretty leading-snug', severity === 'CRITICAL' ? 'text-red-300' : 'text-orange-300')}>
              {TITLES[severity](service.trim() || 'test-service')}
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)} className="h-9 text-xs">
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleInsert}
            disabled={inserting}
            className={cn(
              'h-9 gap-2 text-xs text-primary-foreground',
              severity === 'CRITICAL' ? 'bg-red-600 hover:bg-red-700' : 'bg-orange-500 hover:bg-orange-600'
            )}
          >
            {inserting
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Inserting…</>
              : <><Zap className="h-3.5 w-3.5" />Insert & Trigger Alert</>
            }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
