'use client';

import { ArrowUp, CornerDownRight } from 'lucide-react';
import { forwardRef, useId, useImperativeHandle, useLayoutEffect, useRef, useState, type ClipboardEvent, type DragEvent, type ReactNode } from 'react';
import Tip from '@/components/site/Tip';
import type { FactMark } from './engine';

export type Readiness = { done: number; total: number; missing: string[] };

/** The send button with a thin ring that fills as the key facts arrive; hover lists what is missing. Sending is never blocked. */
function SendButton({ disabled, onClick, readiness }: { disabled: boolean; onClick: () => void; readiness?: Readiness }) {
  const noteId = useId();
  const button = (
    <button type="button" className="ej-send" onClick={onClick} disabled={disabled} aria-label="Send" aria-describedby={readiness ? noteId : undefined}>
      <ArrowUp size={15} strokeWidth={2.2} />
    </button>
  );
  if (!readiness) return <span className="ml-auto">{button}</span>;
  const r = 16.5;
  const length = 2 * Math.PI * r;
  const part = readiness.total ? readiness.done / readiness.total : 0;
  const label = readiness.missing.length ? `Still useful to add: ${readiness.missing.join(', ')}. You can send at any time.` : 'Role, place, closing date, and contract are all in.';
  return (
    <Tip label={label} className="ml-auto">
      <span className="ej-ring">
        <svg width="38" height="38" viewBox="0 0 38 38" aria-hidden>
          <circle cx="19" cy="19" r={r} className="ej-ring-track" />
          <circle cx="19" cy="19" r={r} className="ej-ring-fill" strokeDasharray={length} strokeDashoffset={length * (1 - part)} transform="rotate(-90 19 19)" />
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
    /** Facts recognised in the text, underlined; hover shows how they were read, a click selects them to retype. */
    marks?: FactMark[];
    /** Called when a long job description is pasted, to offer reading it as a document. */
    onPasteLong?: (text: string) => void;
    /** Called when a file is dropped on the box. */
    onFile?: (file: File) => void;
    /** A height chosen by dragging the box's edge; the text still grows it beyond that. */
    minHeight?: number;
  }
>(function Composer({ value, onChange, onSend, suggestion, placeholder, label, autoFocus, compact, large, tools, readiness, marks, onPasteLong, onFile, minHeight = 0 }, handle) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const ghost = useRef<HTMLDivElement>(null);
  const [dropping, setDropping] = useState(false);
  useImperativeHandle(handle, () => ({ focus: () => ref.current?.focus() }), []);
  const hintId = useId();
  const readId = useId();
  const shown = (marks ?? []).filter((m) => m.end <= value.length);
  useLayoutEffect(() => {
    const ta = ref.current;
    if (!ta) return;
    ta.style.height = 'auto';
    const max = Math.max(minHeight, Math.round(window.innerHeight * (compact ? 0.4 : 0.5)));
    ta.style.height = `${Math.max(minHeight, Math.min(ta.scrollHeight, max))}px`;
    ta.style.overflowY = ta.scrollHeight > max ? 'auto' : 'hidden';
    for (const el of [layer.current, ghost.current]) {
      if (!el) continue;
      el.style.height = `${ta.clientHeight}px`;
      el.scrollTop = ta.scrollTop;
    }
  });
  const paste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const t = e.clipboardData.getData('text');
    if (onPasteLong && t.length > 400 && t.split('\n').filter((l) => l.trim()).length >= 4) onPasteLong(t);
  };
  const drag = (e: DragEvent<HTMLDivElement>, over: boolean) => {
    if (!onFile || !Array.from(e.dataTransfer.types).includes('Files')) return;
    e.preventDefault();
    if (over || !e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(over);
  };
  const drop = (e: DragEvent<HTMLDivElement>) => {
    const file = e.dataTransfer.files?.[0];
    if (!onFile || !file) return;
    e.preventDefault();
    setDropping(false);
    onFile(file);
  };
  const showGhost = Boolean(suggestion) && Boolean(value);
  const accept = () => {
    onChange(value + suggestion);
    ref.current?.focus();
  };
  return (
    <div className="flex flex-col gap-1.5">
      <div className="ej-composer" data-size={compact ? 'compact' : large ? 'large' : undefined} data-drop={dropping || undefined} onDragOver={(e) => drag(e, true)} onDragLeave={(e) => drag(e, false)} onDrop={drop}>
        {showGhost && (
          <div ref={ghost} className="ej-ghost" aria-hidden>
            {value}
            <span>{suggestion}</span>
          </div>
        )}
        {shown.length > 0 && (
          <div
            ref={layer}
            className="ej-marks"
            aria-hidden
            onWheel={(e) => {
              if (ref.current) ref.current.scrollTop += e.deltaY;
            }}
          >
            {shown.map((m, i) => (
              <span key={m.start}>
                {value.slice(i ? shown[i - 1].end : 0, m.start)}
                <Tip label={m.label} className="ej-inline-tip">
                  <span className="ej-fact-mark">
                    {value.slice(m.start, m.end)}
                  </span>
                </Tip>
              </span>
            ))}
            {value.slice(shown[shown.length - 1].end)}
          </div>
        )}
        <textarea
          ref={ref}
          value={value}
          autoFocus={autoFocus}
          aria-label={label}
          aria-describedby={[showGhost ? hintId : '', shown.length ? readId : ''].filter(Boolean).join(' ') || undefined}
          onPaste={paste}
          onScroll={(e) => {
            const top = e.currentTarget.scrollTop;
            if (layer.current) layer.current.scrollTop = top;
            if (ghost.current) ghost.current.scrollTop = top;
          }}
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
      {shown.length > 0 && (
        <span id={readId} className="sr-only">
          AidJobs read: {shown.map((m) => m.label).join(' ')}
        </span>
      )}
      {showGhost && (
        <span id={hintId} className="sr-only">
          Completion: {suggestion.trim()}. Press Tab or the right arrow to accept it.
        </span>
      )}
    </div>
  );
});

export default Composer;
