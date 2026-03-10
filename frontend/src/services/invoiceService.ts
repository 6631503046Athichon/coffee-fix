import { Invoice, SaleOrderItem } from '../types';
import { api } from './api';
import { handleApiError } from '../utils/errorHandler';

function transformInvoiceFromBackend(inv: any): Invoice {
  return {
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    saleOrderId: inv.saleOrderId,
    issueDate: inv.issueDate?.split('T')[0] || inv.issueDate,
    dueDate: inv.dueDate?.split('T')[0] || inv.dueDate || undefined,
    status: inv.status,
    items: (inv.items || []).map((item: any): SaleOrderItem => ({
      id: item.id,
      greenBeanLotId: item.greenBeanLotId,
      lotGrade: item.lotGrade || item.greenBeanLot?.grade || '',
      quantity: item.quantity,
      pricePerKg: item.pricePerKg,
      subtotal: item.subtotal,
    })),
    subtotal: inv.subtotal,
    tax: inv.tax || undefined,
    totalAmount: inv.totalAmount,
    currency: inv.currency || 'THB',
    notes: inv.notes || undefined,
  };
}

export const getAllInvoices = async (filters?: {
  saleOrderId?: string;
  status?: string;
}): Promise<Invoice[]> => {
  try {
    const params: Record<string, string> = {};
    if (filters?.saleOrderId) params.saleOrderId = filters.saleOrderId;
    if (filters?.status) params.status = filters.status;

    const response = await api.get<{ invoices: any[] }>(
      '/invoices',
      Object.keys(params).length > 0 ? params : undefined
    );
    return (response.invoices || []).map(transformInvoiceFromBackend);
  } catch (error) {
    throw new Error(handleApiError(error, 'fetch invoices'));
  }
};

export const getInvoiceById = async (id: string): Promise<Invoice> => {
  try {
    const response = await api.get<{ invoice: any }>(`/invoices/${id}`);
    return transformInvoiceFromBackend(response.invoice);
  } catch (error) {
    throw new Error(handleApiError(error, 'fetch invoice'));
  }
};

export const createInvoice = async (invoiceData: {
  saleOrderId: string;
  issueDate?: string;
  dueDate?: string;
  status?: string;
  tax?: number;
  currency?: string;
  notes?: string;
}): Promise<Invoice> => {
  try {
    const response = await api.post<{ invoice: any; message: string }>(
      '/invoices',
      invoiceData
    );
    return transformInvoiceFromBackend(response.invoice);
  } catch (error) {
    throw new Error(handleApiError(error, 'create invoice'));
  }
};

export const updateInvoice = async (
  invoiceId: string,
  data: { status?: string; notes?: string }
): Promise<Invoice> => {
  try {
    const response = await api.put<{ invoice: any }>(
      `/invoices/${invoiceId}`,
      data
    );
    return transformInvoiceFromBackend(response.invoice);
  } catch (error) {
    throw new Error(handleApiError(error, 'update invoice'));
  }
};
