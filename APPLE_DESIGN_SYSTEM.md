# Apple-Style Design System for AidJobs

## Overview
This document defines the Apple-inspired design system for AidJobs, focusing on minimalism, clarity, and elegance. The design philosophy emphasizes clean typography, generous whitespace, and a monochromatic color palette with minimal accent colors.

## Design Principles

1. **Minimalism**: Remove unnecessary elements, focus on content
2. **Clarity**: Clear hierarchy, readable typography, obvious interactions
3. **Consistency**: Uniform spacing, typography, and component styles
4. **Elegance**: Subtle animations, smooth transitions, refined details
5. **Generosity**: Ample whitespace, comfortable reading, spacious layouts

## Typography

### Font Family
- **Primary**: System fonts (`-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", Roboto, sans-serif`)
- **Monospace**: `"SF Mono", Monaco, "Cascadia Code", "Roboto Mono", Consolas, monospace`

### Type Scale
- **Display Large**: `72px / 80px` (1.11 line-height) - Hero headings
- **Display**: `56px / 64px` (1.14 line-height) - Section headings
- **Headline**: `40px / 48px` (1.2 line-height) - Page titles
- **Title**: `28px / 34px` (1.21 line-height) - Card titles
- **Body Large**: `20px / 28px` (1.4 line-height) - Large body text
- **Body**: `17px / 24px` (1.41 line-height) - Default body text
- **Body Small**: `15px / 20px` (1.33 line-height) - Secondary text
- **Caption**: `13px / 18px` (1.38 line-height) - Labels, captions
- **Caption Small**: `11px / 16px` (1.45 line-height) - Fine print

### Font Weights
- **Regular**: 400 - Body text
- **Medium**: 500 - Emphasis
- **Semibold**: 600 - Headings, buttons
- **Bold**: 700 - Strong emphasis (sparingly)

### Letter Spacing
- **Tight**: -0.02em - Large headings
- **Normal**: 0 - Body text
- **Wide**: 0.01em - Uppercase labels

## Color System

### Primary Palette (Monochromatic)
- **Pure White**: `#FFFFFF` - Backgrounds
- **Off-White**: `#FBFBFD` - Subtle backgrounds
- **Light Gray**: `#F5F5F7` - Borders, dividers
- **Medium Gray**: `#86868B` - Secondary text
- **Dark Gray**: `#1D1D1F` - Primary text
- **Pure Black**: `#000000` - Strong emphasis (sparingly)

### Accent Colors (Minimal Use)
- **Primary Blue**: `#0071E3` - Links, primary actions
- **Primary Blue Hover**: `#0077ED` - Hover states
- **Success Green**: `#30D158` - Success states
- **Error Red**: `#FF3B30` - Errors, warnings
- **Orange Accent**: `#FF9500` - Special highlights (AidJobs brand)

### Semantic Colors
- **Background**: `#FFFFFF`
- **Foreground**: `#1D1D1F`
- **Muted**: `#86868B`
- **Border**: `#D2D2D7`
- **Input**: `#F5F5F7`
- **Primary**: `#0071E3`
- **Success**: `#30D158`
- **Error**: `#FF3B30`
- **Warning**: `#FF9500`

## Spacing System

### Base Unit: 4px
- **xs**: 4px
- **sm**: 8px
- **md**: 16px
- **lg**: 24px
- **xl**: 32px
- **2xl**: 48px
- **3xl**: 64px
- **4xl**: 96px
- **5xl**: 128px

### Section Spacing
- **Section Padding**: 80px vertical, 40px horizontal (mobile: 40px vertical, 20px horizontal)
- **Content Max Width**: 1200px (centered)
- **Grid Gutter**: 24px

## Layout

### Container
- **Max Width**: 1200px
- **Padding**: 40px (desktop), 20px (mobile)
- **Centered**: `margin: 0 auto`

### Grid System
- **Columns**: 12 columns
- **Gutter**: 24px
- **Breakpoints**:
  - Mobile: < 768px
  - Tablet: 768px - 1024px
  - Desktop: > 1024px

### Section Structure
```css
.section {
  padding: 80px 40px;
  max-width: 1200px;
  margin: 0 auto;
}
```

## Components

### Buttons

#### Primary Button
- **Background**: `#0071E3`
- **Text**: White
- **Padding**: 12px 24px
- **Border Radius**: 8px (subtle)
- **Font**: 17px, Semibold
- **Hover**: Slightly darker blue, subtle scale (1.02)
- **Active**: Scale down (0.98)

#### Secondary Button
- **Background**: Transparent
- **Border**: 1px solid `#D2D2D7`
- **Text**: `#1D1D1F`
- **Padding**: 12px 24px
- **Border Radius**: 8px
- **Font**: 17px, Medium
- **Hover**: Background `#F5F5F7`

#### Text Button
- **Background**: Transparent
- **Text**: `#0071E3`
- **Padding**: 8px 16px
- **Font**: 17px, Medium
- **Hover**: Underline

### Inputs

#### Text Input
- **Background**: `#F5F5F7`
- **Border**: 1px solid `#D2D2D7`
- **Border Radius**: 8px
- **Padding**: 12px 16px
- **Font**: 17px, Regular
- **Focus**: Border `#0071E3`, subtle shadow
- **Placeholder**: `#86868B`

#### Search Input
- **Background**: `#F5F5F7`
- **Border**: None
- **Border Radius**: 12px
- **Padding**: 16px 20px
- **Font**: 17px, Regular
- **Icon**: Left-aligned, `#86868B`

### Cards

#### Job Card
- **Background**: White
- **Border**: 1px solid `#D2D2D7`
- **Border Radius**: 12px
- **Padding**: 24px
- **Hover**: Subtle shadow, border `#0071E3`
- **Spacing**: 16px between cards

### Navigation

#### Header
- **Background**: White with blur effect
- **Height**: 64px
- **Padding**: 0 40px
- **Border**: Bottom 1px solid `#D2D2D7`
- **Sticky**: Yes
- **Logo**: Left-aligned, 24px height

#### Sidebar
- **Width**: 240px
- **Background**: `#FBFBFD`
- **Border**: Right 1px solid `#D2D2D7`
- **Padding**: 24px
- **Sticky**: Yes

### Modals/Drawers

#### Modal
- **Background**: White
- **Border Radius**: 16px (top corners only on mobile)
- **Padding**: 32px
- **Max Width**: 600px
- **Backdrop**: `rgba(0, 0, 0, 0.4)` with blur
- **Animation**: Fade in + scale (0.95 to 1.0)

#### Drawer
- **Background**: White
- **Width**: 400px (desktop), 100% (mobile)
- **Padding**: 24px
- **Animation**: Slide in from right
- **Backdrop**: `rgba(0, 0, 0, 0.4)`

## Animations

### Transitions
- **Duration**: 200ms (fast), 300ms (normal), 400ms (slow)
- **Easing**: `cubic-bezier(0.4, 0, 0.2, 1)` (Apple's standard easing)

### Hover Effects
- **Scale**: 1.02 (subtle)
- **Opacity**: 0.8 (for overlays)
- **Background**: Slight color shift

### Page Transitions
- **Fade**: 300ms ease-out
- **Slide**: 400ms cubic-bezier(0.4, 0, 0.2, 1)

## Shadows

### Elevation Levels
- **Level 1**: `0 1px 3px rgba(0, 0, 0, 0.1)` - Subtle elevation
- **Level 2**: `0 4px 12px rgba(0, 0, 0, 0.1)` - Cards, modals
- **Level 3**: `0 8px 24px rgba(0, 0, 0, 0.12)` - Elevated modals

## Border Radius

### Radius Scale
- **None**: 0px - Sharp edges (default)
- **Small**: 4px - Small elements
- **Medium**: 8px - Buttons, inputs
- **Large**: 12px - Cards
- **XLarge**: 16px - Modals

## Implementation Notes

### CSS Variables
All colors and spacing values should be defined as CSS variables for easy theming and consistency.

### Responsive Design
- Mobile-first approach
- Breakpoints at 768px and 1024px
- Touch-friendly targets (minimum 44x44px)

### Accessibility
- Minimum contrast ratio: 4.5:1 for text
- Focus indicators: 2px solid `#0071E3`
- Keyboard navigation: Full support
- Screen reader: Semantic HTML, ARIA labels

### Performance
- Use CSS transforms for animations (GPU-accelerated)
- Lazy load images
- Optimize font loading
- Minimize layout shifts

## Migration Strategy

1. **Phase 1**: Update design tokens (colors, typography, spacing)
2. **Phase 2**: Redesign homepage and search interface
3. **Phase 3**: Update components (buttons, inputs, cards)
4. **Phase 4**: Update admin panel (maintain current login design)
5. **Phase 5**: Update collections and saved pages
6. **Phase 6**: Polish animations and interactions

## Examples

### Hero Section
```tsx
<section className="py-32 px-10 text-center">
  <h1 className="text-7xl font-semibold text-[#1D1D1F] mb-6">
    Find Your Next Opportunity
  </h1>
  <p className="text-xl text-[#86868B] max-w-2xl mx-auto">
    Discover meaningful jobs in humanitarian and development work
  </p>
</section>
```

### Button
```tsx
<button className="px-6 py-3 bg-[#0071E3] text-white rounded-lg font-semibold text-base hover:bg-[#0077ED] transition-colors">
  Get Started
</button>
```

### Input
```tsx
<input
  type="text"
  className="w-full px-4 py-3 bg-[#F5F5F7] border border-[#D2D2D7] rounded-lg text-base focus:outline-none focus:border-[#0071E3]"
  placeholder="Search jobs..."
/>
```

---

**Last Updated**: 2024-01-XX
**Version**: 1.0.0

