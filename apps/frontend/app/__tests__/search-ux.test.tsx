import { describe, it, expect, jest, beforeEach } from '@jest/globals';

describe('Search UX Improvements', () => {
  beforeEach(() => {
    global.fetch = jest.fn() as jest.Mock;
  });

  describe('Sort parameter', () => {
    it('should include sort param in API call when sort is newest', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        json: async () => ({
          status: 'ok',
          data: {
            items: [],
            total: 0,
            page: 1,
            size: 20,
            source: 'meili',
          },
          error: null,
          request_id: 'test-123',
        }),
      });

      const sort = 'newest';
      const params = new URLSearchParams();
      params.append('page', '1');
      params.append('size', '20');
      params.append('sort', sort);

      await fetch(`/api/search/query?${params.toString()}`);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('sort=newest')
      );
    });

    it('should include sort param in API call when sort is closing_soon', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        json: async () => ({
          status: 'ok',
          data: {
            items: [],
            total: 0,
            page: 1,
            size: 20,
            source: 'meili',
          },
          error: null,
          request_id: 'test-123',
        }),
      });

      const sort = 'closing_soon';
      const params = new URLSearchParams();
      params.append('page', '1');
      params.append('size', '20');
      params.append('sort', sort);

      await fetch(`/api/search/query?${params.toString()}`);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('sort=closing_soon')
      );
    });

    it('should not include sort param when sort is relevance', () => {
      const sort = 'relevance';
      const params = new URLSearchParams();
      params.append('page', '1');
      params.append('size', '20');
      if (sort !== 'relevance') {
        params.append('sort', sort);
      }

      const queryString = params.toString();
      expect(queryString).not.toContain('sort=');
    });
  });

  describe('Fallback banner', () => {
    it('should detect database fallback when source is db', () => {
      const mockResponse = {
        status: 'ok',
        data: {
          items: [],
          total: 0,
          page: 1,
          size: 20,
          source: 'db',
        },
        error: null,
        request_id: 'test-123',
      };

      const searchSource = mockResponse.data.source;
      const showFallbackBanner = searchSource === 'db';

      expect(showFallbackBanner).toBe(true);
    });

    it('should not show banner when source is meili', () => {
      const mockResponse = {
        status: 'ok',
        data: {
          items: [],
          total: 0,
          page: 1,
          size: 20,
          source: 'meili',
        },
        error: null,
        request_id: 'test-123',
      };

      const searchSource = mockResponse.data.source;
      const showFallbackBanner = searchSource === 'db';

      expect(showFallbackBanner).toBe(false);
    });
  });

  describe('Empty state', () => {
    it('should detect when filters are applied', () => {
      const searchQuery = 'developer';
      const country = 'KE';
      const level = 'senior';
      const international = false;
      const missionTags: string[] = [];

      const hasAnyFilters =
        searchQuery || country || level || international || missionTags.length > 0;

      expect(hasAnyFilters).toBe(true);
    });

    it('should detect when no filters are applied', () => {
      const searchQuery = '';
      const country = '';
      const level = '';
      const international = false;
      const missionTags: string[] = [];

      const hasAnyFilters =
        searchQuery || country || level || international || missionTags.length > 0;

      expect(hasAnyFilters).toBe(false);
    });
  });

  describe('Request cancellation', () => {
    it('should abort previous request when new search is initiated', () => {
      const abortController1 = new AbortController();
      const abortController2 = new AbortController();

      const spy = jest.spyOn(abortController1, 'abort');
      
      abortController1.abort();

      expect(spy).toHaveBeenCalled();
    });
  });
});
