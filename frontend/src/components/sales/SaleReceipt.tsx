import React from 'react'
import type { SaleOrder } from '../../types'
import {
  describeBean,
  describeLine,
  formatKg,
  formatMoney,
  formatSaleDate,
  saleCustomerName,
} from './saleDisplay'

/**
 * Printable receipt for one sale. It is only ever shown by the print rules in
 * styles.css (portaled into #sale-print-root by the sale details popup), so it
 * is plain black-on-white with blue accents and no fills that need
 * "background graphics" turned on to print.
 */
const SaleReceipt: React.FC<{ order: SaleOrder }> = ({ order }) => {
  const cancelled = order.status === 'Cancelled'
  return (
    <div className="mx-auto max-w-2xl bg-white p-6 text-sm text-gray-900">
      {cancelled && (
        <p className="mb-4 border-2 border-red-600 py-1.5 text-center text-base font-bold tracking-[0.3em] text-red-600">
          CANCELLED
        </p>
      )}

      <div className="flex items-start justify-between gap-6 border-b-2 border-blue-600 pb-3">
        <div>
          <h1 className="text-2xl font-bold text-blue-700">Receipt</h1>
          {order.creatorName && <p className="mt-1 font-semibold">{order.creatorName}</p>}
        </div>
        <dl className="text-right">
          <div className="flex justify-end gap-2">
            <dt className="text-gray-500">Sale #</dt>
            <dd className="font-semibold">{order.orderNumber}</dd>
          </div>
          <div className="flex justify-end gap-2">
            <dt className="text-gray-500">Date</dt>
            <dd>{formatSaleDate(order.orderDate)}</dd>
          </div>
          <div className="flex items-center justify-end gap-2">
            <dt className="text-gray-500">Status</dt>
            <dd>
              {order.status}
              {order.status === 'Draft' && (
                <span className="ml-2 rounded border border-gray-400 px-1.5 text-xs font-semibold uppercase text-gray-600">
                  Draft
                </span>
              )}
            </dd>
          </div>
        </dl>
      </div>

      <div className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Bill to</p>
        <p className="mt-1 font-semibold">{saleCustomerName(order)}</p>
        {order.customerAddress && <p className="whitespace-pre-line">{order.customerAddress}</p>}
        {order.customerPhone && <p>{order.customerPhone}</p>}
      </div>

      <table className="mt-5 w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-gray-400 text-xs uppercase tracking-wider text-gray-500">
            <th className="py-1.5 pr-3 font-semibold">Item</th>
            <th className="py-1.5 pr-3 font-semibold">Coffee</th>
            <th className="py-1.5 pr-3 text-right font-semibold">Kg</th>
            <th className="py-1.5 pr-3 text-right font-semibold">Price/kg</th>
            <th className="py-1.5 text-right font-semibold">Amount</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item) => (
            <tr key={item.id} className="border-b border-gray-200 align-top">
              {item.roast ? (
                <>
                  <td className="py-1.5 pr-3">
                    <span className="font-semibold">{item.roast.label}</span>
                    <span className="block text-xs text-gray-500">
                      {formatSaleDate(item.roast.roastDate)} · {item.roast.roastLevel ?? 'No level'}
                    </span>
                  </td>
                  <td className="py-1.5 pr-3">{describeBean(item)}</td>
                </>
              ) : item.green ? (
                <>
                  <td className="py-1.5 pr-3">
                    <span className="font-semibold">Green beans</span>
                    <span className="block text-xs text-gray-500">
                      {item.green.label}
                      {item.green.greenBeanLotDisplayId ? ` · ${item.green.greenBeanLotDisplayId}` : ''}
                    </span>
                  </td>
                  <td className="py-1.5 pr-3">{describeBean(item)}</td>
                </>
              ) : (
                <td className="py-1.5 pr-3" colSpan={2}>
                  {describeLine(item)}
                </td>
              )}
              <td className="py-1.5 pr-3 text-right tabular-nums">{formatKg(item.quantity)}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums">
                {item.pricePerKg.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </td>
              <td className="py-1.5 text-right tabular-nums">
                {item.subtotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={4} className="pt-3 pr-3 text-right font-semibold">
              Total
            </td>
            <td className="pt-3 text-right text-base font-bold tabular-nums text-blue-700">
              {formatMoney(order.totalAmount, order.currency)}
            </td>
          </tr>
        </tfoot>
      </table>

      {order.notes && (
        <div className="mt-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Notes</p>
          <p className="mt-1 whitespace-pre-line">{order.notes}</p>
        </div>
      )}

      <p className="mt-8 text-center text-gray-600">Thank you</p>
    </div>
  )
}

export default SaleReceipt
