export interface Farm {
  id: string;
  farmName?: string;
  name?: string;
  farmerName: string;
  ownerNames?: string[];
  ownerName?: string;
  caretakerNames?: string[]; // Added caretakerNames to Farm type
  caretakerName?: string;
  googleMapsUrl?: string;
  location: string;
  latitude?: number;
  longitude?: number;
  altitudeMeters?: number;
  sizeHectares?: number;
  varieties?: string[];
  weatherAutoFetchEnabled?: boolean;
  weatherAutoFetchInterval?: number;
  createdAt?: string;
  updatedAt?: string;
  archived?: boolean;
  archivedAt?: string;
  /** Optional: the owner user id (farmer) who owns this farm */
  ownerUserId?: string;
  /** Collaborators assigned to this farm */
  collaborators?: FarmCollaborator[];
}

export interface FarmCollaborator {
  id: string;
  farmId: string;
  userId: string;
  createdAt?: string;
  user?: {
    id: string;
    name: string;
    email?: string;
    roles?: string[];
  };
}
