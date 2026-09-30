import { isValidMaxBotName } from "./max/bot-name.js";

export type AppConfig = {
  botToken: string;
  botName: string;
  maxInitDataMaxAgeSeconds: number;
  maxOutboundEnabled: boolean;
  allowSelfRoleSwitch?: boolean;
  previewAccessRequired?: boolean;
  botTimeZone?: string;
  demoAutoEnrollHouseAddress?: string;
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
  const rawOutbound = process.env.MAX_OUTBOUND_ENABLED ?? "true";
  if (rawOutbound !== "true" && rawOutbound !== "false") throw new Error("MAX_OUTBOUND_ENABLED must be true or false");
  const preview = process.env.PREVIEW_ACCESS_REQUIRED ?? "false";
  if (preview !== "true" && preview !== "false") throw new Error("PREVIEW_ACCESS_REQUIRED must be true or false");
  const botTimeZone = process.env.BOT_TIME_ZONE ?? "Europe/Moscow";
  try { new Intl.DateTimeFormat("ru-RU", { timeZone: botTimeZone }); } catch { throw new Error("BOT_TIME_ZONE must be a valid time zone"); }

  const demoAutoEnrollHouseAddress = process.env.DEMO_AUTO_ENROLL_HOUSE_ADDRESS?.trim() || undefined;
  if (demoAutoEnrollHouseAddress && demoAutoEnrollHouseAddress.length > 512) throw new Error("DEMO_AUTO_ENROLL_HOUSE_ADDRESS must be at most 512 characters");

  return {
    botToken,
    botName,
    maxInitDataMaxAgeSeconds,
    maxOutboundEnabled: rawOutbound === "true",
    allowSelfRoleSwitch: rawSelfRoleSwitch === "true",
    previewAccessRequired: preview === "true",
    botTimeZone,
    demoAutoEnrollHouseAddress,
  };
}
