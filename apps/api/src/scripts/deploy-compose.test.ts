import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

it.each([
  ["false", false],
  ["true", true],
  [null, true],
])("deploy skips MAX webhook only when outbound is %s", (outbound, expectWebhook) => {
  const root = mkdtempSync(join(tmpdir(), "priemka-deploy-test-"));
  try {
    const scripts = join(root, "scripts");
    const bin = join(root, "bin");
    mkdirSync(scripts);
    mkdirSync(bin);
    copyFileSync(fileURLToPath(new URL("../../../../scripts/deploy-compose.sh", import.meta.url)), join(scripts, "deploy-compose.sh"));
    writeFileSync(join(root, ".env"), `APP_PORT=33302\nPUBLIC_BASE_URL=https://example.test\n${outbound === null ? "" : `MAX_OUTBOUND_ENABLED=${outbound}\n`}`);
    const log = join(root, "docker.log");
    const docker = join(bin, "docker");
    writeFileSync(docker, '#!/bin/sh\nprintf "%s\\n" "$*" >> "$TEST_DOCKER_LOG"\n');
    chmodSync(docker, 0o755);
    const curl = join(bin, "curl");
    writeFileSync(curl, "#!/bin/sh\nexit 0\n");
    chmodSync(curl, 0o755);
    const env: NodeJS.ProcessEnv = { ...process.env, PATH: `${bin}:${process.env.PATH}`, TEST_DOCKER_LOG: log };
    delete env.MAX_OUTBOUND_ENABLED;
    const output = execFileSync("bash", [join(scripts, "deploy-compose.sh")], { env, encoding: "utf8" });
    expect(readFileSync(log, "utf8").includes("ensure-max-webhook.js")).toBe(expectWebhook);
    expect(output.includes("настройка webhook пропущена")).toBe(!expectWebhook);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
