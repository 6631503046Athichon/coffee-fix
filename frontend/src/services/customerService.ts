import { api } from './api';
import { Customer } from '../types';
import { handleApiError } from '../utils/errorHandler';

/**
 * Get all customers from the backend
 */
export const getAllCustomers = async (): Promise<Customer[]> => {
  try {
    const response = await api.get<{ customers: any[] }>('/customers');
    return response.customers.map(transformCustomerFromBackend);
  } catch (error) {
    throw new Error(handleApiError(error, 'fetch customers'));
  }
};

/**
 * Create a new customer
 */
export const addCustomer = async (customerData: Partial<Customer>): Promise<Customer> => {
  try {
    if (!customerData.name || !customerData.type) {
      throw new Error('Name and type are required');
    }

    const response = await api.post<{ customer: any; message: string }>('/customers', {
      name: customerData.name,
      type: customerData.type,
      contactEmail: customerData.contactEmail || null,
      contactPhone: customerData.contactPhone || null,
      address: customerData.address || null,
      notes: customerData.notes || null,
    });

    return transformCustomerFromBackend(response.customer);
  } catch (error) {
    throw new Error(handleApiError(error, 'create customer'));
  }
};

/**
 * Update an existing customer
 */
export const updateCustomer = async (customerId: string, customerData: Partial<Customer>): Promise<Customer> => {
  try {
    const response = await api.put<{ customer: any; message: string }>(`/customers/${customerId}`, {
      name: customerData.name,
      type: customerData.type,
      contactEmail: customerData.contactEmail || null,
      contactPhone: customerData.contactPhone || null,
      address: customerData.address || null,
      notes: customerData.notes || null,
    });

    return transformCustomerFromBackend(response.customer);
  } catch (error) {
    throw new Error(handleApiError(error, 'update customer'));
  }
};

/**
 * Delete a customer
 */
export const deleteCustomer = async (customerId: string): Promise<void> => {
  try {
    await api.delete(`/customers/${customerId}`);
  } catch (error) {
    throw new Error(handleApiError(error, 'delete customer'));
  }
};

/**
 * Transform customer data from backend format to frontend format
 */
export function transformCustomerFromBackend(backendCustomer: any): Customer {
  return {
    id: backendCustomer.id,
    name: backendCustomer.name,
    type: backendCustomer.type,
    contactEmail: backendCustomer.contactEmail || undefined,
    contactPhone: backendCustomer.contactPhone || undefined,
    address: backendCustomer.address || undefined,
    notes: backendCustomer.notes || undefined,
  };
}
