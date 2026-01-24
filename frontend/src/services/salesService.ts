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
