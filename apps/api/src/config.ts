import { isValidMaxBotName } from "./max/bot-name.js";

export type AppConfig = {
  botToken: string;
  botName: string;
  maxInitDataMaxAgeSeconds: number;
  allowSelfRoleSwitch?: boolean;
};

export function getConfig(): AppConfig {
  const botToken = process.env.MAX_BOT_TOKEN;
  if (!botToken) throw new Error("MAX_BOT_TOKEN is required");
  const botName = process.env.MAX_BOT_NAME;
  if (!botName || !isValidMaxBotName(botName)) throw new Error("MAX_BOT_NAME must be a valid MAX bot name");

  const rawMaxAge = process.env.MAX_INIT_DATA_MAX_AGE_SECONDS ?? "3600";
  const maxInitDataMaxAgeSeconds = Number(rawMaxAge);
  if (!Number.isFinite(maxInitDataMaxAgeSeconds) || !Number.isInteger(maxInitDataMaxAgeSeconds) || maxInitDataMaxAgeSeconds <= 0) {
    throw new Error("MAX_INIT_DATA_MAX_AGE_SECONDS must be a positive finite integer");
  }
  const rawSelfRoleSwitch = process.env.ALLOW_SELF_ROLE_SWITCH ?? "false";
  if (rawSelfRoleSwitch !== "true" && rawSelfRoleSwitch !== "false") throw new Error("ALLOW_SELF_ROLE_SWITCH must be true or false");

  return {
    botToken,
    botName,
    maxInitDataMaxAgeSeconds,
    allowSelfRoleSwitch: rawSelfRoleSwitch === "true",
  };
}
