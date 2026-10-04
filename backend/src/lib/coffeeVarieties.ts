import prisma from '@/lib/prisma'

// The unique index on CoffeeVariety.name is case-sensitive, so on its own it
// let "bourbon" in next to "Bourbon" and the dropdowns then listed both.
// Names are compared trimmed and lower-cased here instead. The registry is
// a few dozen rows, so the comparison runs over all of them in memory, which
// also catches older rows that were saved with stray spaces.

const nameKey = (name: string) => name.trim().toLowerCase()

/**
 * The variety (other than `excludeId`) whose name matches `name` ignoring
 * case and surrounding spaces, or null when the name is free.
 */
export async function findVarietyNameClash(
  name: string,
  excludeId?: string
): Promise<{ id: string; name: string } | null> {
  const key = nameKey(name)
  const varieties = await prisma.coffeeVariety.findMany({
    select: { id: true, name: true },
  })
  return varieties.find(v => v.id !== excludeId && nameKey(v.name) === key) ?? null
}

export const varietyNameTakenMessage = (existingName: string) =>
  `Coffee variety "${existingName.trim()}" already exists (names are not case-sensitive)`
