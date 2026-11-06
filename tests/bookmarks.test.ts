import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatBookmark,
  generateSlug,
  normalizeUrl,
  parseBookmarks,
  serializeBookmarks,
  toBase62,
} from '../src/lib/bookmarks.ts';

test('URL with and without https:// normalises to the same saved value', () => {
  const a = normalizeUrl('www.example.com');
  const b = normalizeUrl('https://www.example.com');
  const c = normalizeUrl('  https://www.example.com/  ');
  assert.equal(a, 'https://www.example.com');
  assert.equal(a, b);
  assert.equal(b, c);
});

test('normalizeUrl keeps paths and rejects unusable input', () => {
  assert.equal(normalizeUrl('example.com/a?b=1'), 'https://example.com/a?b=1');
  assert.equal(normalizeUrl('http://example.com'), 'http://example.com');
  for (const bad of ['', '   ', 'nodots', 'javascript:alert(1)', 'ftp://example.com', 'a b.com', null, 42]) {
    assert.equal(normalizeUrl(bad), null, String(bad));
  }
});

test('slugs are mona- prefixed base62 and avoid collisions', () => {
  const slug = generateSlug();
  assert.match(slug, /^mona-[0-9a-zA-Z]{4}$/);
  const constant = () => 0;
  assert.equal(generateSlug([], constant), 'mona-0000');
  assert.notEqual(generateSlug(['mona-0000'], constant), 'mona-0000');
  assert.equal(toBase62(0), '0');
  assert.equal(toBase62(61), 'Z');
  assert.equal(toBase62(62), '10');
});

test('loading empty, corrupted, legacy, or non-array values recovers', () => {
  const cases: unknown[] = [
    null,
    undefined,
    '',
    '   ',
    '{not json',
    'null',
    '"a string"',
    '42',
    '{"url":"https://a.com","slug":"mona-1111"}',
    '["https://a.com"]',
    '[null, 1, "x", [], {"url":1,"slug":2}, {"url":"https://a.com"}, {"url":"javascript:x","slug":"mona-1"}]',
    '[{"url":"https://a.com","slug":"not-mona"}]',
  ];
  for (const raw of cases) {
    assert.deepEqual(parseBookmarks(raw), [], String(raw));
  }
});

test('loading keeps valid entries, drops malformed ones, and dedupes slugs', () => {
  const raw = JSON.stringify([
    { url: 'https://a.com', slug: 'mona-aaaa', extra: 'ignored' },
    { url: 42, slug: 'mona-bbbb' },
    { url: 'https://b.com', slug: 'mona-aaaa' },
    { url: 'https://c.com', slug: 'mona-cccc' },
  ]);
  assert.deepEqual(parseBookmarks(raw), [
    { url: 'https://a.com', slug: 'mona-aaaa' },
    { url: 'https://c.com', slug: 'mona-cccc' },
  ]);
});

test('serialize and parse round-trip', () => {
  const list = [{ url: 'https://a.com', slug: 'mona-7fk2' }];
  assert.deepEqual(parseBookmarks(serializeBookmarks(list)), list);
});

test('a saved bookmark formats as "<url> :: <slug>"', () => {
  assert.equal(
    formatBookmark({ url: 'https://www.example.com', slug: 'mona-7fk2' }),
    'https://www.example.com :: mona-7fk2',
  );
});
