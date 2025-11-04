'use client';

import { useState } from 'react';
import { 
  Button, 
  IconButton, 
  Input, 
  FilterChip, 
  Sheet, 
  Tooltip,
  TooltipProvider,
  useThemeContext 
} from '@aidjobs/ui';
import { Palette, Sun, Moon } from 'lucide-react';
import type { PaletteKey } from '@aidjobs/ui/tokens/palettes';

export default function ThemePage() {
  const { theme, toggleTheme, palette, setPalette, mounted } = useThemeContext();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<string>('');

  if (!mounted) {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold text-foreground mb-2">Theme Controls</h1>
          <p className="text-muted-foreground mb-8">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background p-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-foreground mb-2">Theme Controls</h1>
              <p className="text-muted-foreground">
                Switch palettes and preview all UI primitives
              </p>
            </div>
            <IconButton
              onClick={toggleTheme}
              variant="outline"
              size="md"
              icon={theme === 'light' ? Moon : Sun}
              aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            />
          </div>

          <div className="bg-surface border border-border rounded-lg p-6 mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-4">Palette Selection</h2>
            <div className="flex items-center gap-4">
              <label htmlFor="palette-select" className="text-sm font-medium text-foreground">
                Active Palette:
              </label>
              <select
                id="palette-select"
                value={palette}
                onChange={(e) => setPalette(e.target.value as PaletteKey)}
                className="h-10 w-48 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="mint">Mint (Soft Green)</option>
                <option value="sand">Sand (Soft Beige)</option>
              </select>
            </div>
            <p className="text-xs text-muted-foreground mt-4">
              Selection persists in localStorage as <code className="bg-muted px-1 rounded">aidjobs.theme.palette</code>
            </p>
          </div>

          <div className="bg-surface border border-border rounded-lg p-6 mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-4">Live Preview</h2>
            
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-3">Buttons</h3>
                <div className="flex flex-wrap gap-3">
                  <Button variant="default" size="md">Default Button</Button>
                  <Button variant="outline" size="md">Outline Button</Button>
                  <Button variant="ghost" size="md">Ghost Button</Button>
                  <Button variant="primary" size="md">Primary Button</Button>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-foreground mb-3">Icon Buttons</h3>
                <div className="flex flex-wrap gap-3">
                  <IconButton variant="default" size="md" icon={Palette} aria-label="Default" />
                  <IconButton variant="outline" size="md" icon={Palette} aria-label="Outline" />
                  <IconButton variant="ghost" size="md" icon={Palette} aria-label="Ghost" />
                  <IconButton variant="primary" size="md" icon={Palette} aria-label="Primary" />
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-foreground mb-3">Filter Chips</h3>
                <div className="flex flex-wrap gap-2">
                  <FilterChip
                    label="Active Filter"
                    active={selectedFilter === 'active'}
                    onClick={() => setSelectedFilter('active')}
                  />
                  <FilterChip
                    label="Inactive Filter"
                    active={selectedFilter === 'inactive'}
                    onClick={() => setSelectedFilter('inactive')}
                  />
                  <FilterChip
                    label="Remote Work"
                    active={selectedFilter === 'remote'}
                    onClick={() => setSelectedFilter('remote')}
                  />
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-foreground mb-3">Input</h3>
                <Input
                  placeholder="Type something..."
                  className="max-w-md"
                />
              </div>

              <div>
                <h3 className="text-sm font-semibold text-foreground mb-3">Tooltip</h3>
                <Tooltip content="This is a helpful tooltip">
                  <Button variant="outline" size="sm">Hover me</Button>
                </Tooltip>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-foreground mb-3">Sheet</h3>
                <Button
                  variant="default"
                  size="md"
                  onClick={() => setSheetOpen(true)}
                >
                  Open Sheet
                </Button>
              </div>
            </div>
          </div>

          <div className="bg-surface border border-border rounded-lg p-6">
            <h2 className="text-xl font-semibold text-foreground mb-4">Color Tokens</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {[
                { name: 'Primary', var: '--primary', fg: '--primary-foreground' },
                { name: 'Accent', var: '--accent', fg: '--accent-foreground' },
                { name: 'Background', var: '--bg', fg: '--fg' },
                { name: 'Surface', var: '--surface', fg: '--fg' },
                { name: 'Muted', var: '--muted', fg: '--muted-foreground' },
                { name: 'Warning', var: '--warning', fg: '--fg' },
              ].map(({ name, var: colorVar, fg }) => (
                <div key={name} className="flex items-center gap-3">
                  <div
                    className="w-12 h-12 rounded border border-border flex-shrink-0"
                    style={{ backgroundColor: `hsl(var(${colorVar}))` }}
                  />
                  <div>
                    <div className="text-sm font-medium text-foreground">{name}</div>
                    <div className="text-xs text-muted-foreground font-mono">{colorVar}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <Sheet
          isOpen={sheetOpen}
          onClose={() => setSheetOpen(false)}
          title="Example Sheet"
        >
          <div className="space-y-4">
            <p className="text-foreground">
              This is an example sheet component demonstrating the current theme and palette.
            </p>
            <p className="text-muted-foreground">
              Notice how all colors adapt to the selected palette seamlessly.
            </p>
            <div className="flex gap-2">
              <Button variant="primary" size="sm">Action</Button>
              <Button variant="outline" size="sm" onClick={() => setSheetOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </Sheet>
      </div>
    </TooltipProvider>
  );
}
