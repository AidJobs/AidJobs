import { Star } from 'lucide-react';
import { AccessibilityPanel, ThemeToggle } from '@/components/site/SettingsPanel';

export default function SitePage() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-4 pt-3 lg:px-6 lg:pt-6">
        <Star size={18} strokeWidth={2} style={{ color: 'var(--sage-7)' }} />
        <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em' }}>aidjobs</span>
      </div>
      <div className="px-4 pt-1 lg:px-6">
        <h1 className="aj-display aj-h1" style={{ margin: 0 }}>
          NGO, humanitarian and development jobs
        </h1>
      </div>
      <div className="mt-auto flex items-center gap-1 border-t px-3 py-3 aj-hair">
        <ThemeToggle />
        <AccessibilityPanel />
      </div>
    </div>
  );
}
