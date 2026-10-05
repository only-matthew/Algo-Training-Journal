// The build selects the asset host; data and API requests remain same-origin.
export function staticAssetUrl(path, doc = globalThis.document) {
  const origin = doc?.querySelector?.('meta[name="journal-asset-origin"]')?.content || '';
  return `${origin}/${path.replace(/^\/+/, '')}`;
}
