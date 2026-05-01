import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(
  new URL('../AppShell.tsx', import.meta.url),
  'utf8',
);

describe('AppShell source', () => {
  it('exports an AppShell function/component', () => {
    expect(source).toMatch(/export\s+function\s+AppShell/);
  });

  it('declares AppShellProps with sidebar, header, children slots', () => {
    expect(source).toMatch(/interface\s+AppShellProps/);
    expect(source).toMatch(/sidebar\s*:\s*ReactNode/);
    expect(source).toMatch(/header\s*:\s*ReactNode/);
    expect(source).toMatch(/children\s*:\s*ReactNode/);
  });

  it('renders a <main> with overflow-y-auto for scrollable content', () => {
    expect(source).toMatch(/<main[^>]*overflow-y-auto/);
  });

  it('hides the inline sidebar below the lg breakpoint (responsive class)', () => {
    expect(source).toMatch(/lg:(flex|block)/);
    expect(source).toMatch(/hidden/);
  });

  it('keeps drawer open/close state via useState', () => {
    expect(source).toMatch(/useState/);
  });

  it('locks body scroll while drawer is open via useEffect', () => {
    expect(source).toMatch(/useEffect/);
    expect(source).toMatch(/document\.body\.style\.overflow/);
  });

  it('exposes drawer state via React context', () => {
    expect(source).toMatch(/createContext/);
  });

  it('exports a useAppShell (or similar) hook for consumers', () => {
    expect(source).toMatch(/export\s+function\s+use(AppShell|Shell|Drawer)/);
  });

  it('full-viewport flex layout (h-screen)', () => {
    expect(source).toMatch(/h-screen/);
  });
});
