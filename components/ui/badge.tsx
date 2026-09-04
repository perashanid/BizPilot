import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

/**
 * Status-pill vocabulary. Every screen reuses these six variants instead of inventing new
 * pill colors. See DESIGN.md for the full business-status -> variant mapping table, e.g.:
 *   success     paid, fulfilled, received, done, active
 *   secondary   sent, pending, in_progress, awaiting (neutral "in motion" info look)
 *   warning     due soon, low stock, opportunity/attention-needed
 *   destructive overdue, critical, blocked, cancelled
 *   outline     draft
 *   default     brand-tinted, used sparingly (e.g. "new")
 */
const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-1 focus:ring-ring',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        success: 'border-transparent bg-success/15 text-success',
        warning: 'border-transparent bg-warning/15 text-warning',
        destructive: 'border-transparent bg-destructive/15 text-destructive',
        outline: 'border-border text-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
