'use client';

import { useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { MessageCircle, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ChatPanel } from '@/components/copilot/chat-panel';

/** Floating "Ask Copilot" trigger, fixed bottom-right on every authenticated page. */
export function AskCopilotButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        size="icon"
        className="fixed bottom-6 right-6 z-40 h-12 w-12 rounded-full shadow-lg"
        aria-label="Ask Copilot"
      >
        <MessageCircle className="h-5 w-5" />
      </Button>

      <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay
            className={cn(
              'fixed inset-0 z-50 bg-black/40',
              'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'
            )}
          />
          <DialogPrimitive.Content
            className={cn(
              'fixed inset-y-0 right-0 z-50 flex h-full w-full max-w-md flex-col border-l border-border bg-card shadow-lg outline-none',
              'transition-transform duration-200 ease-out data-[state=closed]:translate-x-full data-[state=open]:translate-x-0'
            )}
          >
            <DialogPrimitive.Title className="sr-only">Ask Copilot</DialogPrimitive.Title>
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
              <span className="font-display text-base font-semibold">Ask Copilot</span>
              <DialogPrimitive.Close
                className="rounded-sm p-1 text-muted-foreground hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </DialogPrimitive.Close>
            </div>
            <ChatPanel variant="panel" />
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
