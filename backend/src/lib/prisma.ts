import { PrismaClient } from '@prisma/client'

const prismaClientSingleton = () => {
  return new PrismaClient()
}

declare const globalThis: {
  prismaGlobal: ReturnType<typeof prismaClientSingleton>;
} & typeof global;

// Singleton pattern - ใช้ instance เดียวกันทั้งแอป
const prisma = globalThis.prismaGlobal ?? prismaClientSingleton()

export default prisma

// ใน development mode - เก็บ instance ไว้ใน globalThis
if (process.env.NODE_ENV !== 'production') {
  globalThis.prismaGlobal = prisma
}

