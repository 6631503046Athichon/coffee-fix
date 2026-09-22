import React, { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  Flame,
  Loader2,
  Pencil,
  Trash2,
  X,
} from 'lucide-react'
import DatePicker from '../common/DatePicker'
import { Modal } from '../common/Modal'
import { useDataContext } from '../../hooks/useDataContext'
import { useToast } from '../../contexts/ToastContext'
import { RoastBatch, RoastLevel } from '../../types'
import { toFixed2, toRoaId, toRoastBatchId } from '../../utils/formatters'
import { deleteRoastBatch, updateRoastBatch } from '../../services/roaster/roasterService'
import { FLAVOR_GROUPS } from './flavorGroups'

/** A roast plus the labels of the coffee it came from, as the log and logbook already show them. */
export type RoastDetails = RoastBatch & {
  formattedLotId?: string
  sourceVariety?: string
  sourceProcess?: string
  sourceGrade?: string
}

interface RoastDetailsModalProps {
  roast: RoastDetails | null
  /** Owner of the roast, or an admin: may correct or delete it. */
  canManage: boolean
  onClose: () => void
}

type Mode = 'view' | 'edit' | 'confirm-delete'

const splitTags = (value?: string) =>
  (value || '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)

// Yield window the roasting desk treats as typical. Outside it the record only
// asks the roaster to double-check the weights; it says nothing about cup quality.
const TYPICAL_YIELD_MIN = 78
const TYPICAL_YIELD_MAX = 92

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "2026-09-16" → "16 Sep 2026"; anything else is shown as is. */
const formatRoastDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return y && m >= 1 && m <= 12 && d ? `${d} ${MONTHS[m - 1]} ${y}` : iso
}

const parseWeight = (value: string) => {
  const normalized = value.trim().replace(',', '.')
  return normalized === '' ? NaN : Number(normalized)
}

const fieldClass =
  'block w-full rounded-xl border border-[#d6dfd7] bg-white px-4 py-3 text-sm text-[#294936] outline-none transition-all duration-200 focus:border-[#d87832] focus:ring-4 focus:ring-orange-100'
const labelClass = 'mb-2 block text-sm font-semibold text-[#46564b]'

const RoastDetailsModal: React.FC<RoastDetailsModalProps> = ({ roast, canManage, onClose }) => {
  if (!roast) return null
  // Keyed by roast so every newly opened roast starts from a clean view state.
  return <RoastDetailsBody key={roast.id} roast={roast} canManage={canManage} onClose={onClose} />
}

const RoastDetailsBody: React.FC<{
  roast: RoastDetails
  canManage: boolean
  onClose: () => void
}> = ({ roast, canManage, onClose }) => {
  const { data, setData, refreshData, setIsEditing } = useDataContext()
  const { addToast } = useToast()

  const [mode, setMode] = useState<Mode>('view')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const [roastDate, setRoastDate] = useState(roast.roastDate)
  const [batchSize, setBatchSize] = useState(String(roast.batchSizeKg))
  const [roastedWeight, setRoastedWeight] = useState(
    roast.roastedWeightKg != null ? String(roast.roastedWeightKg) : '',
  )
  const [roastLevel, setRoastLevel] = useState<RoastLevel | undefined>(roast.roastLevel)
  const [notes, setNotes] = useState(
    roast.roastProfileNotes === 'No notes' ? '' : roast.roastProfileNotes || '',
  )
  const [flavorTags, setFlavorTags] = useState<string[]>(splitTags(roast.flavorNotes))
  const [openGroups, setOpenGroups] = useState<string[]>([])
  const editFirstFieldRef = useRef<HTMLInputElement>(null)
  const keepRoastRef = useRef<HTMLButtonElement>(null)

  // Pause the background reload while the dialog is open: a reload that started
  // before a save or delete would otherwise land afterwards and put the old
  // roast and stock figures back on screen.
  useEffect(() => {
    setIsEditing(true)
    return () => setIsEditing(false)
  }, [setIsEditing])

  // The button that switches modes disappears with the old mode, so move
  // keyboard focus into the new one.
  useEffect(() => {
    if (mode === 'edit') editFirstFieldRef.current?.focus()
    if (mode === 'confirm-delete') keepRoastRef.current?.focus()
  }, [mode])

  const roastLabel = roast.displayId || toRoastBatchId(roast.id)
  // The stored yield carries two decimals, so the check has to use the same
  // one-decimal figure the panel prints, or a 77.96 shows as 78.0% next to a
  // notice saying it is outside the 78-92% range.
  const shownYieldPct = Number(roast.yieldPercentage.toFixed(1))
  const inventory = data.roasterInventory.find((item) => item.id === roast.roasterInventoryId)
  // What the corrected batch may use: this roast's own beans plus what is still
  // in stock. The bulk load keeps only the newest inventory rows, so the row can
  // be missing here; then the stock is unknown and the server is the only check.
  // Rounded to what the hint shows, so the value it names is accepted.
  const maxBatchKg = inventory
    ? Math.round((roast.batchSizeKg + inventory.remainingWeightKg) * 100) / 100
    : null

  const batchKg = parseWeight(batchSize)
  const roastedKg = parseWeight(roastedWeight)
  const yieldPct =
    batchKg > 0 && roastedKg != null && roastedKg > 0 ? (roastedKg / batchKg) * 100 : null

  const close = () => {
    if (busy) return
    onClose()
  }

  const applyInventory = (updated?: { id: string; remainingWeightKg: number }) =>
    updated
      ? (items: typeof data.roasterInventory) =>
          items.map((item) =>
            item.id === updated.id
              ? { ...item, remainingWeightKg: updated.remainingWeightKg }
              : item,
          )
      : (items: typeof data.roasterInventory) => items

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault()
    if (busy) return
    if (!(batchKg > 0)) {
      setError('Enter the green bean weight.')
      return
    }
    if (maxBatchKg != null && batchKg > maxBatchKg + 1e-9) {
      setError(`Only ${toFixed2(maxBatchKg)} kg is available for this roast.`)
      return
    }
    if (!(roastedKg > 0)) {
      setError('Enter the roasted weight.')
      return
    }
    if (roastedKg > batchKg) {
      setError('Roasted weight cannot be more than the green beans in.')
      return
    }
    if (!roastDate) {
      setError('Choose the roast date.')
      return
    }

    try {
      setError('')
      setBusy(true)
      const { roastBatch, updatedInventory } = await updateRoastBatch(roast.id, {
        // Only sent when it changed, so an untouched date is never rewritten.
        roastDate: roastDate !== roast.roastDate ? roastDate : undefined,
        batchSizeKg: batchKg,
        roastedWeightKg: roastedKg,
        roastLevel: roastLevel ?? null,
        roastProfileNotes: notes.trim(),
        flavorNotes: flavorTags.join(', ') || null,
        expectedUpdatedAt: roast.updatedAt,
      })
      setData((prev) => ({
        ...prev,
        roastBatches: prev.roastBatches.map((item) =>
          item.id === roast.id ? { ...roastBatch, displayId: item.displayId } : item,
        ),
        roasterInventory: applyInventory(updatedInventory)(prev.roasterInventory),
      }))
      addToast({ type: 'success', message: `Roast ${roastLabel} updated` })
      onClose()
    } catch (err) {
      // Stale form: someone else corrected or removed this roast. Pull the
      // current rows and close, so the next open starts from what is there.
      if (
        err instanceof Error &&
        /changed or removed by someone else|^Roast batch not found$/i.test(err.message)
      ) {
        await refreshData().catch(() => undefined)
        addToast({ type: 'error', message: err.message })
        onClose()
        return
      }
      setError(
        err instanceof Error && err.message
          ? err.message
          : 'The roast could not be updated. Please try again.',
      )
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async () => {
    if (busy) return
    try {
      setError('')
      setBusy(true)
      const { updatedInventory } = await deleteRoastBatch(roast.id)
      setData((prev) => ({
        ...prev,
        roastBatches: prev.roastBatches.filter((item) => item.id !== roast.id),
        roasterInventory: applyInventory(updatedInventory)(prev.roasterInventory),
      }))
      addToast({
        type: 'success',
        message: `Roast ${roastLabel} deleted · ${toFixed2(roast.batchSizeKg)} kg returned to stock`,
      })
      onClose()
    } catch (err) {
      // The API client resends a request after a 503. If the first attempt had
      // already deleted the roast, the resend reports it missing: the roast is
      // gone either way, so drop it here and reload the stock numbers.
      if (err instanceof Error && /^(Roast batch|Record) not found$/i.test(err.message)) {
        setData((prev) => ({
          ...prev,
          roastBatches: prev.roastBatches.filter((item) => item.id !== roast.id),
        }))
        refreshData().catch(() => undefined)
        addToast({ type: 'success', message: `Roast ${roastLabel} deleted` })
        onClose()
        return
      }
      setError(
        err instanceof Error && err.message
          ? err.message
          : 'The roast could not be deleted. Please try again.',
      )
    } finally {
      setBusy(false)
    }
  }

  const header = (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-[#d87832] shadow-sm shadow-orange-200">
          {mode === 'edit' ? (
            <Pencil className="h-5 w-5 text-white" />
          ) : (
            <Flame className="h-6 w-6 text-white" />
          )}
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#d87832]">
            {mode === 'edit' ? 'Edit roast' : 'Roast details'}
          </p>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900">{roastLabel}</h2>
        </div>
      </div>
      <button
        type="button"
        onClick={close}
        disabled={busy}
        aria-label="Close"
        title="Close"
        className="-mr-2 -mt-1 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-[#718077] transition-colors hover:bg-[#f1f5f1] hover:text-[#294936] disabled:opacity-40"
      >
        <X className="h-5 w-5" />
      </button>
    </div>
  )

  const errorBox = error && (
    <p
      role="alert"
      className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
    >
      {error}
    </p>
  )

  if (mode === 'edit') {
    return (
      <Modal isOpen onClose={close} maxWidth="2xl" showCloseButton={false}>
        <form onSubmit={handleSave} className="text-[#263b31]">
          {header}

          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <span className={labelClass}>Roast date</span>
                <DatePicker value={roastDate} onChange={setRoastDate} />
              </div>
              <div>
                <label htmlFor="edit-roast-batch" className={labelClass}>
                  Green beans in (kg)
                </label>
                <input
                  id="edit-roast-batch"
                  ref={editFirstFieldRef}
                  inputMode="decimal"
                  autoComplete="off"
                  value={batchSize}
                  onChange={(e) => setBatchSize(e.target.value)}
                  className={`${fieldClass} font-bold`}
                />
              </div>
              <div>
                <label htmlFor="edit-roast-roasted" className={labelClass}>
                  Roasted beans out (kg)
                </label>
                <input
                  id="edit-roast-roasted"
                  inputMode="decimal"
                  autoComplete="off"
                  value={roastedWeight}
                  onChange={(e) => setRoastedWeight(e.target.value)}
                  className={`${fieldClass} font-bold`}
                />
              </div>
            </div>
            <p className="-mt-2 text-xs text-[#718077]">
              {inventory && maxBatchKg != null
                ? `Up to ${toFixed2(maxBatchKg)} kg can go in (this roast's ${toFixed2(roast.batchSizeKg)} kg plus ${toFixed2(inventory.remainingWeightKg)} kg still in stock). `
                : `This roast used ${toFixed2(roast.batchSizeKg)} kg; how much stock is still available is checked when you save. `}
              Changing the green weight adjusts your stock by the difference.
              {yieldPct != null && (
                <span className="ml-1 font-semibold text-[#2e6848]">
                  Yield {yieldPct.toFixed(1)}%
                </span>
              )}
            </p>

            <div>
              <span className={labelClass}>Roast level</span>
              <div className="grid grid-cols-3 gap-2">
                {[RoastLevel.Light, RoastLevel.Medium, RoastLevel.Dark].map((level) => (
                  <button
                    key={level}
                    type="button"
                    aria-pressed={roastLevel === level}
                    onClick={() => setRoastLevel(level)}
                    className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-bold transition-all ${roastLevel === level ? 'border-[#d87832] bg-[#fff1df] text-[#b45f22] shadow-sm' : 'border-[#e2e8e1] bg-white text-[#718077] hover:border-[#b8cabe]'}`}
                  >
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${level === RoastLevel.Light ? 'bg-[#d5a455]' : level === RoastLevel.Medium ? 'bg-[#9b633b]' : 'bg-[#3d302b]'}`}
                    />
                    {level}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="edit-roast-notes" className={labelClass}>
                Roast notes
              </label>
              <textarea
                id="edit-roast-notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className={`${fieldClass} resize-y`}
                placeholder="e.g., First crack at 9:30. Dropped at 11:15."
              />
            </div>

            <div>
              <p className={labelClass}>
                Flavor notes{' '}
                <span className="font-normal text-[#9aa69e]">— tap to add or remove</span>
              </p>
              {flavorTags.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {flavorTags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1.5 rounded-full border border-yellow-200 bg-yellow-100 py-1 pl-3 pr-1.5 text-xs font-semibold text-yellow-800"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => setFlavorTags((prev) => prev.filter((t) => t !== tag))}
                        className="flex h-5 w-5 items-center justify-center rounded-full text-yellow-700 hover:bg-yellow-200 hover:text-yellow-900"
                        aria-label={`Remove ${tag}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {Object.keys(FLAVOR_GROUPS).map((group) => {
                  const isOpen = openGroups.includes(group)
                  return (
                    <button
                      key={group}
                      type="button"
                      aria-pressed={isOpen}
                      onClick={() =>
                        setOpenGroups((prev) =>
                          isOpen ? prev.filter((item) => item !== group) : [...prev, group],
                        )
                      }
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${isOpen ? 'border-[#2e6848] bg-[#e9f2ec] text-[#2e6848]' : 'border-[#dfe9df] bg-white text-[#718077] hover:border-[#9cb8a6]'}`}
                    >
                      {group}
                    </button>
                  )
                })}
              </div>
              {openGroups.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2 rounded-xl border border-[#e2e8e1] bg-[#f7fbf7] p-3">
                  {openGroups
                    .flatMap((group) => FLAVOR_GROUPS[group])
                    .map((note) => {
                      const isSelected = flavorTags.includes(note)
                      return (
                        <button
                          key={note}
                          type="button"
                          aria-pressed={isSelected}
                          onClick={() =>
                            setFlavorTags((prev) =>
                              isSelected ? prev.filter((t) => t !== note) : [...prev, note],
                            )
                          }
                          className={`rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${isSelected ? 'border-[#d87832] bg-[#fff1df] font-bold text-[#b45f22]' : 'border-transparent bg-white text-[#718077] hover:border-[#e2e8e1]'}`}
                        >
                          {note}
                        </button>
                      )
                    })}
                </div>
              )}
            </div>
          </div>

          <div className="sticky -bottom-8 -mx-8 -mb-8 mt-6 rounded-b-3xl border-t border-[#e8ece8] bg-white px-8 py-4">
            {errorBox}
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setError('')
                  setMode('view')
                }}
                disabled={busy}
                className="rounded-xl bg-gray-100 px-5 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-200 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#d87832] px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#bd5d1e] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {busy ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </form>
      </Modal>
    )
  }

  return (
    <Modal isOpen onClose={close} maxWidth="lg" showCloseButton={false}>
      <div className="text-[#263b31]">
        {header}

        <div className="rounded-2xl bg-[#f7faf7] p-4">
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
            <div>
              <p className="text-xs font-semibold text-[#829188]">Green beans in</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-[#294936]">
                {toFixed2(roast.batchSizeKg)}{' '}
                <span className="text-sm font-semibold text-[#829188]">kg</span>
              </p>
            </div>
            <ArrowRight aria-hidden="true" className="h-5 w-5 text-[#b3beb6]" />
            <div>
              <p className="text-xs font-semibold text-[#829188]">Roasted beans out</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-[#294936]">
                {roast.roastedWeightKg != null ? (
                  <>
                    {toFixed2(roast.roastedWeightKg)}{' '}
                    <span className="text-sm font-semibold text-[#829188]">kg</span>
                  </>
                ) : (
                  <span className="text-base font-semibold text-[#718077]">Not recorded</span>
                )}
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-[#e2e8e1] pt-3 text-sm">
            <p>
              <span className="text-[#829188]">Yield</span>{' '}
              <span className="font-bold tabular-nums text-[#294936]">
                {shownYieldPct.toFixed(1)}%
              </span>
            </p>
            <p>
              <span className="text-[#829188]">Weight loss</span>{' '}
              <span className="font-bold tabular-nums text-[#294936]">
                {(100 - shownYieldPct).toFixed(1)}%
              </span>
            </p>
            <p className="ml-auto flex items-center gap-2 text-[#6d756e]">
              <CalendarDays aria-hidden="true" className="h-4 w-4 text-[#829188]" />
              <span className="sr-only">Roast date</span>
              <span>{formatRoastDate(roast.roastDate)}</span>
              <span className="sr-only">Roast level</span>
              {roast.roastLevel ? (
                <span className="rounded-full bg-[#fff1df] px-2.5 py-0.5 text-xs font-bold text-[#b45f22]">
                  {roast.roastLevel}
                </span>
              ) : (
                <span className="rounded-full bg-[#eef1ee] px-2.5 py-0.5 text-xs font-semibold text-[#718077]">
                  Level not set
                </span>
              )}
            </p>
          </div>
        </div>

        {(shownYieldPct < TYPICAL_YIELD_MIN || shownYieldPct > TYPICAL_YIELD_MAX) && (
          <p
            role="status"
            className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
          >
            <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>
              Yield is outside the usual {TYPICAL_YIELD_MIN}–{TYPICAL_YIELD_MAX}% range. Check the
              weights in and out{canManage ? ' and use Edit roast to correct them' : ''}.
            </span>
          </p>
        )}

        <dl className="mt-4 divide-y divide-[#e8ece8] rounded-xl border border-[#e8ece8] text-sm">
          {[
            ['Source ID', roast.formattedLotId ?? toRoaId(roast.greenBeanLotId)],
            ['Variety', roast.sourceVariety || 'Not set'],
            ['Process type', roast.sourceProcess || 'Not set'],
            ['Grade', roast.sourceGrade || 'Not set'],
          ].map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between gap-4 px-3 py-2">
              <dt className="flex-shrink-0 text-[#829188]">{label}</dt>
              <dd className="break-words text-right font-semibold text-[#294936]">{value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-4">
          <p className="text-xs font-semibold text-[#829188]">Roast notes</p>
          {roast.roastProfileNotes && roast.roastProfileNotes !== 'No notes' ? (
            <p className="mt-1 whitespace-pre-wrap break-words rounded-xl border border-[#f0e5d6] bg-[#fffaf3] p-3 text-sm leading-relaxed text-[#6d756e]">
              {roast.roastProfileNotes}
            </p>
          ) : (
            <p className="mt-1 text-sm text-[#718077]">Not recorded</p>
          )}
        </div>

        <div className="mt-4">
          <p className="text-xs font-semibold text-[#829188]">Flavor notes</p>
          {splitTags(roast.flavorNotes).length > 0 ? (
            <div className="mt-1.5 flex flex-wrap gap-2">
              {splitTags(roast.flavorNotes).map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-yellow-200 bg-yellow-100 px-3 py-1 text-xs font-semibold text-yellow-800"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-1 text-sm text-[#718077]">Not recorded</p>
          )}
        </div>

        {canManage && (
          <div className="-mx-8 -mb-8 mt-6 rounded-b-3xl border-t border-[#e8ece8] bg-white px-8 py-4">
            {errorBox}
            {mode === 'confirm-delete' ? (
              <div
                role="alertdialog"
                aria-labelledby="delete-roast-title"
                className="rounded-xl border border-red-200 bg-red-50 p-4"
              >
                <p
                  id="delete-roast-title"
                  className="flex items-center gap-2 text-sm font-bold text-red-800"
                >
                  <AlertTriangle className="h-4 w-4" />
                  Delete roast {roastLabel}?
                </p>
                <p className="mt-1 text-sm text-red-700">
                  Its {toFixed2(roast.batchSizeKg)} kg of green beans go back to stock. This cannot
                  be undone.
                </p>
                <div className="mt-3 flex justify-end gap-3">
                  <button
                    type="button"
                    ref={keepRoastRef}
                    onClick={() => {
                      setError('')
                      setMode('view')
                    }}
                    disabled={busy}
                    className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-gray-700 ring-1 ring-gray-200 transition-colors hover:bg-gray-50 disabled:opacity-50"
                  >
                    Keep roast
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={busy}
                    className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                    {busy ? 'Deleting…' : 'Delete roast'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setMode('confirm-delete')}
                  className="inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </button>
                <button
                  type="button"
                  onClick={() => setMode('edit')}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#d87832] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#bd5d1e]"
                >
                  <Pencil className="h-4 w-4" />
                  Edit roast
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}

export default RoastDetailsModal
