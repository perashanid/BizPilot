import * as React from 'react';

import { cn } from '@/lib/utils';

export interface SeparatorProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: 'horizontal' | 'vertical';
  decorative?: boolean;
}

/**
 * Plain div-based separator (no @radix-ui/react-separator — it isn't in package.json and
 * this project doesn't add new dependencies). Decorative by default (aria-hidden); pass
 * decorative={false} and role="separator" is applied for a semantically meaningful divider.
 */
const Separator = React.forwardRef<HTMLDivElement, SeparatorProps>(
  ({ className, orientation = 'horizontal', decorative = true, ...props }, ref) => (
    <div
      ref={ref}
      role={decorative ? 'none' : 'separator'}
      aria-orientation={decorative ? undefined : orientation}
      className={cn('shrink-0 bg-border', orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px', className)}
      {...props}
    />
  )
);
Separator.displayName = 'Separator';

export { Separator };
