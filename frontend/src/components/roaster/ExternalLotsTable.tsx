import React, { useState } from 'react'
import { ChevronDown, Flame, Package, Pencil, PlusCircle, Trash2 } from 'lucide-react'
import { Button } from '../common/Button'
import { Modal } from '../common/Modal'
import type { ExternalDisplayLot } from '../../types/displayTypes'
import { toFixed2, toRoaId } from '../../utils/formatters'
import { useStablePageHeight } from '../../hooks/useStablePageHeight'
import LotsPagination from './LotsPagination'
import { formatPurchaseDate, usedUpLotDeletable } from './purchasedLots'

interface ExternalLotsTableProps {
  lots: ExternalDisplayLot[]
  /**
   * Purchased lots off the shelf (used up), listed collapsed under the shelf
   * with View details and Edit (and Delete while nothing was taken from them).
   * Only the ones the viewer may manage are passed, newest first; the list
   * shows the first USED_UP_SHOWN of them until "Show all" is clicked.
   */
  usedUpLots?: ExternalDisplayLot[]
  onRoast: (lot: ExternalDisplayLot) => void
  onAddExternal: () => void
  /** Edit and Delete show on the lots this returns true for (their buyer, or an Admin). */
  canManage?: (lot: ExternalDisplayLot) => boolean
  onEdit?: (lot: ExternalDisplayLot) => void
  onDelete?: (lot: ExternalDisplayLot) => void
  /** Who bought the lot, shown to an Admin who sees every roaster's shelf. */
  ownerNameOf?: (lot: ExternalDisplayLot) => string | undefined
  currentPage?: number
  totalPages?: number
  onPageChange?: (page: number) => void
  /** Items on a full page, so a short last page still reserves a full page of height. */
  pageSize?: number
  hideHeader?: boolean
  loadingLotId?: string | null
}

/** How many used-up lots the list shows before "Show all". */
const USED_UP_SHOWN = 20

const iconButton =
  'flex h-8 w-8 items-center justify-center rounded-lg border border-[#dfe9df] text-[#557262] transition-colors hover:bg-[#e6f0e8]'

const ExternalLotsTable: React.FC<ExternalLotsTableProps> = ({
  lots,
  usedUpLots = [],
  onRoast,
  onAddExternal,
  canManage,
  onEdit,
  onDelete,
  ownerNameOf,
  currentPage = 1,
  totalPages = 1,
  onPageChange,
  pageSize,
  hideHeader = false,
  loadingLotId,
}) => {
  // A short last page would shrink the panel and make the screen jump up.
  const pageRef = useStablePageHeight<HTMLDivElement>(
    currentPage,
    totalPages,
    lots.length,
    pageSize,
  )
  const [detailsId, setDetailsId] = useState<string | null>(null)
  const [showUsedUp, setShowUsedUp] = useState(false)
  const [showAllUsedUp, setShowAllUsedUp] = useState(false)
  const shownUsedUpLots = showAllUsedUp ? usedUpLots : usedUpLots.slice(0, USED_UP_SHOWN)
  const detailsLot =
    lots.find((l) => l.id === detailsId) ?? usedUpLots.find((l) => l.id === detailsId)
  const manageable = (lot: ExternalDisplayLot) => (canManage ? canManage(lot) : false)
  const isUsedUp = (lot: ExternalDisplayLot) => usedUpLots.some((l) => l.id === lot.id)
  // A used-up lot was nearly always drawn from, which the server refuses to
  // delete: Delete shows only while nothing was taken from it.
  const deletable = (lot: ExternalDisplayLot) =>
    manageable(lot) && (!isUsedUp(lot) || usedUpLotDeletable(lot))

  const closeDetails = () => setDetailsId(null)

  return (
    <div
      className={
        hideHeader ? '' : 'overflow-hidden rounded-2xl border border-[#e2e8e1] bg-white shadow-sm'
      }
    >
      {/* Header */}
      {!hideHeader && (
        <div className="flex items-center justify-between border-b border-[#e6ebe5] bg-[#f8fbf8] px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#dcebe1]">
              <Package className="h-5 w-5 text-[#2e6848]" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-[#20352b]">Purchased Lots</h3>
              <p className="text-sm text-[#7b8a80]">External green bean inventory</p>
            </div>
          </div>
        </div>
      )}

      {hideHeader && (
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#e6ebe5] bg-[#f7fbf7] px-5 py-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#7f9184]">
              Sourcing shelf
            </p>
            <p className="mt-1 text-sm font-bold text-[#294936]">Purchased coffee lots</p>
          </div>
          <Button
            variant="success"
            size="sm"
            icon={<PlusCircle className="h-3.5 w-3.5" />}
            onClick={onAddExternal}
            className="shrink-0"
          >
            Add lot
          </Button>
        </div>
      )}

      <div className="bg-[#f7fbf7] p-4 sm:p-5">
        {lots.length === 0 ? (
          <div className="flex min-h-[260px] flex-col items-center justify-center text-center">
            <Package className="mb-3 h-9 w-9 text-[#a8b8ac]" />
            <p className="text-sm font-bold text-[#55635a]">
              {usedUpLots.length > 0 ? 'No purchased lots on the shelf' : 'No purchased lots yet'}
            </p>
            <p className="mt-1 text-xs text-[#8b9a90]">
              {usedUpLots.length > 0
                ? 'Used-up lots are listed below. Add a lot when new coffee arrives.'
                : 'Add an external lot when new coffee arrives.'}
            </p>
          </div>
        ) : (
          <div ref={pageRef} className="grid content-start gap-3 xl:grid-cols-2">
            {lots.map((lot) => {
              const ownerName = ownerNameOf?.(lot)
              const roaId = toRoaId(lot.id)
              return (
                <article
                  key={lot.id}
                  className="rounded-2xl border border-[#dfe9df] bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-[#9cb8a6] hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-sm font-bold text-[#294936]">{roaId}</p>
                      <p className="mt-1 truncate text-xs font-medium text-[#8b9a90]">
                        {ownerName ? (
                          <>
                            Bought by{' '}
                            <span className="font-semibold text-[#55635a]">{ownerName}</span>
                          </>
                        ) : (
                          'Purchased source lot'
                        )}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setDetailsId(lot.id)}
                        className={iconButton}
                        title="View Details"
                        aria-label={`View details of ${roaId}`}
                      >
                        <Package className="h-4 w-4" aria-hidden="true" />
                      </button>
                      {manageable(lot) && onEdit && (
                        <button
                          type="button"
                          onClick={() => onEdit(lot)}
                          className={iconButton}
                          title="Edit lot"
                          aria-label={`Edit ${roaId}`}
                        >
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                        </button>
                      )}
                      {deletable(lot) && onDelete && (
                        <button
                          type="button"
                          onClick={() => onDelete(lot)}
                          className={`${iconButton} hover:!border-red-200 hover:!bg-red-50 hover:text-red-600`}
                          title="Delete lot"
                          aria-label={`Delete ${roaId}`}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-[#e9f2ec] px-2.5 py-1 text-xs font-bold text-[#2e6848]">
                      {lot.grade || 'Unclassified'}
                    </span>
                    <span className="rounded-full bg-[#eef4ef] px-2.5 py-1 text-xs font-medium text-[#55635a]">
                      {lot.process || 'Process not set'}
                    </span>
                    {/* Weight and the action sit together on the right; the button keeps
                        its natural width instead of stretching across the card. */}
                    <span className="ml-auto flex flex-wrap items-center justify-end gap-4">
                      <span className="text-lg font-bold text-[#294936]">
                        {toFixed2(lot.currentWeightKg)}{' '}
                        <span className="text-xs font-semibold text-[#8b9a90]">kg</span>
                      </span>
                      <Button
                        variant="success"
                        size="md"
                        icon={<Flame className="h-4 w-4" />}
                        disabled={loadingLotId === lot.id}
                        onClick={() => onRoast(lot)}
                        className="shrink-0"
                      >
                        {loadingLotId === lot.id ? 'Loading…' : 'Start roast'}
                      </Button>
                    </span>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>

      {lots.length > 0 && totalPages > 1 && onPageChange && (
        <LotsPagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={onPageChange}
          tone="warm"
        />
      )}

      {/* Used up: off the shelf, still open to view and correct. Collapsed. */}
      {usedUpLots.length > 0 && (
        <div className="border-t border-[#e6ebe5] bg-[#fafcf9] px-4 py-3 sm:px-5">
          <button
            type="button"
            onClick={() => setShowUsedUp((v) => !v)}
            aria-expanded={showUsedUp}
            aria-controls="used-up-purchased-lots"
            className="flex w-full items-center gap-2 text-left text-sm font-bold text-[#55635a] transition-colors hover:text-[#294936]"
          >
            <ChevronDown
              className={`h-4 w-4 transition-transform ${showUsedUp ? '' : '-rotate-90'}`}
              aria-hidden="true"
            />
            Used up
            <span className="rounded-full bg-[#e9f2ec] px-2 py-0.5 text-xs text-[#2e6848]">
              {usedUpLots.length}
            </span>
            <span className="ml-auto text-xs font-medium text-[#8b9a90]">
              Out of kg or withdrawn
            </span>
          </button>
          {showUsedUp && (
            <>
              <ul
                id="used-up-purchased-lots"
                className="mt-3 divide-y divide-[#edf1ec] overflow-hidden rounded-xl border border-[#dfe9df] bg-white"
              >
                {shownUsedUpLots.map((lot) => {
                  const ownerName = ownerNameOf?.(lot)
                  const roaId = toRoaId(lot.id)
                  return (
                    <li key={lot.id} className="flex items-center justify-between gap-3 px-3 py-2">
                      <div className="min-w-0">
                        <p className="font-mono text-sm font-bold text-[#294936]">{roaId}</p>
                        <p className="truncate text-xs text-[#8b9a90]">
                          {[
                            lot.variety && lot.variety !== 'N/A' ? lot.variety : '',
                            lot.process && lot.process !== 'N/A' ? lot.process : '',
                            `${toFixed2(lot.initialWeightKg)} kg bought`,
                            // Set Withdrawn with coffee still in it: say what is left.
                            lot.currentWeightKg > 0
                              ? `Withdrawn, ${toFixed2(lot.currentWeightKg)} kg left`
                              : '',
                            ownerName ? `by ${ownerName}` : '',
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setDetailsId(lot.id)}
                          className={iconButton}
                          title="View Details"
                          aria-label={`View details of ${roaId}`}
                        >
                          <Package className="h-4 w-4" aria-hidden="true" />
                        </button>
                        {manageable(lot) && onEdit && (
                          <button
                            type="button"
                            onClick={() => onEdit(lot)}
                            className={iconButton}
                            title="Edit lot"
                            aria-label={`Edit ${roaId}`}
                          >
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                          </button>
                        )}
                        {deletable(lot) && onDelete && (
                          <button
                            type="button"
                            onClick={() => onDelete(lot)}
                            className={`${iconButton} hover:!border-red-200 hover:!bg-red-50 hover:text-red-600`}
                            title="Delete lot"
                            aria-label={`Delete ${roaId}`}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
              {usedUpLots.length > USED_UP_SHOWN && (
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-[#8b9a90]">
                  <span>
                    {showAllUsedUp
                      ? `All ${usedUpLots.length} used-up lots`
                      : `Newest ${USED_UP_SHOWN} of ${usedUpLots.length}`}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowAllUsedUp((v) => !v)}
                    aria-controls="used-up-purchased-lots"
                    className="rounded-lg border border-[#dfe9df] bg-white px-3 py-1.5 font-bold text-[#2e6848] transition-colors hover:bg-[#edf5ee]"
                  >
                    {showAllUsedUp ? 'Show fewer' : `Show all ${usedUpLots.length}`}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Lot details: a centred popup, with Edit and Delete for its buyer. */}
      <Modal
        isOpen={!!detailsLot}
        onClose={closeDetails}
        maxWidth="md"
        ariaLabelledBy="purchased-lot-details-title"
        className="!p-6"
      >
        {detailsLot && (
          <PurchasedLotDetails
            lot={detailsLot}
            ownerName={ownerNameOf?.(detailsLot)}
            onEdit={
              manageable(detailsLot) && onEdit
                ? () => {
                    closeDetails()
                    onEdit(detailsLot)
                  }
                : undefined
            }
            onDelete={
              deletable(detailsLot) && onDelete
                ? () => {
                    closeDetails()
                    onDelete(detailsLot)
                  }
                : undefined
            }
          />
        )}
      </Modal>
    </div>
  )
}

const DetailRow: React.FC<{ label: string; value?: React.ReactNode; wide?: boolean }> = ({
  label,
  value,
  wide = false,
}) => (
  <div className={wide ? 'sm:col-span-2' : ''}>
    <dt className="text-[10px] font-bold uppercase tracking-wide text-[#8b9a90]">{label}</dt>
    <dd className="mt-0.5 whitespace-pre-line break-words text-sm font-semibold text-[#294936]">
      {value === undefined || value === null || value === '' ? (
        <span className="font-normal text-[#a2ada5]">—</span>
      ) : (
        value
      )}
    </dd>
  </div>
)

const PurchasedLotDetails: React.FC<{
  lot: ExternalDisplayLot
  ownerName?: string
  onEdit?: () => void
  onDelete?: () => void
}> = ({ lot, ownerName, onEdit, onDelete }) => {
  const source = lot.externalSource
  // The lot's own price is the one sales and costs read; 0 is "no price".
  const price = lot.pricePerKg ?? source?.pricePerKg
  const currency = source?.currency || lot.currency || 'THB'
  return (
    <div className="text-[#263b31]">
      <div className="mb-4 flex items-center gap-3 border-b border-[#e8ece8] pb-4 pr-8">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[#dcebe1]">
          <Package className="h-5 w-5 text-[#2e6848]" />
        </div>
        <div className="min-w-0">
          <h2 id="purchased-lot-details-title" className="text-lg font-bold text-[#20352b]">
            Lot details
          </h2>
          <p className="font-mono text-xs font-bold text-[#66756b]">
            {toRoaId(lot.id)}
            {lot.displayId ? ` · ${lot.displayId}` : ''}
          </p>
        </div>
      </div>

      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        <DetailRow label="Origin / Supplier" value={source?.originName} />
        <DetailRow label="Producer" value={source?.producerName} />
        <DetailRow label="Variety" value={source?.variety || lot.variety} />
        <DetailRow label="Process" value={source?.processType || lot.process} />
        <DetailRow label="Grade" value={lot.grade} />
        <DetailRow label="Purchase date" value={formatPurchaseDate(source?.purchaseDate)} />
        <DetailRow
          label="Price / kg"
          value={
            typeof price === 'number' && price > 0 ? `${price.toFixed(2)} ${currency}` : undefined
          }
        />
        <DetailRow
          label="Weight left"
          value={`${toFixed2(lot.currentWeightKg)} of ${toFixed2(lot.initialWeightKg)} kg`}
        />
        {ownerName && <DetailRow label="Bought by" value={ownerName} />}
        <DetailRow label="Taste note" value={source?.tasteNote} wide />
        <DetailRow label="Supplier notes" value={source?.supplierNotes} wide />
      </dl>

      {(onEdit || onDelete) && (
        <div className="mt-5 flex items-center justify-between gap-3 border-t border-[#e8ece8] pt-4">
          {onDelete ? (
            <button
              type="button"
              onClick={onDelete}
              className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </button>
          ) : (
            <span />
          )}
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex items-center gap-2 rounded-xl bg-[#2e6848] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#24553a]"
            >
              <Pencil className="h-4 w-4" />
              Edit lot
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default ExternalLotsTable
