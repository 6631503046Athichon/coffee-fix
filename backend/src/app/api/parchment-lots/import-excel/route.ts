import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import prisma from '@/lib/prisma'
import { requireAuth, requireRole, handleApiError } from '@/lib/middleware'
import { nextDisplayId, withDisplayIdRetry } from '@/lib/utils'

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

// POST /api/parchment-lots/import-excel
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request)
    requireRole(user, ['Processor', 'Admin'])

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
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const sheetName = workbook.SheetNames[0]
    if (!sheetName) {
      return NextResponse.json({ error: 'Excel file has no sheets' }, { status: 400 })
    }

    const sheet = workbook.Sheets[sheetName]
    const rawData: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 })

    if (rawData.length < 2) {
      return NextResponse.json({ error: 'Excel file must have a header row and at least one data row' }, { status: 400 })
    }

    // Map headers
    const headers = (rawData[0] as string[]).map(h => String(h || ''))
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

    for (let rowIdx = 1; rowIdx < rawData.length; rowIdx++) {
      const row = rawData[rowIdx]
      if (!row || row.every((cell: any) => cell === null || cell === undefined || cell === '')) {
        continue // skip empty rows
      }

      const rowData: Record<string, any> = {}
      for (const [colIdx, field] of Object.entries(headerMap)) {
        rowData[field] = row[parseInt(colIdx)]
      }

      // Validate required fields
      if (!rowData.processType) {
        errors.push(`Row ${rowIdx + 1}: missing Process type`)
        continue
      }
      if (!rowData.weightKg || isNaN(parseFloat(String(rowData.weightKg)))) {
        errors.push(`Row ${rowIdx + 1}: missing or invalid Weight`)
        continue
      }

      const weightKg = parseFloat(String(rowData.weightKg))
      if (weightKg <= 0) {
        errors.push(`Row ${rowIdx + 1}: weight must be positive`)
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

    // Create parchment lots in a transaction. The in-loop findMany works
    // because Postgres read-your-own-writes makes each iteration see the
    // prior tx.create rows. Inter-request races are still possible though
    // (another concurrent importer commits between our reads and writes), so
    // wrap the whole transaction in the retry helper to recover from P2002.
    const createdLots = await withDisplayIdRetry(async () => prisma.$transaction(async (tx) => {
      const lots = []
      for (const row of validRows) {
        const displayId = await nextDisplayId(tx.parchmentLot as any, 'PCH')

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
    }))

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
