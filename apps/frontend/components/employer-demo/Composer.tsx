'use client';

import { ArrowUp, CornerDownRight } from 'lucide-react';
import { forwardRef, useId, useImperativeHandle, useRef, type ReactNode } from 'react';
import Tip from '@/components/site/Tip';

export type Readiness = { done: number; total: number; missing: string[] };

/** The send button with a thin ring that fills as the key facts arrive; hover lists what is missing. Sending is never blocked. */
function SendButton({ disabled, onClick, readiness }: { disabled: boolean; onClick: () => void; readiness?: Readiness }) {
  const noteId = useId();
  const button = (
    <button type="button" className="aj-ink-btn ej-send" style={{ width: 36, height: 36, padding: 0, justifyContent: 'center' }} onClick={onClick} disabled={disabled} aria-label="Send" aria-describedby={readiness ? noteId : undefined}>
      <ArrowUp size={16} strokeWidth={2.2} />
    </button>
  );
  if (!readiness) return <span className="ml-auto">{button}</span>;
  const r = 20;
  const length = 2 * Math.PI * r;
  const part = readiness.total ? readiness.done / readiness.total : 0;
  const label = readiness.missing.length ? `Still useful to add: ${readiness.missing.join(', ')}. You can send at any time.` : 'Role, place, closing date, and contract are all in.';
  return (
    <Tip label={label} className="ml-auto">
      <span className="ej-ring">
        <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden>
          <circle cx="22" cy="22" r={r} className="ej-ring-track" />
          <circle cx="22" cy="22" r={r} className="ej-ring-fill" strokeDasharray={length} strokeDashoffset={length * (1 - part)} transform="rotate(-90 22 22)" />
        </svg>
        {button}
        <span id={noteId} className="sr-only">
          {label}
        </span>
      </span>
    </Tip>
  );
}

export type ComposerHandle = { focus: () => void };

/**
 * The chat box. Ghost text completes the word or phrase being typed; Tab (only while a completion shows) or the → key at the end of the text
 * accepts it, and on touch screens a small chip does. Enter sends; Shift+Enter starts a new line.
 */
const Composer = forwardRef<
  ComposerHandle,
  {
    value: string;
    onChange: (v: string) => void;
    onSend: (v: string) => void;
    suggestion: string;
    placeholder: string;
    label: string;
    autoFocus?: boolean;
    compact?: boolean;
    large?: boolean;
    tools?: ReactNode;
    readiness?: Readiness;
  }
>(function Composer({ value, onChange, onSend, suggestion, placeholder, label, autoFocus, compact, large, tools, readiness }, handle) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(handle, () => ({ focus: () => ref.current?.focus() }), []);
  const hintId = useId();
  const showGhost = Boolean(suggestion) && Boolean(value);
  const accept = () => {
    onChange(value + suggestion);
    ref.current?.focus();
  };
  return (
    <div className="flex flex-col gap-1.5">
      <div className="ej-composer" data-size={compact ? 'compact' : large ? 'large' : undefined}>
        {showGhost && (
          <div className="ej-ghost" aria-hidden>
            {value}
            <span>{suggestion}</span>
          </div>
        )}
        <textarea
          ref={ref}
          value={value}
          autoFocus={autoFocus}
          aria-label={label}
          aria-describedby={showGhost ? hintId : undefined}
          placeholder={placeholder}
          rows={compact ? 1 : 3}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            const el = e.currentTarget;
            const atEnd = el.selectionStart === value.length && el.selectionEnd === value.length;
            if (showGhost && atEnd && (e.key === 'Tab' || e.key === 'ArrowRight') && !e.shiftKey) {
              e.preventDefault();
              accept();
            } else if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (value.trim()) onSend(value.trim());
            }
          }}
        />
        <div className="flex min-w-0 items-center gap-1.5 px-2 pb-2">
          {tools}
          {showGhost && (
            <button type="button" className="aj-text-btn inline-flex min-w-0 shrink items-center gap-1 sm:hidden" style={{ height: 30, fontSize: 12 }} onClick={accept} aria-label={`Complete with ${suggestion.trim()}`}>
              <CornerDownRight size={13} strokeWidth={2} className="shrink-0" />
              <span className="truncate">{suggestion.trim()}</span>
            </button>
          )}
          <SendButton disabled={!value.trim()} onClick={() => value.trim() && onSend(value.trim())} readiness={readiness} />
        </div>
      </div>
      {showGhost && (
        <span id={hintId} className="sr-only">
          Completion: {suggestion.trim()}. Press Tab or the right arrow to accept it.
        </span>
      )}
    </div>
  );
});

export default Composer;
