import { SaleOrder, SaleOrderItem } from '../../types';
import { api } from '../api';
import { handleApiError } from '../../utils/errorHandler';

function transformSaleOrderFromBackend(order: any): SaleOrder {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    customerId: order.customerId,
    customerName: order.customerName || order.customer?.name || '',
    orderDate: order.orderDate?.split('T')[0] || order.orderDate,
    status: order.status,
    items: (order.items || []).map((item: any): SaleOrderItem => ({
      id: item.id,
      greenBeanLotId: item.greenBeanLotId,
      lotGrade: item.lotGrade || item.greenBeanLot?.grade || '',
      quantity: item.quantity,
      pricePerKg: item.pricePerKg,
      subtotal: item.subtotal,
    })),
    totalAmount: order.totalAmount,
    currency: order.currency || 'THB',
    notes: order.notes || undefined,
    createdBy: order.createdBy || order.creator?.name || '',
  };
}

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

export const createSaleOrder = async (orderData: {
  customerId: string;
  customerName: string;
  orderDate?: string;
  status?: string;
  items: Array<{
    greenBeanLotId: string;
    lotGrade: string;
    quantity: number;
    pricePerKg: number;
    subtotal: number;
  }>;
  currency?: string;
  notes?: string;
}): Promise<SaleOrder> => {
  try {
    const response = await api.post<{ saleOrder: any; message: string }>(
      '/sale-orders',
      orderData
    );
    return transformSaleOrderFromBackend(response.saleOrder);
  } catch (error) {
    throw new Error(handleApiError(error, 'create sale order'));
  }
};

export const updateSaleOrder = async (
  orderId: string,
  data: { status?: string; notes?: string }
): Promise<SaleOrder> => {
  try {
    const response = await api.put<{ saleOrder: any }>(
      `/sale-orders/${orderId}`,
      data
    );
    return transformSaleOrderFromBackend(response.saleOrder);
  } catch (error) {
    throw new Error(handleApiError(error, 'update sale order'));
  }
};
