import { afterEach, describe, expect, it } from "vitest";

import { getConfig } from "./config.js";
import { isValidMaxBotName } from "./max/bot-name.js";

const original = process.env.MAX_INIT_DATA_MAX_AGE_SECONDS;
const originalBotToken = process.env.MAX_BOT_TOKEN;
const originalBotName = process.env.MAX_BOT_NAME;
const originalSelfRoleSwitch = process.env.ALLOW_SELF_ROLE_SWITCH;

afterEach(() => {
  if (original === undefined) delete process.env.MAX_INIT_DATA_MAX_AGE_SECONDS;
  else process.env.MAX_INIT_DATA_MAX_AGE_SECONDS = original;
  if (originalBotToken === undefined) delete process.env.MAX_BOT_TOKEN;
  else process.env.MAX_BOT_TOKEN = originalBotToken;
  if (originalBotName === undefined) delete process.env.MAX_BOT_NAME;
  else process.env.MAX_BOT_NAME = originalBotName;
  if (originalSelfRoleSwitch === undefined) delete process.env.ALLOW_SELF_ROLE_SWITCH;
  else process.env.ALLOW_SELF_ROLE_SWITCH = originalSelfRoleSwitch;
});

describe("ALLOW_SELF_ROLE_SWITCH", () => {
  it("reads strict boolean values", () => {
    process.env.MAX_BOT_TOKEN = "test-token";
    process.env.MAX_BOT_NAME = "PriemkaDemoBot";
    process.env.ALLOW_SELF_ROLE_SWITCH = "true";
    expect(getConfig().allowSelfRoleSwitch).toBe(true);
    process.env.ALLOW_SELF_ROLE_SWITCH = "false";
    expect(getConfig().allowSelfRoleSwitch).toBe(false);
    process.env.ALLOW_SELF_ROLE_SWITCH = "yes";
    expect(() => getConfig()).toThrow("ALLOW_SELF_ROLE_SWITCH");
  });
});

describe("MAX_INIT_DATA_MAX_AGE_SECONDS", () => {
  it.each(["0", "-1", "1.5", "Infinity", "NaN", "not-a-number"])("rejects %s", (value) => {
    process.env.MAX_BOT_TOKEN = "test-token";
    process.env.MAX_BOT_NAME = "PriemkaDemoBot";
    process.env.MAX_INIT_DATA_MAX_AGE_SECONDS = value;
    expect(() => getConfig()).toThrow("positive finite integer");
  });
});

describe("MAX_BOT_NAME", () => {
  it("uses the same lightweight validator for config and document links", () => {
    expect(isValidMaxBotName("Abc_5")).toBe(true);
    expect(isValidMaxBotName("a".repeat(64))).toBe(true);
    for (const name of ["abcd", "a".repeat(65), "bad-name", "имябота"]) expect(isValidMaxBotName(name)).toBe(false);
  });
  it("rejects missing and invalid names at startup", () => {
    process.env.MAX_BOT_TOKEN = "test-token";
    delete process.env.MAX_BOT_NAME;
    expect(() => getConfig()).toThrow("MAX_BOT_NAME");
    process.env.MAX_BOT_NAME = "bad-name";
    expect(() => getConfig()).toThrow("MAX_BOT_NAME");
    process.env.MAX_BOT_NAME = "PriemkaDemoBot";
    expect(getConfig().botName).toBe("PriemkaDemoBot");
  });
});
