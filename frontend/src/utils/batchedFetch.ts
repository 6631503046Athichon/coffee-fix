import { connectionManager } from './connectionManager';

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
    // If backend went down during a previous batch, skip remaining batches
    if (i > 0 && !connectionManager.isConnected()) {
      for (let j = i; j < tasks.length; j++) {
        results.push(fallback as T);
      }
      break;
    }

    const batch = tasks.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(batch.map(fn => fn()));
    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        // Only log non-connection errors to reduce noise
        const reason = result.reason?.message || String(result.reason);
        if (!reason.includes('Cannot connect') && !reason.includes('Connection timeout')) {
          console.warn('Batched task failed:', result.reason);
        }
        results.push(fallback as T);
      }
    }
  }
  return results;
}
