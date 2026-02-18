import { PrismaClient, Prisma } from '@prisma/client'

// Transient Prisma error codes that should trigger a retry
const TRANSIENT_ERROR_CODES = new Set([
  'P1001', // Can't reach database server
  'P1008', // Operations timed out
  'P1017', // Server has closed the connection
  'P2024', // Timed out fetching a new connection from the connection pool
])

function isTransientError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return TRANSIENT_ERROR_CODES.has(error.code)
  }
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return true
  }
  if (error instanceof Error) {
    const msg = error.message.toLowerCase()
    return msg.includes('10054') ||
           msg.includes('connection reset') ||
           msg.includes('connection forcibly closed') ||
           msg.includes('econnreset') ||
           msg.includes('econnrefused')
  }
  return false
}

function delay(attempt: number): Promise<void> {
  const ms = Math.min(500 * Math.pow(2, attempt), 2000)
  return new Promise(resolve => setTimeout(resolve, ms))
}

const MAX_RETRIES = 2

const prismaClientSingleton = () => {
  const client = new PrismaClient({
    log: ['error', 'warn'],
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  })

  return client.$extends({
    query: {
      async $allOperations({ operation, model, args, query }) {
        let lastError: unknown
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
          try {
            return await query(args)
          } catch (error) {
            lastError = error
            if (attempt < MAX_RETRIES && isTransientError(error)) {
              console.warn(
                `[Prisma Retry] ${model}.${operation} failed (attempt ${attempt + 1}/${MAX_RETRIES + 1}): ${
                  error instanceof Error ? error.message.substring(0, 150) : String(error)
                }`
              )
              await delay(attempt)
              continue
            }
            throw error
          }
        }
        throw lastError
      },
    },
  })
}

declare const globalThis: {
  prismaGlobal: ReturnType<typeof prismaClientSingleton>;
} & typeof global;

// Singleton pattern - ใช้ instance เดียวกันทั้งแอป
const prisma = globalThis.prismaGlobal ?? prismaClientSingleton()

if (!globalThis.prismaGlobal) {
  globalThis.prismaGlobal = prisma
}

if (process.env.NODE_ENV !== 'production') {
  process.on('beforeExit', async () => {
    await prisma.$disconnect()
  })
}

export default prisma
