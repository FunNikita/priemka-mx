import { afterEach, describe, expect, it } from "vitest";

import { getConfig } from "./config.js";
import { isValidMaxBotName } from "./max/bot-name.js";

const original = process.env.MAX_INIT_DATA_MAX_AGE_SECONDS;
const originalBotToken = process.env.MAX_BOT_TOKEN;
const originalBotName = process.env.MAX_BOT_NAME;
const originalSelfRoleSwitch = process.env.ALLOW_SELF_ROLE_SWITCH;
const originalPreview = process.env.PREVIEW_ACCESS_REQUIRED;
const originalTimeZone = process.env.BOT_TIME_ZONE;
const originalOutbound = process.env.MAX_OUTBOUND_ENABLED;

afterEach(() => {
  if (original === undefined) delete process.env.MAX_INIT_DATA_MAX_AGE_SECONDS;
  else process.env.MAX_INIT_DATA_MAX_AGE_SECONDS = original;
  if (originalBotToken === undefined) delete process.env.MAX_BOT_TOKEN;
  else process.env.MAX_BOT_TOKEN = originalBotToken;
  if (originalBotName === undefined) delete process.env.MAX_BOT_NAME;
  else process.env.MAX_BOT_NAME = originalBotName;
  if (originalSelfRoleSwitch === undefined) delete process.env.ALLOW_SELF_ROLE_SWITCH;
  else process.env.ALLOW_SELF_ROLE_SWITCH = originalSelfRoleSwitch;
  if (originalPreview === undefined) delete process.env.PREVIEW_ACCESS_REQUIRED;
  else process.env.PREVIEW_ACCESS_REQUIRED = originalPreview;
  if (originalTimeZone === undefined) delete process.env.BOT_TIME_ZONE;
  else process.env.BOT_TIME_ZONE = originalTimeZone;
  if (originalOutbound === undefined) delete process.env.MAX_OUTBOUND_ENABLED;
  else process.env.MAX_OUTBOUND_ENABLED = originalOutbound;
});

describe("MAX_OUTBOUND_ENABLED", () => {
  it("defaults to true and accepts only explicit booleans", () => {
    process.env.MAX_BOT_TOKEN = "test-token";
    process.env.MAX_BOT_NAME = "PriemkaDemoBot";
    delete process.env.MAX_OUTBOUND_ENABLED;
    expect(getConfig().maxOutboundEnabled).toBe(true);
    process.env.MAX_OUTBOUND_ENABLED = "false";
    expect(getConfig().maxOutboundEnabled).toBe(false);
    process.env.MAX_OUTBOUND_ENABLED = "invalid";
    expect(() => getConfig()).toThrow("MAX_OUTBOUND_ENABLED must be true or false");
  });
});

describe("preview and bot time zone", () => {
  it("defaults preview off and validates explicit settings", () => {
    process.env.MAX_BOT_TOKEN = "test-token";
    process.env.MAX_BOT_NAME = "PriemkaDemoBot";
    delete process.env.PREVIEW_ACCESS_REQUIRED;
    delete process.env.BOT_TIME_ZONE;
    expect(getConfig()).toEqual(expect.objectContaining({ previewAccessRequired: false, botTimeZone: "Europe/Moscow" }));
    process.env.PREVIEW_ACCESS_REQUIRED = "true";
    expect(getConfig().previewAccessRequired).toBe(true);
    process.env.PREVIEW_ACCESS_REQUIRED = "yes";
    expect(() => getConfig()).toThrow("PREVIEW_ACCESS_REQUIRED");
    process.env.PREVIEW_ACCESS_REQUIRED = "false";
    process.env.BOT_TIME_ZONE = "Not/AZone";
    expect(() => getConfig()).toThrow("BOT_TIME_ZONE");
  });
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

it("normalizes the optional demo address and rejects oversized configuration", () => {
  const before = process.env.DEMO_AUTO_ENROLL_HOUSE_ADDRESS;
  process.env.MAX_BOT_TOKEN = "test-token";
  process.env.MAX_BOT_NAME = "PriemkaDemoBot";
  try {
    delete process.env.DEMO_AUTO_ENROLL_HOUSE_ADDRESS;
    expect(getConfig().demoAutoEnrollHouseAddress).toBeUndefined();
    process.env.DEMO_AUTO_ENROLL_HOUSE_ADDRESS = "  ";
    expect(getConfig().demoAutoEnrollHouseAddress).toBeUndefined();
    process.env.DEMO_AUTO_ENROLL_HOUSE_ADDRESS = "  Exact house  ";
    expect(getConfig().demoAutoEnrollHouseAddress).toBe("Exact house");
    process.env.DEMO_AUTO_ENROLL_HOUSE_ADDRESS = "x".repeat(513);
    expect(() => getConfig()).toThrow("at most 512");
  } finally {
    if (before === undefined) delete process.env.DEMO_AUTO_ENROLL_HOUSE_ADDRESS;
    else process.env.DEMO_AUTO_ENROLL_HOUSE_ADDRESS = before;
  }
});

it("defaults demo auto-approval to false and accepts only boolean values", () => {
  const before = process.env.DEMO_AUTO_APPROVE_JOIN_REQUESTS;
  process.env.MAX_BOT_TOKEN = "test-token"; process.env.MAX_BOT_NAME = "PriemkaDemoBot";
  try {
    delete process.env.DEMO_AUTO_APPROVE_JOIN_REQUESTS; expect(getConfig().demoAutoApproveJoinRequests).toBe(false);
    for (const value of ["false", "true"]) { process.env.DEMO_AUTO_APPROVE_JOIN_REQUESTS = value; expect(getConfig().demoAutoApproveJoinRequests).toBe(value === "true"); }
    process.env.DEMO_AUTO_APPROVE_JOIN_REQUESTS = "yes"; expect(() => getConfig()).toThrow("must be true or false");
  } finally { if (before === undefined) delete process.env.DEMO_AUTO_APPROVE_JOIN_REQUESTS; else process.env.DEMO_AUTO_APPROVE_JOIN_REQUESTS = before; }
});
