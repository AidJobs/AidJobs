const SHORTLIST_KEY = 'aidjobs.shortlist';

export interface ShortlistItem {
  id: string;
  addedAt: number;
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
  if (isInShortlist(jobId)) {
    removeFromShortlist(jobId);
    return false;
  } else {
    addToShortlist(jobId);
    return true;
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
