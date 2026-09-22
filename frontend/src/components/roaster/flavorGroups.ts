// Flavor wheel groups offered when tagging a roast. Shared by the roast form
// and the roast edit dialog so both always offer the same notes.
export const FLAVOR_GROUPS: Record<string, string[]> = {
  Sweet: ['Brown Sugar', 'Honey', 'Caramel', 'Vanilla'],
  Fruity: ['Citrus', 'Orange Peel', 'Berry', 'Apple', 'Tropical'],
  Floral: ['Jasmine', 'Rose', 'Lavender'],
  'Nutty/Chocolatey': ['Almond', 'Hazelnut', 'Chocolate', 'Cocoa'],
  Spicy: ['Cinnamon', 'Clove', 'Black Pepper'],
  Roasted: ['Toasted', 'Smoky'],
  Other: ['Earthy', 'Woody', 'Herbal'],
}
