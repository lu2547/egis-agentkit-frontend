import { expect, it } from 'vitest';
import { catalogIconUrl } from '../src/domain/catalogIcons';
it('resolves only known library IDs and keeps legacy markers safe', () => {
  expect(catalogIconUrl('expert:developer')).toBe('/catalog/experts/developer.webp');
  expect(catalogIconUrl('skill:kdocs')).toBe('/catalog/skills/kdocs.svg');
  expect(catalogIconUrl('https://example.com/a.png')).toBeUndefined();
  expect(catalogIconUrl('spark')).toBeUndefined();
});
