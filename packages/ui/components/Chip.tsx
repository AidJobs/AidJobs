import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/utils';

const chipVariants = cva(
  'inline-flex items-center justify-center rounded-full px-3 py-1 text-xs font-medium',
  {
    variants: {
      variant: {
        default: 'bg-muted text-foreground',
        primary: 'bg-primary/10 text-primary',
        accent: 'bg-accent text-accent-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface ChipProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof chipVariants> {}

const Chip = React.forwardRef<HTMLSpanElement, ChipProps>(
  ({ className, variant, ...props }, ref) => {
    return (
      <span
        className={cn(chipVariants({ variant, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Chip.displayName = 'Chip';

export { Chip, chipVariants };
