import { api } from './api';
import { Customer } from '../types';

/**
 * Get all customers from the backend
 */
export const getAllCustomers = async (): Promise<Customer[]> => {
  try {
    const response = await api.get<{ customers: any[] }>('/customers');
    return response.customers.map(transformCustomerFromBackend);
  } catch (error: any) {
    const errorMessage = error?.message || 'Failed to fetch customers';
    
    if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
      throw new Error('Authentication failed. Please log in again.');
    }
    
    if (errorMessage.includes('timeout') || errorMessage.includes('not responding')) {
      throw new Error('Connection timeout. Please check your internet connection and try again.');
    }
    
    if (errorMessage.includes('Failed to fetch') || errorMessage.includes('network')) {
      throw new Error('Cannot connect to server. Please ensure the backend server is running on port 3001.');
    }
    
    throw new Error(errorMessage);
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
  } catch (error: any) {
    const errorMessage = error?.message || 'Failed to create customer';
    
    if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
      throw new Error('Authentication failed. Please log in again and try submitting the form.');
    }
    
    if (errorMessage.includes('403') || errorMessage.includes('Forbidden')) {
      throw new Error('You do not have permission to create customers. Admin or Roaster role required.');
    }
    
    if (errorMessage.includes('timeout') || errorMessage.includes('not responding')) {
      throw new Error('Connection timeout. Please check your internet connection and try again.');
    }
    
    if (errorMessage.includes('Failed to fetch') || errorMessage.includes('network')) {
      throw new Error('Cannot connect to server. Please ensure the backend server is running on port 3001.');
    }
    
    throw new Error(errorMessage);
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
  } catch (error: any) {
    const errorMessage = error?.message || 'Failed to update customer';
    
    if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
      throw new Error('Authentication failed. Please log in again and try submitting the form.');
    }
    
    if (errorMessage.includes('timeout') || errorMessage.includes('not responding')) {
      throw new Error('Connection timeout. Please check your internet connection and try again.');
    }
    
    if (errorMessage.includes('Failed to fetch') || errorMessage.includes('network')) {
      throw new Error('Cannot connect to server. Please ensure the backend server is running on port 3001.');
    }
    
    throw new Error(errorMessage);
  }
};

/**
 * Delete a customer
 */
export const deleteCustomer = async (customerId: string): Promise<void> => {
  try {
    await api.delete(`/customers/${customerId}`);
  } catch (error: any) {
    const errorMessage = error?.message || 'Failed to delete customer';
    
    if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
      throw new Error('Authentication failed. Please log in again.');
    }
    
    if (errorMessage.includes('timeout') || errorMessage.includes('not responding')) {
      throw new Error('Connection timeout. Please check your internet connection and try again.');
    }
    
    if (errorMessage.includes('Failed to fetch') || errorMessage.includes('network')) {
      throw new Error('Cannot connect to server. Please ensure the backend server is running on port 3001.');
    }
    
    throw new Error(errorMessage);
  }
};

/**
 * Transform customer data from backend format to frontend format
 */
function transformCustomerFromBackend(backendCustomer: any): Customer {
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
