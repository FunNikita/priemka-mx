import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { afterEach, expect, it, vi } from "vitest";
import { createOperationalLogStream } from "./operational-log.js";

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

it("writes daily JSONL and asynchronously compresses the previous day", async () => {
  const directory = await mkdtemp(join(tmpdir(), "priemka-logs-test-"));
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-27T23:59:50Z"));
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  try {
    const stream = createOperationalLogStream(directory, 14);
    stream.write('{"event":"http_request","statusCode":200}\n');
    vi.setSystemTime(new Date("2026-09-28T00:00:01Z"));
    stream.write('{"event":"http_request","statusCode":404}\n');
    await stream.close();
    for (let attempt = 0; attempt < 30 && !(await readdir(directory)).some((name) => name.endsWith(".gz")); attempt++) await new Promise((resolve) => setTimeout(resolve, 20));
    expect(gunzipSync(await readFile(join(directory, "priemka-2026-09-27.jsonl.gz"))).toString()).toContain('"statusCode":200');
    expect(await readFile(join(directory, "priemka-2026-09-28.jsonl"), "utf8")).toContain('"statusCode":404');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
