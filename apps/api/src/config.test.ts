import { afterEach, describe, expect, it } from "vitest";

import { getConfig } from "./config.js";

const original = process.env.MAX_INIT_DATA_MAX_AGE_SECONDS;
const originalBotToken = process.env.MAX_BOT_TOKEN;

afterEach(() => {
  if (original === undefined) delete process.env.MAX_INIT_DATA_MAX_AGE_SECONDS;
  else process.env.MAX_INIT_DATA_MAX_AGE_SECONDS = original;
  if (originalBotToken === undefined) delete process.env.MAX_BOT_TOKEN;
  else process.env.MAX_BOT_TOKEN = originalBotToken;
});

describe("MAX_INIT_DATA_MAX_AGE_SECONDS", () => {
  it.each(["0", "-1", "1.5", "Infinity", "NaN", "not-a-number"])("rejects %s", (value) => {
    process.env.MAX_BOT_TOKEN = "test-token";
    process.env.MAX_INIT_DATA_MAX_AGE_SECONDS = value;
    expect(() => getConfig()).toThrow("positive finite integer");
  });
});
