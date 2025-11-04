import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  getShortlist,
  addToShortlist,
  removeFromShortlist,
  isInShortlist,
  toggleShortlist,
  clearShortlist,
} from '../shortlist';

const mockLocalStorage = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(global, 'localStorage', {
  value: mockLocalStorage,
  writable: true,
});

describe('Shortlist Utils', () => {
  beforeEach(() => {
    mockLocalStorage.clear();
  });

  afterEach(() => {
    mockLocalStorage.clear();
  });

  describe('getShortlist', () => {
    it('returns empty array when no shortlist exists', () => {
      expect(getShortlist()).toEqual([]);
    });

    it('returns stored job IDs', () => {
      mockLocalStorage.setItem('aidjobs.shortlist', JSON.stringify(['job1', 'job2']));
      expect(getShortlist()).toEqual(['job1', 'job2']);
    });

    it('handles corrupted data gracefully', () => {
      mockLocalStorage.setItem('aidjobs.shortlist', 'invalid json');
      expect(getShortlist()).toEqual([]);
    });
  });

  describe('addToShortlist', () => {
    it('adds a job ID to empty shortlist', () => {
      const result = addToShortlist('job1');
      expect(result).toBe(true);
      expect(getShortlist()).toEqual(['job1']);
    });

    it('adds a job ID to existing shortlist', () => {
      addToShortlist('job1');
      const result = addToShortlist('job2');
      expect(result).toBe(true);
      expect(getShortlist()).toEqual(['job1', 'job2']);
    });

    it('does not add duplicate job IDs', () => {
      addToShortlist('job1');
      const result = addToShortlist('job1');
      expect(result).toBe(false);
      expect(getShortlist()).toEqual(['job1']);
    });

    it('returns false for empty job ID', () => {
      const result = addToShortlist('');
      expect(result).toBe(false);
    });
  });

  describe('removeFromShortlist', () => {
    it('removes a job ID from shortlist', () => {
      addToShortlist('job1');
      addToShortlist('job2');
      const result = removeFromShortlist('job1');
      expect(result).toBe(true);
      expect(getShortlist()).toEqual(['job2']);
    });

    it('returns false when job ID not in shortlist', () => {
      addToShortlist('job1');
      const result = removeFromShortlist('job2');
      expect(result).toBe(false);
      expect(getShortlist()).toEqual(['job1']);
    });

    it('returns false for empty job ID', () => {
      const result = removeFromShortlist('');
      expect(result).toBe(false);
    });
  });

  describe('isInShortlist', () => {
    it('returns true for shortlisted job', () => {
      addToShortlist('job1');
      expect(isInShortlist('job1')).toBe(true);
    });

    it('returns false for non-shortlisted job', () => {
      addToShortlist('job1');
      expect(isInShortlist('job2')).toBe(false);
    });

    it('returns false for empty shortlist', () => {
      expect(isInShortlist('job1')).toBe(false);
    });
  });

  describe('toggleShortlist', () => {
    it('adds job when not in shortlist', () => {
      const result = toggleShortlist('job1');
      expect(result).toBe(true);
      expect(isInShortlist('job1')).toBe(true);
    });

    it('removes job when in shortlist', () => {
      addToShortlist('job1');
      const result = toggleShortlist('job1');
      expect(result).toBe(false);
      expect(isInShortlist('job1')).toBe(false);
    });
  });

  describe('clearShortlist', () => {
    it('clears all shortlisted jobs', () => {
      addToShortlist('job1');
      addToShortlist('job2');
      clearShortlist();
      expect(getShortlist()).toEqual([]);
    });
  });
});
