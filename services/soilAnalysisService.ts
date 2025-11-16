import { SoilAnalysis } from '../types';

const SOIL_ANALYSES_STORAGE_KEY = 'coffee_lab_soil_analyses';

/**
 * Initialize soil analyses in localStorage if they don't exist
 */
export const initializeSoilAnalyses = (defaultAnalyses: SoilAnalysis[]) => {
  const storedAnalyses = localStorage.getItem(SOIL_ANALYSES_STORAGE_KEY);
  if (!storedAnalyses) {
    localStorage.setItem(SOIL_ANALYSES_STORAGE_KEY, JSON.stringify(defaultAnalyses));
  }
};

/**
 * Get all soil analyses from localStorage
 */
export const getAllSoilAnalyses = (): SoilAnalysis[] => {
  const storedAnalyses = localStorage.getItem(SOIL_ANALYSES_STORAGE_KEY);
  if (storedAnalyses) {
    try {
      return JSON.parse(storedAnalyses);
    } catch (error) {
      console.error('Error parsing soil analyses from localStorage:', error);
      return [];
    }
  }
  return [];
};

/**
 * Save all soil analyses to localStorage
 */
export const saveAllSoilAnalyses = (analyses: SoilAnalysis[]) => {
  localStorage.setItem(SOIL_ANALYSES_STORAGE_KEY, JSON.stringify(analyses));
};

/**
 * Add a new soil analysis
 */
export const addSoilAnalysis = (analysis: SoilAnalysis) => {
  const allAnalyses = getAllSoilAnalyses();
  allAnalyses.unshift(analysis); // Add to beginning of array
  saveAllSoilAnalyses(allAnalyses);
};

/**
 * Update a soil analysis
 */
export const updateSoilAnalysis = (updatedAnalysis: SoilAnalysis) => {
  const allAnalyses = getAllSoilAnalyses();
  const updatedAnalyses = allAnalyses.map(analysis =>
    analysis.id === updatedAnalysis.id ? updatedAnalysis : analysis
  );
  saveAllSoilAnalyses(updatedAnalyses);
};

/**
 * Delete a soil analysis
 */
export const deleteSoilAnalysis = (analysisId: string) => {
  const allAnalyses = getAllSoilAnalyses();
  const filteredAnalyses = allAnalyses.filter(analysis => analysis.id !== analysisId);
  saveAllSoilAnalyses(filteredAnalyses);
};
