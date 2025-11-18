export function generateNextId(
  existingIds: string[],
  prefix: string,
  padLength: number = 3
): string {
  const numbers = existingIds
    .map(id => parseInt(id.replace(prefix, ''), 10))
    .filter(num => !isNaN(num));

  const maxNumber = numbers.length > 0 ? Math.max(...numbers) : 0;
  const nextNumber = maxNumber + 1;

  return `${prefix}${String(nextNumber).padStart(padLength, '0')}`;
}

export function extractIdNumber(id: string, prefix: string): number {
  const numberStr = id.replace(prefix, '');
  return parseInt(numberStr, 10);
}

// Helper for common ID patterns
export function generateHarvestLotId(existingIds: string[]): string {
  return generateNextId(existingIds, 'HL', 3);
}

export function generateParchmentLotId(existingIds: string[]): string {
  return generateNextId(existingIds, 'PL', 3);
}

export function generateGreenBeanLotId(existingIds: string[]): string {
  return generateNextId(existingIds, 'GB', 3);
}

export function generateRoastLogId(existingIds: string[]): string {
  return generateNextId(existingIds, 'RL', 3);
}

export function generateSoilAnalysisId(existingIds: string[]): string {
  return generateNextId(existingIds, 'SA', 3);
}

export function generateGAPLogId(existingIds: string[]): string {
  return generateNextId(existingIds, 'GAP', 3);
}

export function generateFarmId(existingIds: string[]): string {
  return generateNextId(existingIds, 'F', 3);
}
