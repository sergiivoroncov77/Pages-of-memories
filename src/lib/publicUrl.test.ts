import { describe, expect, it } from 'vitest';
import { publicUrl } from './publicUrl';

describe('publicUrl', () => {
  it('keeps root paths at the site root and prefixes them under a sub-path once', () => {
    expect(publicUrl('/demo/photo-porch.svg', '/')).toBe('/demo/photo-porch.svg');
    expect(publicUrl('/demo/photo-porch.svg', '/Pages-of-memories/')).toBe('/Pages-of-memories/demo/photo-porch.svg');
    expect(publicUrl('/Pages-of-memories/demo/a.svg', '/Pages-of-memories/')).toBe('/Pages-of-memories/demo/a.svg');
  });

  it('leaves data, blob, external and protocol-relative URLs alone', () => {
    ['data:image/png;base64,AA==', 'blob:https://x/1', 'https://example.com/a.png', '//cdn.example.com/a.png', 'idb:media_1']
      .forEach((url) => expect(publicUrl(url, '/Pages-of-memories/')).toBe(url));
  });
});
