// Import base types from data context
import type { GreenBeanLot } from '@/contexts/DataContext';

// Display types for various tables and components

export interface DisplayLot extends GreenBeanLot {
  variety: string;
  process: string;
  displayInfo: string;
  gradeDisplay: string;
}

export interface ExternalDisplayLot extends DisplayLot {
  displayPrice?: string;
}

export interface InternalDisplayLot extends DisplayLot {
  finalScore: string | number;
  displayScore: string;
}

export interface RoastDisplayLot extends GreenBeanLot {
  variety: string;
  process: string;
  finalScore: string | number;
}

// Common table column configurations
export interface TableColumn<T> {
  key: string;
  header: string;
  accessor: (row: T) => React.ReactNode;
  className?: string;
}

// Form states
export interface FormState<T> {
  data: T;
  errors: Partial<Record<keyof T, string>>;
  isSubmitting: boolean;
}

// Success message state
export interface SuccessMessage {
  show: boolean;
  message: string;
  timeout?: number;
}

// Modal state
export interface ModalState<T = any> {
  isOpen: boolean;
  data: T | null;
  mode: 'create' | 'edit' | 'view';
}

// Filter/Sort state
export interface FilterState {
  searchTerm: string;
  filters: Record<string, any>;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}
