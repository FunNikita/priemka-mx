import { PrismaUserRepository } from "../repositories/prisma-user-repository.js";
import { seedDemo, seedDemoWorkflow } from "../demo/seed-demo.js";

const repository = new PrismaUserRepository();
try {
  const result = await seedDemo(repository.prisma);
  await seedDemoWorkflow(repository.prisma);
  process.stdout.write(`Demo data ready: ${JSON.stringify(result)}\n`);
} finally {
  await repository.close();
}
