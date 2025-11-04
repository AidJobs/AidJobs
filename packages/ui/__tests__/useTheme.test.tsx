import { renderHook, act } from '@testing-library/react';
import { useTheme } from '../hooks/useTheme';
import { getPaletteColors } from '../tokens/palettes';

describe('useTheme', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
    document.documentElement.removeAttribute('data-palette');
    const existingStyle = document.getElementById('theme-vars');
    if (existingStyle) {
      existingStyle.remove();
    }
  });

  it('should initialize with default theme and palette', () => {
    const { result } = renderHook(() => useTheme());
    
    act(() => {
      result.current.setTheme('light');
      result.current.setPalette('mint');
    });

    expect(result.current.theme).toBe('light');
    expect(result.current.palette).toBe('mint');
    expect(result.current.mounted).toBe(true);
  });

  it('should update CSS variables when palette changes', () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.setPalette('mint');
    });

    const styleEl = document.getElementById('theme-vars');
    expect(styleEl).toBeTruthy();
    expect(styleEl?.textContent).toContain('--primary');
    expect(styleEl?.textContent).toContain('--accent');
    
    const mintColors = getPaletteColors('mint', 'light');
    expect(styleEl?.textContent).toContain(mintColors['primary']);
  });

  it('should update CSS variables when switching from mint to sand', () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.setPalette('mint');
    });

    let styleEl = document.getElementById('theme-vars');
    const mintColors = getPaletteColors('mint', 'light');
    expect(styleEl?.textContent).toContain(mintColors['primary']);

    act(() => {
      result.current.setPalette('sand');
    });

    styleEl = document.getElementById('theme-vars');
    const sandColors = getPaletteColors('sand', 'light');
    expect(styleEl?.textContent).toContain(sandColors['primary']);
    expect(styleEl?.textContent).not.toContain(mintColors['primary']);
  });

  it('should set data-palette attribute on documentElement', () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.setPalette('sand');
    });

    expect(document.documentElement.getAttribute('data-palette')).toBe('sand');

    act(() => {
      result.current.setPalette('mint');
    });

    expect(document.documentElement.getAttribute('data-palette')).toBe('mint');
  });

  it('should persist palette selection in localStorage', () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.setPalette('sand');
    });

    expect(localStorage.getItem('aidjobs.theme.palette')).toBe('sand');

    act(() => {
      result.current.setPalette('mint');
    });

    expect(localStorage.getItem('aidjobs.theme.palette')).toBe('mint');
  });

  it('should update CSS variables when theme mode changes', () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.setPalette('mint');
      result.current.setTheme('light');
    });

    let styleEl = document.getElementById('theme-vars');
    const mintLightColors = getPaletteColors('mint', 'light');
    expect(styleEl?.textContent).toContain(mintLightColors['bg']);

    act(() => {
      result.current.setTheme('dark');
    });

    styleEl = document.getElementById('theme-vars');
    const mintDarkColors = getPaletteColors('mint', 'dark');
    expect(styleEl?.textContent).toContain(mintDarkColors['bg']);
  });

  it('should toggle theme while maintaining palette', () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.setPalette('sand');
      result.current.setTheme('light');
    });

    expect(result.current.theme).toBe('light');
    expect(result.current.palette).toBe('sand');

    act(() => {
      result.current.toggleTheme();
    });

    expect(result.current.theme).toBe('dark');
    expect(result.current.palette).toBe('sand');

    const styleEl = document.getElementById('theme-vars');
    const sandDarkColors = getPaletteColors('sand', 'dark');
    expect(styleEl?.textContent).toContain(sandDarkColors['primary']);
  });

  it('should maintain current palette after system theme change', () => {
    localStorage.removeItem('aidjobs-theme');
    
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.setPalette('sand');
    });

    const sandLightColors = getPaletteColors('sand', 'light');
    let styleEl = document.getElementById('theme-vars');
    expect(styleEl?.textContent).toContain(sandLightColors['primary']);

    act(() => {
      const event = new MediaQueryListEvent('change', { matches: true, media: '(prefers-color-scheme: dark)' });
      window.matchMedia('(prefers-color-scheme: dark)').dispatchEvent(event);
    });

    styleEl = document.getElementById('theme-vars');
    const sandDarkColors = getPaletteColors('sand', 'dark');
    expect(styleEl?.textContent).toContain(sandDarkColors['primary']);
    expect(styleEl?.textContent).not.toContain(sandLightColors['primary']);
    
    expect(localStorage.getItem('aidjobs.theme.palette')).toBe('sand');
  });
});
