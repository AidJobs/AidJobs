import type { JSX } from 'react';
import * as Flags from 'country-flag-icons/react/3x2';

type FlagComponent = (props: { title?: string; className?: string }) => JSX.Element;

export default function Flag({ iso, title }: { iso: string | null; title?: string | null }) {
  if (!iso) return null;
  const Component = (Flags as unknown as Record<string, FlagComponent | undefined>)[iso];
  if (!Component) return null;
  return <Component className="aj-flag" title={title ?? iso} />;
}
