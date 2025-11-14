# Bugs Found in Sources Page and Dashboard

## Critical Bugs

### 1. **Modal Position Shared State Bug** (Sources Page)
**Location:** `apps/frontend/app/admin/sources/page.tsx` lines 79, 900, 1124, 1260

**Issue:** All three modals (Add/Edit, Test Results, Simulation Results) share the same `modalPosition` state. When you drag one modal, it affects all modals because they all use the same state variable.

**Impact:** 
- Dragging one modal will move all modals to the same position
- Opening a different modal after dragging one will show it at the dragged position
- Confusing user experience

**Fix:** Each modal should have its own position state:
```typescript
const [addEditModalPosition, setAddEditModalPosition] = useState({ x: 0, y: 0 });
const [testModalPosition, setTestModalPosition] = useState({ x: 0, y: 0 });
const [simulateModalPosition, setSimulateModalPosition] = useState({ x: 0, y: 0 });
```

### 2. **Modal Drag Calculation Bug** (Sources Page)
**Location:** `apps/frontend/app/admin/sources/page.tsx` lines 103-114

**Issue:** The drag calculation is incorrect. `dragStart` is set relative to the modal's bounding rect, but then the calculation uses it relative to the container, causing the modal to jump when starting to drag.

**Current code:**
```typescript
setDragStart({
  x: e.clientX - rect.left,  // Relative to modal
  y: e.clientY - rect.top,
});
// Later:
const newX = e.clientX - dragStart.x - containerRect.left;  // Wrong calculation
```

**Fix:** Should track the initial mouse position relative to the viewport:
```typescript
setDragStart({
  x: e.clientX - modalPosition.x,  // Mouse position minus current modal offset
  y: e.clientY - modalPosition.y,
});
```

### 3. **Container Query Selector Bug** (Sources Page)
**Location:** `apps/frontend/app/admin/sources/page.tsx` line 106

**Issue:** Using `document.querySelector('.fixed.inset-0')` might select the wrong container if multiple modals are open, or if there are other elements with these classes.

**Fix:** Should use the specific modal's container or pass the container as a ref.

## Medium Priority Bugs

### 4. **showAdvanced State Not Reset When Opening Edit Modal** (Sources Page)
**Location:** `apps/frontend/app/admin/sources/page.tsx` lines 596-608

**Issue:** When opening the edit modal, `showAdvanced` is not set based on whether the source has advanced fields. If a user had advanced options open in the add modal, then opens edit modal, the advanced section might be incorrectly shown/hidden.

**Fix:** In `openEditModal`, check if source has advanced fields and set `showAdvanced` accordingly:
```typescript
const openEditModal = (source: Source) => {
  setEditingSource(source);
  setFormData({...});
  setShowEditModal(true);
  // Check if source has advanced fields
  setShowAdvanced(!!(source.org_type || source.time_window || 
    (source.parser_hint && source.source_type !== 'api')));
};
```

### 5. **Modal Position Not Reset When Switching Modals** (Sources Page)
**Location:** `apps/frontend/app/admin/sources/page.tsx` lines 900, 1124, 1260

**Issue:** When closing one modal and opening another, the position from the previous modal is retained. This could be confusing.

**Fix:** Reset position when opening a new modal, or use separate position states for each modal.

### 6. **Missing Error Handling in Dashboard fetchStatus** (Dashboard)
**Location:** `apps/frontend/app/admin/page.tsx` lines 160-166

**Issue:** If `crawlRes` exists but is not ok, it only logs a warning. The crawler status state might not be updated, leaving stale data.

**Fix:** Should set crawler status to null or error state when fetch fails:
```typescript
if (crawlRes && crawlRes.ok) {
  const crawlData = await crawlRes.json();
  setCrawlerStatus(crawlData.data || crawlData);
} else if (crawlRes) {
  console.warn('Crawler status unavailable:', crawlRes.status);
  setCrawlerStatus(null);  // Clear stale data
}
```

## Low Priority Bugs / Improvements

### 7. **useEffect Dependency Array Could Be Optimized** (Sources Page)
**Location:** `apps/frontend/app/admin/sources/page.tsx` line 181

**Issue:** `fetchSources` is included in the dependency array, but since it's a `useCallback` with its own dependencies, this is technically redundant (though not incorrect). The effect will re-run when `fetchSources` changes, which happens when its dependencies change.

**Note:** This is not a bug, but could be optimized by removing `fetchSources` from dependencies since `page`, `statusFilter`, and `searchQuery` are already in the array.

### 8. **Missing Cleanup for Modal Position State** (Sources Page)
**Location:** `apps/frontend/app/admin/sources/page.tsx` lines 79-84

**Issue:** When a modal is closed, the position is reset, but if the component unmounts while dragging, the event listeners might not be cleaned up properly.

**Note:** The useEffect already handles cleanup, but it's worth ensuring modal position is reset on unmount.

### 9. **Dashboard fetchStatus Missing Dependency** (Dashboard)
**Location:** `apps/frontend/app/admin/page.tsx` line 246

**Issue:** `fetchStatus` is in the dependency array, but it's a `useCallback` with empty dependencies `[]`, so it's stable. However, if `fetchStatus` logic changes in the future, this could cause issues.

**Note:** This is fine as-is, but worth noting for future maintenance.

### 10. **Race Condition in Sources Fetch** (Sources Page)
**Location:** `apps/frontend/app/admin/sources/page.tsx` lines 135-177

**Issue:** If `fetchSources` is called multiple times rapidly (e.g., user quickly changes filters), there's no cancellation of previous requests. The last response will win, but this could cause race conditions.

**Fix:** Use AbortController to cancel previous requests:
```typescript
const abortControllerRef = useRef<AbortController | null>(null);

const fetchSources = useCallback(async () => {
  // Cancel previous request
  if (abortControllerRef.current) {
    abortControllerRef.current.abort();
  }
  
  const abortController = new AbortController();
  abortControllerRef.current = abortController;
  
  setLoading(true);
  try {
    const res = await fetch(`/api/admin/sources?${params}`, {
      credentials: 'include',
      signal: abortController.signal,
    });
    // ... rest of code
  } catch (error) {
    if (error.name === 'AbortError') return;
    // ... error handling
  }
}, [page, statusFilter, searchQuery, router]);
```

## Summary

**Critical Bugs:** 3
**Medium Priority:** 3
**Low Priority / Improvements:** 4

**Total:** 10 issues found

