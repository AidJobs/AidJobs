'use client';

import { Languages, Plus, Sparkles, X } from 'lucide-react';
import { useRef, useState } from 'react';
import Tip from '@/components/site/Tip';
import { SECTION_BY_KEY, SECTIONS } from './engine';
import Grip, { dropAt, groupDropAt, type GripAction } from './Grip';
import { applyOp, groupLabelOf, groupOfKey, groupOrderOf, isCatalogGroup, isCustomGroup, KEPT, placeSaid, type OutlineOp } from './outline';
import type { CustomGroup, GroupKey, Grouping } from './types';

/** A heading that reads as plain text: clicked, it becomes a field; Enter or leaving it saves, Escape keeps the old one. */
function InlineHeading({ value, onCommit, readOnly, label }: { value: string; onCommit: (v: string) => void; readOnly?: boolean; label?: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  if (readOnly) return <span className="ej-ol-head">{value}</span>;
  if (draft === null)
    return (
      <Tip label="Click to rename" className="min-w-0 flex-1">
        <button type="button" className="ej-ol-head" onClick={() => setDraft(value)} aria-label={`${label ?? value}. Rename`}>
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
      aria-label={`New name for ${label ?? value}`}
    />
  );
}

/** A quiet name field that opens when "Add your own" or "Add a group" is chosen. */
function NameField({ label, onCommit, onCancel }: { label: string; onCommit: (v: string) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState('');
  return (
    <input
      className="ej-ol-input"
      style={{ minWidth: 120 }}
      value={draft}
      autoFocus
      placeholder={label}
      aria-label={label}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft.trim()) onCommit(draft.trim());
        else onCancel();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (draft.trim()) onCommit(draft.trim());
          else onCancel();
        }
        if (e.key === 'Escape') {
          e.stopPropagation();
          onCancel();
        }
      }}
    />
  );
}

export type OutlineProps = {
  /** The sections in reading order, with their headings. */
  rows: Array<{ key: string; heading: string }>;
  grouping: Grouping;
  /** Groups the user added (section 19, phase 6 amendment). */
  customGroups?: CustomGroup[];
  /** What a change does; without it the outline is read only (reviewers). */
  onOp?: (op: OutlineOp) => void;
  recommended?: string[];
  /** Differences by language ("French only", "Not in Arabic"), shown as a small mark with its text. */
  marks?: Record<string, string>;
  label?: string;
};

/**
 * The outline, one design wherever it appears (section 19, phase 6, B and the amendment): groups and their sections, catalog chips,
 * Add your own section, Add a group. Sub-sections stay in ✎, not here.
 */
export default function OutlineEditor({ rows, grouping, customGroups, onOp, recommended = [], marks = {}, label = 'Sections, by group' }: OutlineProps) {
  const root = useRef<HTMLDivElement>(null);
  const [drop, setDrop] = useState<{ after: string | null; group: string | null } | null>(null);
  const [groupDrop, setGroupDrop] = useState<{ before: string | null } | null>(null);
  const [said, setSaid] = useState('');
  const [adding, setAdding] = useState<{ kind: 'section'; group: GroupKey } | { kind: 'group' } | null>(null);
  const full = { ...grouping, customGroups };
  const keys = rows.map((r) => r.key);
  const heading = (k: string) => rows.find((r) => r.key === k)?.heading ?? SECTION_BY_KEY[k]?.label ?? k;
  const order = groupOrderOf(full);
  const ro = !onOp;
  const groupLabel = (g: GroupKey) => groupLabelOf(g, customGroups);

  const run = (op: OutlineOp, focusKey?: string) => {
    if (!onOp) return;
    const next = applyOp(keys, full, op.op === 'add' || op.op === 'addCustom' || op.op === 'addGroup' || op.op === 'removeGroup' || op.op === 'renameGroup' ? op : op);
    onOp(op);
    if (op.op === 'remove') setSaid(`${heading(op.key)} removed`);
    else if (op.op === 'add') setSaid(`${heading(op.key)} added: ${placeSaid(next.keys, { ...next.grouping, customGroups }, op.key, heading(op.key))}`);
    else if (op.op === 'addCustom') setSaid(`${op.heading.trim()} added`);
    else if (op.op === 'addGroup') setSaid(`Added the group ${op.label.trim()}`);
    else if (op.op === 'removeGroup') setSaid(`Removed the group ${groupLabel(op.group)}`);
    else if (op.op === 'renameGroup') setSaid(`Renamed the group to ${op.label.trim()}`);
    else if ('key' in op) setSaid(`Moved. ${placeSaid(next.keys, { ...next.grouping, customGroups }, op.key, heading(op.key))}`);
    else setSaid(`Moved the group ${groupLabel(op.group)}: ${groupOrderOf({ ...next.grouping, customGroups }).indexOf(op.group) + 1} of ${order.length}`);
    if (focusKey) requestAnimationFrame(() => root.current?.querySelector<HTMLElement>(`[data-grip-key="${focusKey}"]`)?.focus({ preventScroll: true }));
  };

  const rowActions = (k: string): GripAction[] => {
    const here = groupOfKey(full, k);
    return [
      { label: 'Move up', run: () => run({ op: 'by', key: k, by: -1 }, k) },
      { label: 'Move down', run: () => run({ op: 'by', key: k, by: 1 }, k) },
      { label: 'Move to group…', items: order.filter((g) => g !== here).map((g) => ({ label: groupLabel(g), run: () => run({ op: 'toGroup', key: k, group: g }, k) })) },
      ...(KEPT.includes(k) ? [] : [{ label: 'Remove', danger: true, run: () => run({ op: 'remove', key: k }) }]),
    ];
  };

  const groupActions = (g: GroupKey): GripAction[] => [
    { label: 'Move up', run: () => run({ op: 'groupBy', group: g, by: -1 }, `group:${g}`) },
    { label: 'Move down', run: () => run({ op: 'groupBy', group: g, by: 1 }, `group:${g}`) },
    ...(isCustomGroup(g) ? [{ label: 'Remove', danger: true, run: () => run({ op: 'removeGroup', group: g }) }] : []),
  ];

  return (
    <div ref={root} className="ej-ol" aria-label={label} role="group">
      <div className="sr-only" role="status">
        {said}
      </div>
      {order.map((g, gi) => {
        const inGroup = keys.filter((k) => groupOfKey(full, k) === g);
        const missing = ro || !isCatalogGroup(g) ? [] : SECTIONS.filter((d) => d.group === g && !keys.includes(d.key));
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
                  actions={groupActions(g)}
                  onKey={(by) => run({ op: 'groupBy', group: g, by }, `group:${g}`)}
                  onDrag={(y) => setGroupDrop({ before: groupDropAt(root.current, y, g) })}
                  onDrop={(y) => {
                    setGroupDrop(null);
                    if (y !== null) run({ op: 'groupBefore', group: g, before: groupDropAt(root.current, y, g) as GroupKey | null });
                  }}
                />
              )}
              {isCustomGroup(g) && !ro ? (
                <InlineHeading value={groupLabel(g)} onCommit={(v) => run({ op: 'renameGroup', group: g, label: v })} label={`Group ${groupLabel(g)}`} />
              ) : (
                <span>{groupLabel(g)}</span>
              )}
              {isCustomGroup(g) && !ro && (
                <Tip label="Remove this group; How to apply stays">
                  <button type="button" className="ej-ol-x" onClick={() => run({ op: 'removeGroup', group: g })} aria-label={`Remove the group ${groupLabel(g)}`}>
                    <X size={12} strokeWidth={2} />
                  </button>
                </Tip>
              )}
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
            {!ro && (
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
                {adding?.kind === 'section' && adding.group === g ? (
                  <NameField
                    label="Name this section"
                    onCommit={(v) => {
                      setAdding(null);
                      run({ op: 'addCustom', heading: v, group: g });
                    }}
                    onCancel={() => setAdding(null)}
                  />
                ) : (
                  <Tip label="Add a section of your own in this group">
                    <button type="button" className="ej-add" onClick={() => setAdding({ kind: 'section', group: g })} aria-label={`Add your own section in ${groupLabel(g)}`}>
                      <Plus size={11} strokeWidth={2} aria-hidden />
                      Add your own
                    </button>
                  </Tip>
                )}
              </div>
            )}
          </section>
        );
      })}
      {!ro && (
        <div className="ej-ol-chips" style={{ marginTop: 4 }}>
          {adding?.kind === 'group' ? (
            <NameField
              label="Name this group"
              onCommit={(v) => {
                setAdding(null);
                run({ op: 'addGroup', label: v });
              }}
              onCancel={() => setAdding(null)}
            />
          ) : (
            <Tip label="Add a group of your own">
              <button type="button" className="ej-add" onClick={() => setAdding({ kind: 'group' })} aria-label="Add a group">
                <Plus size={11} strokeWidth={2} aria-hidden />
                Add a group
              </button>
            </Tip>
          )}
        </div>
      )}
    </div>
  );
}
