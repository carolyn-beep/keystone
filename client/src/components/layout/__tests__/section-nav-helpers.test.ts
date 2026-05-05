import { describe, expect, it } from 'vitest';
import {
  resolveSectionNavActive,
  getSectionNavItems,
  type SectionNavSection,
} from '../section-nav-helpers';

describe('resolveSectionNavActive', () => {
  it('maps "/" to "chat"', () => {
    expect(resolveSectionNavActive('/')).toBe<SectionNavSection>('chat');
  });

  it('maps "/library" to "library"', () => {
    expect(resolveSectionNavActive('/library')).toBe<SectionNavSection>('library');
  });

  it('maps "/library/" (trailing slash) to "library"', () => {
    expect(resolveSectionNavActive('/library/')).toBe<SectionNavSection>('library');
  });

  it('maps "/grading/<slug>" to "library"', () => {
    expect(resolveSectionNavActive('/grading/some-slug')).toBe<SectionNavSection>('library');
    expect(resolveSectionNavActive('/grading/another/with/segments')).toBe<SectionNavSection>('library');
  });

  it('maps "/brainlifts/<slug>" to "library"', () => {
    expect(resolveSectionNavActive('/brainlifts/some-slug')).toBe<SectionNavSection>('library');
    expect(resolveSectionNavActive('/brainlifts/x')).toBe<SectionNavSection>('library');
  });

  it('maps "/analytics" to "analytics"', () => {
    expect(resolveSectionNavActive('/analytics')).toBe<SectionNavSection>('analytics');
  });

  it('maps "/skills" to "skills"', () => {
    expect(resolveSectionNavActive('/skills')).toBe<SectionNavSection>('skills');
    expect(resolveSectionNavActive('/skills/')).toBe<SectionNavSection>('skills');
  });

  it('maps "/admin/providers" to "providers"', () => {
    expect(resolveSectionNavActive('/admin/providers')).toBe<SectionNavSection>('providers');
  });

  it('returns null for empty string', () => {
    expect(resolveSectionNavActive('')).toBeNull();
  });

  it('returns null for shell-bypass routes', () => {
    expect(resolveSectionNavActive('/login')).toBeNull();
    expect(resolveSectionNavActive('/dev/import-agent')).toBeNull();
    expect(resolveSectionNavActive('/view/some-slug')).toBeNull();
  });

  it('returns null for unrecognized paths', () => {
    expect(resolveSectionNavActive('/nope')).toBeNull();
    expect(resolveSectionNavActive('/foo/bar')).toBeNull();
  });
});

describe('getSectionNavItems', () => {
  it('returns [Chat, Library, Skills] for non-admin, non-allowlisted', () => {
    const items = getSectionNavItems({ isAdmin: false, email: 'someone@example.com' });
    expect(items.map((i) => i.section)).toEqual(['chat', 'library', 'skills']);
  });

  it('returns [Chat, Library, Skills] when email is null', () => {
    const items = getSectionNavItems({ isAdmin: false, email: null });
    expect(items.map((i) => i.section)).toEqual(['chat', 'library', 'skills']);
  });

  it('returns [Chat, Library, Skills] when email is undefined', () => {
    const items = getSectionNavItems({ isAdmin: false });
    expect(items.map((i) => i.section)).toEqual(['chat', 'library', 'skills']);
  });

  it('appends Analytics when isAdmin is true', () => {
    const items = getSectionNavItems({ isAdmin: true, email: 'someone@example.com' });
    expect(items.map((i) => i.section)).toEqual(['chat', 'library', 'skills', 'analytics']);
  });

  it('appends Providers when allowlisted email is provided (non-admin)', () => {
    const items = getSectionNavItems({ isAdmin: false, email: 'caina.barbosa@trilogy.com' });
    expect(items.map((i) => i.section)).toEqual(['chat', 'library', 'skills', 'providers']);
  });

  it('appends Analytics then Providers when admin AND allowlisted', () => {
    const items = getSectionNavItems({ isAdmin: true, email: 'caina.barbosa@trilogy.com' });
    expect(items.map((i) => i.section)).toEqual(['chat', 'library', 'skills', 'analytics', 'providers']);
  });

  it('matches email case-insensitively', () => {
    const items = getSectionNavItems({ isAdmin: false, email: 'CAINA.BARBOSA@TRILOGY.COM' });
    expect(items.map((i) => i.section)).toContain('providers');
  });

  it('each item has section, label, href, icon', () => {
    const items = getSectionNavItems({ isAdmin: true, email: 'caina.barbosa@trilogy.com' });
    for (const item of items) {
      expect(item).toHaveProperty('section');
      expect(item).toHaveProperty('label');
      expect(item).toHaveProperty('href');
      expect(item).toHaveProperty('icon');
      expect(typeof item.label).toBe('string');
      expect(typeof item.href).toBe('string');
    }
  });

  it('Chat href is "/", Library href is "/library", and Skills href is "/skills"', () => {
    const items = getSectionNavItems({ isAdmin: false });
    const chat = items.find((i) => i.section === 'chat');
    const library = items.find((i) => i.section === 'library');
    const skills = items.find((i) => i.section === 'skills');
    expect(chat?.href).toBe('/');
    expect(library?.href).toBe('/library');
    expect(skills?.href).toBe('/skills');
  });
});
