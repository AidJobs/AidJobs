const SHORTLIST_KEY = 'aidjobs.shortlist';

export interface ShortlistItem {
  id: string;
  addedAt: number;
}

/**
 * Check if server-side shortlist is available (requires auth).
 * Returns false for now - will be true once auth is implemented.
 */
function isServerAvailable(): boolean {
  // TODO: Check if user is authenticated
  // For now, always use localStorage (guest mode)
  return false;
}

/**
 * Toggle job shortlist on server (when authenticated).
 */
async function toggleShortlistServer(jobId: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/shortlist/${jobId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include', // Include cookies for auth
    });
    
    if (!response.ok) {
      if (response.status === 401) {
        // Not authenticated - fall back to localStorage
        return false;
      }
      throw new Error(`Server error: ${response.status}`);
    }
    
    const data = await response.json();
    return data.saved;
  } catch (error) {
    console.error('Failed to toggle shortlist on server:', error);
    return false;
  }
}

/**
 * Get shortlist from server (when authenticated).
 */
async function getShortlistServer(): Promise<string[]> {
  try {
    const response = await fetch('/api/shortlist', {
      method: 'GET',
      credentials: 'include',
    });
    
    if (!response.ok) {
      if (response.status === 401) {
        // Not authenticated
        return [];
      }
      throw new Error(`Server error: ${response.status}`);
    }
    
    const data = await response.json();
    return data.job_ids || [];
  } catch (error) {
    console.error('Failed to get shortlist from server:', error);
    return [];
  }
}

export function getShortlist(): string[] {
  if (typeof window === 'undefined') return [];
  
  try {
    const stored = localStorage.getItem(SHORTLIST_KEY);
    if (!stored) return [];
    
    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed)) {
      return parsed.map(item => 
        typeof item === 'string' ? item : item.id
      ).filter(Boolean);
    }
    return [];
  } catch (error) {
    console.error('Failed to read shortlist:', error);
    return [];
  }
}

export function addToShortlist(jobId: string): boolean {
  if (typeof window === 'undefined' || !jobId) return false;
  
  try {
    const current = getShortlist();
    if (current.includes(jobId)) return false;
    
    const updated = [...current, jobId];
    localStorage.setItem(SHORTLIST_KEY, JSON.stringify(updated));
    return true;
  } catch (error) {
    console.error('Failed to add to shortlist:', error);
    return false;
  }
}

export function removeFromShortlist(jobId: string): boolean {
  if (typeof window === 'undefined' || !jobId) return false;
  
  try {
    const current = getShortlist();
    const updated = current.filter(id => id !== jobId);
    
    if (updated.length === current.length) return false;
    
    localStorage.setItem(SHORTLIST_KEY, JSON.stringify(updated));
    return true;
  } catch (error) {
    console.error('Failed to remove from shortlist:', error);
    return false;
  }
}

export function isInShortlist(jobId: string): boolean {
  if (typeof window === 'undefined' || !jobId) return false;
  return getShortlist().includes(jobId);
}

export function toggleShortlist(jobId: string): boolean {
  // Optimistically update localStorage immediately
  const wasAdded = isInShortlist(jobId) ? false : true;
  
  if (wasAdded) {
    addToShortlist(jobId);
  } else {
    removeFromShortlist(jobId);
  }
  
  // Sync with server in background (when auth is available)
  if (isServerAvailable()) {
    toggleShortlistServer(jobId).catch(err => {
      console.error('Server sync failed:', err);
      // Keep localStorage state since server failed
    });
  }
  
  return wasAdded;
}

/**
 * Sync localStorage shortlist to server (call on login).
 * This merges local saves with server-side saves.
 */
export async function syncShortlistToServer(): Promise<void> {
  if (!isServerAvailable()) {
    return;
  }
  
  try {
    // Get server shortlist
    const serverIds = await getShortlistServer();
    
    // Get local shortlist
    const localIds = getShortlist();
    
    // Merge: server is source of truth, but preserve local additions
    const merged = new Set([...serverIds, ...localIds]);
    
    // Update localStorage with merged list
    localStorage.setItem(SHORTLIST_KEY, JSON.stringify(Array.from(merged)));
    
    // TODO: Push any local-only items to server
    // For now, server will be empty on first login anyway
  } catch (error) {
    console.error('Failed to sync shortlist:', error);
  }
}

export function clearShortlist(): void {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.removeItem(SHORTLIST_KEY);
  } catch (error) {
    console.error('Failed to clear shortlist:', error);
  }
}
