import { FarmRequest } from '../types';

const FARM_REQUESTS_STORAGE_KEY = 'coffee_lab_farm_requests';

/**
 * Initialize farm requests in localStorage if they don't exist
 */
export const initializeFarmRequests = (defaultRequests: FarmRequest[]) => {
  const storedRequests = localStorage.getItem(FARM_REQUESTS_STORAGE_KEY);
  if (!storedRequests) {
    localStorage.setItem(FARM_REQUESTS_STORAGE_KEY, JSON.stringify(defaultRequests));
  }
};

/**
 * Get all farm requests from localStorage
 */
export const getAllFarmRequests = (): FarmRequest[] => {
  const storedRequests = localStorage.getItem(FARM_REQUESTS_STORAGE_KEY);
  if (storedRequests) {
    try {
      return JSON.parse(storedRequests);
    } catch (error) {
      console.error('Error parsing farm requests from localStorage:', error);
      return [];
    }
  }
  return [];
};

/**
 * Save all farm requests to localStorage
 */
export const saveAllFarmRequests = (requests: FarmRequest[]) => {
  localStorage.setItem(FARM_REQUESTS_STORAGE_KEY, JSON.stringify(requests));
};

/**
 * Add a new farm request
 */
export const addFarmRequest = (request: FarmRequest) => {
  const allRequests = getAllFarmRequests();
  allRequests.unshift(request); // Add to beginning of array
  saveAllFarmRequests(allRequests);
};

/**
 * Update a farm request (e.g., approve/reject)
 */
export const updateFarmRequest = (updatedRequest: FarmRequest) => {
  const allRequests = getAllFarmRequests();
  const updatedRequests = allRequests.map(req =>
    req.id === updatedRequest.id ? updatedRequest : req
  );
  saveAllFarmRequests(updatedRequests);
};

/**
 * Delete a farm request
 */
export const deleteFarmRequest = (requestId: string) => {
  const allRequests = getAllFarmRequests();
  const filteredRequests = allRequests.filter(req => req.id !== requestId);
  saveAllFarmRequests(filteredRequests);
};
