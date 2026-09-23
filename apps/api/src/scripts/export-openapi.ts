import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { createApp } from "../app.js";

const app = await createApp({
  config: { botToken: "openapi-export-placeholder", maxInitDataMaxAgeSeconds: 3600 },
  userRepository: { isReady: async () => false, upsertFromMax: async () => undefined },
  logger: false,
});
try {
  await app.ready();
  const document = app.swagger({ yaml: false });
  const target = resolve(import.meta.dirname, "../../../../docs/openapi.json");
  await mkdir(resolve(target, ".."), { recursive: true });
  await writeFile(target, `${JSON.stringify(document, null, 2)}\n`);
} finally {
  await app.close();
}
