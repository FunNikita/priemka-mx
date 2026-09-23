import type { preHandlerHookHandler } from "fastify";

import { MaxInitDataError, validateMaxInitData } from "./init-data.js";

export function requireMaxAuth(botToken: string, maxAgeSeconds: number, now: () => Date): preHandlerHookHandler {
  return async (request, reply) => {
    const header = request.headers["x-max-init-data"];
    if (typeof header !== "string") {
      return reply.code(401).send({ message: "Недействительные данные запуска MAX" });
    }

    try {
      request.maxInitData = validateMaxInitData(header, botToken, maxAgeSeconds, now());
    } catch (error) {
      if (error instanceof MaxInitDataError) {
        return reply.code(401).send({ message: "Недействительные данные запуска MAX" });
      }
      throw error;
    }
  };
}
