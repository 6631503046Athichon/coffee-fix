import { GoogleGenAI, Type } from "@google/genai";
import { JudgeScore, CuppingSession, AppData, PlatformInsight, ComprehensiveQualityReport } from '../types';

// IMPORTANT: This key is managed externally. Do not modify or expose it in the UI.
const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

const ai = API_KEY ? new GoogleGenAI({ apiKey: API_KEY }) : null;

/**
 * Get the initialised GoogleGenAI client or throw a localised error if the
 * API key is missing. Call sites that previously did `if (!API_KEY) throw ...`
 * followed by `ai.foo(...)` now funnel through this helper so TypeScript's
 * strict-null checks can narrow the client to non-null.
 */
function getAI(): GoogleGenAI {
  if (!ai) {
    throw new Error('ไม่พบ Gemini API Key กรุณาตั้งค่า VITE_GEMINI_API_KEY')
  }
  return ai
}

/**
 * The Gemini SDK types `response.text` as `string | undefined`. Empty
 * responses always indicate an API failure for our use cases, so surface it
 * as an error instead of letting `undefined` leak downstream.
 */
function requireText(text: string | undefined): string {
  if (text === undefined || text === '') {
    throw new Error('Gemini API returned an empty response')
  }
  return text
}

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
    throw new Error("ไม่พบ Gemini API Key กรุณาตั้งค่า VITE_GEMINI_API_KEY");
  }

  try {
    const response = await getAI().models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
            temperature: 0.7,
            topP: 1,
            topK: 32,
        }
    });

    return requireText(response.text);
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
    throw new Error("ไม่พบ Gemini API Key กรุณาตั้งค่า VITE_GEMINI_API_KEY");
  }

  try {
    const response = await getAI().models.generateContent({
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
    
    return JSON.parse(requireText(response.text));

  } catch (error) {
    console.error("Error calling Gemini API for insights:", error);
    throw new Error("Failed to generate AI-powered insights. Please try again.");
  }
};

/**
 * Extract lot analysis data from app data
 */
function extractLotAnalysisData(appData: AppData) {
    // Build lookup maps for O(1) access instead of O(n) .find() calls
    const parchmentMap = new Map(appData.parchmentLots.map(p => [p.id, p]));
    const batchMap = new Map(appData.processingBatches.map(b => [b.id, b]));
    const harvestMap = new Map(appData.harvestLots.map(h => [h.id, h]));
    const sessionMap = new Map(appData.cuppingSessions.map(s => [s.id, s]));

    const analysisData = appData.greenBeanLots.map(gbl => {
        const parchmentLot = gbl.parchmentLotId ? parchmentMap.get(gbl.parchmentLotId) : undefined;
        const processingBatch = parchmentLot?.processingBatchId ? batchMap.get(parchmentLot.processingBatchId) : undefined;
        const harvestLot = parchmentLot?.harvestLotId ? harvestMap.get(parchmentLot.harvestLotId) : undefined;

        let finalScore: number | null = null;
        let finalNotes: string | null = null;
        const scoreInfo = gbl.cuppingScores[0];

        if (scoreInfo) {
            const session = scoreInfo.sessionId ? sessionMap.get(scoreInfo.sessionId) : undefined;
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

    return analysisData.sort((a, b) => b.score - a.score).slice(0, 10);
}

export const generateComprehensiveReport = async (appData: AppData): Promise<ComprehensiveQualityReport> => {
    const topLotsData = extractLotAnalysisData(appData);
    
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
        throw new Error("ไม่พบ Gemini API Key กรุณาตั้งค่า VITE_GEMINI_API_KEY");
    }

    try {
        const response = await getAI().models.generateContent({
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

        return JSON.parse(requireText(response.text));

    } catch (error) {
        console.error("Error calling Gemini API for comprehensive report:", error);
        throw new Error("Failed to generate AI-powered comprehensive report. Please try again.");
    }
};

/**
 * Generate AI-powered soil recommendations based on soil analysis data
 */
export const generateSoilRecommendations = async (soilData: {
  pH: number;
  phosphorus: number;
  potassium: number;
  nitrogen: number;
  calcium: number;
  magnesium: number;
  organicMatter?: number;
  sulfur?: number;
  zinc?: number;
  iron?: number;
  manganese?: number;
  copper?: number;
  boron?: number;
  location?: string;
  variety?: string;
}): Promise<string> => {
  const prompt = `คุณเป็นผู้เชี่ยวชาญด้านวิทยาศาสตร์ดินเกษตรที่เชี่ยวชาญเรื่องการปลูกกาแฟ กรุณาวิเคราะห์ข้อมูลดินต่อไปนี้และให้คำแนะนำที่เฉพาะเจาะจงและปฏิบัติได้จริง เพื่อปรับปรุงสุขภาพดินและเพิ่มผลผลิตกาแฟ

**กรุณาตอบเป็นภาษาไทยทั้งหมด**

ข้อมูลวิเคราะห์ดิน:
- ที่ตั้ง: ${soilData.location || 'ฟาร์มกาแฟ'}
- ค่า pH: ${soilData.pH}
- ฟอสฟอรัส (P): ${soilData.phosphorus} ppm
- โพแทสเซียม (K): ${soilData.potassium} ppm
- ไนโตรเจน (N): ${soilData.nitrogen}%
- แคลเซียม (Ca): ${soilData.calcium} ppm
- แมกนีเซียม (Mg): ${soilData.magnesium} ppm
${soilData.organicMatter ? `- อินทรียวัตถุ: ${soilData.organicMatter}%` : ''}
${soilData.sulfur ? `- กำมะถัน (S): ${soilData.sulfur} ppm` : ''}
${soilData.zinc ? `- สังกะสี (Zn): ${soilData.zinc} ppm` : ''}
${soilData.iron ? `- เหล็ก (Fe): ${soilData.iron} ppm` : ''}
${soilData.manganese ? `- แมงกานีส (Mn): ${soilData.manganese} ppm` : ''}
${soilData.copper ? `- ทองแดง (Cu): ${soilData.copper} ppm` : ''}
${soilData.boron ? `- โบรอน (B): ${soilData.boron} ppm` : ''}
${soilData.variety ? `- พันธุ์กาแฟ: ${soilData.variety}` : ''}

จากข้อมูลนี้ กรุณาให้:
1. การประเมินสถานะสุขภาพดินปัจจุบัน
2. สารอาหารที่ขาดหรือมากเกินไป
3. คำแนะนำในการปรับปรุงดิน (ปุ๋ย, อินทรียวัตถุ, การปรับ pH เป็นต้น)
4. แนวปฏิบัติที่ดีสำหรับการรักษาสภาพดินให้เหมาะสมกับการปลูกกาแฟ

ตอบเป็นคำแนะนำที่ชัดเจน เข้าใจง่าย เกษตรกรสามารถนำไปปฏิบัติได้จริง`;

  if (!API_KEY) {
    throw new Error("ไม่พบ Gemini API Key กรุณาตั้งค่า VITE_GEMINI_API_KEY");
  }

  try {
    const response = await getAI().models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        temperature: 0.7,
        topP: 1,
        topK: 32,
      }
    });

    return requireText(response.text);
  } catch (error) {
    console.error("Error calling Gemini API for soil recommendations:", error);
    throw new Error("Failed to generate AI recommendations. Please try again.");
  }
};

/**
 * Extract trend analysis data from app data
 */
function extractTrendAnalysisData(appData: AppData) {
    // Build lookup maps for O(1) access instead of O(n) .find() calls
    const parchmentMap = new Map(appData.parchmentLots.map(p => [p.id, p]));
    const batchMap = new Map(appData.processingBatches.map(b => [b.id, b]));
    const harvestMap = new Map(appData.harvestLots.map(h => [h.id, h]));
    const sessionMap = new Map(appData.cuppingSessions.map(s => [s.id, s]));

    const analysisData = appData.greenBeanLots.map(gbl => {
        const parchmentLot = gbl.parchmentLotId ? parchmentMap.get(gbl.parchmentLotId) : undefined;
        const processingBatch = parchmentLot?.processingBatchId ? batchMap.get(parchmentLot.processingBatchId) : undefined;
        const harvestLot = parchmentLot?.harvestLotId ? harvestMap.get(parchmentLot.harvestLotId) : undefined;

        let finalScore: number | null = null;
        let finalNotes: string | null = null;
        const scoreInfo = gbl.cuppingScores[0];

        if (scoreInfo) {
            const session = scoreInfo.sessionId ? sessionMap.get(scoreInfo.sessionId) : undefined;
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

    return analysisData;
}

export const getPlatformTrends = async (appData: AppData): Promise<PlatformInsight> => {
    const analysisData = extractTrendAnalysisData(appData);
    
    const prompt = `You are a world-class coffee quality data scientist. Analyze the following dataset from a specialty coffee platform. Each entry represents a distinct coffee lot with its cupping score and characteristics.

    Dataset:
    ${JSON.stringify(analysisData, null, 2)}

    Based on this data, provide a structured analysis in JSON format. Your analysis should include:
    1.  topPerformingVariety: Identify the cherry variety with the highest average score. Include the variety name and its average score.
    2.  topPerformingProcess: Identify the processing method with the highest average score. Include the process name and its average score.
    3.  notableCorrelations: List 2-3 interesting correlations or observations (e.g., "Washed process coffees consistently show higher 'Acidity' scores," or "Gesha variety often has 'floral' notes mentioned in judge comments").
    4.  overallSummary: Provide a brief, insightful summary for platform stakeholders (like roasters or processors) about the key quality trends this year.`;

    if (!API_KEY) {
        throw new Error("ไม่พบ Gemini API Key กรุณาตั้งค่า VITE_GEMINI_API_KEY");
    }

    try {
        const response = await getAI().models.generateContent({
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

        return JSON.parse(requireText(response.text));

    } catch (error) {
        console.error("Error calling Gemini API for platform trends:", error);
        throw new Error("Failed to generate AI-powered platform trends. Please try again.");
    }
};

/**
 * Extract soil analysis data from an uploaded image using Gemini Vision
 */
export interface ExtractedSoilData {
  pH?: string;
  phosphorus?: string;
  potassium?: string;
  nitrogen?: string;
  calcium?: string;
  magnesium?: string;
  organicMatter?: string;
  sulfur?: string;
  zinc?: string;
  iron?: string;
  manganese?: string;
  copper?: string;
  boron?: string;
  labName?: string;
  certificateNumber?: string;
}

export const extractSoilDataFromImage = async (
  imageBase64: string,
  mimeType: string
): Promise<ExtractedSoilData> => {
  const prompt = `You are a soil analysis report reader. Analyze this soil analysis certificate/report image and extract the nutrient values.

Extract the following values from the image. Return ONLY the numeric values (no units). If a value is not found, return null for that field.

Fields to extract:
- pH: soil pH value
- phosphorus: Phosphorus (P) in ppm
- potassium: Potassium (K) in ppm
- nitrogen: Nitrogen (N) in percentage (%)
- calcium: Calcium (Ca) in ppm
- magnesium: Magnesium (Mg) in ppm
- organicMatter: Organic Matter (OM) in percentage (%)
- sulfur: Sulfur (S) in ppm
- zinc: Zinc (Zn) in ppm
- iron: Iron (Fe) in ppm
- manganese: Manganese (Mn) in ppm
- copper: Copper (Cu) in ppm
- boron: Boron (B) in ppm
- labName: Name of the laboratory that performed the analysis
- certificateNumber: Certificate or report number

Important: Look for Thai or English labels. Common Thai labels: pH, ฟอสฟอรัส (P), โพแทสเซียม (K), ไนโตรเจน (N), แคลเซียม (Ca), แมกนีเซียม (Mg), อินทรีย์วัตถุ (OM).`;

  if (!API_KEY) {
    throw new Error("ไม่พบ Gemini API Key กรุณาตั้งค่า VITE_GEMINI_API_KEY");
  }

  try {
    const response = await ai!.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType,
                data: imageBase64,
              },
            },
          ],
        },
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            pH: { type: Type.STRING, nullable: true },
            phosphorus: { type: Type.STRING, nullable: true },
            potassium: { type: Type.STRING, nullable: true },
            nitrogen: { type: Type.STRING, nullable: true },
            calcium: { type: Type.STRING, nullable: true },
            magnesium: { type: Type.STRING, nullable: true },
            organicMatter: { type: Type.STRING, nullable: true },
            sulfur: { type: Type.STRING, nullable: true },
            zinc: { type: Type.STRING, nullable: true },
            iron: { type: Type.STRING, nullable: true },
            manganese: { type: Type.STRING, nullable: true },
            copper: { type: Type.STRING, nullable: true },
            boron: { type: Type.STRING, nullable: true },
            labName: { type: Type.STRING, nullable: true },
            certificateNumber: { type: Type.STRING, nullable: true },
          },
        },
      },
    });

    return JSON.parse(requireText(response.text));
  } catch (error) {
    console.error('Error calling Gemini Vision for soil OCR:', error);
    throw new Error('ไม่สามารถอ่านค่าจากรูปได้ กรุณาลองอีกครั้ง');
  }
};
