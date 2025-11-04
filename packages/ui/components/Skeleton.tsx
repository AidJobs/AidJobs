import * as React from 'react';
import { cn } from '../lib/utils';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  height?: string | number;
}

function Skeleton({ className, height, style, ...props }: SkeletonProps) {
  const heightStyle = height
    ? typeof height === 'number'
      ? { height: `${height}px` }
      : { height }
    : {};

  return (
    <div
      className={cn(
        'animate-pulse rounded-md bg-muted',
        className
      )}
      style={{ ...heightStyle, ...style }}
      {...props}
    />
  );
}

export { Skeleton };
