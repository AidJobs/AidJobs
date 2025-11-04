import * as React from 'react';
import { cn } from '../lib/utils';

export interface FilterChipProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  pressed?: boolean;
  count?: number;
}

const FilterChip = React.forwardRef<HTMLButtonElement, FilterChipProps>(
  ({ className, pressed = false, count, children, ...props }, ref) => {
    return (
      <button
        className={cn(
          'inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          pressed
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-foreground hover:bg-muted/80',
          className
        )}
        aria-pressed={pressed}
        ref={ref}
        {...props}
      >
        {children}
        {count !== undefined && count > 0 && (
          <span
            className={cn(
              'inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold',
              pressed
                ? 'bg-primary-foreground/20 text-primary-foreground'
                : 'bg-primary/20 text-primary'
            )}
          >
            {count}
          </span>
        )}
      </button>
    );
  }
);
FilterChip.displayName = 'FilterChip';

export { FilterChip };
