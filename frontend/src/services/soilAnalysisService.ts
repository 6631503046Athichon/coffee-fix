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
  try {
    const response = await api.post<{ soilAnalysis: any; message: string }>(
      '/soil-analyses',
      transformSoilAnalysisToBackend(analysisData)
    );
    return transformSoilAnalysisFromBackend(response.soilAnalysis);
  } catch (error: any) {
    const errorMessage = error?.message || 'Failed to create soil analysis';
    
    // Provide user-friendly error messages
    if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
      throw new Error('Authentication failed. Please log in again and try submitting the form.');
    }
    
    if (errorMessage.includes('timeout') || errorMessage.includes('not responding')) {
      throw new Error('Connection timeout. Please check your internet connection and try again.');
    }
    
    if (errorMessage.includes('Failed to fetch') || errorMessage.includes('network')) {
      throw new Error('Cannot connect to server. Please ensure the backend server is running on port 3001.');
    }
    
    throw new Error(errorMessage);
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
  } catch (error: any) {
    const errorMessage = error?.message || 'Failed to update soil analysis';
    
    // Provide user-friendly error messages
    if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
      throw new Error('Authentication failed. Please log in again and try updating the analysis.');
    }
    
    if (errorMessage.includes('timeout') || errorMessage.includes('not responding')) {
      throw new Error('Connection timeout. Please check your internet connection and try again.');
    }
    
    if (errorMessage.includes('Failed to fetch') || errorMessage.includes('network')) {
      throw new Error('Cannot connect to server. Please ensure the backend server is running on port 3001.');
    }
    
    throw new Error(errorMessage);
  }
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
