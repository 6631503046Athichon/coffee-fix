/**
 * Format harvest lot ID to a more readable format
 * Options:
 * 1. Short format: First 8 characters of UUID (e.g., "3026e5c9")
 * 2. Full short: First 8 + last 4 (e.g., "3026e5c9...0498")
 * 3. Lot number format: Based on harvest date (e.g., "HL-2025-11-001")
 */

export const formatHarvestLotId = (
  id: string,
  format: 'short' | 'full-short' | 'lot-number' = 'short',
  harvestDate?: string
): string => {
  if (!id) return '';

  switch (format) {
    case 'short':
      // Return first 8 characters: "3026e5c9"
      return id.substring(0, 8).toUpperCase();
    
    case 'full-short':
      // Return first 8 + last 4: "3026e5c9...0498"
      if (id.length >= 12) {
        return `${id.substring(0, 8).toUpperCase()}...${id.substring(id.length - 4).toUpperCase()}`;
      }
      return id.toUpperCase();
    
    case 'lot-number':
      // Format: HL-YYYY-MM-XXX (e.g., "HL-2025-11-001")
      if (harvestDate) {
        try {
          const date = new Date(harvestDate);
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          // Use last 3 characters of UUID as sequence
          const sequence = id.substring(id.length - 3).toUpperCase();
          return `HL-${year}-${month}-${sequence}`;
        } catch (e) {
          // Fallback to short format if date parsing fails
          return id.substring(0, 8).toUpperCase();
        }
      }
      // Fallback to short format if no harvest date
      return id.substring(0, 8).toUpperCase();
    
    default:
      return id;
  }
};

