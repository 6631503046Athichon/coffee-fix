import { UserRole } from './user';

export interface SoilAnalysis {
  id: string;
  farmId: string;
  farmPlotLocation: string;
  testDate: string;
  labName?: string;
  certificateNumber?: string;

  // Core soil chemistry data (6 main nutrients)
  pH: number;
  phosphorus: number; // P (ppm or mg/kg)
  potassium: number; // K (ppm or mg/kg)
  nitrogen?: number; // N (%)
  calcium: number; // Ca (ppm or mg/kg)
  magnesium: number; // Mg (ppm or mg/kg)

  // Optional additional nutrients
  organicMatter?: number; // OM (%)
  sulfur?: number; // S (ppm)
  zinc?: number; // Zn (ppm)
  iron?: number; // Fe (ppm)
  manganese?: number; // Mn (ppm)
  copper?: number; // Cu (ppm)
  boron?: number; // B (ppm)

  // Metadata
  notes?: string;
  recommendations?: string;
  createdBy: string;
  createdByRole: UserRole;
  attachmentUrl?: string;
}
