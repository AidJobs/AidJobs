'use client';

import { Info, Upload as UploadIcon } from 'lucide-react';
import { useState, type DragEvent } from 'react';
import Tip from '@/components/site/Tip';
import { ACCEPTED, readJobFile } from './readFile';
import { Dialog, inputStyle } from './ui';

/**
 * One window for an existing job description: paste it, or choose or drop a file. Links are not read (section 19, step 2): many career
 * sites cannot be read automatically. The chat then asks whether to use only its headings or its wording too.
 */
export default function UploadDialog({ onClose, onUse }: { onClose: () => void; onUse: (text: string) => void }) {
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const [reading, setReading] = useState(false);

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    setReading(true);
    setNote('');
    const r = await readJobFile(file);
    setReading(false);
    if (r.error) return setNote(r.error);
    setText(r.text ?? '');
  };
  const drop = (e: DragEvent) => {
    e.preventDefault();
    void readFile(e.dataTransfer.files?.[0]);
  };

  return (
    <Dialog
      title="Upload a job description"
      subtitle="Use its headings, or its wording too"
      onClose={onClose}
      wide
      footer={
        <div className="flex items-center justify-between gap-2">
          <span className="aj-faint" style={{ fontSize: 11 }}>
            Demo: files are read in your browser.
          </span>
          <button type="button" className="aj-ink-btn" disabled={!text.trim() || reading} onClick={() => onUse(text)}>
            Use this job description
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <textarea
          style={{ ...inputStyle, minHeight: 200, lineHeight: 1.5 }}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={drop}
          placeholder={reading ? 'Reading the file…' : 'Paste a job description or terms of reference, or drop a file here'}
          aria-label="Job description text"
        />
        <div className="flex flex-wrap items-center gap-2">
          <label className="aj-pill" style={{ cursor: 'pointer' }}>
            <UploadIcon size={13} strokeWidth={1.8} /> Choose a file
            <input type="file" accept={ACCEPTED} className="sr-only" onChange={(e) => void readFile(e.target.files?.[0])} />
          </label>
          <Tip label="Text, Word (.docx), or PDF, up to 10 MB. Older .doc files and scanned PDFs cannot be read.">
            <span className="inline-flex aj-faint" tabIndex={0} aria-label="Which files work">
              <Info size={14} strokeWidth={1.8} />
            </span>
          </Tip>
          <span className="aj-faint" style={{ fontSize: 12 }}>
            Links can&apos;t be read: paste the text or use the file.
          </span>
        </div>
        {note && (
          <span role="alert" style={{ color: 'var(--red)', fontSize: 12 }}>
            {note}
          </span>
        )}
      </div>
    </Dialog>
  );
}
