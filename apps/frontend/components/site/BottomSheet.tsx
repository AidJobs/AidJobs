'use client';

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';

const PHONE_QUERY = '(max-width: 1023px)';

function subscribePhone(onChange: () => void): () => void {
  const mq = window.matchMedia(PHONE_QUERY);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

/**
 * True below the desktop breakpoint, where pickers open as bottom sheets instead of dropdowns.
 * False while hydrating, as on the server; components mounted later, such as an opened sheet, get the real value at once.
 */
export function useIsPhone(): boolean {
  return useSyncExternalStore(
    subscribePhone,
    () => window.matchMedia(PHONE_QUERY).matches,
    () => false,
  );
}

/**
 * Phone panel that rises from the bottom edge. The header and footer stay put; only the body scrolls.
 * Closes on the scrim, Escape, or a downward swipe on the header.
 */
export default function BottomSheet({
  title,
  subtitle,
  action,
  footer,
  tall,
  onClose,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  footer?: ReactNode;
  tall?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const [drag, setDrag] = useState(0);
  const startY = useRef<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="aj-scrim min-h-0 flex-1" onClick={onClose} aria-hidden />
      <div
        className="aj-sheet aj-sheet-in flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          height: tall ? 'min(78dvh, 640px)' : undefined,
          maxHeight: '88dvh',
          transform: drag ? `translateY(${drag}px)` : undefined,
          transition: drag ? 'none' : 'transform 160ms ease',
        }}
      >
        <div
          className="shrink-0 px-4 pb-2"
          style={{ touchAction: 'none' }}
          onTouchStart={(e) => {
            startY.current = e.touches[0].clientY;
          }}
          onTouchMove={(e) => {
            if (startY.current !== null) setDrag(Math.max(0, e.touches[0].clientY - startY.current));
          }}
          onTouchEnd={() => {
            if (drag > 80) onClose();
            setDrag(0);
            startY.current = null;
          }}
        >
          <div className="aj-grabber" />
          <div className="flex min-h-[40px] items-center gap-2 pt-1">
            <span className="aj-title shrink-0" style={{ fontSize: 16 }}>
              {title}
            </span>
            {subtitle && <span className="aj-faint min-w-0 truncate">{subtitle}</span>}
            <span className="ml-auto shrink-0">{action}</span>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col px-3">{children}</div>
        {footer && (
          <div className="shrink-0 border-t px-4 pt-3 aj-hair" style={{ paddingBottom: 'max(14px, env(safe-area-inset-bottom))' }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
