import { createReadStream, createWriteStream, existsSync, mkdirSync } from "node:fs";
import { readdir, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";

// Pino writes each JSON record as one line. This sink never blocks an HTTP handler on gzip.
export function createOperationalLogStream(directory: string, retentionDays: number) {
  mkdirSync(directory, { recursive: true });
  const day = () => new Date().toISOString().slice(0, 10);
  const fileName = (date: string) => join(directory, `priemka-${date}.jsonl`);
  let currentDay = day();
  let stream = createWriteStream(fileName(currentDay), { flags: "a", mode: 0o600 });
  const pending = new Set<Promise<unknown>>();
  const track = (task: Promise<unknown>) => {
    const tracked = task.catch(() => { process.stderr.write("operational log rotation failed\n"); });
    pending.add(tracked);
    void tracked.then(() => pending.delete(tracked));
  };
  stream.on("error", () => process.stderr.write("operational log file write failed\n"));
  const compress = async (date: string) => {
    const source = fileName(date), archive = `${source}.gz`, temporary = `${archive}.tmp`;
    if (!existsSync(source) || existsSync(archive)) return;
    try {
      await pipeline(createReadStream(source), createGzip(), createWriteStream(temporary, { mode: 0o600 }));
      await rename(temporary, archive);
      await unlink(source);
    } catch { try { await unlink(temporary); } catch { /* no temporary file */ } }
  };
  const sweep = async () => {
    const files = await readdir(directory);
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    for (const name of files) {
      const match = /^priemka-(\d{4}-\d{2}-\d{2})\.jsonl(?:\.gz)?$/.exec(name);
      if (!match) continue;
      if (name.endsWith(".jsonl") && match[1] !== currentDay) await compress(match[1]);
      if (new Date(`${match[1]}T00:00:00Z`).getTime() < cutoff) try { await unlink(join(directory, name)); } catch { /* already gone */ }
    }
  };
  track(sweep());
  return {
    write(line: string) {
      process.stdout.write(line);
      const today = day();
      if (today !== currentDay) {
        const previous = currentDay, old = stream;
        currentDay = today;
        stream = createWriteStream(fileName(today), { flags: "a", mode: 0o600 });
        stream.on("error", () => process.stderr.write("operational log file write failed\n"));
        track(new Promise<void>((resolve) => old.end(resolve)).then(() => compress(previous)).then(sweep));
      }
      stream.write(line);
    },
    async close() {
      await new Promise<void>((resolve) => stream.end(resolve));
      await Promise.allSettled([...pending]);
    },
  };
}
