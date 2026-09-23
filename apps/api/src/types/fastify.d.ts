import "fastify";

import type { MaxInitData } from "../max/init-data.js";

declare module "fastify" {
  interface FastifyRequest {
    maxInitData?: MaxInitData;
  }
}
