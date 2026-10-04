import { readFileSync } from 'fs'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { INITIAL_APP_DATA } from '../../constants'
import type { AppData, CuppingSession } from '../../types'

// The AI features run on the backend (POST /api/ai/:feature), which holds the
// Gemini key. Even with a browser key present, these must not use it.

const { post, generateContent, GoogleGenAI } = vi.hoisted(() => {
  const generateContent = vi.fn()
  return {
    post: vi.fn(),
    generateContent,
    GoogleGenAI: vi.fn(function () {
      return { models: { generateContent } }
    }),
  }
})

vi.mock('../api', () => ({ api: { post } }))
vi.mock('@google/genai', () => ({ GoogleGenAI }))

const loadService = async () => {
  vi.resetModules()
  return import('./geminiService')
}

// After loadService, so it is the class the fresh service checks against.
const loadApiError = async () => (await import('../apiError')).ApiError

const soil = {
  pH: 5.5,
  phosphorus: 12,
  potassium: 80,
  nitrogen: 0.2,
  calcium: 900,
  magnesium: 120,
  organicMatter: Number.NaN,
  zinc: 4,
  location: 'Doi Chang '.repeat(30),
  variety: 'Catimor',
}

describe('geminiService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    // A key in the browser env must not be what these features use.
    vi.stubEnv('VITE_GEMINI_API_KEY', 'browser-key')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('soil recommendations come from the backend route, not from Gemini in the browser', async () => {
    post.mockResolvedValueOnce({ result: 'ใส่ปูนขาว' })
    const { generateSoilRecommendations } = await loadService()

    await expect(generateSoilRecommendations(soil)).resolves.toBe('ใส่ปูนขาว')

    expect(post).toHaveBeenCalledTimes(1)
    const [endpoint, body] = post.mock.calls[0]
    expect(endpoint).toBe('/ai/soil-recommendations')
    expect(body).toMatchObject({ pH: 5.5, phosphorus: 12, zinc: 4, variety: 'Catimor' })
    // A value that is not a number is left out, as the prompt always did.
    expect(body.organicMatter).toBeUndefined()
    expect(body.location).toHaveLength(200)
    expect(JSON.stringify(body)).not.toContain('browser-key')
    expect(generateContent).not.toHaveBeenCalled()
  })

  it('a soil-report photo is sent to the backend as it is when it fits', async () => {
    post.mockResolvedValueOnce({ result: { pH: '5.4', labName: 'Soil Lab' } })
    const { extractSoilDataFromImage } = await loadService()

    await expect(extractSoilDataFromImage('aGVsbG8=', 'image/png')).resolves.toEqual({
      pH: '5.4',
      labName: 'Soil Lab',
    })
    expect(post).toHaveBeenCalledWith('/ai/soil-image', { imageBase64: 'aGVsbG8=', mimeType: 'image/png' })
    expect(generateContent).not.toHaveBeenCalled()
  })

  it('a photo above the upload limit is scaled down to a JPEG first', async () => {
    class FakeImage {
      naturalWidth = 4800
      naturalHeight = 3600
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(_value: string) {
        queueMicrotask(() => this.onload?.())
      }
    }
    vi.stubGlobal('Image', FakeImage)
    const drawImage = vi.fn()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as never)
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,c21hbGw=')
    post.mockResolvedValueOnce({ result: {} })
    const { extractSoilDataFromImage, MAX_AI_IMAGE_BASE64_CHARS } = await loadService()

    await extractSoilDataFromImage('A'.repeat(MAX_AI_IMAGE_BASE64_CHARS + 4), 'image/png')

    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1600, 1200)
    expect(post).toHaveBeenCalledWith('/ai/soil-image', { imageBase64: 'c21hbGw=', mimeType: 'image/jpeg' })
  })

  it('a photo the backend would take but that is slow to upload (about 3 MB) is shrunk too', async () => {
    class FakeImage {
      naturalWidth = 4000
      naturalHeight = 3000
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(_value: string) {
        queueMicrotask(() => this.onload?.())
      }
    }
    vi.stubGlobal('Image', FakeImage)
    const drawImage = vi.fn()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as never)
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,c21hbGw=')
    post.mockResolvedValueOnce({ result: {} })
    const { extractSoilDataFromImage, AI_IMAGE_TARGET_BASE64_CHARS, MAX_AI_IMAGE_BASE64_CHARS } = await loadService()
    expect(AI_IMAGE_TARGET_BASE64_CHARS).toBeLessThanOrEqual(1_000_000)

    await extractSoilDataFromImage('A'.repeat(MAX_AI_IMAGE_BASE64_CHARS - 4), 'image/jpeg')

    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1600, 1200)
    expect(post).toHaveBeenCalledWith('/ai/soil-image', { imageBase64: 'c21hbGw=', mimeType: 'image/jpeg' })
  })

  it('a large photo the browser cannot draw (HEIC) still goes as it is while the backend takes it', async () => {
    class BrokenImage {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(_value: string) {
        queueMicrotask(() => this.onerror?.())
      }
    }
    vi.stubGlobal('Image', BrokenImage)
    post.mockResolvedValueOnce({ result: {} })
    const { extractSoilDataFromImage, AI_IMAGE_TARGET_BASE64_CHARS } = await loadService()
    const heic = 'A'.repeat(AI_IMAGE_TARGET_BASE64_CHARS + 4)

    await extractSoilDataFromImage(heic, 'image/heic')

    expect(post).toHaveBeenCalledWith('/ai/soil-image', { imageBase64: heic, mimeType: 'image/heic' })
  })

  it('a photo that cannot be shrunk is refused before anything is sent', async () => {
    class BrokenImage {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(_value: string) {
        queueMicrotask(() => this.onerror?.())
      }
    }
    vi.stubGlobal('Image', BrokenImage)
    const { extractSoilDataFromImage, MAX_AI_IMAGE_BASE64_CHARS } = await loadService()

    await expect(
      extractSoilDataFromImage('A'.repeat(MAX_AI_IMAGE_BASE64_CHARS + 4), 'image/png'),
    ).rejects.toThrow('รูปนี้ใหญ่เกินไปหรือเปิดไม่ได้')
    expect(post).not.toHaveBeenCalled()
  })

  it('cupping insights send each sample’s average and notes to the backend', async () => {
    const insight = { keyDescriptors: ['floral'], performanceSummary: 'Bright.', roasterRecommendations: [] }
    post.mockResolvedValueOnce({ result: insight })
    const { getQualityInsights } = await loadService()
    const session = {
      samples: [
        { id: 's1', blindCode: 'A1' },
        { id: 's2', blindCode: 'B2' },
      ],
      scores: {
        s1: [
          { scores: { Flavor: 8 }, notes: 'Jasmine' },
          { scores: { Flavor: 7.5 }, notes: 'x'.repeat(3000) },
        ],
      },
    } as unknown as CuppingSession

    await expect(getQualityInsights(session, 'Flavor')).resolves.toEqual(insight)

    const [endpoint, body] = post.mock.calls[0]
    expect(endpoint).toBe('/ai/quality-insights')
    expect(body.attribute).toBe('Flavor')
    expect(body.samples).toHaveLength(2)
    expect(body.samples[0]).toMatchObject({ blindCode: 'A1', averageScore: 7.75 })
    expect(body.samples[0].notes).toHaveLength(2000)
    expect(body.samples[1]).toEqual({ blindCode: 'B2', averageScore: 0, notes: '' })
    expect(generateContent).not.toHaveBeenCalled()
  })

  it('the annual report sends the top-scored lots to the backend', async () => {
    const report = { title: 'Annual Coffee Quality Report' }
    post.mockResolvedValueOnce({ result: report })
    const { generateComprehensiveReport } = await loadService()
    const data = {
      ...INITIAL_APP_DATA,
      harvestLots: [{ id: 'h1', cherryVariety: 'Gesha' }],
      processingBatches: [{ id: 'b1', processType: 'Washed' }],
      parchmentLots: [{ id: 'p1', processingBatchId: 'b1', harvestLotId: 'h1' }],
      greenBeanLots: Array.from({ length: 12 }, (_, i) => ({
        id: `g${i}`,
        parchmentLotId: 'p1',
        cuppingScores: [{ sessionId: '', score: 80 + i }],
      })),
    } as unknown as AppData

    await expect(generateComprehensiveReport(data)).resolves.toEqual(report)

    const [endpoint, body] = post.mock.calls[0]
    expect(endpoint).toBe('/ai/quality-report')
    expect(body.lots).toHaveLength(10)
    expect(body.lots[0]).toEqual({
      lotId: 'g11',
      score: 91,
      variety: 'Gesha',
      process: 'Washed',
      notes: 'No final notes available.',
    })
    expect(generateContent).not.toHaveBeenCalled()
  })

  it('says why when the backend rate-limits or has no key, and stays generic otherwise', async () => {
    const { generateSoilRecommendations } = await loadService()
    const ApiError = await loadApiError()

    post.mockRejectedValueOnce(new ApiError('Too many requests. Please try again later.', 429))
    await expect(generateSoilRecommendations(soil)).rejects.toThrow('Too many requests. Please try again later.')

    post.mockRejectedValueOnce(new ApiError('AI features are not set up on this server yet', 501))
    await expect(generateSoilRecommendations(soil)).rejects.toThrow('AI features are not set up on this server yet')

    post.mockRejectedValueOnce(new ApiError('Request is too large for this AI feature', 413))
    await expect(generateSoilRecommendations(soil)).rejects.toThrow('Request is too large for this AI feature')

    // An invalid value names the field rather than "please try again".
    post.mockRejectedValueOnce(
      new ApiError('Validation Error', 400, {
        error: 'Validation Error',
        details: [{ field: 'pH', message: 'ค่า pH ต้องอยู่ระหว่าง 0 ถึง 14', code: 'too_big' }],
      }),
    )
    await expect(generateSoilRecommendations(soil)).rejects.toThrow('pH: ค่า pH ต้องอยู่ระหว่าง 0 ถึง 14')

    post.mockRejectedValueOnce(new ApiError('Validation Error', 400, { error: 'Validation Error' }))
    await expect(generateSoilRecommendations(soil)).rejects.toThrow(
      'Failed to generate AI recommendations. Please try again.',
    )

    post.mockRejectedValueOnce(new ApiError('The AI service failed. Please try again.', 502))
    await expect(generateSoilRecommendations(soil)).rejects.toThrow(
      'Failed to generate AI recommendations. Please try again.',
    )
  })
})

describe('the frontend build', () => {
  it('does not paste a Gemini key into the bundle', () => {
    const config = readFileSync(path.resolve(__dirname, '../../../vite.config.ts'), 'utf8')
    expect(config).not.toMatch(/process\.env\.(GEMINI_)?API_KEY/)
    expect(config).not.toMatch(/env\.GEMINI_API_KEY/)
  })
})
