'use client';

import Link from 'next/link';
import {
  ArrowLeft,
  Bookmark,
  Briefcase,
  CalendarPlus,
  Clock,
  ExternalLink,
  LayoutDashboard,
  Mail,
  MapPin,
  Menu,
  Search,
  Share2,
  SlidersHorizontal,
} from 'lucide-react';
import Flag from '../_components/Flag';
import Tip from '../_components/Tip';
import { useDemoSettings } from '../_components/DemoRoot';

const SWATCHES: Array<{ name: string; token: string; use: string }> = [
  { name: 'Page wash', token: '--wash', use: 'Faint tint behind everything' },
  { name: 'Surface', token: '--surface', use: 'Cards, menu, sheets' },
  { name: 'Surface 2', token: '--surface-2', use: 'Hover, quiet chips' },
  { name: 'Hairline', token: '--hair', use: 'Borders and dividers' },
  { name: 'Ink', token: '--ink', use: 'Active and primary' },
  { name: 'Text 2', token: '--text-2', use: 'Secondary text' },
  { name: 'Text 3', token: '--text-3', use: 'Labels and counts' },
  { name: 'Sage 1', token: '--sage-1', use: 'Option hover' },
  { name: 'Sage 2', token: '--sage-2', use: 'Selected row, tint chips' },
  { name: 'Sage 3', token: '--sage-3', use: 'Active outlines' },
  { name: 'Sage 7', token: '--sage-7', use: 'Logo star, focus, charts' },
  { name: 'Sage 8', token: '--sage-8', use: 'Text on sage' },
  { name: 'Amber', token: '--amber', use: 'Closes within 7 days' },
  { name: 'Red', token: '--red', use: 'Closes within 3 days' },
];

const ICONS = [
  { icon: Search, label: 'Search' },
  { icon: Briefcase, label: 'Organisation' },
  { icon: MapPin, label: 'Place' },
  { icon: Clock, label: 'Deadline' },
  { icon: Bookmark, label: 'Save' },
  { icon: Share2, label: 'Share' },
  { icon: CalendarPlus, label: 'Add to calendar' },
  { icon: Mail, label: 'Email to myself' },
  { icon: ExternalLink, label: 'Opens the employer page' },
  { icon: SlidersHorizontal, label: 'Columns' },
  { icon: LayoutDashboard, label: 'Dashboard' },
  { icon: Menu, label: 'Menu' },
];

export default function TokensPage() {
  const { font, theme } = useDemoSettings();
  return (
    <div className="dj-scroll h-full">
      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-6 lg:px-8">
        <div className="flex items-center gap-3">
          <Link href="/demo" className="dj-icon-btn" aria-label="Back to the demo">
            <ArrowLeft size={15} strokeWidth={1.8} />
          </Link>
          <div>
            <h1 className="dj-display" style={{ margin: 0 }}>
              Design tokens
            </h1>
            <p className="dj-muted" style={{ margin: 0 }}>
              Ink and sage · {font === 'inter' ? 'Inter' : 'Manrope'} · {theme} mode. Switch typeface and mode at the bottom of the menu on the demo pages.
            </p>
          </div>
        </div>

        <section className="flex flex-col gap-3">
          <h2 className="dj-title" style={{ margin: 0 }}>
            Colour
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {SWATCHES.map((s) => (
              <div key={s.token} className="flex flex-col gap-1.5">
                <div className="dj-swatch" style={{ background: `var(${s.token})` }} />
                <span style={{ fontWeight: 600 }}>{s.name}</span>
                <span className="dj-faint">{s.use}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="dj-title" style={{ margin: 0 }}>
            Type
          </h2>
          <div className="dj-card flex flex-col gap-3 p-5">
            <div className="dj-display">NGO, humanitarian and development jobs</div>
            <div className="dj-number">206</div>
            <div style={{ fontSize: 15, fontWeight: 650 }}>Child Protection Officer (NO-2), Fixed Term · 15px job title</div>
            <div style={{ fontSize: 13, fontWeight: 560 }}>WASH Officer (System Strengthening) · 13px list title</div>
            <div>UNICEF · Mexico City, Mexico · 12px body and metadata</div>
            <div className="dj-faint">Labels, counts, and hints · 12px tertiary</div>
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="dj-title" style={{ margin: 0 }}>
            Icons, with hover and long-press labels
          </h2>
          <div className="flex flex-wrap gap-2">
            {ICONS.map(({ icon: Icon, label }) => (
              <Tip key={label} label={label}>
                <span className="dj-icon-btn" aria-label={label}>
                  <Icon size={15} strokeWidth={1.8} />
                </span>
              </Tip>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="dj-title" style={{ margin: 0 }}>
            Controls
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <span className="dj-ink-btn">
              Apply on UNICEF <ExternalLink size={13} strokeWidth={2} />
            </span>
            <span className="dj-pill">
              <Briefcase size={13} strokeWidth={1.8} /> Organisation
            </span>
            <span className="dj-pill" data-active="true">
              <MapPin size={13} strokeWidth={1.8} /> Kenya
            </span>
            <span className="dj-chip" data-tone="sage">
              206 roles
            </span>
            <span className="dj-chip">
              <Clock size={11} strokeWidth={2} />
              24d
            </span>
            <span className="dj-chip" data-tone="amber">
              <Clock size={11} strokeWidth={2} />
              6d
            </span>
            <span className="dj-chip" data-tone="red">
              <Clock size={11} strokeWidth={2} />
              2d
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Flag iso="KE" title="Kenya" /> <Flag iso="NP" title="Nepal" /> <Flag iso="SS" title="South Sudan" /> <Flag iso="GB" title="United Kingdom" />
            </span>
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="dj-title" style={{ margin: 0 }}>
            Row states
          </h2>
          <div className="dj-card p-2">
            <div className="dj-row">
              <span className="dj-mark">UN</span>
              <div className="min-w-0 flex-1">
                <div style={{ fontSize: 13, fontWeight: 560 }}>Resting row</div>
                <div className="dj-muted">Organisation · Place</div>
              </div>
            </div>
            <div className="dj-row" data-active="true">
              <span className="dj-mark">UN</span>
              <div className="min-w-0 flex-1">
                <div style={{ fontSize: 13, fontWeight: 560 }}>Open job, sage highlight</div>
                <div className="dj-muted">Organisation · Place</div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
