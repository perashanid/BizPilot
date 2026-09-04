import { cn } from '@/lib/utils';

/** Pulsing placeholder block. Compose to match the shape of the content it stands in for. */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} {...props} />;
}

export { Skeleton };
