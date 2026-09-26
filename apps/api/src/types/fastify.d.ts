import "fastify";

import type { MaxInitData } from "../max/init-data.js";
import type { PrismaClient } from "../../generated/prisma/client.js";

declare module "fastify" {
  interface FastifyRequest {
    maxInitData?: MaxInitData;
    business?: { db: PrismaClient; userId: number; isAdmin: boolean };
  }
}
