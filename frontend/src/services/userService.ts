import { User } from "../types";
import { api } from "./api";
import { handleApiError, handleApiErrorWithFallback } from "../utils/errorHandler";

function mapUser(u: any): User {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    username: u.username,
    roles: u.roles || [],
    isActive: u.isActive,
    isSuperAdmin: u.isSuperAdmin,
  };
}

/**
 * Fetch all users from backend
 */
export const getAllUsers = async (filters?: {
  search?: string;
  role?: string;
  status?: string;
}): Promise<User[]> => {
  try {
    const params: Record<string, string> = {};
    if (filters?.search) params.search = filters.search;
    if (filters?.role) params.role = filters.role;
    if (filters?.status) params.status = filters.status;

    const queryString = Object.keys(params).length > 0
      ? '?' + new URLSearchParams(params).toString()
      : '';

    const response = await api.get<{ users: any[] }>(`/users${queryString}`);
    return (response.users || []).map(mapUser);
  } catch (error) {
    return handleApiErrorWithFallback<User[]>(error, {
      operation: "fetch users",
      fallbackValue: [],
    });
  }
};

export const createUser = async (payload: Record<string, any>): Promise<{ user: User; credentials?: { username: string; password: string; message?: string } }> => {
  try {
    const response = await api.post<{ user: any; credentials?: { username: string; password: string; message?: string } }>('/users', payload);
    return { user: mapUser(response.user), credentials: response.credentials };
  } catch (error) {
    throw new Error(handleApiError(error, 'create user'));
  }
};

export const updateUser = async (userId: string, data: Record<string, any>): Promise<User> => {
  try {
    const response = await api.put<{ user: any }>(`/users/${userId}`, data);
    return mapUser(response.user);
  } catch (error) {
    throw new Error(handleApiError(error, 'update user'));
  }
};

export const deleteUser = async (userId: string): Promise<void> => {
  try {
    await api.delete(`/users/${userId}`);
  } catch (error) {
    throw new Error(handleApiError(error, 'delete user'));
  }
};

export const transferOwnership = async (targetUserId: string): Promise<void> => {
  try {
    await api.post('/users/transfer-ownership', { targetUserId });
  } catch (error) {
    throw new Error(handleApiError(error, 'transfer ownership'));
  }
};
