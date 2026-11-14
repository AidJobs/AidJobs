'use client';

import { Languages, Plus, Sparkles, X } from 'lucide-react';
import { useRef, useState } from 'react';
import Tip from '@/components/site/Tip';
import { GROUPS, SECTION_BY_KEY, SECTIONS } from './engine';
import Grip, { dropAt, groupDropAt, type GripAction } from './Grip';
import { applyOp, groupOfKey, groupOrderOf, KEPT, placeSaid, type OutlineOp } from './outline';
import type { GroupKey, Grouping } from './types';

/** A heading that reads as plain text: clicked, it becomes a field; Enter or leaving it saves, Escape keeps the old one. */
function InlineHeading({ value, onCommit, readOnly }: { value: string; onCommit: (v: string) => void; readOnly?: boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  if (readOnly) return <span className="ej-ol-head">{value}</span>;
  if (draft === null)
    return (
      <Tip label="Click to rename" className="min-w-0 flex-1">
        <button type="button" className="ej-ol-head" onClick={() => setDraft(value)} aria-label={`${value}. Rename`}>
          {value}
        </button>
      </Tip>
    );
  const commit = () => {
    if (draft.trim() && draft.trim() !== value) onCommit(draft.trim());
    setDraft(null);
  };
  return (
    <input
      className="ej-ol-input"
      value={draft}
      autoFocus
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') {
          e.stopPropagation();
          setDraft(null);
        }
      }}
      aria-label={`New heading for ${value}`}
    />
  );
}

export type OutlineProps = {
  /** The sections in reading order, with their headings. */
  rows: Array<{ key: string; heading: string }>;
  grouping: Grouping;
  /** What a change does; without it the outline is read only (reviewers). */
  onOp?: (op: OutlineOp) => void;
  recommended?: string[];
  /** Differences by language ("French only", "Not in Arabic"), shown as a small mark with its text. */
  marks?: Record<string, string>;
  label?: string;
};

/**
 * The outline, one design wherever it appears (section 19, phase 6, B): the five groups as titles in small capitals, and under each its
 * sections in the order chosen, then "+" chips for the sections not in the job. Minimal at rest: a faint grip on each row (drag it, or
 * press it for its menu), the heading as plain text (click to rename), a quiet × to remove (none for How to apply). A group's grip
 * moves the whole group. It never turns into one flat list.
 */
export default function OutlineEditor({ rows, grouping, onOp, recommended = [], marks = {}, label = 'Sections, by group' }: OutlineProps) {
  const root = useRef<HTMLDivElement>(null);
  const [drop, setDrop] = useState<{ after: string | null; group: string | null } | null>(null);
  const [groupDrop, setGroupDrop] = useState<{ before: string | null } | null>(null);
  const [said, setSaid] = useState('');
  const keys = rows.map((r) => r.key);
  const heading = (k: string) => rows.find((r) => r.key === k)?.heading ?? SECTION_BY_KEY[k]?.label ?? k;
  const order = groupOrderOf(grouping);
  const ro = !onOp;
  const groupLabel = (g: GroupKey) => GROUPS.find((x) => x.key === g)?.label ?? g;

  const run = (op: OutlineOp, focusKey?: string) => {
    if (!onOp) return;
    const next = applyOp(keys, grouping, op);
    onOp(op);
    if (op.op === 'remove') setSaid(`${heading(op.key)} removed`);
    else if (op.op === 'add') setSaid(`${heading(op.key)} added: ${placeSaid(next.keys, next.grouping, op.key, heading(op.key))}`);
    else if ('key' in op) setSaid(`Moved. ${placeSaid(next.keys, next.grouping, op.key, heading(op.key))}`);
    else setSaid(`Moved the group ${groupLabel(op.group)}: ${groupOrderOf(next.grouping).indexOf(op.group) + 1} of ${GROUPS.length}`);
    if (focusKey) requestAnimationFrame(() => root.current?.querySelector<HTMLElement>(`[data-grip-key="${focusKey}"]`)?.focus({ preventScroll: true }));
  };

  const rowActions = (k: string): GripAction[] => {
    const here = groupOfKey(grouping, k);
    return [
      { label: 'Move up', run: () => run({ op: 'by', key: k, by: -1 }, k) },
      { label: 'Move down', run: () => run({ op: 'by', key: k, by: 1 }, k) },
      { label: 'Move to group…', items: order.filter((g) => g !== here).map((g) => ({ label: groupLabel(g), run: () => run({ op: 'toGroup', key: k, group: g }, k) })) },
      ...(KEPT.includes(k) ? [] : [{ label: 'Remove', danger: true, run: () => run({ op: 'remove', key: k }) }]),
    ];
  };

  return (
    <div ref={root} className="ej-ol" aria-label={label} role="group">
      <div className="sr-only" aria-live="polite">
        {said}
      </div>
      {order.map((g, gi) => {
        const inGroup = keys.filter((k) => groupOfKey(grouping, k) === g);
        const missing = ro ? [] : SECTIONS.filter((d) => d.group === g && !keys.includes(d.key));
        const first = drop && drop.after === null && drop.group === g;
        return (
          <section key={g} className="ej-ol-group" data-group-block={g} data-drop-before={groupDrop?.before === g || undefined} data-drop-end={(groupDrop && groupDrop.before === null && gi === order.length - 1) || undefined} aria-label={groupLabel(g)}>
            <div className="ej-ol-gtitle" data-drop-group={g} data-drop={first ? 'first' : undefined}>
              {!ro && (
                <Grip
                  className="ej-grip ej-ol-ggrip"
                  size={12}
                  gripKey={`group:${g}`}
                  label={`Move the group ${groupLabel(g)}, or press for its menu`}
                  tip="Drag to move the group, or press for more"
                  actions={[
                    { label: 'Move up', run: () => run({ op: 'groupBy', group: g, by: -1 }, `group:${g}`) },
                    { label: 'Move down', run: () => run({ op: 'groupBy', group: g, by: 1 }, `group:${g}`) },
                  ]}
                  onKey={(by) => run({ op: 'groupBy', group: g, by }, `group:${g}`)}
                  onDrag={(y) => setGroupDrop({ before: groupDropAt(root.current, y, g) })}
                  onDrop={(y) => {
                    setGroupDrop(null);
                    if (y !== null) run({ op: 'groupBefore', group: g, before: groupDropAt(root.current, y, g) as GroupKey | null });
                  }}
                />
              )}
              <span>{groupLabel(g)}</span>
            </div>
            {inGroup.length > 0 && (
              <ul className="ej-ol-rows">
                {inGroup.map((k) => (
                  <li key={k} className="ej-ol-row" data-drop-key={k} data-drop-group={g} data-drop={drop?.after === k ? 'after' : undefined}>
                    {!ro && (
                      <Grip
                        gripKey={k}
                        label={`Move ${heading(k)}, or press for its menu`}
                        tip="Drag to move, or press for more"
                        actions={rowActions(k)}
                        onKey={(by) => run({ op: 'by', key: k, by }, k)}
                        onDrag={(y) => setDrop(dropAt(root.current, y, k))}
                        onDrop={(y) => {
                          setDrop(null);
                          if (y === null) return;
                          const at = dropAt(root.current, y, k);
                          run({ op: 'drop', key: k, after: at.after, group: (at.group ?? order[0]) as GroupKey }, k);
                        }}
                      />
                    )}
                    <InlineHeading value={heading(k)} readOnly={ro} onCommit={(v) => run({ op: 'rename', key: k, heading: v })} />
                    {marks[k] && (
                      <Tip label={marks[k]}>
                        <span className="ej-ol-mark" tabIndex={0}>
                          <Languages size={11} strokeWidth={2} aria-hidden />
                          <span className="sr-only">{marks[k]}</span>
                        </span>
                      </Tip>
                    )}
                    {!ro && !KEPT.includes(k) && (
                      <Tip label="Remove; Undo brings it back">
                        <button type="button" className="ej-ol-x" onClick={() => run({ op: 'remove', key: k })} aria-label={`Remove ${heading(k)}`}>
                          <X size={12} strokeWidth={2} />
                        </button>
                      </Tip>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {missing.length > 0 && (
              <div className="ej-ol-chips">
                {missing.map((d) => {
                  const rec = recommended.includes(d.key);
                  return (
                    <Tip key={d.key} label={`${d.hint}${rec ? ' · recommended for this job' : ''}`}>
                      <button type="button" className="ej-add" data-recommended={rec} onClick={() => run({ op: 'add', key: d.key, group: g })} aria-label={`Add ${d.label}${rec ? ', recommended for this job' : ''}`}>
                        <Plus size={11} strokeWidth={2} aria-hidden />
                        {d.label}
                        {rec && <Sparkles size={10} strokeWidth={2} aria-hidden className="ej-ol-rec" />}
                      </button>
                    </Tip>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
