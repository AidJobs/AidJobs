/**
 * @jest-environment node
 */
import robots from '../../app/robots';
import sitemap from '../../app/sitemap';

describe('search engine files', () => {
  it('lets every crawler in except Bytespider, skips the API, and names the sitemap', () => {
    const r = robots();
    expect(r.rules).toEqual([
      { userAgent: 'Bytespider', disallow: '/' },
      { userAgent: '*', allow: '/', disallow: '/api/' },
    ]);
    expect(r.sitemap).toBe('https://aid-jobs-frontend.vercel.app/sitemap.xml');
  });

  it('lists the home page at the site address', () => {
    expect(sitemap().map((e) => e.url)).toEqual(['https://aid-jobs-frontend.vercel.app/v2']);
  });
});
