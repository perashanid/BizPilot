import { AlertTriangle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
  className?: string;
}

/** Canonical inline error-with-retry pattern. Use for any failed fetch/mutation on a view. */
export function ErrorState({ message = 'Something went wrong. Please try again.', onRetry, className }: ErrorStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-6 py-10 text-center',
        className
      )}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/15 text-destructive">
        <AlertTriangle className="h-5 w-5" />
      </div>
      <p className="max-w-sm text-sm text-foreground">{message}</p>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}
