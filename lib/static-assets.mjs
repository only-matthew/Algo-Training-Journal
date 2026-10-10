// The build selects the asset host; data and API requests remain same-origin.
export function staticAssetUrl(path, doc = globalThis.document) {
  path = path.replace(/^\/+/, '');
  // Rendering libraries and their relative font URLs stay on the page's origin.
  if (path.startsWith('vendor/')) return `/${path}`;
  const origin = doc?.querySelector?.('meta[name="journal-asset-origin"]')?.content || '';
  return `${origin}/${path}`;
}
