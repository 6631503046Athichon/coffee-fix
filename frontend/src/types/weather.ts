export interface WeatherRecord {
  id: string;
  farmId: string;
  farmPlotLocation: string;
  recordDate: string; // ISO date
  temperatureMin: number; // Celsius
  temperatureMax: number; // Celsius
  temperatureAvg: number; // Celsius
  rainfall: number; // mm
  humidity: number; // percentage 0-100
  source: "Manual" | "API"; // How data was collected
  notes?: string;
  recordedBy?: string; // User ID
  createdAt?: string; // ISO datetime - เวลาที่บันทึก
  updatedAt?: string; // ISO datetime - เวลาที่อัปเดต
}
