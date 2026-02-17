import { User } from "../types";
import { api } from "./api";
import { handleApiErrorWithFallback } from "../utils/errorHandler";

/**
 * Fetch all users from backend
 */
export const getAllUsers = async (): Promise<User[]> => {
  try {
    const response = await api.get<{ users: any[] }>("/users");
    return response.users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      username: u.username,
      roles: u.roles || [],
      isActive: u.isActive,
      isSuperAdmin: u.isSuperAdmin,
    }));
  } catch (error) {
    return handleApiErrorWithFallback<User[]>(error, {
      operation: "fetch users",
      fallbackValue: [],
    });
  }
};
