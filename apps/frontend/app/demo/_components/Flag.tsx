import * as Flags from 'country-flag-icons/react/3x2';

type FlagComponent = (props: { title?: string; className?: string }) => JSX.Element;

export default function Flag({ iso, title }: { iso: string | null; title?: string | null }) {
  if (!iso) return null;
  const Component = (Flags as unknown as Record<string, FlagComponent | undefined>)[iso];
  if (!Component) return null;
  return <Component className="dj-flag" title={title ?? iso} />;
}
