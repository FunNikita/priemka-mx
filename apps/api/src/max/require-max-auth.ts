import type { preHandlerHookHandler } from "fastify";
import type { PrismaClient } from "../../generated/prisma/client.js";

import { MaxInitDataError, validateMaxInitData } from "./init-data.js";

export function requireMaxAuth(botToken: string, maxAgeSeconds: number, now: () => Date, preview?: { required: boolean; db: PrismaClient | null }): preHandlerHookHandler {
  return async (request, reply) => {
    const header = request.headers["x-max-init-data"];
    if (typeof header !== "string") {
      return reply.code(401).send({ message: "Недействительные данные запуска MAX" });
    }

    try {
      request.maxInitData = validateMaxInitData(header, botToken, maxAgeSeconds, now());
      if (preview?.required) {
        if (!preview.db) return reply.code(503).send({ message: "База данных недоступна" });
        const maxUserId = request.maxInitData.user.id;
        const access = await preview.db.previewAccess.findUnique({ where: { maxUserId } });
        if (!access?.enabled) return reply.code(403).send({ message: "Доступ к тестированию пока не открыт", code: "PREVIEW_ACCESS_DENIED", maxUserId });
      }
    } catch (error) {
      if (error instanceof MaxInitDataError) {
        return reply.code(401).send({ message: "Недействительные данные запуска MAX" });
      }
      throw error;
    }
  };
}
