export interface Customer {
  id: string;
  name: string;
  type: "Roaster" | "Distributor" | "Retailer" | "Other";
  contactEmail?: string;
  contactPhone?: string;
  address?: string;
  notes?: string;
}

export interface SaleOrderItem {
  id: string;
  greenBeanLotId: string;
  lotGrade: string;
  quantity: number;
  pricePerKg: number;
  subtotal: number;
}

export interface SaleOrder {
  id: string;
  orderNumber: string;
  customerId: string;
  customerName: string;
  orderDate: string;
  status: "Draft" | "Confirmed" | "Delivered" | "Cancelled";
  items: SaleOrderItem[];
  totalAmount: number;
  currency: string;
  notes?: string;
  createdBy: string;
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
