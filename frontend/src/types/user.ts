export enum UserRole {
  Farmer = "Farmer",
  Processor = "Processor",
  Roaster = "Roaster",
  HeadJudge = "HeadJudge",
  Cupper = "Cupper",
  Admin = "Admin",
}

export interface User {
  id: string;
  name: string;
  email?: string;
  username?: string;
  roles: UserRole[]; // Changed to support multiple roles
  farmId?: string;
  /** Whether the account is active and can sign in */
  isActive?: boolean; // default true
  isSuperAdmin?: boolean;
  mustChangePassword?: boolean;
  mustChangeUsername?: boolean;
  mustChangeEmail?: boolean;
  temporaryPassword?: string | null;
  createdAt?: string;
  updatedAt?: string;
  lastLogin?: string;
}
