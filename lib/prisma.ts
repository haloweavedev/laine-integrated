import { PrismaClient } from '@prisma/client';

// This function creates a new PrismaClient instance.
const prismaClientSingleton = () => {
  return new PrismaClient();
};

// Define a type for the singleton instance.
type PrismaClientSingleton = ReturnType<typeof prismaClientSingleton>;

// Augment the global scope to include a potential 'prisma' property.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClientSingleton | undefined;
};

// Use the cached instance if it exists, otherwise create a new one.
const prisma = globalForPrisma.prisma ?? prismaClientSingleton();

// Export the singleton instance.
export { prisma };

// In non-production environments, cache the instance on the global object.
// This prevents hot-reloading from creating a flood of new connections during development.
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
} 