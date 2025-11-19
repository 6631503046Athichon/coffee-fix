import { SoilAnalysis } from '../types';
import { api } from './api';
import {
  transformSoilAnalysisFromBackend,
  transformSoilAnalysisToBackend,
} from './utils/transformers';

/**
 * Fetch all soil analyses, optionally filtered by farm ID
 */
export const getAllSoilAnalyses = async (farmId?: string): Promise<SoilAnalysis[]> => {
  try {
    const params = farmId ? { farmId } : undefined;
    const response = await api.get<{ soilAnalyses: any[] }>('/soil-analyses', params);
    return response.soilAnalyses.map(transformSoilAnalysisFromBackend);
  } catch (error) {
    console.error('Failed to fetch soil analyses:', error);
    return [];
  }
};

/**
 * Create a new soil analysis
 */
export const addSoilAnalysis = async (
  analysisData: Partial<SoilAnalysis>
): Promise<SoilAnalysis> => {
  const response = await api.post<{ soilAnalysis: any; message: string }>(
    '/soil-analyses',
    transformSoilAnalysisToBackend(analysisData)
  );
  return transformSoilAnalysisFromBackend(response.soilAnalysis);
};

/**
 * Update an existing soil analysis
 */
export const updateSoilAnalysis = async (
  analysisId: string,
  analysisData: Partial<SoilAnalysis>
): Promise<SoilAnalysis> => {
  const response = await api.put<{ soilAnalysis: any }>(
    `/soil-analyses/${analysisId}`,
    transformSoilAnalysisToBackend(analysisData)
  );
  return transformSoilAnalysisFromBackend(response.soilAnalysis);
};

/**
 * Delete a soil analysis
 */
export const deleteSoilAnalysis = async (analysisId: string): Promise<void> => {
  await api.delete(`/soil-analyses/${analysisId}`);
};

// Legacy localStorage functions for backward compatibility
const SOIL_ANALYSES_STORAGE_KEY = 'coffee_lab_soil_analyses';

export const initializeSoilAnalyses = (defaultAnalyses: SoilAnalysis[]) => {
  localStorage.setItem(SOIL_ANALYSES_STORAGE_KEY, JSON.stringify(defaultAnalyses));
};

const saveAllSoilAnalyses = (analyses: SoilAnalysis[]) => {
  localStorage.setItem(SOIL_ANALYSES_STORAGE_KEY, JSON.stringify(analyses));
};
