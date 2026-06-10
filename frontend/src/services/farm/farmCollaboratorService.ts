import { FarmCollaborator } from '../../types';
import { api } from '../api';
import { handleApiError } from '../../utils/errorHandler';

/**
 * Get all collaborators for a farm
 */
export const getFarmCollaborators = async (farmId: string): Promise<FarmCollaborator[]> => {
  try {
    const response = await api.get<{ collaborators: FarmCollaborator[] }>(`/farms/${farmId}/collaborators`);
    return response.collaborators;
  } catch (error) {
    handleApiError(error, 'fetch farm collaborators');
    return [];
  }
};

/**
 * Add a collaborator to a farm
 */
export const addFarmCollaborator = async (
  farmId: string,
  userId: string,
): Promise<FarmCollaborator | null> => {
  try {
    const response = await api.post<{ collaborator: FarmCollaborator }>(`/farms/${farmId}/collaborators`, {
      userId,
    });
    return response.collaborator;
  } catch (error) {
    handleApiError(error, 'add farm collaborator');
    return null;
  }
};

/**
 * Remove a collaborator from a farm
 */
export const removeFarmCollaborator = async (farmId: string, userId: string): Promise<boolean> => {
  try {
    await api.delete(`/farms/${farmId}/collaborators?userId=${userId}`);
    return true;
  } catch (error) {
    handleApiError(error, 'remove farm collaborator');
    return false;
  }
};
