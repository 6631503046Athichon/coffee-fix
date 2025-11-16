

import { GoogleGenAI, Type } from "@google/genai";
import { JudgeScore, CuppingSession, AppData, PlatformInsight, ComprehensiveQualityReport } from '../types';

// IMPORTANT: This key is managed externally. Do not modify or expose it in the UI.
const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  console.warn("API_KEY environment variable not set. Gemini API calls will be mocked.");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

export interface QualityInsight {
  keyDescriptors: string[];
  performanceSummary: string;
  roasterRecommendations: string[];
}

export const synthesizeCuppingNotes = async (scores: JudgeScore[]): Promise<string> => {
  const notesText = scores.map(s => `- ${s.notes}`).join('\n');
  
  const prompt = `You are a professional coffee quality expert (Head Judge). Your task is to synthesize tasting notes from multiple judges into a single, cohesive, and elegant paragraph for a final cupping report. The tone should be professional and descriptive. Do not list the notes; weave them into a narrative.

Here are the notes from the judges:
${notesText}

Synthesize these notes into a final summary:`;

  if (!API_KEY) {
    // Mock response for development when API key is not available
    await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate network latency
    return `A mock synthesis of judge notes. The consensus points towards a complex cup with notes of bright citrus, tropical fruits, and a floral character. It has a silky body and elegant acidity, making it a well-balanced and satisfying coffee.`;
  }

  try {
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
            temperature: 0.7,
            topP: 1,
            topK: 32,
        }
    });

    return response.text;
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    return "Error generating AI summary. Please review notes manually.";
  }
};


export const getQualityInsights = async (session: CuppingSession, attribute: string): Promise<QualityInsight> => {
  const relevantData = session.samples.map(sample => {
    const scoresForSample = session.scores[sample.id] || [];
    const notes = scoresForSample.map(s => s.notes).join('; ');
    const averageScore = scoresForSample.reduce((acc, s) => acc + (s.scores[attribute] || 0), 0) / (scoresForSample.length || 1);
    return `Sample ${sample.blindCode} (Avg ${attribute} Score: ${averageScore.toFixed(2)}): Notes - "${notes}"`;
  }).join('\n');

  const prompt = `As a coffee quality consultant, analyze the following cupping data for the attribute "${attribute}". Provide insights for a coffee roaster.

Data:
${relevantData}

Based on this data, provide:
1.  A list of key descriptive words or phrases used by the judges.
2.  A brief summary of the overall performance of the samples for this attribute.
3.  A list of actionable recommendations for a roaster based on these findings (e.g., for sourcing, blending, or marketing).
`;

  if (!API_KEY) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    return {
      keyDescriptors: ["Citrus", "Floral", "Bright", "Silky Body", "Honey"],
      performanceSummary: `Mock Data: Samples generally performed well on ${attribute}, with judges consistently highlighting positive characteristics. There is a clear distinction between higher-scoring lots, which showed more complexity, and lower-scoring ones.`,
      roasterRecommendations: [
        "Consider sourcing more lots that exhibit 'floral' and 'citrus' notes, as these correlated with higher scores.",
        "For marketing, emphasize the 'silky body' and 'honey' sweetness, as these were common positive descriptors.",
        "Experiment with blending high-acidity lots with those noted for 'body' to create a more balanced final product."
      ]
    };
  }

  try {
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              keyDescriptors: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "A list of 3-5 key descriptive words or phrases from the judge's notes."
              },
              performanceSummary: {
                type: Type.STRING,
                description: "A 2-3 sentence summary of the overall performance on the specified attribute."
              },
              roasterRecommendations: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "A list of 2-3 actionable recommendations for a coffee roaster."
              }
            }
          }
        }
    });
    
    return JSON.parse(response.text);

  } catch (error) {
    console.error("Error calling Gemini API for insights:", error);
    throw new Error("Failed to generate AI-powered insights. Please try again.");
  }
};

export const generateComprehensiveReport = async (appData: AppData): Promise<ComprehensiveQualityReport> => {
    const analysisData = appData.greenBeanLots.map(gbl => {
        const parchmentLot = appData.parchmentLots.find(p => p.id === gbl.parchmentLotId);
        const processingBatch = appData.processingBatches.find(b => b.id === parchmentLot?.processingBatchId);
        const harvestLot = appData.harvestLots.find(h => h.id === parchmentLot?.harvestLotId);

        let finalScore: number | null = null;
        let finalNotes: string | null = null;
        const scoreInfo = gbl.cuppingScores[0];
        if (scoreInfo) {
            const session = appData.cuppingSessions.find(s => s.id === scoreInfo.sessionId);
            const sample = session?.samples.find(s => s.greenBeanLotId === gbl.id);
            if (session && sample && session.finalResults && session.finalResults[sample.id]) {
                finalScore = session.finalResults[sample.id].totalScore;
                finalNotes = session.finalResults[sample.id].finalNotes;
            } else if (scoreInfo.score) {
                finalScore = scoreInfo.score;
            }
        }
        
        if (!finalScore) return null;

        return {
            lotId: gbl.id,
            score: finalScore,
            variety: harvestLot?.cherryVariety || 'Unknown',
            process: processingBatch?.processType || 'Unknown',
            notes: finalNotes || 'No final notes available.'
        };
    }).filter((item): item is NonNullable<typeof item> => item !== null);
    
    if (analysisData.length === 0) {
        throw new Error("Not enough data to generate a report.");
    }

    // Sort by score and take top lots to keep prompt concise
    const topLotsData = analysisData.sort((a,b) => b.score - a.score).slice(0, 10);
    
    const prompt = `You are a world-class coffee industry analyst. Your task is to create a comprehensive annual quality report based on the provided dataset of cupped coffee lots. The report should be engaging, insightful, and professional, written in a clear and accessible tone for stakeholders like farmers, roasters, and processors.

    Dataset:
    ${JSON.stringify(topLotsData, null, 2)}

    Based on this data, generate a structured report in JSON format. Your analysis should be thorough and include:
    1. title: A compelling title for the report, like "Annual Coffee Quality Report 2025".
    2. executiveSummary: A concise, high-level overview of the year's key findings.
    3. topPerformingCoffees: A list of the top 3 performing lots. For each, include lotId, variety, process, score, and a one-sentence summary of its tasting notes based on the provided notes.
    4. varietyAnalysis: An analysis of the performance of different coffee varieties. Identify the top-performing variety, its average score, and a brief analysis of why it might be performing well (e.g., "Gesha's floral and complex profile consistently commands high scores...").
    5. processingAnalysis: An analysis of processing methods. Identify the top-performing process, its average score, and a brief analysis of its impact on quality (e.g., "The Honey process is yielding coffees with exceptional sweetness and body...").
    6. keyTrends: A list of 2-3 bullet points highlighting significant trends or notable correlations observed in the data.
    7. recommendations: Actionable recommendations for key stakeholders:
        - forFarmers: Advice on variety selection, agricultural practices, etc.
        - forProcessors: Advice on processing methods to focus on.
        - forRoasters: Advice on sourcing priorities and marketing angles.`;
    
    if (!API_KEY) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        return {
            title: "Mock Annual Coffee Quality Report 2025",
            executiveSummary: "This year was marked by the exceptional performance of the Gesha variety, particularly when processed using the Honey method. These coffees consistently achieved the highest scores due to their complexity, sweetness, and clean cup profiles. A key trend was the direct correlation between meticulous processing and high cupping scores, highlighting the importance of post-harvest techniques.",
            topPerformingCoffees: [
                { lotId: "GBL001", variety: "Gesha", process: "Honey", score: 90.50, tastingNotes: "Remarkable complexity with layers of tropical fruit, jasmine, and a honey-sweet finish." },
                { lotId: "GBL002", variety: "Caturra", process: "Washed", score: 88.25, tastingNotes: "A very clean and elegant coffee with notes of citrus, green apple, and a delicate floral quality." },
            ],
            varietyAnalysis: {
                topVariety: "Gesha",
                averageScore: 90.50,
                analysis: "The Gesha variety continues to dominate the high end of the quality spectrum. Its inherent genetic potential for complex floral and fruit notes, when combined with skilled farming, results in scores that are consistently higher than other varieties in the dataset."
            },
            processingAnalysis: {
                topProcess: "Honey",
                averageScore: 90.50,
                analysis: "The Honey process demonstrated its ability to produce exceptionally sweet and full-bodied coffees this year, leading to the highest average scores. This method appears to enhance the natural sweetness of the Gesha cherry, creating a highly desirable cup profile."
            },
            keyTrends: [
                "Strong positive correlation between Gesha variety and scores above 90.",
                "Honey processed coffees are outperforming Washed and Natural methods in terms of overall score.",
                "High sweetness scores are a common denominator across all top-performing lots, indicating excellent cherry ripeness."
            ],
            recommendations: {
                forFarmers: "Consider planting more Gesha if the climate is suitable. Focus on achieving optimal cherry ripeness at harvest to maximize sweetness.",
                forProcessors: "Refine and expand Honey processing techniques, as this method is currently yielding the highest quality and value. Maintain detailed drying logs to ensure consistency.",
                forRoasters: "Prioritize sourcing Gesha and Honey processed lots for premium, high-margin offerings. Use the detailed tasting notes in marketing to attract discerning customers."
            }
        };
    }
    
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        title: { type: Type.STRING },
                        executiveSummary: { type: Type.STRING },
                        topPerformingCoffees: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    lotId: { type: Type.STRING },
                                    variety: { type: Type.STRING },
                                    process: { type: Type.STRING },
                                    score: { type: Type.NUMBER },
                                    tastingNotes: { type: Type.STRING }
                                },
                                required: ["lotId", "variety", "process", "score", "tastingNotes"]
                            }
                        },
                        varietyAnalysis: {
                            type: Type.OBJECT,
                            properties: {
                                topVariety: { type: Type.STRING },
                                averageScore: { type: Type.NUMBER },
                                analysis: { type: Type.STRING }
                            },
                             required: ["topVariety", "averageScore", "analysis"]
                        },
                        processingAnalysis: {
                            type: Type.OBJECT,
                            properties: {
                                topProcess: { type: Type.STRING },
                                averageScore: { type: Type.NUMBER },
                                analysis: { type: Type.STRING }
                            },
                             required: ["topProcess", "averageScore", "analysis"]
                        },
                        keyTrends: { type: Type.ARRAY, items: { type: Type.STRING } },
                        recommendations: {
                            type: Type.OBJECT,
                            properties: {
                                forFarmers: { type: Type.STRING },
                                forProcessors: { type: Type.STRING },
                                forRoasters: { type: Type.STRING }
                            },
                             required: ["forFarmers", "forProcessors", "forRoasters"]
                        }
                    },
                    required: ["title", "executiveSummary", "topPerformingCoffees", "varietyAnalysis", "processingAnalysis", "keyTrends", "recommendations"]
                }
            }
        });

        return JSON.parse(response.text);

    } catch (error) {
        console.error("Error calling Gemini API for comprehensive report:", error);
        throw new Error("Failed to generate AI-powered comprehensive report. Please try again.");
    }
};

export const getPlatformTrends = async (appData: AppData): Promise<PlatformInsight> => {
    const analysisData = appData.greenBeanLots.map(gbl => {
        const parchmentLot = appData.parchmentLots.find(p => p.id === gbl.parchmentLotId);
        const processingBatch = appData.processingBatches.find(b => b.id === parchmentLot?.processingBatchId);
        const harvestLot = appData.harvestLots.find(h => h.id === parchmentLot?.harvestLotId);

        let finalScore: number | null = null;
        let finalNotes: string | null = null;
        const scoreInfo = gbl.cuppingScores[0];
        if (scoreInfo) {
            const session = appData.cuppingSessions.find(s => s.id === scoreInfo.sessionId);
            const sample = session?.samples.find(s => s.greenBeanLotId === gbl.id);
            if (session && sample && session.finalResults && session.finalResults[sample.id]) {
                finalScore = session.finalResults[sample.id].totalScore;
                finalNotes = session.finalResults[sample.id].finalNotes;
            } else if (scoreInfo.score) {
                finalScore = scoreInfo.score;
            }
        }
        
        if (!finalScore) return null;

        return {
            score: finalScore.toFixed(2),
            variety: harvestLot?.cherryVariety || 'Unknown',
            process: processingBatch?.processType || 'Unknown',
            notes: finalNotes || 'No final notes available.'
        };
    }).filter(Boolean);

    if (analysisData.length === 0) {
        throw new Error("Not enough data to perform trend analysis.");
    }
    
    const prompt = `You are a world-class coffee quality data scientist. Analyze the following dataset from a specialty coffee platform. Each entry represents a distinct coffee lot with its cupping score and characteristics.

    Dataset:
    ${JSON.stringify(analysisData, null, 2)}

    Based on this data, provide a structured analysis in JSON format. Your analysis should include:
    1.  topPerformingVariety: Identify the cherry variety with the highest average score. Include the variety name and its average score.
    2.  topPerformingProcess: Identify the processing method with the highest average score. Include the process name and its average score.
    3.  notableCorrelations: List 2-3 interesting correlations or observations (e.g., "Washed process coffees consistently show higher 'Acidity' scores," or "Gesha variety often has 'floral' notes mentioned in judge comments").
    4.  overallSummary: Provide a brief, insightful summary for platform stakeholders (like roasters or processors) about the key quality trends this year.`;

    if (!API_KEY) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        return {
            topPerformingVariety: { variety: "Gesha", avgScore: 89.25 },
            topPerformingProcess: { process: "Honey", avgScore: 89.25 },
            notableCorrelations: [
                "Gesha variety is strongly associated with high scores and complex floral notes.",
                "The Honey process appears to be yielding the highest quality results in this dataset.",
                "There is a consistent trend of high sweetness scores across top-performing lots."
            ],
            overallSummary: "Mock Data: This year's data highlights the exceptional performance of the Gesha variety, particularly when combined with the Honey process. Roasters should prioritize these lots for premium offerings. The consistent high sweetness scores suggest excellent cherry ripeness and meticulous processing across the board."
        };
    }

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        topPerformingVariety: { 
                            type: Type.OBJECT,
                            properties: { variety: { type: Type.STRING }, avgScore: { type: Type.NUMBER } },
                        },
                        topPerformingProcess: {
                            type: Type.OBJECT,
                            properties: { process: { type: Type.STRING }, avgScore: { type: Type.NUMBER } },
                        },
                        notableCorrelations: { type: Type.ARRAY, items: { type: Type.STRING } },
                        overallSummary: { type: Type.STRING }
                    }
                }
            }
        });

        return JSON.parse(response.text);

    } catch (error) {
        console.error("Error calling Gemini API for platform trends:", error);
        throw new Error("Failed to generate AI-powered platform trends. Please try again.");
    }
};