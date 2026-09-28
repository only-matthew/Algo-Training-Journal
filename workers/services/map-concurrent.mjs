export async function mapConcurrent(items, concurrency, mapper) {
  const results = new Array(items.length); let next = 0;
  async function worker() { while (next < items.length) { const index = next++; results[index] = await mapper(items[index], index); } }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker)); return results;
}
