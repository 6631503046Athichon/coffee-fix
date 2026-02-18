/**
 * Utility to format display IDs for various lot types
 * Format: {PREFIX}-{YEAR}-{NUMBER}
 * Example: GBL-2026-001, PCH-2026-001, PB-2026-001
 */

export type IdPrefix = 'GBL' | 'PCH' | 'PB' | 'HL';

interface HasIdAndCreatedAt {
  id: string;
  createdAt?: string | Date;
  displayId?: string;
}

/**
 * Generate a readable display ID from UUID and timestamp
 * Uses the last 3 digits of the timestamp as the sequence number
 */
export const formatDisplayId = (
  item: HasIdAndCreatedAt,
  prefix: IdPrefix
): string => {
  // If displayId already exists (from backend), use it
  if (item.displayId) {
    return item.displayId;
  }

  // Extract year from createdAt or use current year
  let year = new Date().getFullYear();
  if (item.createdAt) {
    const date = new Date(item.createdAt);
    if (!isNaN(date.getTime())) {
      year = date.getFullYear();
    }
  }

  // Use first 4 hex chars of UUID as a short hash, prefixed with #
  // This makes it visually distinct from sequential IDs like GBL-2026-42
  const shortHash = item.id.substring(0, 4).toLowerCase();
  return `${prefix}-${year}-#${shortHash}`;
};

/**
 * Format a Green Bean Lot display ID
 */
export const formatGreenBeanId = (item: HasIdAndCreatedAt): string => {
  return formatDisplayId(item, 'GBL');
};

/**
 * Format a Parchment Lot display ID
 */
export const formatParchmentId = (item: HasIdAndCreatedAt): string => {
  return formatDisplayId(item, 'PCH');
};

/**
 * Format a Processing Batch display ID
 */
export const formatProcessingBatchId = (item: HasIdAndCreatedAt): string => {
  return formatDisplayId(item, 'PB');
};

/**
 * Format a Harvest Lot display ID
 */
export const formatHarvestLotId = (item: HasIdAndCreatedAt): string => {
  return formatDisplayId(item, 'HL');
};

export default formatDisplayId;
