// Process-type colours, read from the admin-managed ProcessType list.
//
// An admin gives every process type one of the PROCESS_TYPE_PICKER_HUES
// (admin/ProcessTypeManagement.tsx swatch picker). The stored scheme holds
// Tailwind classes such as `border-l-blue-500`; this module turns it into one
// hue and hands out a full, LITERAL class set per hue. Never build these class
// names with templates: Tailwind only generates classes it can read verbatim
// in src/**/*.ts(x).
//
// Selected-fill shade per hue: 600 where white text on it reaches 5:1, else
// 700, so the white label and check always clear 4.5:1 (lowest: yellow-700,
// 4.9:1). The focus ring uses the same shade, at least 3:1 on the white page.

import type { ProcessType } from '../../../types'

/** The colours an admin can give a process type, in palette (rainbow) order. */
export const PROCESS_TYPE_HUES = [
  'red',
  'orange',
  'amber',
  'yellow',
  'lime',
  'green',
  'emerald',
  'teal',
  'cyan',
  'sky',
  'blue',
  'indigo',
  'violet',
  'purple',
  'fuchsia',
  'pink',
  'rose',
] as const

/** A scheme hue, or gray for a type with no (or an unknown) scheme. */
export type ProcessTypeHue = (typeof PROCESS_TYPE_HUES)[number] | 'gray'

/** Every swatch the admin picker offers: the colours, then gray. */
export const PROCESS_TYPE_PICKER_HUES: readonly ProcessTypeHue[] = [...PROCESS_TYPE_HUES, 'gray']

export interface ProcessTypeColorClasses {
  /** Unselected chip: light tint, matching border, dark text of the hue. */
  chip: string
  /** Hover tint for an unselected chip that is a button (not a static preview). */
  chipHover: string
  /** Selected chip: solid fill with white text (shade keeps 4.5:1 contrast). */
  chipSelected: string
  /** Keyboard focus ring: the selected-fill shade, at least 3:1 on white. */
  focusRing: string
  /** Badge / pill colours, the same as the stored badgeColor (add `border`). */
  pill: string
  /** Small solid dot; also the admin colour swatch. */
  dot: string
  /** Card left accent (add `border-l-4`); the stored borderColor. */
  accent: string
  /** The scheme's stored iconBg (kept for the saved shape; nothing draws it now). */
  iconBg: string
  /** The scheme's stored iconColor (kept for the saved shape; nothing draws it now). */
  iconColor: string
}

export const PROCESS_TYPE_COLORS: Record<ProcessTypeHue, ProcessTypeColorClasses> = {
  red: {
    chip: 'bg-red-50 border-red-200 text-red-800',
    chipHover: 'hover:bg-red-100 hover:border-red-300',
    chipSelected: 'bg-red-700 border-red-700 text-white',
    focusRing: 'focus-visible:ring-red-700',
    pill: 'bg-red-100 text-red-700 border-red-200',
    dot: 'bg-red-500',
    accent: 'border-l-red-500',
    iconBg: 'bg-red-100',
    iconColor: 'text-red-600',
  },
  orange: {
    chip: 'bg-orange-50 border-orange-200 text-orange-800',
    chipHover: 'hover:bg-orange-100 hover:border-orange-300',
    chipSelected: 'bg-orange-700 border-orange-700 text-white',
    focusRing: 'focus-visible:ring-orange-700',
    pill: 'bg-orange-100 text-orange-700 border-orange-200',
    dot: 'bg-orange-500',
    accent: 'border-l-orange-500',
    iconBg: 'bg-orange-100',
    iconColor: 'text-orange-600',
  },
  amber: {
    chip: 'bg-amber-50 border-amber-200 text-amber-800',
    chipHover: 'hover:bg-amber-100 hover:border-amber-300',
    chipSelected: 'bg-amber-700 border-amber-700 text-white',
    focusRing: 'focus-visible:ring-amber-700',
    pill: 'bg-amber-100 text-amber-700 border-amber-200',
    dot: 'bg-amber-500',
    accent: 'border-l-amber-500',
    iconBg: 'bg-amber-100',
    iconColor: 'text-amber-600',
  },
  yellow: {
    chip: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    chipHover: 'hover:bg-yellow-100 hover:border-yellow-300',
    chipSelected: 'bg-yellow-700 border-yellow-700 text-white',
    focusRing: 'focus-visible:ring-yellow-700',
    pill: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    dot: 'bg-yellow-500',
    accent: 'border-l-yellow-500',
    iconBg: 'bg-yellow-100',
    iconColor: 'text-yellow-600',
  },
  lime: {
    chip: 'bg-lime-50 border-lime-200 text-lime-800',
    chipHover: 'hover:bg-lime-100 hover:border-lime-300',
    chipSelected: 'bg-lime-700 border-lime-700 text-white',
    focusRing: 'focus-visible:ring-lime-700',
    pill: 'bg-lime-100 text-lime-700 border-lime-200',
    dot: 'bg-lime-500',
    accent: 'border-l-lime-500',
    iconBg: 'bg-lime-100',
    iconColor: 'text-lime-600',
  },
  green: {
    chip: 'bg-green-50 border-green-200 text-green-800',
    chipHover: 'hover:bg-green-100 hover:border-green-300',
    chipSelected: 'bg-green-700 border-green-700 text-white',
    focusRing: 'focus-visible:ring-green-700',
    pill: 'bg-green-100 text-green-700 border-green-200',
    dot: 'bg-green-500',
    accent: 'border-l-green-500',
    iconBg: 'bg-green-100',
    iconColor: 'text-green-600',
  },
  emerald: {
    chip: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    chipHover: 'hover:bg-emerald-100 hover:border-emerald-300',
    chipSelected: 'bg-emerald-700 border-emerald-700 text-white',
    focusRing: 'focus-visible:ring-emerald-700',
    pill: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    dot: 'bg-emerald-500',
    accent: 'border-l-emerald-500',
    iconBg: 'bg-emerald-100',
    iconColor: 'text-emerald-600',
  },
  teal: {
    chip: 'bg-teal-50 border-teal-200 text-teal-800',
    chipHover: 'hover:bg-teal-100 hover:border-teal-300',
    chipSelected: 'bg-teal-700 border-teal-700 text-white',
    focusRing: 'focus-visible:ring-teal-700',
    pill: 'bg-teal-100 text-teal-700 border-teal-200',
    dot: 'bg-teal-500',
    accent: 'border-l-teal-500',
    iconBg: 'bg-teal-100',
    iconColor: 'text-teal-600',
  },
  cyan: {
    chip: 'bg-cyan-50 border-cyan-200 text-cyan-800',
    chipHover: 'hover:bg-cyan-100 hover:border-cyan-300',
    chipSelected: 'bg-cyan-700 border-cyan-700 text-white',
    focusRing: 'focus-visible:ring-cyan-700',
    pill: 'bg-cyan-100 text-cyan-700 border-cyan-200',
    dot: 'bg-cyan-500',
    accent: 'border-l-cyan-500',
    iconBg: 'bg-cyan-100',
    iconColor: 'text-cyan-600',
  },
  sky: {
    chip: 'bg-sky-50 border-sky-200 text-sky-800',
    chipHover: 'hover:bg-sky-100 hover:border-sky-300',
    chipSelected: 'bg-sky-700 border-sky-700 text-white',
    focusRing: 'focus-visible:ring-sky-700',
    pill: 'bg-sky-100 text-sky-700 border-sky-200',
    dot: 'bg-sky-500',
    accent: 'border-l-sky-500',
    iconBg: 'bg-sky-100',
    iconColor: 'text-sky-600',
  },
  blue: {
    chip: 'bg-blue-50 border-blue-200 text-blue-800',
    chipHover: 'hover:bg-blue-100 hover:border-blue-300',
    chipSelected: 'bg-blue-600 border-blue-600 text-white',
    focusRing: 'focus-visible:ring-blue-600',
    pill: 'bg-blue-100 text-blue-700 border-blue-200',
    dot: 'bg-blue-500',
    accent: 'border-l-blue-500',
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600',
  },
  indigo: {
    chip: 'bg-indigo-50 border-indigo-200 text-indigo-800',
    chipHover: 'hover:bg-indigo-100 hover:border-indigo-300',
    chipSelected: 'bg-indigo-600 border-indigo-600 text-white',
    focusRing: 'focus-visible:ring-indigo-600',
    pill: 'bg-indigo-100 text-indigo-700 border-indigo-200',
    dot: 'bg-indigo-500',
    accent: 'border-l-indigo-500',
    iconBg: 'bg-indigo-100',
    iconColor: 'text-indigo-600',
  },
  violet: {
    chip: 'bg-violet-50 border-violet-200 text-violet-800',
    chipHover: 'hover:bg-violet-100 hover:border-violet-300',
    chipSelected: 'bg-violet-600 border-violet-600 text-white',
    focusRing: 'focus-visible:ring-violet-600',
    pill: 'bg-violet-100 text-violet-700 border-violet-200',
    dot: 'bg-violet-500',
    accent: 'border-l-violet-500',
    iconBg: 'bg-violet-100',
    iconColor: 'text-violet-600',
  },
  purple: {
    chip: 'bg-purple-50 border-purple-200 text-purple-800',
    chipHover: 'hover:bg-purple-100 hover:border-purple-300',
    chipSelected: 'bg-purple-600 border-purple-600 text-white',
    focusRing: 'focus-visible:ring-purple-600',
    pill: 'bg-purple-100 text-purple-700 border-purple-200',
    dot: 'bg-purple-500',
    accent: 'border-l-purple-500',
    iconBg: 'bg-purple-100',
    iconColor: 'text-purple-600',
  },
  fuchsia: {
    chip: 'bg-fuchsia-50 border-fuchsia-200 text-fuchsia-800',
    chipHover: 'hover:bg-fuchsia-100 hover:border-fuchsia-300',
    chipSelected: 'bg-fuchsia-700 border-fuchsia-700 text-white',
    focusRing: 'focus-visible:ring-fuchsia-700',
    pill: 'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200',
    dot: 'bg-fuchsia-500',
    accent: 'border-l-fuchsia-500',
    iconBg: 'bg-fuchsia-100',
    iconColor: 'text-fuchsia-600',
  },
  pink: {
    chip: 'bg-pink-50 border-pink-200 text-pink-800',
    chipHover: 'hover:bg-pink-100 hover:border-pink-300',
    chipSelected: 'bg-pink-700 border-pink-700 text-white',
    focusRing: 'focus-visible:ring-pink-700',
    pill: 'bg-pink-100 text-pink-700 border-pink-200',
    dot: 'bg-pink-500',
    accent: 'border-l-pink-500',
    iconBg: 'bg-pink-100',
    iconColor: 'text-pink-600',
  },
  rose: {
    chip: 'bg-rose-50 border-rose-200 text-rose-800',
    chipHover: 'hover:bg-rose-100 hover:border-rose-300',
    chipSelected: 'bg-rose-700 border-rose-700 text-white',
    focusRing: 'focus-visible:ring-rose-700',
    pill: 'bg-rose-100 text-rose-700 border-rose-200',
    dot: 'bg-rose-500',
    accent: 'border-l-rose-500',
    iconBg: 'bg-rose-100',
    iconColor: 'text-rose-600',
  },
  gray: {
    chip: 'bg-gray-50 border-gray-200 text-gray-800',
    chipHover: 'hover:bg-gray-100 hover:border-gray-300',
    chipSelected: 'bg-gray-600 border-gray-600 text-white',
    focusRing: 'focus-visible:ring-gray-600',
    pill: 'bg-gray-100 text-gray-700 border-gray-200',
    dot: 'bg-gray-400',
    accent: 'border-l-gray-400',
    iconBg: 'bg-gray-100',
    iconColor: 'text-gray-600',
  },
}

/** The display name of a hue, also the stored scheme `name`: `Red`, `Gray`. */
export const processTypeHueLabel = (hue: ProcessTypeHue): string =>
  hue.charAt(0).toUpperCase() + hue.slice(1)

/**
 * Hues that are hard to tell apart in chips, pills and dots. A hue may sit in
 * two groups (rose looks like red and like pink).
 */
export const SIMILAR_PROCESS_TYPE_HUES: readonly (readonly ProcessTypeHue[])[] = [
  ['red', 'rose'],
  ['orange', 'amber', 'yellow', 'lime'],
  ['emerald', 'green', 'teal'],
  ['sky', 'cyan', 'blue'],
  ['violet', 'purple', 'indigo'],
  ['fuchsia', 'pink'],
  ['pink', 'rose'],
]

/** The other hues that look like `hue` (none for gray). */
export const similarProcessTypeHues = (hue: ProcessTypeHue): ProcessTypeHue[] => {
  const similar = SIMILAR_PROCESS_TYPE_HUES.filter((group) => group.includes(hue)).flat()
  return PROCESS_TYPE_HUES.filter((h) => h !== hue && similar.includes(h))
}

/**
 * The order a new process type's colour is suggested in: far-apart hues
 * first; red (also the app's NEW badges, errors and Delete) last.
 */
export const SUGGESTED_PROCESS_TYPE_HUES: readonly ProcessTypeHue[] = [
  'blue', 'green', 'purple', 'amber', 'pink', 'teal', 'orange', 'indigo', 'sky',
  'yellow', 'emerald', 'violet', 'lime', 'fuchsia', 'cyan', 'rose', 'red',
]

/**
 * The colour a new process type starts on, given the colours in use: the
 * first suggested hue that is free and looks like none in use, else the first
 * free one, else blue.
 */
export const suggestProcessTypeHue = (used: readonly ProcessTypeHue[]): ProcessTypeHue => {
  const isUsed = (hue: ProcessTypeHue) => used.includes(hue)
  return (
    SUGGESTED_PROCESS_TYPE_HUES.find((hue) => !isUsed(hue) && !similarProcessTypeHues(hue).some(isUsed)) ??
    SUGGESTED_PROCESS_TYPE_HUES.find((hue) => !isUsed(hue)) ??
    'blue'
  )
}

// Hues whose 500 dot is too light for a white check (under 3:1).
const LIGHT_DOT_HUES: readonly ProcessTypeHue[] = [
  'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'gray',
]

/**
 * The check drawn on a hue's dot (the selected admin swatch): white, or dark
 * on the light hues, so it keeps 3:1 or more either way.
 */
export const processTypeDotCheck = (hue: ProcessTypeHue): string =>
  LIGHT_DOT_HUES.includes(hue) ? 'text-gray-900' : 'text-white'

/** The colorScheme the admin page stores for a process type. */
export type ProcessTypeScheme = ProcessType['colorScheme'] & { name: string }

/**
 * The colorScheme saved for a hue, in the shape the API has always stored:
 * `{ name, borderColor, iconBg, iconColor, badgeColor }`. For the eight
 * original schemes (Blue, Amber, Yellow, Green, Purple, Pink, Indigo, Teal)
 * it is exactly the object the old admin form saved.
 */
export const processTypeScheme = (hue: ProcessTypeHue): ProcessTypeScheme => {
  const c = PROCESS_TYPE_COLORS[hue]
  return {
    name: processTypeHueLabel(hue),
    borderColor: c.accent,
    iconBg: c.iconBg,
    iconColor: c.iconColor,
    badgeColor: c.pill,
  }
}

/**
 * Shown, in this order, only while the admin list is empty (not loaded yet):
 * the three classic process types, by name.
 */
export const CLASSIC_PROCESS_TYPES = ['Honey', 'Natural', 'Washed'] as const

const isHue = (word: string): word is ProcessTypeHue =>
  (PROCESS_TYPE_PICKER_HUES as readonly string[]).includes(word)

// `border-l-blue-500`, `bg-blue-100 text-blue-700 border-blue-200`, ...
const HUE_IN_CLASSES = new RegExp(`-(${PROCESS_TYPE_PICKER_HUES.join('|')})-\\d{2,3}(?![\\w-])`, 'i')

// borderColor first: the admin edit form identifies a scheme by it.
const SCHEME_KEYS = ['borderColor', 'name', 'badgeColor', 'iconBg', 'iconColor'] as const

/**
 * The hue of a stored ProcessType.colorScheme: by the scheme name or by the
 * colour inside its classes. A JSON string is parsed first. Every picker hue
 * resolves, including the eight original schemes and the seeded ones that
 * have no name. Anything else (missing, garbage, a colour outside the
 * palette) is gray.
 */
export const processTypeHue = (scheme: unknown): ProcessTypeHue => {
  let value = scheme
  for (let i = 0; i < 2 && typeof value === 'string'; i++) {
    try {
      value = JSON.parse(value)
    } catch {
      return 'gray'
    }
  }
  if (!value || typeof value !== 'object') return 'gray'
  const record = value as Record<string, unknown>
  for (const key of SCHEME_KEYS) {
    const field = record[key]
    if (typeof field !== 'string') continue
    const word = field.trim().toLowerCase()
    if (isHue(word)) return word
    const match = HUE_IN_CLASSES.exec(field)
    if (match) return match[1].toLowerCase() as ProcessTypeHue
  }
  return 'gray'
}

/** The key process-type names are compared by: trimmed, case-insensitive. */
export const processTypeKey = (name: unknown): string =>
  typeof name === 'string' ? name.trim().toLowerCase() : ''

/**
 * The admin ProcessType a stored name refers to (trimmed, case-insensitive),
 * preferring an active one if two differ only by case.
 */
export const findProcessType = (
  types: readonly ProcessType[] | null | undefined,
  name: string | null | undefined,
): ProcessType | undefined => {
  const key = processTypeKey(name)
  if (!key || !types) return undefined
  const matches = types.filter((pt) => processTypeKey(pt?.name) === key)
  return matches.find((pt) => pt.isActive) ?? matches[0]
}

/** The colour classes for a process type, found by its name. */
export const processTypeColors = (
  types: readonly ProcessType[] | null | undefined,
  name: string | null | undefined,
): ProcessTypeColorClasses =>
  PROCESS_TYPE_COLORS[processTypeHue(findProcessType(types, name)?.colorScheme)]

export interface ProcessTypeChoice {
  name: string
  hue: ProcessTypeHue
  /** Kept only because it is the current value: inactive or not in the list. */
  inactive: boolean
}

/**
 * The process types a picker offers: the active ones in the admin list order
 * (the order the API and the admin page use), then the current value if it is
 * inactive or unknown, so editing an old record never loses it. The classic
 * three stand in only while the admin list is empty.
 */
export const processTypeChoices = (
  types: readonly ProcessType[] | null | undefined,
  selected?: string | null,
): ProcessTypeChoice[] => {
  const list = types ?? []
  const seen = new Set<string>()
  const choices: ProcessTypeChoice[] = []
  const add = (name: string, hue: ProcessTypeHue, inactive: boolean) => {
    const key = processTypeKey(name)
    if (!key || seen.has(key)) return
    seen.add(key)
    choices.push({ name, hue, inactive })
  }
  if (list.length === 0) {
    CLASSIC_PROCESS_TYPES.forEach((name) => add(name, 'gray', false))
  } else {
    for (const pt of list) {
      if (pt?.isActive && typeof pt.name === 'string') {
        add(pt.name.trim(), processTypeHue(pt.colorScheme), false)
      }
    }
  }
  if (selected && processTypeKey(selected)) {
    add(selected, processTypeHue(findProcessType(list, selected)?.colorScheme), true)
  }
  return choices
}

/**
 * The process type a new record starts on: `preferred` when it is offered
 * (in the admin spelling), else the first offered type, else ''.
 */
export const defaultProcessTypeName = (
  types: readonly ProcessType[] | null | undefined,
  preferred?: string,
): string => {
  const choices = processTypeChoices(types)
  const key = processTypeKey(preferred)
  return (key && choices.find((c) => processTypeKey(c.name) === key)?.name) || choices[0]?.name || ''
}

/**
 * Options for a process-type filter: every admin type (inactive too, since old
 * lots carry them) in list order, or the classic three while the list is
 * empty, then any other value found on the records, by name.
 */
export const processTypeFilterNames = (
  types: readonly ProcessType[] | null | undefined,
  recordValues: readonly (string | null | undefined)[] = [],
): string[] => {
  const list = types ?? []
  const seen = new Set<string>()
  const names: string[] = []
  const add = (name: string) => {
    const key = processTypeKey(name)
    if (!key || seen.has(key)) return
    seen.add(key)
    names.push(name.trim())
  }
  if (list.length === 0) CLASSIC_PROCESS_TYPES.forEach(add)
  for (const pt of list) {
    if (typeof pt?.name === 'string') add(pt.name)
  }
  const extra = recordValues
    .filter((v): v is string => typeof v === 'string' && !seen.has(processTypeKey(v)))
    .map((v) => v.trim())
    .sort((a, b) => a.localeCompare(b))
  extra.forEach(add)
  return names
}
