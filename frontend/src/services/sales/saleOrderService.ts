import {
  AppData,
  GreenStockSummary,
  RoastLevel,
  RoastSaleSummary,
  SaleOrder,
  SaleOrderItem,
  SaleOrderStatus,
  SellableGreenLot,
  SellableRoast,
} from '../../types';
import { api } from '../api';
import { handleApiError } from '../../utils/errorHandler';
import { toRoaId, toRoastBatchId } from '../../utils/formatters';

/** One sale line: roasted coffee from a roast batch, or green beans from a stock row. */
export type SaleLineInput =
  | { roastBatchId: string; quantity: number; pricePerKg: number }
  | { roasterInventoryId: string; quantity: number; pricePerKg: number };

export interface SaleOrderInput {
  customerId: string;
  orderDate: string;
  currency: string;
  notes?: string | null;
  items?: SaleLineInput[];
}

/** A new sale. Admin only: `sellerId` records it for that roaster, from that roaster's stock. */
export type CreateSaleOrderInput = SaleOrderInput & { sellerId?: string };

export interface AffectedRoastBatch {
  id: string;
  soldWeightKg: number;
  availableKg: number;
}

/** A stock row whose green kg a sale took or gave back. */
export interface AffectedInventoryItem {
  id: string;
  remainingWeightKg: number;
}

export interface SaleMutationResult {
  saleOrder: SaleOrder;
  affectedRoastBatches: AffectedRoastBatch[];
  affectedInventoryItems: AffectedInventoryItem[];
}

/* eslint-disable @typescript-eslint/no-explicit-any -- raw backend JSON */

const optionalString = (value: any): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;

const numberOr = (value: any, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const dateOnly = (value: any): string =>
  typeof value === 'string' ? value.slice(0, 10) : '';

export function transformRoastSummary(raw: any): RoastSaleSummary {
  return {
    id: raw.id,
    label: optionalString(raw.label) ?? toRoastBatchId(raw.id),
    roastDate: dateOnly(raw.roastDate),
    roastLevel: optionalString(raw.roastLevel) as RoastLevel | undefined,
    roastedWeightKg: typeof raw.roastedWeightKg === 'number' ? raw.roastedWeightKg : undefined,
    soldWeightKg: numberOr(raw.soldWeightKg, 0),
    availableKg: numberOr(raw.availableKg, 0),
    greenBeanLotId: raw.greenBeanLotId,
    greenBeanLotDisplayId: optionalString(raw.greenBeanLotDisplayId),
    grade: optionalString(raw.grade),
    variety: optionalString(raw.variety),
    process: optionalString(raw.process),
  };
}

export function transformGreenSummary(raw: any): GreenStockSummary {
  return {
    id: raw.id,
    label: optionalString(raw.label) ?? toRoaId(raw.greenBeanLotId ?? raw.id),
    greenBeanLotId: raw.greenBeanLotId,
    greenBeanLotDisplayId: optionalString(raw.greenBeanLotDisplayId),
    grade: optionalString(raw.grade),
    variety: optionalString(raw.variety),
    process: optionalString(raw.process),
    availableKg: numberOr(raw.availableKg, 0),
  };
}

// Tolerates the sale JSON of the backend that was live before roast sales
// (no roast, invoiceCount, updatedAt or customer snapshots).
export function transformSaleOrderFromBackend(order: any): SaleOrder {
  const customer = order.customer;
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    customerId: order.customerId,
    customerName: order.customerName || customer?.name || '',
    customerPhone: optionalString(order.customerPhone),
    customerAddress: optionalString(order.customerAddress),
    customer: customer
      ? {
          id: customer.id,
          name: customer.name,
          type: customer.type,
          contactEmail: optionalString(customer.contactEmail),
          contactPhone: optionalString(customer.contactPhone),
          address: optionalString(customer.address),
        }
      : undefined,
    orderDate: dateOnly(order.orderDate),
    status: order.status,
    items: (order.items || []).map((item: any): SaleOrderItem => ({
      id: item.id,
      roastBatchId: item.roastBatchId ?? undefined,
      roasterInventoryId: item.roasterInventoryId ?? undefined,
      greenBeanLotId: item.greenBeanLotId,
      lotGrade: item.lotGrade || item.greenBeanLot?.grade || '',
      quantity: numberOr(item.quantity, 0),
      pricePerKg: numberOr(item.pricePerKg, 0),
      subtotal: numberOr(item.subtotal, 0),
      roast: item.roast ? transformRoastSummary(item.roast) : undefined,
      green: item.green ? transformGreenSummary(item.green) : undefined,
    })),
    totalAmount: numberOr(order.totalAmount, 0),
    currency: order.currency || 'THB',
    notes: order.notes || undefined,
    createdBy: order.createdBy ?? '',
    creatorName: order.creatorName ?? order.creator?.name ?? undefined,
    invoiceCount: order.invoiceCount ?? order._count?.invoices ?? 0,
    createdAt: order.createdAt ?? '',
    updatedAt: order.updatedAt ?? '',
  };
}

const transformAffected = (raw: any): AffectedRoastBatch[] =>
  Array.isArray(raw)
    ? raw.map((b: any) => ({
        id: b.id,
        soldWeightKg: numberOr(b.soldWeightKg, 0),
        availableKg: numberOr(b.availableKg, 0),
      }))
    : [];

const transformAffectedInventory = (raw: any): AffectedInventoryItem[] =>
  Array.isArray(raw)
    ? raw.map((b: any) => ({
        id: b.id,
        remainingWeightKg: numberOr(b.remainingWeightKg, 0),
      }))
    : [];

export const getAllSaleOrders = async (filters?: {
  customerId?: string;
  status?: string;
}): Promise<SaleOrder[]> => {
  try {
    const params: Record<string, string> = {};
    if (filters?.customerId) params.customerId = filters.customerId;
    if (filters?.status) params.status = filters.status;

    const response = await api.get<{ saleOrders: any[] }>(
      '/sale-orders',
      Object.keys(params).length > 0 ? params : undefined
    );
    return (response.saleOrders || []).map(transformSaleOrderFromBackend);
  } catch (error) {
    throw new Error(handleApiError(error, 'fetch sale orders'));
  }
};

export const getSaleOrderById = async (id: string): Promise<SaleOrder> => {
  try {
    const response = await api.get<{ saleOrder: any }>(`/sale-orders/${id}`);
    return transformSaleOrderFromBackend(response.saleOrder);
  } catch (error) {
    throw new Error(handleApiError(error, 'fetch sale order'));
  }
};

/** Roasts with roasted kg left to sell (the viewer's own; an admin may ask for a roaster's). */
export const getSellableRoasts = async (
  roasterId?: string
): Promise<{ roasts: SellableRoast[]; missingWeightCount: number }> => {
  try {
    const response = await api.get<{ roastBatches: any[]; missingWeightCount?: number }>(
      '/roast-batches/sellable',
      roasterId ? { roasterId } : undefined
    );
    return {
      roasts: (response.roastBatches || []).map((raw: any): SellableRoast => ({
        ...transformRoastSummary(raw),
        roasterId: raw.roasterId,
      })),
      missingWeightCount: numberOr(response.missingWeightCount, 0),
    };
  } catch (error) {
    throw new Error(handleApiError(error, 'fetch roasts to sell'));
  }
};

/** Green stock rows with kg left to sell (the viewer's own; an admin may ask for a roaster's). */
export const getSellableGreenLots = async (roasterId?: string): Promise<SellableGreenLot[]> => {
  try {
    const response = await api.get<{ greenLots: any[] }>(
      '/roaster-inventory/sellable',
      roasterId ? { roasterId } : undefined
    );
    return (response.greenLots || []).map((raw: any): SellableGreenLot => ({
      ...transformGreenSummary(raw),
      roasterId: raw.roasterId,
    }));
  } catch (error) {
    throw new Error(handleApiError(error, 'fetch green beans to sell'));
  }
};

// Create, update and delete rethrow the server's error unchanged: its
// message is written for the user and the popups show it as it is.

export const createSaleOrder = async ({
  sellerId,
  ...input
}: CreateSaleOrderInput): Promise<SaleMutationResult> => {
  // sellerId goes out only when given: a sale of one's own stock never names a seller.
  const response = await api.post<{
    saleOrder: any;
    affectedRoastBatches?: any[];
    affectedInventoryItems?: any[];
  }>('/sale-orders', sellerId ? { ...input, sellerId } : input);
  return {
    saleOrder: transformSaleOrderFromBackend(response.saleOrder),
    affectedRoastBatches: transformAffected(response.affectedRoastBatches),
    affectedInventoryItems: transformAffectedInventory(response.affectedInventoryItems),
  };
};

export const updateSaleOrder = async (
  id: string,
  input: Partial<SaleOrderInput> & { status?: SaleOrderStatus; expectedUpdatedAt: string }
): Promise<SaleMutationResult> => {
  const response = await api.put<{
    saleOrder: any;
    affectedRoastBatches?: any[];
    affectedInventoryItems?: any[];
  }>(`/sale-orders/${id}`, input);
  return {
    saleOrder: transformSaleOrderFromBackend(response.saleOrder),
    affectedRoastBatches: transformAffected(response.affectedRoastBatches),
    affectedInventoryItems: transformAffectedInventory(response.affectedInventoryItems),
  };
};

export const deleteSaleOrder = async (
  id: string,
  expectedUpdatedAt: string
): Promise<{
  affectedRoastBatches: AffectedRoastBatch[];
  affectedInventoryItems: AffectedInventoryItem[];
  deletedInvoices: number;
}> => {
  const response = await api.delete<{
    affectedRoastBatches?: any[];
    affectedInventoryItems?: any[];
    deletedInvoices?: number;
  }>(`/sale-orders/${id}?expectedUpdatedAt=${encodeURIComponent(expectedUpdatedAt)}`);
  return {
    affectedRoastBatches: transformAffected(response?.affectedRoastBatches),
    affectedInventoryItems: transformAffectedInventory(response?.affectedInventoryItems),
    deletedInvoices: numberOr(response?.deletedInvoices, 0),
  };
};

/* eslint-enable @typescript-eslint/no-explicit-any */

/** Newest sale first: sale date, then the time it was recorded. */
export const compareSalesNewestFirst = (a: SaleOrder, b: SaleOrder): number =>
  b.orderDate.localeCompare(a.orderDate) || b.createdAt.localeCompare(a.createdAt);

/**
 * Merges a sale change into the app data without a full reload: upserts or
 * removes the sale (keeping the list newest first), patches the sold kg of
 * the roasts the change touched and the green kg left in the stock rows it
 * took from or gave back to.
 */
export function applySaleChange(
  prev: AppData,
  change: {
    upsert?: SaleOrder;
    removeId?: string;
    affectedRoastBatches?: AffectedRoastBatch[];
    affectedInventoryItems?: AffectedInventoryItem[];
  }
): AppData {
  let saleOrders = prev.saleOrders;
  if (change.removeId) {
    saleOrders = saleOrders.filter((o) => o.id !== change.removeId);
  }
  if (change.upsert) {
    const upsert = change.upsert;
    saleOrders = [...saleOrders.filter((o) => o.id !== upsert.id), upsert];
  }
  if (saleOrders !== prev.saleOrders) {
    saleOrders = [...saleOrders].sort(compareSalesNewestFirst);
  }

  const affected = new Map((change.affectedRoastBatches ?? []).map((b) => [b.id, b]));
  const roastBatches = affected.size
    ? prev.roastBatches.map((b) => {
        const hit = affected.get(b.id);
        return hit ? { ...b, soldWeightKg: hit.soldWeightKg } : b;
      })
    : prev.roastBatches;

  const affectedStock = new Map((change.affectedInventoryItems ?? []).map((i) => [i.id, i]));
  const roasterInventory = affectedStock.size
    ? prev.roasterInventory.map((item) => {
        const hit = affectedStock.get(item.id);
        return hit ? { ...item, remainingWeightKg: hit.remainingWeightKg } : item;
      })
    : prev.roasterInventory;

  return { ...prev, saleOrders, roastBatches, roasterInventory };
}
