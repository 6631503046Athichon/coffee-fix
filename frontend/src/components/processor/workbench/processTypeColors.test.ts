import resolveConfig from 'tailwindcss/resolveConfig'
import tailwindConfig from '../../../../tailwind.config'
import type { ProcessType } from '../../../types'
import source from './processTypeColors.ts?raw'
import {
  CLASSIC_PROCESS_TYPES,
  PROCESS_TYPE_COLORS,
  PROCESS_TYPE_HUES,
  PROCESS_TYPE_PICKER_HUES,
  defaultProcessTypeName,
  findProcessType,
  processTypeChoices,
  SIMILAR_PROCESS_TYPE_HUES,
  SUGGESTED_PROCESS_TYPE_HUES,
  processTypeColors,
  processTypeDotCheck,
  processTypeFilterNames,
  processTypeHue,
  processTypeHueLabel,
  processTypeScheme,
  similarProcessTypeHues,
  suggestProcessTypeHue,
} from './processTypeColors'

// The scheme shape the admin page has always stored (the old COLOR_SCHEMES).
const adminScheme = (hue: string) => ({
  name: hue[0].toUpperCase() + hue.slice(1),
  borderColor: `border-l-${hue}-500`,
  iconBg: `bg-${hue}-100`,
  iconColor: `text-${hue}-600`,
  badgeColor: `bg-${hue}-100 text-${hue}-700 border-${hue}-200`,
})

const processType = (name: string, hue: string, isActive = true): ProcessType => ({
  id: `pt-${name}`,
  name,
  colorScheme: adminScheme(hue),
  createdDate: '2026-09-01',
  isActive,
})

const types: ProcessType[] = [
  processType('Washed', 'blue'),
  processType('Natural', 'yellow'),
  processType('Honey', 'amber', false),
  processType('Anaerobic', 'purple'),
]

// The eight schemes the admin page offered before the palette grew.
const ORIGINAL_HUES = ['blue', 'amber', 'yellow', 'green', 'purple', 'pink', 'indigo', 'teal'] as const

describe('palette', () => {
  it('offers 17 colours in rainbow order, then gray: 18 swatches', () => {
    expect(PROCESS_TYPE_HUES).toEqual([
      'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan',
      'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose',
    ])
    expect(PROCESS_TYPE_PICKER_HUES).toEqual([...PROCESS_TYPE_HUES, 'gray'])
    expect(PROCESS_TYPE_PICKER_HUES).toHaveLength(18)
    expect(Object.keys(PROCESS_TYPE_COLORS).sort()).toEqual([...PROCESS_TYPE_PICKER_HUES].sort())
  })

  it('names each hue for the swatch and the stored scheme', () => {
    expect(processTypeHueLabel('red')).toBe('Red')
    expect(processTypeHueLabel('fuchsia')).toBe('Fuchsia')
    expect(processTypeHueLabel('gray')).toBe('Gray')
  })
})

describe('look-alike hues', () => {
  it('groups the hues that are hard to tell apart', () => {
    expect(similarProcessTypeHues('violet')).toEqual(['indigo', 'purple'])
    expect(similarProcessTypeHues('purple')).toEqual(['indigo', 'violet'])
    expect(similarProcessTypeHues('blue')).toEqual(['cyan', 'sky'])
    expect(similarProcessTypeHues('green')).toEqual(['emerald', 'teal'])
    expect(similarProcessTypeHues('orange')).toEqual(['amber', 'yellow', 'lime'])
    expect(similarProcessTypeHues('rose')).toEqual(['red', 'pink'])
    expect(similarProcessTypeHues('pink')).toEqual(['fuchsia', 'rose'])
    expect(similarProcessTypeHues('gray')).toEqual([])
  })

  it('puts every colour in a group, and only palette colours', () => {
    expect(new Set(SIMILAR_PROCESS_TYPE_HUES.flat())).toEqual(new Set(PROCESS_TYPE_HUES))
  })
})

describe('suggestProcessTypeHue', () => {
  it('tries every colour once, red last', () => {
    expect([...SUGGESTED_PROCESS_TYPE_HUES].sort()).toEqual([...PROCESS_TYPE_HUES].sort())
    expect(SUGGESTED_PROCESS_TYPE_HUES.at(-1)).toBe('red')
  })

  it('starts on blue, then picks colours far from the ones in use', () => {
    expect(suggestProcessTypeHue([])).toBe('blue')
    // The seeded Washed blue, Natural yellow, Honey amber: not red or orange.
    expect(suggestProcessTypeHue(['blue', 'yellow', 'amber'])).toBe('green')
    expect(suggestProcessTypeHue(['blue', 'yellow', 'amber', 'green'])).toBe('purple')
    expect(suggestProcessTypeHue(['blue', 'yellow', 'amber', 'green', 'purple'])).toBe('pink')
    // Gray (an unknown scheme) rules nothing out.
    expect(suggestProcessTypeHue(['gray'])).toBe('blue')
  })

  it('falls back to the first free colour once every group is in use, then blue', () => {
    const oneOfEach = ['blue', 'green', 'purple', 'amber', 'pink', 'red'] as const
    expect(suggestProcessTypeHue(oneOfEach)).toBe('teal')
    expect(suggestProcessTypeHue(PROCESS_TYPE_HUES)).toBe('blue')
  })
})

describe('processTypeHue', () => {
  it.each(PROCESS_TYPE_HUES)('reads the %s admin scheme', (hue) => {
    expect(processTypeHue(adminScheme(hue))).toBe(hue)
  })

  it.each(PROCESS_TYPE_PICKER_HUES)('reads back the %s scheme the admin page saves', (hue) => {
    expect(processTypeHue(processTypeScheme(hue))).toBe(hue)
    expect(processTypeHue(JSON.stringify(processTypeScheme(hue)))).toBe(hue)
  })

  it.each(PROCESS_TYPE_HUES)('reads a %s scheme by its name alone, or by any one of its classes', (hue) => {
    const scheme = processTypeScheme(hue)
    expect(processTypeHue({ name: scheme.name })).toBe(hue)
    expect(processTypeHue({ borderColor: scheme.borderColor })).toBe(hue)
    expect(processTypeHue({ badgeColor: scheme.badgeColor })).toBe(hue)
    expect(processTypeHue({ iconBg: scheme.iconBg })).toBe(hue)
    expect(processTypeHue({ iconColor: scheme.iconColor })).toBe(hue)
  })

  it('reads the seeded schemes, which have no name, from their classes', () => {
    const { name: _name, ...seeded } = adminScheme('amber')
    expect(processTypeHue(seeded)).toBe('amber')
    expect(processTypeHue({ badgeColor: 'bg-teal-100 text-teal-700 border-teal-200' })).toBe('teal')
    expect(processTypeHue({ iconColor: 'text-pink-600' })).toBe('pink')
    expect(processTypeHue({ name: 'Indigo' })).toBe('indigo')
  })

  it('goes by borderColor first, as the admin edit form does', () => {
    expect(processTypeHue({ ...adminScheme('green'), name: 'Blue' })).toBe('green')
  })

  it('parses a scheme stored as a JSON string', () => {
    expect(processTypeHue(JSON.stringify(adminScheme('purple')))).toBe('purple')
    expect(processTypeHue(JSON.stringify(JSON.stringify(adminScheme('teal'))))).toBe('teal')
  })

  it('now reads the sky and orange schemes it used to show gray', () => {
    expect(processTypeHue({ borderColor: 'border-l-sky-500', badgeColor: 'bg-sky-100 text-sky-800' })).toBe('sky')
    expect(processTypeHue({ name: 'Orange', borderColor: 'border-l-orange-500' })).toBe('orange')
  })

  it('tells close hue names apart', () => {
    expect(processTypeHue({ borderColor: 'border-l-emerald-500' })).toBe('emerald')
    expect(processTypeHue({ badgeColor: 'bg-rose-100 text-rose-700' })).toBe('rose')
    expect(processTypeHue({ badgeColor: 'bg-red-100/50' })).toBe('red')
    expect(processTypeHue({ name: ' Sky ' })).toBe('sky')
  })

  it('is gray for a missing, gray or unknown scheme', () => {
    for (const scheme of [
      undefined, null, '', 'not json', 42, {},
      processTypeScheme('gray'),
      { name: 'Gray', borderColor: 'border-l-gray-400' },
      { borderColor: 'border-l-coffee-500', badgeColor: 'bg-slate-100 text-slate-700' },
      { name: 'Magenta' },
      { borderColor: 'border-l-blue-500x' },
    ]) {
      expect(processTypeHue(scheme)).toBe('gray')
    }
  })
})

describe('processTypeScheme', () => {
  it.each(ORIGINAL_HUES)('saves %s exactly as the old admin form did (same keys, same order)', (hue) => {
    expect(JSON.stringify(processTypeScheme(hue))).toBe(JSON.stringify(adminScheme(hue)))
  })

  it.each(PROCESS_TYPE_PICKER_HUES)('saves %s in the stored shape, from the shared class set', (hue) => {
    const scheme = processTypeScheme(hue)
    const c = PROCESS_TYPE_COLORS[hue]
    expect(Object.keys(scheme)).toEqual(['name', 'borderColor', 'iconBg', 'iconColor', 'badgeColor'])
    expect(scheme).toEqual({
      name: processTypeHueLabel(hue),
      borderColor: c.accent,
      iconBg: c.iconBg,
      iconColor: c.iconColor,
      badgeColor: c.pill,
    })
  })

  it('saves a new hue in the same pattern, and gray with its 400 accent', () => {
    expect(processTypeScheme('fuchsia')).toEqual(adminScheme('fuchsia'))
    expect(processTypeScheme('gray')).toEqual({
      name: 'Gray',
      borderColor: 'border-l-gray-400',
      iconBg: 'bg-gray-100',
      iconColor: 'text-gray-600',
      badgeColor: 'bg-gray-100 text-gray-700 border-gray-200',
    })
  })
})

// WCAG 2.x contrast, on the colours Tailwind builds from this project's config.
const palette = resolveConfig(tailwindConfig).theme.colors as unknown as Record<string, Record<string, string>>
const hex = (cls: string): string => {
  const [, hue, shade] = cls.match(/-([a-z]+)-(\d{2,3})$/)!
  return palette[hue][shade]
}
const luminance = (color: string) => {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(color.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
const WHITE = '#ffffff'
const pick = (set: string, prefix: string) => set.split(' ').find((c) => c.startsWith(prefix))!

describe('contrast', () => {
  it.each(PROCESS_TYPE_PICKER_HUES)('%s: white text on the selected fill clears 4.5:1, the focus ring 3:1', (hue) => {
    const c = PROCESS_TYPE_COLORS[hue]
    expect(contrast(hex(pick(c.chipSelected, 'bg-')), WHITE)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(hex(c.focusRing), WHITE)).toBeGreaterThanOrEqual(3)
  })

  it.each(PROCESS_TYPE_HUES)('%s: the fill is 600 where white reaches 5:1 on it, else 700', (hue) => {
    const shade = pick(PROCESS_TYPE_COLORS[hue].chipSelected, 'bg-').split('-').pop()
    expect(shade).toBe(contrast(palette[hue]['600'], WHITE) >= 5 ? '600' : '700')
  })

  it.each(PROCESS_TYPE_PICKER_HUES)('%s: the check on the selected admin swatch (the 500 dot) clears 3:1', (hue) => {
    const c = PROCESS_TYPE_COLORS[hue]
    const check = processTypeDotCheck(hue)
    expect(contrast(hex(c.dot), check === 'text-white' ? WHITE : hex(check))).toBeGreaterThanOrEqual(3)
  })

  it.each(PROCESS_TYPE_PICKER_HUES)('%s: chip and pill text clear 4.5:1 on their tints', (hue) => {
    const c = PROCESS_TYPE_COLORS[hue]
    const chipText = hex(pick(c.chip, 'text-'))
    expect(contrast(chipText, hex(pick(c.chip, 'bg-')))).toBeGreaterThanOrEqual(4.5)
    expect(contrast(chipText, hex(pick(c.chipHover, 'hover:bg-')))).toBeGreaterThanOrEqual(4.5)
    expect(contrast(hex(pick(c.pill, 'text-')), hex(pick(c.pill, 'bg-')))).toBeGreaterThanOrEqual(4.5)
  })
})

describe('PROCESS_TYPE_COLORS', () => {
  it.each(PROCESS_TYPE_HUES)('gives %s a full class set in its own colour', (hue) => {
    const c = PROCESS_TYPE_COLORS[hue]
    expect(c.chip).toBe(`bg-${hue}-50 border-${hue}-200 text-${hue}-800`)
    // Hover lives apart, so a static preview chip does not look clickable.
    expect(c.chipHover).toBe(`hover:bg-${hue}-100 hover:border-${hue}-300`)
    expect(c.chipSelected).toMatch(new RegExp(`^bg-${hue}-(600|700) border-${hue}-(600|700) text-white$`))
    // The ring uses the selected-fill shade (600/700), which keeps 3:1 or
    // more against the white page; a 500 ring on yellow/amber/green/teal is
    // too faint to show focus.
    const fillShade = c.chipSelected.match(/^bg-\w+-(\d+)/)![1]
    expect(c.focusRing).toBe(`focus-visible:ring-${hue}-${fillShade}`)
    // The same badge the admin page shows for the type.
    expect(c.pill).toBe(adminScheme(hue).badgeColor)
    expect(c.dot).toBe(`bg-${hue}-500`)
    expect(c.accent).toBe(`border-l-${hue}-500`)
    expect(c.iconBg).toBe(`bg-${hue}-100`)
    expect(c.iconColor).toBe(`text-${hue}-600`)
  })

  it('has a gray set for unknown types', () => {
    expect(PROCESS_TYPE_COLORS.gray.pill).toBe('bg-gray-100 text-gray-700 border-gray-200')
    expect(PROCESS_TYPE_COLORS.gray.accent).toBe('border-l-gray-400')
  })

  it('writes every class set out literally, so Tailwind generates it', () => {
    for (const set of Object.values(PROCESS_TYPE_COLORS)) {
      for (const classes of Object.values(set)) {
        expect(source).toContain(`'${classes}'`)
      }
    }
  })
})

describe('lookup by name', () => {
  it('finds a type trimmed and case-insensitively', () => {
    expect(findProcessType(types, '  washed ')?.id).toBe('pt-Washed')
    expect(findProcessType(types, 'ANAEROBIC')?.id).toBe('pt-Anaerobic')
    expect(findProcessType(types, 'Wet-Hulled')).toBeUndefined()
    expect(findProcessType(types, '')).toBeUndefined()
    expect(findProcessType(undefined, 'Washed')).toBeUndefined()
  })

  it('prefers the active type when two differ only by case', () => {
    const twins = [processType('honey', 'pink', false), processType('Honey', 'amber')]
    expect(findProcessType(twins, 'HONEY')?.name).toBe('Honey')
  })

  it('colours a name with its admin colour, and an unknown name gray', () => {
    expect(processTypeColors(types, 'washed').pill).toBe('bg-blue-100 text-blue-700 border-blue-200')
    // Inactive types keep their colour on old records.
    expect(processTypeColors(types, 'Honey').accent).toBe('border-l-amber-500')
    expect(processTypeColors(types, 'Unknown')).toBe(PROCESS_TYPE_COLORS.gray)
    expect(processTypeColors([], 'Washed')).toBe(PROCESS_TYPE_COLORS.gray)
  })
})

describe('processTypeChoices', () => {
  it('offers the active types in the admin list order', () => {
    expect(processTypeChoices(types)).toEqual([
      { name: 'Washed', hue: 'blue', inactive: false },
      { name: 'Natural', hue: 'yellow', inactive: false },
      { name: 'Anaerobic', hue: 'purple', inactive: false },
    ])
  })

  it('keeps an inactive or unknown current value, unchanged, at the end', () => {
    expect(processTypeChoices(types, 'Honey').at(-1)).toEqual({ name: 'Honey', hue: 'amber', inactive: true })
    expect(processTypeChoices(types, 'Wet-Hulled').at(-1)).toEqual({ name: 'Wet-Hulled', hue: 'gray', inactive: true })
    // An offered value in another case is not listed twice.
    expect(processTypeChoices(types, 'natural').map((c) => c.name)).toEqual(['Washed', 'Natural', 'Anaerobic'])
  })

  it('falls back to the classic three only while the list is empty', () => {
    expect(processTypeChoices([]).map((c) => c.name)).toEqual([...CLASSIC_PROCESS_TYPES])
    expect(processTypeChoices(undefined, 'Anaerobic').map((c) => c.name)).toEqual(['Honey', 'Natural', 'Washed', 'Anaerobic'])
    expect(processTypeChoices([processType('Washed', 'blue', false)])).toEqual([])
  })

  it('skips blank and duplicate names', () => {
    const messy = [...types, processType('  ', 'teal'), processType('washed', 'green')]
    expect(processTypeChoices(messy).map((c) => c.name)).toEqual(['Washed', 'Natural', 'Anaerobic'])
  })
})

describe('defaultProcessTypeName', () => {
  it('starts on the preferred type when offered, else the first', () => {
    expect(defaultProcessTypeName(types, 'natural')).toBe('Natural')
    expect(defaultProcessTypeName(types, 'Honey')).toBe('Washed')
    expect(defaultProcessTypeName(types)).toBe('Washed')
    expect(defaultProcessTypeName([], 'Honey')).toBe('Honey')
    expect(defaultProcessTypeName([processType('Washed', 'blue', false)], 'Honey')).toBe('')
  })
})

describe('processTypeFilterNames', () => {
  it('lists every admin type, inactive too, then other values found on records', () => {
    expect(processTypeFilterNames(types, ['washed', 'Wet-Hulled', undefined, 'Carbonic', ''])).toEqual([
      'Washed', 'Natural', 'Honey', 'Anaerobic', 'Carbonic', 'Wet-Hulled',
    ])
  })

  it('uses the classic three while the list is empty', () => {
    expect(processTypeFilterNames([], ['Washed', 'Anaerobic'])).toEqual(['Honey', 'Natural', 'Washed', 'Anaerobic'])
  })
})
