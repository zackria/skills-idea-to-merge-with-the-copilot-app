// Pure bookmark helpers. No DOM or browser APIs here, so they are safe to
// import during the static build and easy to unit test without a browser.

export interface Bookmark {
  url: string;
  slug: string;
}

export const STORAGE_KEY = 'mona-bookmarks';
export const SLUG_PREFIX = 'mona-';
export const SLUG_LENGTH = 4;
export const SEPARATOR = ' :: ';

const BASE62 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Normalise whatever the user typed into a canonical http(s) URL string.
 * "example.com" and "https://example.com" both become "https://example.com".
 * Returns null when the input is not a usable web URL.
 */
export function normalizeUrl(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;

  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed);
  const candidate = hasScheme ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  // Require a real-looking host (a dot, or localhost) so "foo" is rejected.
  if (!parsed.hostname.includes('.') && parsed.hostname !== 'localhost') return null;

  let href = parsed.href;
  if (parsed.pathname === '/' && !parsed.search && !parsed.hash) {
    href = href.replace(/\/$/, '');
  }
  return href;
}

/** Encode a non-negative integer as base62. */
export function toBase62(value: number): string {
  let n = Math.floor(Math.abs(value));
  if (n === 0) return BASE62[0];
  let out = '';
  while (n > 0) {
    out = BASE62[n % 62] + out;
    n = Math.floor(n / 62);
  }
  return out;
}

/**
 * Generate a short "mona-" slug (for example "mona-7fk2") that is not already
 * in `taken`. `random` is injectable so tests are deterministic.
 */
export function generateSlug(
  taken: Iterable<string> = [],
  random: () => number = Math.random,
): string {
  const used = new Set(taken);
  for (let attempt = 0; attempt < 1000; attempt++) {
    let body = '';
    for (let i = 0; i < SLUG_LENGTH; i++) {
      body += BASE62[Math.floor(random() * 62) % 62];
    }
    const slug = SLUG_PREFIX + body;
    if (!used.has(slug)) return slug;
  }
  // Extremely unlikely: fall back to a counter-based slug that cannot collide.
  return SLUG_PREFIX + toBase62(used.size + 1).padStart(SLUG_LENGTH, '0');
}

/** Format a bookmark for display: "<url> :: <slug>". */
export function formatBookmark(bookmark: Bookmark): string {
  return `${bookmark.url}${SEPARATOR}${bookmark.slug}`;
}

function isBookmark(value: unknown): value is Bookmark {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const { url, slug } = value as Record<string, unknown>;
  return (
    typeof url === 'string' &&
    typeof slug === 'string' &&
    slug.startsWith(SLUG_PREFIX) &&
    normalizeUrl(url) !== null
  );
}

/**
 * Treat stored data as untrusted. Accepts the raw string from localStorage
 * and returns only well-formed {url, slug} entries. Never throws: empty,
 * corrupted, legacy, or non-array values all recover to a clean list.
 */
export function parseBookmarks(raw: unknown): Bookmark[] {
  if (typeof raw !== 'string' || raw.trim() === '') return [];

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];

  const seen = new Set<string>();
  const result: Bookmark[] = [];
  for (const item of data) {
    if (!isBookmark(item) || seen.has(item.slug)) continue;
    seen.add(item.slug);
    result.push({ url: item.url, slug: item.slug });
  }
  return result;
}

/** Serialise bookmarks for storage. */
export function serializeBookmarks(bookmarks: Bookmark[]): string {
  return JSON.stringify(bookmarks.map(({ url, slug }) => ({ url, slug })));
}

/** Case-insensitive match of `query` against each bookmark's URL or slug. View-only: never mutates. */
export function filterBookmarks(bookmarks: Bookmark[], query: string): Bookmark[] {
  const q = query.trim().toLowerCase();
  if (!q) return bookmarks;
  return bookmarks.filter(
    (b) => b.url.toLowerCase().includes(q) || b.slug.toLowerCase().includes(q),
  );
}

export const COUNT_KEY = 'mona-bookmarks-count';

/** True when a previous save recorded bookmarks but the store is now empty. */
export function isStoreUnexpectedlyEmpty(lastCount: unknown, current: number): boolean {
  const n = typeof lastCount === 'string' ? Number.parseInt(lastCount, 10) : NaN;
  return Number.isFinite(n) && n > 0 && current === 0;
}
