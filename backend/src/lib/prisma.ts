// Load environment variables before importing PrismaClient
import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env file from backend directory
config({ path: resolve(process.cwd(), '.env') });

import { PrismaClient } from '@prisma/client'

const prismaClientSingleton = () => {
  return new PrismaClient({
    log: ['error', 'warn'],
  })
}

declare const globalThis: {
  prismaGlobal: ReturnType<typeof prismaClientSingleton>;
} & typeof global;

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

