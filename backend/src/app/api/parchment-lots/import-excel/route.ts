import { NextRequest, NextResponse } from 'next/server'
import { rateLimit, RATE_LIMITS } from '@/lib/rateLimit'
import ExcelJS from 'exceljs'
import prisma from '@/lib/prisma'
import { requireAuth, requireRole, handleApiError } from '@/lib/middleware'
import { nextDisplayIds, withDisplayIdRetry } from '@/lib/utils'

// Column name mapping (Thai + English variations)
const COLUMN_MAP: Record<string, string> = {
  // Code
  'code': 'code',
  'Code': 'code',
  'รหัส': 'code',
  // Process type
  'process': 'processType',
  'Process': 'processType',
  'กระบวนการ': 'processType',
  // Variety
  'สายพันธุ์': 'variety',
  'variety': 'variety',
  'Variety': 'variety',
  // Origin / Source
  'แหล่ง': 'origin',
  'แหล่งที่มา': 'origin',
  'source': 'origin',
  'Source': 'origin',
  'Origin': 'origin',
  // Weight
  'weight': 'weightKg',
  'Weight': 'weightKg',
  'Weight (kg)': 'weightKg',
  'น้ำหนัก': 'weightKg',
  'น้ำหนัก (kg)': 'weightKg',
  // Moisture
  'moisture': 'moistureContent',
  'Moisture': 'moistureContent',
  'Moisture %': 'moistureContent',
  'ความชื้น': 'moistureContent',
  'ความชื้น %': 'moistureContent',
}

function normalizeHeader(h: string): string {
  return h.trim()
}

function mapHeaders(rawHeaders: string[]): Record<number, string> {
  const mapping: Record<number, string> = {}
  for (let i = 0; i < rawHeaders.length; i++) {
    const normalized = normalizeHeader(rawHeaders[i])
    const mapped = COLUMN_MAP[normalized]
    if (mapped) {
      mapping[i] = mapped
    }
  }
  return mapping
}

// ExcelJS cell values can be primitives, dates, formula results, or rich text.
// Coerce to the plain scalar callers expect (matches XLSX.utils.sheet_to_json output).
function cellToScalar(value: unknown): unknown {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') {
    // Formula result: { formula, result }
    if ('result' in (value as Record<string, unknown>)) {
      return cellToScalar((value as { result: unknown }).result)
    }
    // Rich text: { richText: [{ text }, ...] }
    if ('richText' in (value as Record<string, unknown>)) {
      const parts = (value as { richText: Array<{ text?: string }> }).richText
      return parts.map(p => p.text ?? '').join('')
    }
    // Hyperlink: { text, hyperlink }
    if ('text' in (value as Record<string, unknown>)) {
      return (value as { text: unknown }).text
    }
    // Error cell: { error: '#REF!' }
    if ('error' in (value as Record<string, unknown>)) {
      return ''
    }
    // Date or anything else with toString
    if (value instanceof Date) return value
  }
  return value
}

// Convert an ExcelJS row.values array (1-indexed: index 0 is always undefined)
// into a 0-indexed array of scalar values aligned with the header row width.
function rowValuesTo0Indexed(rowValues: unknown, headerWidth: number): unknown[] {
  if (!Array.isArray(rowValues)) return []
  const out: unknown[] = []
  // Drop ExcelJS's leading undefined at index 0, then take up to headerWidth.
  for (let i = 1; i <= headerWidth; i++) {
    out.push(cellToScalar(rowValues[i]))
  }
  return out
}

// POST /api/parchment-lots/import-excel
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request)
    requireRole(user, ['Processor', 'Admin'])

    // Excel imports are expensive (parse + transactional bulk insert).
    // Cap at 10/min per user to stop a stuck client retry-looping or a
    // malicious double-click spamming a 5,000-row sheet.
    const limited = await rateLimit(request, {
      ...RATE_LIMITS.EXPENSIVE,
      keyFn: () => `user:${user.id}`,
    })
    if (limited) return limited

    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Validate file size (5MB limit)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large. Maximum size is 5MB' }, { status: 400 })
    }

    // Validate file type
    const validExtensions = ['.xlsx', '.xls']
    const fileName = file.name.toLowerCase()
    if (!validExtensions.some(ext => fileName.endsWith(ext))) {
      return NextResponse.json({ error: 'Invalid file type. Only .xlsx and .xls files are accepted' }, { status: 400 })
    }

    // Parse Excel
    const buffer = Buffer.from(await file.arrayBuffer())
    const workbook = new ExcelJS.Workbook()
    try {
      // ExcelJS expects an ArrayBuffer-like; Buffer works at runtime but the
      // typing wants ArrayBuffer, hence the cast.
      await workbook.xlsx.load(buffer as unknown as ArrayBuffer)
    } catch {
      return NextResponse.json({ error: 'Failed to parse Excel file' }, { status: 400 })
    }

    const sheet = workbook.worksheets[0]
    if (!sheet) {
      return NextResponse.json({ error: 'Excel file has no sheets' }, { status: 400 })
    }

    // Build a 2-D array of rows mirroring the old XLSX.utils.sheet_to_json shape.
    // ExcelJS row.values are 1-indexed and may include trailing sparse holes,
    // so we anchor everything to the header row's width.
    const headerRowValues = sheet.getRow(1).values
    if (!Array.isArray(headerRowValues) || headerRowValues.length <= 1) {
      return NextResponse.json({ error: 'Excel file must have a header row and at least one data row' }, { status: 400 })
    }

    // headerRowValues is 1-indexed; usable header count = length - 1.
    const headerWidth = headerRowValues.length - 1
    const rawData: unknown[][] = []
    rawData.push(rowValuesTo0Indexed(headerRowValues, headerWidth))

    // Walk data rows. eachRow with includeEmpty:false skips fully blank rows
    // but preserves original row numbers so error messages stay accurate.
    const dataRows: Array<{ rowNumber: number; values: unknown[] }> = []
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return // header
      dataRows.push({ rowNumber, values: rowValuesTo0Indexed(row.values, headerWidth) })
    })

    if (dataRows.length === 0) {
      return NextResponse.json({ error: 'Excel file must have a header row and at least one data row' }, { status: 400 })
    }

    // Map headers
    const headers = rawData[0].map(h => String(h ?? ''))
    const headerMap = mapHeaders(headers)

    // Check required columns exist
    const mappedFields = new Set(Object.values(headerMap))
    const requiredFields = ['processType', 'weightKg']
    const missingFields = requiredFields.filter(f => !mappedFields.has(f))
    if (missingFields.length > 0) {
      return NextResponse.json({
        error: `Missing required columns: ${missingFields.join(', ')}. Expected columns: Process/กระบวนการ, Weight/น้ำหนัก`,
      }, { status: 400 })
    }

    // Parse rows
    const errors: string[] = []
    const validRows: Array<{
      code?: string
      processType: string
      variety?: string
      origin?: string
      weightKg: number
      moistureContent: number
    }> = []

    for (const { rowNumber, values: row } of dataRows) {
      if (!row || row.every(cell => cell === null || cell === undefined || cell === '')) {
        continue // skip empty rows
      }

      const rowData: Record<string, unknown> = {}
      for (const [colIdx, field] of Object.entries(headerMap)) {
        rowData[field] = row[parseInt(colIdx)]
      }

      // Validate required fields
      if (!rowData.processType) {
        errors.push(`Row ${rowNumber}: missing Process type`)
        continue
      }
      if (!rowData.weightKg || isNaN(parseFloat(String(rowData.weightKg)))) {
        errors.push(`Row ${rowNumber}: missing or invalid Weight`)
        continue
      }

      const weightKg = parseFloat(String(rowData.weightKg))
      if (weightKg <= 0) {
        errors.push(`Row ${rowNumber}: weight must be positive`)
        continue
      }

      validRows.push({
        code: rowData.code ? String(rowData.code).trim() : undefined,
        processType: String(rowData.processType).trim(),
        variety: rowData.variety ? String(rowData.variety).trim() : undefined,
        origin: rowData.origin ? String(rowData.origin).trim() : undefined,
        weightKg,
        moistureContent: rowData.moistureContent ? parseFloat(String(rowData.moistureContent)) : 0,
      })
    }

    if (validRows.length === 0) {
      return NextResponse.json({
        imported: 0,
        skipped: errors.length,
        errors,
        parchmentLots: [],
      })
    }

    // Create parchment lots in a transaction. We pre-allocate all N displayIds
    // in ONE read against the committed table state (outside the tx), then run
    // N creates inside the tx. The previous implementation re-ran
    // `nextDisplayId` inside each iteration — O(N) findMany scans, i.e. O(N^2)
    // total IO for large imports. Inter-request races are still possible (a
    // concurrent importer commits between our pre-read and our writes), so the
    // whole block is wrapped in `withDisplayIdRetry` to recover from P2002 on
    // displayId by re-allocating from a fresh read.
    const createdLots = await withDisplayIdRetry(async () => {
      const displayIds = await nextDisplayIds(prisma.parchmentLot, 'PCH', validRows.length)
      return prisma.$transaction(async (tx) => {
        const lots = []
        for (let i = 0; i < validRows.length; i++) {
          const row = validRows[i]
          const displayId = displayIds[i]

          const lot = await tx.parchmentLot.create({
            data: {
              displayId,
              sourceType: 'External',
              externalSource: {
                code: row.code || displayId,
                variety: row.variety || '',
                origin: row.origin || '',
                importDate: new Date().toISOString(),
                importedBy: user.id,
                fileName: file.name,
              },
              initialWeightKg: row.weightKg,
              currentWeightKg: row.weightKg,
              moistureContent: row.moistureContent,
              processType: row.processType,
              status: 'AwaitingHulling',
            },
            include: {
              processingBatch: {
                select: { id: true, processType: true, status: true },
              },
              harvestLot: {
                select: { id: true, farmerName: true, cherryVariety: true },
              },
              physicalTestResults: true,
              withdrawalHistory: { orderBy: { date: 'desc' as const } },
            },
          })
          lots.push(lot)
        }
        return lots
      })
    })

    return NextResponse.json({
      imported: createdLots.length,
      skipped: errors.length,
      errors,
      parchmentLots: createdLots,
      message: `Successfully imported ${createdLots.length} parchment lot(s)`,
    }, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}
