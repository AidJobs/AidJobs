export function Sparkline({ values, width = 96, height = 28, label }: { values: number[]; width?: number; height?: number; label: string }) {
  const max = Math.max(...values, 1);
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const points = values.map((v, i) => `${(i * step).toFixed(1)},${(height - 3 - (v / max) * (height - 6)).toFixed(1)}`).join(' ');
  const last = values[values.length - 1] ?? 0;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
      <polyline points={points} fill="none" stroke="var(--sage-7)" strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={(values.length - 1) * step} cy={height - 3 - (last / max) * (height - 6)} r={2.6} fill="var(--sage-7)" />
    </svg>
  );
}

export function Gauge({ value, total, size = 180 }: { value: number; total: number; size?: number }) {
  const pct = total > 0 ? Math.min(1, value / total) : 0;
  const r = size / 2 - 12;
  const cx = size / 2;
  const cy = size / 2;
  const arc = (from: number, to: number) => {
    const a0 = Math.PI * (1 - from);
    const a1 = Math.PI * (1 - to);
    const x0 = cx + r * Math.cos(a0);
    const y0 = cy - r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy - r * Math.sin(a1);
    return `M ${x0} ${y0} A ${r} ${r} 0 0 1 ${x1} ${y1}`;
  };
  return (
    <svg width={size} height={size / 2 + 8} viewBox={`0 0 ${size} ${size / 2 + 8}`} role="img" aria-label={`${value} of ${total}`}>
      <path d={arc(0, 1)} fill="none" stroke="var(--sage-2)" strokeWidth={14} strokeLinecap="round" />
      <path d={arc(0, pct)} fill="none" stroke="var(--sage-7)" strokeWidth={14} strokeLinecap="round" />
    </svg>
  );
}

export function Bar({ pct, tone = 'sage' }: { pct: number; tone?: 'sage' | 'ink' }) {
  return (
    <div style={{ height: 6, borderRadius: 6, background: 'var(--surface-2)', overflow: 'hidden' }}>
      <div style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: '100%', borderRadius: 6, background: tone === 'ink' ? 'var(--ink)' : 'var(--sage-5)' }} />
    </div>
  );
}
