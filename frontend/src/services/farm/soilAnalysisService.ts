import { SoilAnalysis } from '../../types';
import { api } from '../api';
import {
  transformSoilAnalysisFromBackend,
  transformSoilAnalysisToBackend,
} from '../utils/transformers';
import { handleApiError, handleApiErrorWithFallback } from '../../utils/errorHandler';

/**
 * Fetch all soil analyses, optionally filtered by farm ID
 */
export const getAllSoilAnalyses = async (farmId?: string): Promise<SoilAnalysis[]> => {
  try {
    const params = farmId ? { farmId } : undefined;
    const response = await api.get<{ soilAnalyses: any[] }>('/soil-analyses', params);
    return response.soilAnalyses.map(transformSoilAnalysisFromBackend);
  } catch (error) {
    return handleApiErrorWithFallback<SoilAnalysis[]>(error, {
      operation: 'fetch soil analyses',
      fallbackValue: [],
    });
  }
};

/**
 * Create a new soil analysis
 */
export const addSoilAnalysis = async (
  analysisData: Partial<SoilAnalysis>
): Promise<SoilAnalysis> => {
  try {
    const response = await api.post<{ soilAnalysis: any; message: string }>(
      '/soil-analyses',
      transformSoilAnalysisToBackend(analysisData)
    );
    return transformSoilAnalysisFromBackend(response.soilAnalysis);
  } catch (error) {
    throw new Error(handleApiError(error, 'create soil analysis'));
  }
};

/**
 * Update an existing soil analysis
 */
export const updateSoilAnalysis = async (
  analysisId: string,
  analysisData: Partial<SoilAnalysis>
): Promise<SoilAnalysis> => {
  try {
    const response = await api.put<{ soilAnalysis: any }>(
      `/soil-analyses/${analysisId}`,
      transformSoilAnalysisToBackend(analysisData)
    );
    return transformSoilAnalysisFromBackend(response.soilAnalysis);
  } catch (error) {
    throw new Error(handleApiError(error, 'update soil analysis'));
  }
};

/**
 * Delete a soil analysis
 */
export const deleteSoilAnalysis = async (analysisId: string): Promise<void> => {
  try {
    await api.delete(`/soil-analyses/${analysisId}`);
  } catch (error) {
    throw new Error(handleApiError(error, 'delete soil analysis'));
  }
};

