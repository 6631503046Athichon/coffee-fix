/**
 * Execute an array of async functions with limited concurrency.
 * Runs at most `batchSize` functions concurrently in sequential batches.
 * Individual task failures return the fallback value instead of failing the entire batch.
 */
export async function batchedPromiseAll<T>(
  tasks: (() => Promise<T>)[],
  batchSize: number = 3,
  fallback?: T
): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < tasks.length; i += batchSize) {
    const batch = tasks.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(batch.map(fn => fn()));
    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        console.warn('Batched task failed:', result.reason);
        results.push(fallback as T);
      }
    }
  }
  return results;
}
