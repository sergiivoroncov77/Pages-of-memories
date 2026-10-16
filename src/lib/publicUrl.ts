/**
 * Files from `public/` are stored with root paths (`/demo/…`). When the app is
 * served from a sub-path (GitHub Pages: `/Pages-of-memories/`), prefix them with
 * the build's base so they keep loading. Other URLs pass through unchanged.
 */
export function publicUrl(url: string, base: string = import.meta.env.BASE_URL): string {
  if (!url.startsWith('/') || url.startsWith('//')) return url;
  const prefix = base.replace(/\/+$/, '');
  return prefix && !url.startsWith(prefix + '/') ? prefix + url : url;
}
