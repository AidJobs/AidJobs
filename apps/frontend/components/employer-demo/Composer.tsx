'use client';

import { ArrowUp, CornerDownRight } from 'lucide-react';
import { useId, useRef } from 'react';

/**
 * The chat box. Ghost text after the cursor suggests what to write next; the → key at the end of the text, or the
 * "Use suggestion" button, accepts it. Tab is left alone so keyboard users can move on. Enter sends; Shift+Enter
 * starts a new line.
 */
export default function Composer({
  value,
  onChange,
  onSend,
  suggestion,
  placeholder,
  label,
  autoFocus,
  compact,
  large,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: (v: string) => void;
  suggestion: string;
  placeholder: string;
  label: string;
  autoFocus?: boolean;
  compact?: boolean;
  large?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
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
          aria-describedby={suggestion ? hintId : undefined}
          placeholder={value ? '' : suggestion ? `${suggestion.trim()}…` : placeholder}
          rows={compact ? 1 : 3}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            const el = e.currentTarget;
            if (e.key === 'ArrowRight' && suggestion && el.selectionStart === value.length && el.selectionEnd === value.length) {
              e.preventDefault();
              accept();
            } else if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (value.trim()) onSend(value.trim());
            }
          }}
        />
        <div className="flex items-center gap-2 px-2 pb-2">
          {suggestion && (
            <button type="button" className="aj-text-btn inline-flex items-center gap-1" style={{ height: 30, fontSize: 12 }} onClick={value ? accept : () => onChange(suggestion.replace(/^[,.\s]+/, ''))}>
              <CornerDownRight size={13} strokeWidth={2} />
              Use suggestion
            </button>
          )}
          <button
            type="button"
            className="aj-ink-btn ml-auto"
            style={{ width: 36, height: 36, padding: 0, justifyContent: 'center' }}
            onClick={() => value.trim() && onSend(value.trim())}
            disabled={!value.trim()}
            aria-label="Send"
          >
            <ArrowUp size={16} strokeWidth={2.2} />
          </button>
        </div>
      </div>
      {suggestion && (
        <span id={hintId} className="sr-only">
          Suggestion: {suggestion.trim().replace(/^[,.;:]\s*/, '')}. Press the right arrow at the end of the text, or use the Use suggestion button, to accept it.
        </span>
      )}
    </div>
  );
}
