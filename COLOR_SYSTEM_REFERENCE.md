# Color System Reference - AidJobs Admin

## 🎨 **APPLE-STYLE MONOCHROMATIC COLOR SYSTEM**

We are using an **Apple-inspired monochromatic color system** with minimal accent colors.

---

## 📋 **PRIMARY PALETTE (Monochromatic)**

### **Text Colors:**
- **Primary Text (Dark Gray)**: `#1D1D1F` 
  - Used for: Headings, primary content, important text
  - Tailwind: `text-[#1D1D1F]` or `text-foreground`
  - CSS Variable: `--fg: 29 29 31`

- **Secondary Text (Medium Gray)**: `#86868B`
  - Used for: Subtitles, labels, secondary information
  - Tailwind: `text-[#86868B]` or `text-muted-foreground`
  - CSS Variable: `--muted-foreground: 134 134 139`

### **Background Colors:**
- **Pure White**: `#FFFFFF`
  - Used for: Main backgrounds, cards
  - Tailwind: `bg-white` or `bg-background`
  - CSS Variable: `--bg: 255 255 255`

- **Light Gray (Muted)**: `#F5F5F7`
  - Used for: Button backgrounds, hover states, subtle backgrounds
  - Tailwind: `bg-[#F5F5F7]` or `bg-muted`
  - CSS Variable: `--muted: 245 245 247`

- **Hover Gray**: `#E5E5E7`
  - Used for: Button hover states
  - Tailwind: `hover:bg-[#E5E5E7]`

- **Off-White (Surface)**: `#FBFBFD`
  - Used for: Subtle surface backgrounds
  - Tailwind: `bg-surface`
  - CSS Variable: `--surface: 251 251 253`

### **Border Colors:**
- **Border Gray**: `#D2D2D7`
  - Used for: Borders, dividers, separators
  - Tailwind: `border-[#D2D2D7]` or `border-border`
  - CSS Variable: `--border: 210 210 215`

### **Input Colors:**
- **Input Background**: `#F5F5F7`
  - Used for: Input fields, form backgrounds
  - Tailwind: `bg-input`
  - CSS Variable: `--input: 245 245 247`

---

## 🎯 **ACCENT COLORS (Minimal Use)**

### **Primary Blue:**
- **Primary Blue**: `#0071E3`
  - Used for: Links, primary actions (sparingly)
  - Tailwind: `text-[#0071E3]` or `text-primary`
  - CSS Variable: `--primary: 0 113 227`

- **Primary Blue Hover**: `#0077ED`
  - Used for: Primary button hover states
  - Tailwind: `hover:bg-[#0077ED]` or `hover:bg-primary-hover`
  - CSS Variable: `--primary-hover: 0 119 237`

### **Status Colors:**
- **Success Green**: `#30D158`
  - Used for: Success states, connected status
  - Tailwind: `text-[#30D158]` or `text-success`
  - CSS Variable: `--success: 48 209 88`

- **Warning Orange**: `#FF9500`
  - Used for: Warnings, indexing status
  - Tailwind: `text-[#FF9500]` or `text-warning`
  - CSS Variable: `--warning: 255 149 0`

- **Error Red**: `#FF3B30`
  - Used for: Errors, disconnected status
  - Tailwind: `text-[#FF3B30]` or `text-danger`
  - CSS Variable: `--danger: 255 59 48`

---

## 📐 **USAGE IN CODE**

### **Dashboard (Correct Usage):**
```tsx
// Headings
<h1 className="text-title font-semibold text-[#1D1D1F] mb-1">Dashboard</h1>
<p className="text-caption text-[#86868B]">System overview and status</p>

// Buttons (Icon-only)
<button className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#F5F5F7] hover:bg-[#E5E5E7]">
  <Icon className="w-4 h-4 text-[#86868B]" />
</button>

// Cards
<div className="bg-white border border-[#D2D2D7] rounded-lg p-4">
  <h2 className="text-body-lg font-semibold text-[#1D1D1F]">Title</h2>
  <p className="text-caption text-[#86868B]">Description</p>
</div>

// Status Indicators
<div className="w-2 h-2 bg-[#30D158] rounded-full"></div> // Success
<div className="w-2 h-2 bg-[#FF3B30] rounded-full"></div> // Error
<div className="w-2 h-2 bg-[#FF9500] rounded-full"></div> // Warning
```

### **Sources Page (Needs Update):**
```tsx
// ❌ WRONG - Old design
<h1 className="text-3xl font-bold text-gray-900">Sources Management</h1>
<button className="px-4 py-2 bg-blue-600 text-white rounded-md">Add Source</button>

// ✅ CORRECT - Apple design system
<h1 className="text-title font-semibold text-[#1D1D1F] mb-1">Sources Management</h1>
<button className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#F5F5F7] hover:bg-[#E5E5E7]">
  <Plus className="w-4 h-4 text-[#86868B]" />
</button>
```

---

## 🎨 **COLOR PALETTE SUMMARY**

| Color | Hex | Usage | Tailwind Class |
|-------|-----|-------|----------------|
| **Primary Text** | `#1D1D1F` | Headings, primary content | `text-[#1D1D1F]` |
| **Secondary Text** | `#86868B` | Subtitles, labels | `text-[#86868B]` |
| **Background** | `#FFFFFF` | Main backgrounds | `bg-white` |
| **Muted Background** | `#F5F5F7` | Button backgrounds | `bg-[#F5F5F7]` |
| **Hover Background** | `#E5E5E7` | Button hover | `hover:bg-[#E5E5E7]` |
| **Border** | `#D2D2D7` | Borders, dividers | `border-[#D2D2D7]` |
| **Success** | `#30D158` | Success states | `text-[#30D158]` |
| **Warning** | `#FF9500` | Warnings | `text-[#FF9500]` |
| **Error** | `#FF3B30` | Errors | `text-[#FF3B30]` |
| **Primary Blue** | `#0071E3` | Links, primary actions | `text-[#0071E3]` |

---

## 📝 **DESIGN PRINCIPLES**

1. **Monochromatic Base**: Use grays (`#1D1D1F`, `#86868B`, `#F5F5F7`, `#D2D2D7`) for most UI
2. **Minimal Accents**: Use blue (`#0071E3`) sparingly for primary actions
3. **Status Colors**: Use green/red/orange only for status indicators
4. **No Bright Colors**: Avoid bright blues, greens, or other vibrant colors for UI elements
5. **Subtle Shadows**: Use subtle shadows for depth
6. **Icon-Only Buttons**: Prefer icon-only buttons with tooltips over text buttons

---

## ✅ **CURRENT STATUS**

- ✅ **Dashboard**: Uses Apple design system correctly
- ✅ **Login Page**: Uses Apple design system correctly
- ❌ **Sources Page**: Still uses old design (blue buttons, gray-900, etc.)
- ❌ **Other Admin Pages**: Need to be updated

---

## 🔧 **HOW TO USE**

### **In Tailwind Classes:**
```tsx
// Text
className="text-[#1D1D1F]"        // Primary text
className="text-[#86868B]"        // Secondary text

// Backgrounds
className="bg-white"               // White background
className="bg-[#F5F5F7]"          // Light gray background
className="hover:bg-[#E5E5E7]"    // Hover state

// Borders
className="border border-[#D2D2D7]" // Border

// Status
className="text-[#30D158]"        // Success
className="text-[#FF3B30]"         // Error
className="text-[#FF9500]"         // Warning
```

### **Via CSS Variables (Recommended):**
```tsx
// Use Tailwind classes that map to CSS variables
className="text-foreground"        // #1D1D1F
className="text-muted-foreground"  // #86868B
className="bg-background"          // #FFFFFF
className="bg-muted"               // #F5F5F7
className="border-border"          // #D2D2D7
className="text-success"           // #30D158
className="text-danger"            // #FF3B30
className="text-warning"           // #FF9500
```

---

## 📚 **FILES TO REFERENCE**

- **CSS Variables**: `apps/frontend/app/globals.css`
- **Tailwind Config**: `apps/frontend/tailwind.config.js`
- **Design System Doc**: `APPLE_DESIGN_SYSTEM.md`
- **Dashboard Example**: `apps/frontend/app/admin/page.tsx`

---

**This is the color system we are using throughout the admin panel.**

