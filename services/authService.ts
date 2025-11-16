// Authentication service functions
import { User, UserRole } from '../types';
import { MOCK_USERS, MockUser } from '../mockUsers';

interface LoginCredentials {
  email: string;
  password: string;
  role?: UserRole;
}

interface RegisterData {
  email: string;
  password: string;
  name: string;
  role: UserRole;
}

const STORAGE_KEY = 'coffee_lab_user';
export const USERS_STORAGE_KEY = 'coffee_lab_users';

// Initialize localStorage with MOCK_USERS if not exists
export const initializeUsers = () => {
  const storedUsers = localStorage.getItem(USERS_STORAGE_KEY);
  if (!storedUsers) {
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(MOCK_USERS));
  }
};

// Helper function to get all users (from localStorage or MOCK_USERS)
export const getAllUsers = (): MockUser[] => {
  const storedUsers = localStorage.getItem(USERS_STORAGE_KEY);
  if (storedUsers) {
    try {
      const parsed: MockUser[] = JSON.parse(storedUsers);
      // Back-compat: ensure isActive default true
      return parsed.map(u => ({ ...u, isActive: u.isActive ?? true }));
    } catch {
      return [...MOCK_USERS];
    }
  }
  // If localStorage is empty, initialize it and return MOCK_USERS
  initializeUsers();
  return [...MOCK_USERS];
};

// Helper function to save all users to localStorage
export const saveAllUsers = (users: MockUser[]) => {
  localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
};

// Helper function to update user credentials (for UserManagement)
export const updateUserCredentials = (updatedUser: User) => {
  const allUsers = getAllUsers();
  const updatedUsers = allUsers.map(u => {
    if (u.id === updatedUser.id) {
      return {
        ...u,
        name: updatedUser.name,
        roles: updatedUser.roles,
        isActive: updatedUser.isActive ?? u.isActive ?? true,
      };
    }
    return u;
  });
  saveAllUsers(updatedUsers);
};

// Toggle or set user active flag
export const updateUserActive = (userId: string, isActive: boolean) => {
  const all = getAllUsers();
  const updated = all.map(u => (u.id === userId ? { ...u, isActive } : u));
  saveAllUsers(updated);
};

// Helper function to add new user
export const addUserCredentials = (newUser: User, email: string, password: string) => {
  const allUsers = getAllUsers();
  const newMockUser: MockUser = {
    id: newUser.id,
    name: newUser.name,
    email,
    password,
    roles: newUser.roles,
    isActive: newUser.isActive ?? true,
  };
  allUsers.push(newMockUser);
  saveAllUsers(allUsers);
};

// Helper function to delete user
export const deleteUserCredentials = (userId: string) => {
  const allUsers = getAllUsers();
  const filteredUsers = allUsers.filter(u => u.id !== userId);
  saveAllUsers(filteredUsers);
};

export const authService = {
  // Mock login function
  login: async (credentials: LoginCredentials): Promise<User> => {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500));

    // Get users from localStorage or MOCK_USERS
    const allUsers = getAllUsers();

    // Find user by email and password
    const mockUser = allUsers.find(
      u => u.email === credentials.email && u.password === credentials.password
    );

    if (!mockUser) {
      throw new Error('Invalid email or password');
    }

    if (mockUser.isActive === false) {
      throw new Error('This account is disabled');
    }

    // Convert MockUser to User (remove password)
    const user: User = {
      id: mockUser.id,
      name: mockUser.name,
      roles: mockUser.roles,
      isActive: mockUser.isActive ?? true,
    };

    // Save to localStorage
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));

    return user;
  },

  // Register function (not implemented as per user request)
  register: async (data: RegisterData): Promise<User> => {
    throw new Error('Registration not implemented yet');
  },

  // Logout function
  logout: () => {
    localStorage.removeItem(STORAGE_KEY);
  },

  // Check if user is authenticated
  isAuthenticated: (): boolean => {
    const user = localStorage.getItem(STORAGE_KEY);
    return !!user;
  },

  // Get current user
  getCurrentUser: (): User | null => {
    const userJson = localStorage.getItem(STORAGE_KEY);
    if (!userJson) return null;

    try {
      return JSON.parse(userJson) as User;
    } catch {
      return null;
    }
  }
};