import { useMemo } from 'react';
import { useDataContext } from './useDataContext';

/**
 * The grades this app shipped with, before an admin could manage them.
 *
 * Kept as a fallback so a grade dropdown never renders empty: a fresh
 * database that has not been seeded yet, or a bulk-load that failed,
 * would otherwise leave a processor unable to record anything. Once the
 * CoffeeGrade table has rows, these are ignored entirely.
 */
export const FALLBACK_GRADE_NAMES = [
  'Grade A',
  'Grade B',
  'Grade C',
  'Peaberry',
  'Screen 18',
  'Screen 17',
  'Screen 16',
  'Screen 15',
];

interface GradeNameOptions {
  /**
   * Include grades an admin has switched off. Use this for *filters* over
   * existing lots — a lot filed under a since-retired grade still needs to
   * be findable — but not for forms that create new records.
   */
  includeInactive?: boolean;
  /**
   * Keep this grade in the list even when it is inactive or no longer
   * exists. Use it for edit forms so the value already on the record does
   * not silently disappear from its own dropdown.
   */
  alwaysInclude?: string;
}

/**
 * Grade names for dropdowns, in the order an admin arranged them.
 *
 * Reads from the app-wide data already loaded by bulk-load, so this costs
 * no extra request.
 */
export const useGradeNames = ({ includeInactive = false, alwaysInclude }: GradeNameOptions = {}): string[] => {
  const { data } = useDataContext();
  const coffeeGrades = data.coffeeGrades;

  return useMemo(() => {
    const source = coffeeGrades ?? [];
    const names = source
      .filter(grade => includeInactive || grade.isActive || grade.name === alwaysInclude)
      .map(grade => grade.name);

    const resolved = names.length > 0 ? names : [...FALLBACK_GRADE_NAMES];

    if (alwaysInclude && !resolved.includes(alwaysInclude)) {
      resolved.push(alwaysInclude);
    }

    return resolved;
  }, [coffeeGrades, includeInactive, alwaysInclude]);
};

/**
 * Same list as `useGradeNames`, shaped for the `{ value, label }` selects.
 */
export const useGradeOptions = (options: GradeNameOptions = {}): { value: string; label: string }[] => {
  const names = useGradeNames(options);
  return useMemo(() => names.map(name => ({ value: name, label: name })), [names]);
};
