import type { RoastLevel } from "./roaster";

export interface Customer {
  id: string;
  name: string;
  type: "Roaster" | "Distributor" | "Retailer" | "Other";
  contactEmail?: string;
  contactPhone?: string;
  address?: string;
  notes?: string;
}

export type SaleOrderStatus = "Draft" | "Confirmed" | "Delivered" | "Cancelled";

/** A roast batch as it appears on a sale (and in the list of roasts that can be sold). */
export interface RoastSaleSummary {
  id: string;
  /** 'RB-0421' */
  label: string;
  /** YYYY-MM-DD */
  roastDate: string;
  roastLevel?: RoastLevel;
  roastedWeightKg?: number;
  soldWeightKg: number;
  /** Roasted kg not yet on a sale (roasted - sold, never below 0). */
  availableKg: number;
  greenBeanLotId: string;
  greenBeanLotDisplayId?: string;
  /** Live grade of the green lot; sale lines show their own lotGrade snapshot instead. */
  grade?: string;
  variety?: string;
  process?: string;
}

export interface SellableRoast extends RoastSaleSummary {
  roasterId: string;
}

/** Green beans in a roaster's stock (a RoasterInventoryItem), as on a sale and in the list that can be sold. */
export interface GreenStockSummary {
  /** RoasterInventoryItem id */
  id: string;
  /** 'ROA-1234' from the green lot id: the id the roaster pages show */
  label: string;
  greenBeanLotId: string;
  /** 'GBL-2026-7' */
  greenBeanLotDisplayId?: string;
  /** Live grade of the green lot; sale lines show their own lotGrade snapshot instead. */
  grade?: string;
  variety?: string;
  process?: string;
  /** Green kg in the stock row that no sale holds. */
  availableKg: number;
}

export interface SellableGreenLot extends GreenStockSummary {
  roasterId: string;
}

export interface SaleOrderItem {
  id: string;
  /** Set on roasted-coffee lines. */
  roastBatchId?: string;
  /** Set on green-bean lines sold from a roaster's stock. Lines recorded before roast sales have neither. */
  roasterInventoryId?: string;
  greenBeanLotId: string;
  /** Grade of the green lot when the sale was recorded. */
  lotGrade: string;
  /** kg */
  quantity: number;
  pricePerKg: number;
  subtotal: number;
  roast?: RoastSaleSummary;
  green?: GreenStockSummary;
}

/** The customer as it is now (the sale keeps its own name/phone/address snapshot). */
export interface SaleCustomerSnapshot {
  id: string;
  name: string;
  type: Customer["type"];
  contactEmail?: string;
  contactPhone?: string;
  address?: string;
}

export interface SaleOrder {
  id: string;
  orderNumber: string;
  customerId: string;
  /** Snapshots taken when the sale was recorded (or its customer changed). */
  customerName: string;
  customerPhone?: string;
  customerAddress?: string;
  /** Live customer record. */
  customer?: SaleCustomerSnapshot;
  /** YYYY-MM-DD */
  orderDate: string;
  status: SaleOrderStatus;
  items: SaleOrderItem[];
  totalAmount: number;
  currency: string;
  notes?: string;
  /** User id of the owner. */
  createdBy: string;
  creatorName?: string;
  invoiceCount: number;
  createdAt: string;
  /** Sent back as expectedUpdatedAt when editing or deleting. */
  updatedAt: string;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  saleOrderId: string;
  issueDate: string;
  dueDate?: string;
  status: "Draft" | "Sent" | "Paid" | "Overdue";
  items: SaleOrderItem[];
  subtotal: number;
  tax?: number;
  totalAmount: number;
  currency: string;
  notes?: string;
}
