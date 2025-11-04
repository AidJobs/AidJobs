import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/utils';

const badgeVariants = cva(
  'inline-flex items-center justify-center rounded-md px-2 py-0.5 text-xs font-semibold',
  {
    variants: {
      status: {
        'closing-soon': 'bg-warning/20 text-warning',
        urgent: 'bg-danger/20 text-danger',
        'pay-transparency': 'bg-accent text-accent-foreground',
        default: 'bg-muted text-muted-foreground',
      },
    },
    defaultVariants: {
      status: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, status, ...props }, ref) => {
    return (
      <span
        className={cn(badgeVariants({ status, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Badge.displayName = 'Badge';

export { Badge, badgeVariants };
