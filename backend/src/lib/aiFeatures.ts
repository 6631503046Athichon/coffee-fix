import { z } from 'zod'
import { pHSchema, nonNegativeNumberSchema } from '@/lib/validations/common'
import type { GeminiRequest } from '@/lib/gemini'

/**
 * The AI features behind POST /api/ai/:feature. Each one takes structured,
 * size-limited input and builds its own prompt on the server, so the route
 * is not an open Gemini proxy: a caller cannot send a prompt of their own.
 *
 * The prompts are the ones the browser used to send straight to Gemini from
 * services/external/geminiService.ts.
 */

export interface AiFeature {
  /** Roles that may use the feature; super admins always may. */
  roles: readonly string[]
  /** Largest request body accepted, in bytes (Thai text is 3 bytes a character). */
  maxBodyBytes: number
  /** Validate the body and build the Gemini request. */
  prepare: (body: unknown) => { ok: true; request: GeminiRequest } | { ok: false; error: z.ZodError }
  /** Turn Gemini's answer into the response's `result`; throws when malformed. */
  toResult: (text: string) => unknown
}

const defineFeature = <I>(def: {
  roles: readonly string[]
  maxBodyBytes: number
  input: z.ZodType<I>
  request: (input: I) => GeminiRequest
  toResult: (text: string) => unknown
}): AiFeature => ({
  roles: def.roles,
  maxBodyBytes: def.maxBodyBytes,
  toResult: def.toResult,
  prepare: (body) => {
    const parsed = def.input.safeParse(body)
    return parsed.success
      ? { ok: true, request: def.request(parsed.data) }
      : { ok: false, error: parsed.error }
  },
})

/**
 * Per user, across every AI feature. The window stays at one minute: the
 * shared limiter's periodic cleanup drops timestamps older than twice the
 * shortest window any route uses, so a longer window would not hold.
 */
export const AI_RATE_LIMIT = { windowMs: 60 * 1000, max: 5, name: 'ai' }

/** Base64 characters of the largest soil-report image (about 3 MB of image). */
export const MAX_IMAGE_BASE64_CHARS = 4_000_000

/** Longest notes text sent for one cupping sample or one lot. */
export const MAX_NOTES_CHARS = 2_000

export const SOIL_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
] as const

// Gemini 2.5 Flash thinks before answering by default, which can push a long
// answer past the SPA's 30 s request timeout. These answers do not need it.
const NO_THINKING = { thinkingConfig: { thinkingBudget: 0 } }

/**
 * The longest answer each feature may get, in tokens. Free text from the
 * caller reaches the prompts (a location, notes), so without a cap a caller
 * could steer Gemini into a long answer billed to the backend's key. Each cap
 * is well above what the feature asks for (Thai takes more tokens a word); a
 * JSON answer cut off at the cap fails to parse and is answered 502.
 */
export const AI_MAX_OUTPUT_TOKENS = {
  'soil-recommendations': 4096,
  'soil-image': 1024,
  'quality-insights': 2048,
  'quality-report': 8192,
} as const

const textConfig = (maxOutputTokens: number) => ({
  temperature: 0.7,
  topP: 1,
  topK: 32,
  maxOutputTokens,
  ...NO_THINKING,
})

const jsonConfig = (responseSchema: Record<string, unknown>, maxOutputTokens: number) => ({
  responseMimeType: 'application/json',
  responseSchema,
  maxOutputTokens,
  ...NO_THINKING,
})

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Gemini's JSON answer as an object; throws on anything else. */
const parseJsonObject = (text: string): Record<string, unknown> => {
  const value: unknown = JSON.parse(text)
  if (!isPlainObject(value)) throw new Error('Gemini answer is not a JSON object')
  return value
}

const stringList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []

// ============================================
// Soil recommendations (Farm > Soil, "AI recommendations")
// ============================================

const optionalNutrient = nonNegativeNumberSchema.optional().nullable()

const soilRecommendationsInput = z.object({
  pH: pHSchema,
  phosphorus: nonNegativeNumberSchema,
  potassium: nonNegativeNumberSchema,
  nitrogen: nonNegativeNumberSchema,
  calcium: nonNegativeNumberSchema,
  magnesium: nonNegativeNumberSchema,
  organicMatter: optionalNutrient,
  sulfur: optionalNutrient,
  zinc: optionalNutrient,
  iron: optionalNutrient,
  manganese: optionalNutrient,
  copper: optionalNutrient,
  boron: optionalNutrient,
  location: z.string().trim().max(200).optional().nullable(),
  variety: z.string().trim().max(100).optional().nullable(),
})

const soilRecommendationsPrompt = (soilData: z.infer<typeof soilRecommendationsInput>) => `คุณเป็นผู้เชี่ยวชาญด้านวิทยาศาสตร์ดินเกษตรที่เชี่ยวชาญเรื่องการปลูกกาแฟ กรุณาวิเคราะห์ข้อมูลดินต่อไปนี้และให้คำแนะนำที่เฉพาะเจาะจงและปฏิบัติได้จริง เพื่อปรับปรุงสุขภาพดินและเพิ่มผลผลิตกาแฟ

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

ตอบเป็นคำแนะนำที่ชัดเจน เข้าใจง่าย เกษตรกรสามารถนำไปปฏิบัติได้จริง`

// ============================================
// Soil report image (Farm > Soil, "read values from a photo")
// ============================================

const soilImageInput = z.object({
  imageBase64: z
    .string()
    .min(1)
    .max(MAX_IMAGE_BASE64_CHARS, 'Image is too large')
    .regex(/^[A-Za-z0-9+/]+={0,2}$/, 'Image must be base64'),
  mimeType: z.enum(SOIL_IMAGE_MIME_TYPES),
})

const SOIL_IMAGE_FIELDS = [
  'pH',
  'phosphorus',
  'potassium',
  'nitrogen',
  'calcium',
  'magnesium',
  'organicMatter',
  'sulfur',
  'zinc',
  'iron',
  'manganese',
  'copper',
  'boron',
  'labName',
  'certificateNumber',
] as const

const SOIL_IMAGE_PROMPT = `You are a soil analysis report reader. Analyze this soil analysis certificate/report image and extract the nutrient values.

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

Important: Look for Thai or English labels. Common Thai labels: pH, ฟอสฟอรัส (P), โพแทสเซียม (K), ไนโตรเจน (N), แคลเซียม (Ca), แมกนีเซียม (Mg), อินทรีย์วัตถุ (OM).`

/** Only the known fields, as short strings; anything else is dropped. */
const soilImageResult = (text: string) => {
  const raw = parseJsonObject(text)
  const result: Partial<Record<(typeof SOIL_IMAGE_FIELDS)[number], string>> = {}
  for (const field of SOIL_IMAGE_FIELDS) {
    const value = raw[field]
    if (typeof value === 'string' && value.trim()) result[field] = value.trim().slice(0, 200)
    else if (typeof value === 'number' && Number.isFinite(value)) result[field] = String(value)
  }
  return result
}

// ============================================
// Quality Insights page: one attribute across a cupping session's samples
// ============================================

const qualityInsightsInput = z.object({
  attribute: z.string().trim().min(1).max(60),
  samples: z
    .array(
      z.object({
        blindCode: z.string().trim().max(40),
        averageScore: z.number().min(0).max(100),
        notes: z.string().max(MAX_NOTES_CHARS),
      }),
    )
    .min(1)
    .max(60),
})

const qualityInsightsPrompt = ({ attribute, samples }: z.infer<typeof qualityInsightsInput>) => {
  const relevantData = samples
    .map(
      (sample) =>
        `Sample ${sample.blindCode} (Avg ${attribute} Score: ${sample.averageScore.toFixed(2)}): Notes - "${sample.notes}"`,
    )
    .join('\n')

  return `As a coffee quality consultant, analyze the following cupping data for the attribute "${attribute}". Provide insights for a coffee roaster.

Data:
${relevantData}

Based on this data, provide:
1.  A list of key descriptive words or phrases used by the judges.
2.  A brief summary of the overall performance of the samples for this attribute.
3.  A list of actionable recommendations for a roaster based on these findings (e.g., for sourcing, blending, or marketing).
`
}

const QUALITY_INSIGHTS_SCHEMA = {
  type: 'OBJECT',
  properties: {
    keyDescriptors: {
      type: 'ARRAY',
      items: { type: 'STRING' },
      description: "A list of 3-5 key descriptive words or phrases from the judge's notes.",
    },
    performanceSummary: {
      type: 'STRING',
      description: 'A 2-3 sentence summary of the overall performance on the specified attribute.',
    },
    roasterRecommendations: {
      type: 'ARRAY',
      items: { type: 'STRING' },
      description: 'A list of 2-3 actionable recommendations for a coffee roaster.',
    },
  },
}

const qualityInsightsResult = (text: string) => {
  const raw = parseJsonObject(text)
  return {
    keyDescriptors: stringList(raw.keyDescriptors),
    performanceSummary: typeof raw.performanceSummary === 'string' ? raw.performanceSummary : '',
    roasterRecommendations: stringList(raw.roasterRecommendations),
  }
}

// ============================================
// Quality Insights page: annual report over the top-scoring lots
// ============================================

const qualityReportInput = z.object({
  lots: z
    .array(
      z.object({
        lotId: z.string().trim().min(1).max(100),
        score: z.number().min(0).max(100),
        variety: z.string().trim().max(120),
        process: z.string().trim().max(120),
        notes: z.string().max(MAX_NOTES_CHARS),
      }),
    )
    .min(1)
    .max(10),
})

const qualityReportPrompt = ({ lots }: z.infer<typeof qualityReportInput>) => `You are a world-class coffee industry analyst. Your task is to create a comprehensive annual quality report based on the provided dataset of cupped coffee lots. The report should be engaging, insightful, and professional, written in a clear and accessible tone for stakeholders like farmers, roasters, and processors.

Dataset:
${JSON.stringify(lots, null, 2)}

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
    - forRoasters: Advice on sourcing priorities and marketing angles.`

const QUALITY_REPORT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING' },
    executiveSummary: { type: 'STRING' },
    topPerformingCoffees: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          lotId: { type: 'STRING' },
          variety: { type: 'STRING' },
          process: { type: 'STRING' },
          score: { type: 'NUMBER' },
          tastingNotes: { type: 'STRING' },
        },
        required: ['lotId', 'variety', 'process', 'score', 'tastingNotes'],
      },
    },
    varietyAnalysis: {
      type: 'OBJECT',
      properties: {
        topVariety: { type: 'STRING' },
        averageScore: { type: 'NUMBER' },
        analysis: { type: 'STRING' },
      },
      required: ['topVariety', 'averageScore', 'analysis'],
    },
    processingAnalysis: {
      type: 'OBJECT',
      properties: {
        topProcess: { type: 'STRING' },
        averageScore: { type: 'NUMBER' },
        analysis: { type: 'STRING' },
      },
      required: ['topProcess', 'averageScore', 'analysis'],
    },
    keyTrends: { type: 'ARRAY', items: { type: 'STRING' } },
    recommendations: {
      type: 'OBJECT',
      properties: {
        forFarmers: { type: 'STRING' },
        forProcessors: { type: 'STRING' },
        forRoasters: { type: 'STRING' },
      },
      required: ['forFarmers', 'forProcessors', 'forRoasters'],
    },
  },
  required: [
    'title',
    'executiveSummary',
    'topPerformingCoffees',
    'varietyAnalysis',
    'processingAnalysis',
    'keyTrends',
    'recommendations',
  ],
}

// ============================================
// Registry
// ============================================

// Matches the pages: Farm > Soil is for farmers (soil records also take
// Processors), /insights for Processors and Roasters. Admin always may.
const SOIL_ROLES = ['Farmer', 'Processor', 'Admin'] as const
const INSIGHTS_ROLES = ['Processor', 'Roaster', 'Admin'] as const

export const AI_FEATURES: Record<string, AiFeature> = {
  'soil-recommendations': defineFeature({
    roles: SOIL_ROLES,
    maxBodyBytes: 8 * 1024,
    input: soilRecommendationsInput,
    request: (input) => ({
      parts: [{ text: soilRecommendationsPrompt(input) }],
      generationConfig: textConfig(AI_MAX_OUTPUT_TOKENS['soil-recommendations']),
    }),
    toResult: (text) => text,
  }),
  'soil-image': defineFeature({
    roles: SOIL_ROLES,
    // The image plus a little JSON; Vercel refuses bodies above 4.5 MB.
    maxBodyBytes: MAX_IMAGE_BASE64_CHARS + 4 * 1024,
    input: soilImageInput,
    request: ({ imageBase64, mimeType }) => ({
      parts: [{ text: SOIL_IMAGE_PROMPT }, { inlineData: { mimeType, data: imageBase64 } }],
      generationConfig: jsonConfig(
        {
          type: 'OBJECT',
          properties: Object.fromEntries(
            SOIL_IMAGE_FIELDS.map((field) => [field, { type: 'STRING', nullable: true }]),
          ),
        },
        AI_MAX_OUTPUT_TOKENS['soil-image'],
      ),
    }),
    toResult: soilImageResult,
  }),
  'quality-insights': defineFeature({
    roles: INSIGHTS_ROLES,
    maxBodyBytes: 448 * 1024,
    input: qualityInsightsInput,
    request: (input) => ({
      parts: [{ text: qualityInsightsPrompt(input) }],
      generationConfig: jsonConfig(QUALITY_INSIGHTS_SCHEMA, AI_MAX_OUTPUT_TOKENS['quality-insights']),
    }),
    toResult: qualityInsightsResult,
  }),
  'quality-report': defineFeature({
    roles: INSIGHTS_ROLES,
    maxBodyBytes: 96 * 1024,
    input: qualityReportInput,
    request: (input) => ({
      parts: [{ text: qualityReportPrompt(input) }],
      generationConfig: jsonConfig(QUALITY_REPORT_SCHEMA, AI_MAX_OUTPUT_TOKENS['quality-report']),
    }),
    toResult: parseJsonObject,
  }),
}

/** The feature named in the URL, or null for an unknown one. */
export const getAiFeature = (name: string): AiFeature | null =>
  Object.prototype.hasOwnProperty.call(AI_FEATURES, name) ? AI_FEATURES[name] : null
