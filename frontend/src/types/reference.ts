export interface ProcessType {
  id: string;
  name: string; // e.g., "Washed", "Natural", "Honey"
  description?: string;
  colorScheme: {
    borderColor: string; // e.g., "border-l-blue-500"
    iconBg: string; // e.g., "bg-blue-100"
    iconColor: string; // e.g., "text-blue-600"
    badgeColor: string; // e.g., "bg-blue-100 text-blue-700 border-blue-200"
  };
  createdDate: string;
  isActive: boolean;
}

export interface CropYear {
  id: string;
  year: string; // e.g., "2024/2025"
  startDate: string; // ISO date
  endDate: string; // ISO date
  description?: string;
}

export interface CoffeeGrade {
  id: string;
  name: string; // e.g., "Grade A", "Peaberry", "Screen 18"
  description?: string | null;
  /** Lower numbers come first in the grade dropdowns. */
  sortOrder: number;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}
