import { describe, it, expect } from '@jest/globals';
import { getCollection, getAllCollectionSlugs, collections } from '../collections';

describe('Collections', () => {
  describe('getCollection', () => {
    it('should return collection for valid slug', () => {
      const collection = getCollection('un-jobs');
      expect(collection).toBeTruthy();
      expect(collection?.slug).toBe('un-jobs');
      expect(collection?.title).toBe('UN Jobs');
      expect(collection?.filters).toHaveProperty('org_type', 'un');
    });

    it('should return null for invalid slug', () => {
      const collection = getCollection('non-existent');
      expect(collection).toBeNull();
    });
  });

  describe('getAllCollectionSlugs', () => {
    it('should return array of all collection slugs', () => {
      const slugs = getAllCollectionSlugs();
      expect(Array.isArray(slugs)).toBe(true);
      expect(slugs.length).toBeGreaterThan(0);
      expect(slugs).toContain('un-jobs');
      expect(slugs).toContain('remote');
      expect(slugs).toContain('consultancies');
      expect(slugs).toContain('fellowships');
      expect(slugs).toContain('surge');
    });
  });

  describe('Collection presets', () => {
    it('un-jobs should have org_type=un filter', () => {
      const collection = getCollection('un-jobs');
      expect(collection?.filters).toEqual({ org_type: 'un' });
    });

    it('remote should have work_modality=remote filter', () => {
      const collection = getCollection('remote');
      expect(collection?.filters).toEqual({ work_modality: 'remote' });
    });

    it('consultancies should have career_type=consultancy filter', () => {
      const collection = getCollection('consultancies');
      expect(collection?.filters).toEqual({ career_type: 'consultancy' });
    });

    it('fellowships should have career_type=fellowship filter', () => {
      const collection = getCollection('fellowships');
      expect(collection?.filters).toEqual({ career_type: 'fellowship' });
    });

    it('surge should have surge_required=true filter', () => {
      const collection = getCollection('surge');
      expect(collection?.filters).toEqual({ surge_required: true });
    });
  });

  describe('Collection metadata', () => {
    it('all collections should have title, description, and metaDescription', () => {
      Object.values(collections).forEach((collection) => {
        expect(collection.title).toBeTruthy();
        expect(collection.description).toBeTruthy();
        expect(collection.metaDescription).toBeTruthy();
      });
    });

    it('all collections should have non-empty filters', () => {
      Object.values(collections).forEach((collection) => {
        expect(Object.keys(collection.filters).length).toBeGreaterThan(0);
      });
    });
  });
});
