import { UserRole } from './types';

export interface MockUser {
  id: string;
  name: string;
  email: string;
  password: string;
  roles: UserRole[]; // Changed to support multiple roles
  isActive?: boolean; // default true
}

export const MOCK_USERS: MockUser[] = [
  {
    id: 'user-farmer1',
    name: 'Maria Rodriguez',
    email: 'farmer@coffee.com',
    password: 'farmer123',
    roles: [UserRole.Farmer], // Now an array
    isActive: true,
  },
  {
    id: 'user-processor1',
    name: 'Alarak',
    email: 'processor@coffee.com',
    password: 'processor123',
    roles: [UserRole.Processor], // Now an array
    isActive: true,
  },
  {
    id: 'user-roaster1',
    name: 'Jim Raynor',
    email: 'roaster@coffee.com',
    password: 'roaster123',
    roles: [UserRole.Roaster], // Now an array
    isActive: true,
  },
  {
    id: 'user-headjudge',
    name: 'Artanis',
    email: 'headjudge@coffee.com',
    password: 'headjudge123',
    roles: [UserRole.HeadJudge], // Now an array
    isActive: true,
  },
  {
    id: 'user-cupper1',
    name: 'Tassadar',
    email: 'cupper@coffee.com',
    password: 'cupper123',
    roles: [UserRole.Cupper], // Now an array
    isActive: true,
  },
  {
    id: 'user-admin',
    name: 'Admin User',
    email: 'admin@coffee.com',
    password: 'admin123',
    roles: [UserRole.Admin], // Now an array
    isActive: true,
  },
];
