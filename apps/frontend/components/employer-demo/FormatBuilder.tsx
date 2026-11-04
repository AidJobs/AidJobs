'use client';

import { X } from 'lucide-react';
import { useState } from 'react';
import Tip from '@/components/site/Tip';
import { createFormat } from './actions';
import DragList, { moveItem } from './DragList';
import { FAMILIES_ORDER, GROUPS, SECTION_BY_KEY, SECTIONS } from './engine';
import { useDemo } from './store';
import type { Format, Tone } from './types';
import { Dialog, inputStyle } from './ui';

const TONES: Array<{ key: Tone; label: string; tip: string }> = [
  { key: 'formal', label: 'Formal', tip: 'Third person, as UN and donor job descriptions put it: "The incumbent will…"' },
  { key: 'warm', label: 'Warm', tip: 'Second person, as most NGOs write: "You will…"' },
  { key: 'plain', label: 'Plain', tip: 'Short sentences and everyday words' },
];

/** Name a format, choose and order its sections, and save it for reuse. */
export default function CreateFormatDialog({ onClose, onSaved }: { onClose: () => void; onSaved?: (key: string) => void }) {
  const s = useDemo();
  const formats = s.formats.filter((f) => !f.key.startsWith('pasted-'));
  const [name, setName] = useState('');
  const [from, setFrom] = useState('');
  const [order, setOrder] = useState<Format['order']>([]);
  const [tone, setTone] = useState<Tone>('warm');
  const has = (k: string) => order.some((o) => o.key === k);
  const toggle = (k: string) => setOrder(has(k) ? order.filter((o) => o.key !== k) : [...order, { key: k, heading: SECTION_BY_KEY[k].label }]);
  const startFrom = (key: string) => {
    setFrom(key);
    const f = formats.find((x) => x.key === key);
    setOrder(f ? f.order.map((o) => ({ ...o })) : []);
    if (f) setTone(f.tone);
  };
  const taken = formats.some((f) => f.label.toLowerCase() === name.trim().toLowerCase());
  const problem = !name.trim() ? 'Give it a name' : taken ? 'A format with this name already exists' : order.length < 3 ? 'Choose at least 3 sections' : '';
  const save = () => {
    if (problem) return;
    const key = createFormat(name.trim(), order, tone);
    onSaved?.(key);
    onClose();
  };

  return (
    <Dialog
      title="Create your own JD format"
      subtitle="Name it, choose its sections and headings, and reuse it for any job description"
      onClose={onClose}
      wide
      footer={
        <div className="flex items-center justify-between gap-2">
          <span className="aj-faint" style={{ fontSize: 12 }}>
            {problem || `${order.length} sections · saved under Your organisation`}
          </span>
          <button type="button" className="aj-ink-btn" disabled={Boolean(problem)} onClick={save}>
            Save format
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="ej-panel-label">Name</span>
            <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="For example: Riverstone field roles" autoFocus />
          </label>
          <label className="flex flex-col gap-1">
            <span className="ej-panel-label">Start from</span>
            <select className="ej-select" value={from} onChange={(e) => startFrom(e.target.value)}>
              <option value="">Blank</option>
              {FAMILIES_ORDER.map((fam) => {
                const list = formats.filter((f) => f.family === fam);
                return list.length ? (
                  <optgroup key={fam} label={fam}>
                    {list.map((f) => (
                      <option key={f.key} value={f.key}>
                        {f.label}
                      </option>
                    ))}
                  </optgroup>
                ) : null;
              })}
            </select>
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-3">
            <span className="ej-panel-label">Sections</span>
            {GROUPS.map((g) => (
              <div key={g.key} className="flex flex-col gap-1.5">
                <span style={{ fontSize: 12, fontWeight: 650 }}>{g.label}</span>
                <div className="flex flex-wrap gap-1.5">
                  {SECTIONS.filter((d) => d.group === g.key).map((d) => (
                    <Tip key={d.key} label={d.hint}>
                      <button type="button" className="ej-tag" data-on={has(d.key)} aria-pressed={has(d.key)} onClick={() => toggle(d.key)}>
                        {d.label}
                      </button>
                    </Tip>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="ej-panel-label">Headings, in order</span>
            {order.length === 0 && <span className="aj-faint">Choose sections on the left, or start from a format.</span>}
            <DragList ids={order.map((o) => o.key)} label={(k) => order.find((o) => o.key === k)?.heading ?? k} onMove={(from, to) => setOrder(moveItem(order, from, to))}>
              {(k) => {
                const i = order.findIndex((o) => o.key === k);
                const o = order[i];
                return (
                  <>
                    <input style={{ ...inputStyle, minHeight: 32, padding: '4px 10px' }} value={o.heading} onChange={(e) => setOrder(order.map((x, n) => (n === i ? { ...x, heading: e.target.value } : x)))} aria-label={`Heading ${i + 1}`} />
                    <button type="button" className="aj-icon-btn shrink-0" style={{ width: 28, height: 28 }} onClick={() => toggle(o.key)} aria-label={`Remove ${o.heading}`}>
                      <X size={13} strokeWidth={2} />
                    </button>
                  </>
                );
              }}
            </DragList>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="ej-panel-label">Tone</span>
          <div className="flex gap-1.5">
            {TONES.map((t) => (
              <Tip key={t.key} label={t.tip}>
                <button type="button" className="aj-pill" data-active={tone === t.key} aria-pressed={tone === t.key} onClick={() => setTone(t.key)}>
                  {t.label}
                </button>
              </Tip>
            ))}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
