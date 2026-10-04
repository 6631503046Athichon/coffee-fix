import { GoogleGenAI } from "@google/genai";
import { JudgeScore, CuppingSession, AppData, ComprehensiveQualityReport } from '../../types';
import { api } from '../api';
import { isApiError } from '../apiError';

// AI features call the backend's POST /api/ai/:feature, which holds the
// Gemini key (GEMINI_API_KEY on the backend), checks the user's role and
// rate-limits each user. The browser sends structured data only; the prompts
// are built on the server (backend/src/lib/aiFeatures.ts).
//
// The one exception is synthesizeCuppingNotes below: its only caller is the
// Competition dashboard (cupping, hands-off until the owner approves a
// change), so it still calls Gemini from the browser with
// VITE_GEMINI_API_KEY. Leave that variable unset in the frontend's env:
// any value set there is public. Moving it means adding a feature to
// lib/aiFeatures.ts and pointing this function at it.

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

// Limits the backend enforces (backend/src/lib/aiFeatures.ts). Text is cut to
// fit here so a long note never fails the whole request.
/** Base64 characters of the largest image the backend accepts. */
export const MAX_AI_IMAGE_BASE64_CHARS = 4_000_000
const MAX_NOTES_CHARS = 2_000
const MAX_INSIGHT_SAMPLES = 60
/** Image types Gemini reads; any other image is re-encoded as JPEG first. */
const AI_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
/**
 * Base64 size above which a photo is shrunk before upload (about 750 KB).
 * The upload and Gemini's answer share api.ts's 30 s timeout, so a 3 MB
 * photo on a slow mobile uplink would always time out; a report is still
 * easy to read at this size.
 */
export const AI_IMAGE_TARGET_BASE64_CHARS = 1_000_000
/** Longest edge of a shrunk image. */
const MAX_IMAGE_EDGE_PX = 1600

/** "field: message" of the first problem in a backend 400, or null. */
const firstValidationProblem = (data: unknown): string | null => {
  const details = (data as { details?: unknown } | null)?.details
  if (!Array.isArray(details)) return null
  const first = details.find(
    (detail): detail is { field?: unknown; message: string } =>
      typeof detail?.message === 'string' && detail.message !== '',
  )
  if (!first) return null
  return typeof first.field === 'string' && first.field
    ? `${first.field}: ${first.message}`
    : first.message
}

/**
 * Run an AI feature on the backend and return its `result`. A refusal the
 * user can act on (rate limited, AI not set up, too large, an invalid value)
 * keeps the server's message; anything else becomes `failureMessage`.
 */
async function callAi<T>(feature: string, body: unknown, failureMessage: string): Promise<T> {
  try {
    const response = await api.post<{ result: T }>(`/ai/${feature}`, body)
    return response.result
  } catch (error) {
    console.error(`AI ${feature} failed:`, error)
    if (isApiError(error)) {
      if (error.status === 429 || error.status === 501 || error.status === 413) {
        throw new Error(error.message)
      }
      const problem = error.status === 400 ? firstValidationProblem(error.data) : null
      if (problem) throw new Error(problem)
    }
    throw new Error(failureMessage)
  }
}

const finiteOrUndefined = (value: number | undefined): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined

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
  const samples = session.samples.slice(0, MAX_INSIGHT_SAMPLES).map(sample => {
    const scoresForSample = session.scores[sample.id] || [];
    const notes = scoresForSample.map(s => s.notes).join('; ');
    const averageScore = scoresForSample.reduce((acc, s) => acc + (s.scores[attribute] || 0), 0) / (scoresForSample.length || 1);
    return {
      blindCode: String(sample.blindCode ?? '').slice(0, 40),
      averageScore: Number.isFinite(averageScore) ? averageScore : 0,
      notes: notes.slice(0, MAX_NOTES_CHARS),
    };
  });

  if (samples.length === 0) {
    throw new Error("This session has no samples to analyze.");
  }

  return callAi<QualityInsight>(
    'quality-insights',
    { attribute, samples },
    "Failed to generate AI-powered insights. Please try again."
  );
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
            } else if (scoreInfo.score != null) {
                finalScore = scoreInfo.score;
            }
        }

        if (finalScore == null) return null;

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
    const lots = extractLotAnalysisData(appData).map(lot => ({
        lotId: lot.lotId.slice(0, 100),
        score: lot.score,
        variety: lot.variety.slice(0, 120),
        process: lot.process.slice(0, 120),
        notes: lot.notes.slice(0, MAX_NOTES_CHARS),
    }));

    return callAi<ComprehensiveQualityReport>(
        'quality-report',
        { lots },
        "Failed to generate AI-powered comprehensive report. Please try again."
    );
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
  // An optional value that is not a number is left out, as the prompt
  // always did; a required one is sent as null and refused by the backend.
  const body = {
    pH: soilData.pH,
    phosphorus: soilData.phosphorus,
    potassium: soilData.potassium,
    nitrogen: soilData.nitrogen,
    calcium: soilData.calcium,
    magnesium: soilData.magnesium,
    organicMatter: finiteOrUndefined(soilData.organicMatter),
    sulfur: finiteOrUndefined(soilData.sulfur),
    zinc: finiteOrUndefined(soilData.zinc),
    iron: finiteOrUndefined(soilData.iron),
    manganese: finiteOrUndefined(soilData.manganese),
    copper: finiteOrUndefined(soilData.copper),
    boron: finiteOrUndefined(soilData.boron),
    location: soilData.location?.slice(0, 200),
    variety: soilData.variety?.slice(0, 100),
  };

  return callAi<string>(
    'soil-recommendations',
    body,
    "Failed to generate AI recommendations. Please try again."
  );
};

/**
 * Extract soil analysis data from an uploaded image
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

/**
 * Re-encode an image as JPEG, scaled down to MAX_IMAGE_EDGE_PX, and return
 * its base64 data, or null when the browser cannot decode or draw it.
 */
const reencodeAsJpeg = (dataUrl: string): Promise<string | null> =>
  new Promise((resolve) => {
    const giveUp = window.setTimeout(() => resolve(null), 20000);
    const done = (value: string | null) => {
      window.clearTimeout(giveUp);
      resolve(value);
    };
    const image = new Image();
    image.onload = () => {
      try {
        const longest = Math.max(image.naturalWidth, image.naturalHeight) || 1;
        const scale = Math.min(1, MAX_IMAGE_EDGE_PX / longest);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext('2d');
        if (!context) return done(null);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        done(canvas.toDataURL('image/jpeg', 0.85).split(',')[1] || null);
      } catch {
        done(null);
      }
    };
    image.onerror = () => done(null);
    image.src = dataUrl;
  });

/**
 * The image as the backend takes it: a type Gemini reads, within
 * MAX_AI_IMAGE_BASE64_CHARS. One above AI_IMAGE_TARGET_BASE64_CHARS, or of
 * another type, is re-encoded as a smaller JPEG. One the browser cannot draw
 * (HEIC outside Safari) goes as it is while the backend takes it.
 */
export const prepareSoilImage = async (
  imageBase64: string,
  mimeType: string
): Promise<{ imageBase64: string; mimeType: string }> => {
  const sendable =
    AI_IMAGE_TYPES.includes(mimeType) && imageBase64.length <= MAX_AI_IMAGE_BASE64_CHARS;
  if (sendable && imageBase64.length <= AI_IMAGE_TARGET_BASE64_CHARS) {
    return { imageBase64, mimeType };
  }
  const jpeg = await reencodeAsJpeg(`data:${mimeType};base64,${imageBase64}`);
  if (jpeg && jpeg.length <= MAX_AI_IMAGE_BASE64_CHARS && (!sendable || jpeg.length < imageBase64.length)) {
    return { imageBase64: jpeg, mimeType: 'image/jpeg' };
  }
  if (sendable) return { imageBase64, mimeType };
  throw new Error('รูปนี้ใหญ่เกินไปหรือเปิดไม่ได้ กรุณาใช้รูป JPG หรือ PNG ที่เล็กลง');
};

export const extractSoilDataFromImage = async (
  imageBase64: string,
  mimeType: string
): Promise<ExtractedSoilData> => {
  const image = await prepareSoilImage(imageBase64, mimeType);
  return callAi<ExtractedSoilData>(
    'soil-image',
    image,
    'ไม่สามารถอ่านค่าจากรูปได้ กรุณาลองอีกครั้ง'
  );
};
