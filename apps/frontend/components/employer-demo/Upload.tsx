'use client';

import { ArrowUp, Info, Upload as UploadIcon } from 'lucide-react';
import { useState, type DragEvent } from 'react';
import Tip from '@/components/site/Tip';
import { importJobDescription } from './actions';
import { ACCEPTED, readJobFile } from './readFile';
import { LINKED_SAMPLE } from './sample';
import { go } from './store';
import { Dialog, inputStyle } from './ui';

function hostOf(link: string): string {
  try {
    const u = new URL(link.trim());
    return /^https?:$/.test(u.protocol) && u.hostname.includes('.') ? u.hostname : '';
  } catch {
    return '';
  }
}

/** One window for an existing job description: paste it, choose or drop a file, or give a link. */
export default function UploadDialog({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState('');
  const [link, setLink] = useState('');
  const [save, setSave] = useState(false);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [reading, setReading] = useState(false);
  const host = hostOf(link);

  const finish = (body: string, fromHost?: string) => {
    const id = importJobDescription(body, { host: fromHost, saveAs: save ? name : undefined });
    if (!id) return setNote('No headings or text were found. Headings work best on their own lines.');
    onClose();
    go('create', id);
  };
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
  const blocked = save && !name.trim();

  return (
    <Dialog
      title="Upload a job description"
      subtitle="Your wording and headings are kept"
      onClose={onClose}
      wide
      footer={
        <div className="flex items-center justify-between gap-2">
          <span className="aj-faint" style={{ fontSize: 11 }}>
            Demo: files are read in your browser; links use a sample.
          </span>
          <button type="button" className="aj-ink-btn" disabled={!text.trim() || blocked || reading} onClick={() => finish(text)}>
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
        </div>
        <div className="flex items-center gap-1.5">
          <input
            style={{ ...inputStyle, flex: 1 }}
            value={link}
            onChange={(e) => setLink(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && host && !blocked && finish(LINKED_SAMPLE, host)}
            placeholder="Or paste a link to a job description"
            aria-label="Link to a job description"
            inputMode="url"
          />
          <Tip label="A public page only; AidJobs reads that one page once.">
            <span className="inline-flex aj-faint" tabIndex={0} aria-label="About links">
              <Info size={14} strokeWidth={1.8} />
            </span>
          </Tip>
          <button type="button" className="aj-ink-btn" style={{ width: 36, height: 36, padding: 0, justifyContent: 'center' }} disabled={!host || blocked} onClick={() => finish(LINKED_SAMPLE, host)} aria-label="Use the job description at this link">
            <ArrowUp size={16} strokeWidth={2.2} />
          </button>
        </div>
        <div className="flex flex-col gap-1.5 border-t pt-3 aj-hair">
          <label className="flex items-center gap-2" style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} />
            Save its headings as a JD format
          </label>
          {save && <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Name it, for example: Riverstone field roles" aria-label="JD format name" autoFocus />}
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
