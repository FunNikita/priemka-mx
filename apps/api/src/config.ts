export type AppConfig = {
  botToken: string;
  maxInitDataMaxAgeSeconds: number;
};

export function getConfig(): AppConfig {
  const botToken = process.env.MAX_BOT_TOKEN;
  if (!botToken) throw new Error("MAX_BOT_TOKEN is required");

  const rawMaxAge = process.env.MAX_INIT_DATA_MAX_AGE_SECONDS ?? "3600";
  const maxInitDataMaxAgeSeconds = Number(rawMaxAge);
  if (!Number.isFinite(maxInitDataMaxAgeSeconds) || !Number.isInteger(maxInitDataMaxAgeSeconds) || maxInitDataMaxAgeSeconds <= 0) {
    throw new Error("MAX_INIT_DATA_MAX_AGE_SECONDS must be a positive finite integer");
  }

  return {
    botToken,
    maxInitDataMaxAgeSeconds,
  };
}
