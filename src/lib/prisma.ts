import { PrismaClient } from "@prisma/client";

// Prevents exhausting DB connections from hot-reloading in dev, and from
// Vercel spinning up multiple lambda instances in prod. Standard pattern
// for Prisma on serverless.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
