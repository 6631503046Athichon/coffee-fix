import { Customer, SaleOrder, Invoice, PricingHistory } from '../types';

const CUSTOMERS_STORAGE_KEY = 'coffee_lab_customers';
const SALE_ORDERS_STORAGE_KEY = 'coffee_lab_sale_orders';
const INVOICES_STORAGE_KEY = 'coffee_lab_invoices';
const PRICING_HISTORY_STORAGE_KEY = 'coffee_lab_pricing_history';

// Customer functions
export const initializeCustomers = (defaultCustomers: Customer[]) => {
  const stored = localStorage.getItem(CUSTOMERS_STORAGE_KEY);
  if (!stored) {
    localStorage.setItem(CUSTOMERS_STORAGE_KEY, JSON.stringify(defaultCustomers));
  }
};

export const getAllCustomers = (): Customer[] => {
  const stored = localStorage.getItem(CUSTOMERS_STORAGE_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (error) {
      console.error('Error parsing customers from localStorage:', error);
      return [];
    }
  }
  return [];
};

export const saveAllCustomers = (customers: Customer[]) => {
  localStorage.setItem(CUSTOMERS_STORAGE_KEY, JSON.stringify(customers));
};

export const addCustomer = (customer: Customer) => {
  const all = getAllCustomers();
  all.unshift(customer);
  saveAllCustomers(all);
};

export const updateCustomer = (updated: Customer) => {
  const all = getAllCustomers();
  const updated2 = all.map(c => c.id === updated.id ? updated : c);
  saveAllCustomers(updated2);
};

export const deleteCustomer = (customerId: string) => {
  const all = getAllCustomers();
  const filtered = all.filter(c => c.id !== customerId);
  saveAllCustomers(filtered);
};

// Sale Order functions
export const initializeSaleOrders = (defaultOrders: SaleOrder[]) => {
  const stored = localStorage.getItem(SALE_ORDERS_STORAGE_KEY);
  if (!stored) {
    localStorage.setItem(SALE_ORDERS_STORAGE_KEY, JSON.stringify(defaultOrders));
  }
};

export const getAllSaleOrders = (): SaleOrder[] => {
  const stored = localStorage.getItem(SALE_ORDERS_STORAGE_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (error) {
      console.error('Error parsing sale orders from localStorage:', error);
      return [];
    }
  }
  return [];
};

export const saveAllSaleOrders = (orders: SaleOrder[]) => {
  localStorage.setItem(SALE_ORDERS_STORAGE_KEY, JSON.stringify(orders));
};

export const addSaleOrder = (order: SaleOrder) => {
  const all = getAllSaleOrders();
  all.unshift(order);
  saveAllSaleOrders(all);
};

export const updateSaleOrder = (updated: SaleOrder) => {
  const all = getAllSaleOrders();
  const updated2 = all.map(o => o.id === updated.id ? updated : o);
  saveAllSaleOrders(updated2);
};

export const deleteSaleOrder = (orderId: string) => {
  const all = getAllSaleOrders();
  const filtered = all.filter(o => o.id !== orderId);
  saveAllSaleOrders(filtered);
};

// Invoice functions
export const initializeInvoices = (defaultInvoices: Invoice[]) => {
  const stored = localStorage.getItem(INVOICES_STORAGE_KEY);
  if (!stored) {
    localStorage.setItem(INVOICES_STORAGE_KEY, JSON.stringify(defaultInvoices));
  }
};

export const getAllInvoices = (): Invoice[] => {
  const stored = localStorage.getItem(INVOICES_STORAGE_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (error) {
      console.error('Error parsing invoices from localStorage:', error);
      return [];
    }
  }
  return [];
};

export const saveAllInvoices = (invoices: Invoice[]) => {
  localStorage.setItem(INVOICES_STORAGE_KEY, JSON.stringify(invoices));
};

export const addInvoice = (invoice: Invoice) => {
  const all = getAllInvoices();
  all.unshift(invoice);
  saveAllInvoices(all);
};

export const updateInvoice = (updated: Invoice) => {
  const all = getAllInvoices();
  const updated2 = all.map(i => i.id === updated.id ? updated : i);
  saveAllInvoices(updated2);
};

export const deleteInvoice = (invoiceId: string) => {
  const all = getAllInvoices();
  const filtered = all.filter(i => i.id !== invoiceId);
  saveAllInvoices(filtered);
};

// Pricing History functions
export const initializePricingHistory = (defaultHistory: PricingHistory[]) => {
  const stored = localStorage.getItem(PRICING_HISTORY_STORAGE_KEY);
  if (!stored) {
    localStorage.setItem(PRICING_HISTORY_STORAGE_KEY, JSON.stringify(defaultHistory));
  }
};

export const getAllPricingHistory = (): PricingHistory[] => {
  const stored = localStorage.getItem(PRICING_HISTORY_STORAGE_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (error) {
      console.error('Error parsing pricing history from localStorage:', error);
      return [];
    }
  }
  return [];
};

export const saveAllPricingHistory = (history: PricingHistory[]) => {
  localStorage.setItem(PRICING_HISTORY_STORAGE_KEY, JSON.stringify(history));
};

export const addPricingHistory = (record: PricingHistory) => {
  const all = getAllPricingHistory();
  all.unshift(record);
  saveAllPricingHistory(all);
};
