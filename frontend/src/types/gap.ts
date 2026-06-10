export interface ActivityType {
  id: string;
  name: string;
  description?: string;
  createdDate: string;
  isActive: boolean;
}

export interface GAPLogEntry {
  id: string;
  /** Reference to the farm entry from Farm Management */
  farmId?: string;
  farmPlotLocation: string;
  activityType: string; // Activity type name (dynamic from ActivityType)
  date: string;
  productUsed: string;
  quantity: string;
  notes?: string;
}
