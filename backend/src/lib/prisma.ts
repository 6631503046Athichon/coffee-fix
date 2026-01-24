import { PrismaClient } from '@prisma/client'

const prismaClientSingleton = () => {
  // For serverless environments (Vercel), we need to reuse connections
  // Prisma Client automatically manages connection pooling, but we need
  // to ensure we're using a singleton pattern to avoid creating multiple instances
  
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  })
}

declare const globalThis: {
  prismaGlobal: ReturnType<typeof prismaClientSingleton>;
} & typeof global;

// Singleton pattern - ใช้ instance เดียวกันทั้งแอป
// ใน serverless (Vercel) แต่ละ invocation อาจสร้าง instance ใหม่
// แต่เราจะเก็บไว้ใน globalThis เพื่อ reuse connection
// 
// IMPORTANT: For Vercel deployment, you MUST use a connection pooler:
// 1. Use Prisma Accelerate (recommended): https://www.prisma.io/docs/accelerate
// 2. Or use PgBouncer with your DATABASE_URL:
//    postgresql://user:pass@host:port/db?pgbouncer=true&connection_limit=1
// 3. Or use Vercel Postgres with connection pooling enabled
const prisma = globalThis.prismaGlobal ?? prismaClientSingleton()

// เก็บ instance ไว้ใน globalThis ทั้ง development และ production
// เพื่อ reuse connection ใน serverless environment
// This is critical for Vercel serverless functions
if (!globalThis.prismaGlobal) {
  globalThis.prismaGlobal = prisma
}

// Cleanup on process exit (optional, but good practice)
if (process.env.NODE_ENV !== 'production') {
  process.on('beforeExit', async () => {
    await prisma.$disconnect()
  })
}

export default prisma

