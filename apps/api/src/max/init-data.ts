import { createHmac, timingSafeEqual } from "node:crypto";

export type MaxUser = {
  id: string;
  firstName: string;
  lastName: string;
  username: string | null;
  languageCode: string;
  photoUrl: string | null;
};

export type MaxInitData = {
  authDate: number;
  queryId?: string;
  ip?: string;
  chat?: { id: string; type: "DIALOG" | "CHAT" | "CHANNEL" };
  startParam?: string;
  user: MaxUser;
};

export class MaxInitDataError extends Error {}

function decode(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    throw new MaxInitDataError("MAX initData contains malformed URL encoding");
  }
}

function parsePairs(initData: string): Array<[string, string]> {
  if (!initData) throw new MaxInitDataError("MAX initData is empty");

  const seen = new Set<string>();
  return initData.split("&").map((part) => {
    const separator = part.indexOf("=");
    if (separator <= 0) throw new MaxInitDataError("MAX initData contains malformed parameter");

    const key = part.slice(0, separator);
    const value = decode(part.slice(separator + 1));
    if (seen.has(key)) throw new MaxInitDataError("MAX initData contains duplicate parameter");
    seen.add(key);
    return [key, value];
  });
}

function hmac(key: string | Buffer, value: string): Buffer {
  return createHmac("sha256", key).update(value).digest();
}

function readMaxUser(rawUser: string): MaxUser {
  const { value: user, id } = parseObjectWithId(rawUser, "MAX initData user.id", false);
  const requiredString = (key: string): string => {
    if (typeof user[key] !== "string") throw new MaxInitDataError(`MAX user.${key} is invalid`);
    return user[key];
  };
  const nullableString = (key: string): string | null => {
    if (user[key] !== null && typeof user[key] !== "string") {
      throw new MaxInitDataError(`MAX user.${key} is invalid`);
    }
    return user[key] as string | null;
  };

  return {
    id,
    firstName: requiredString("first_name"),
    lastName: requiredString("last_name"),
    username: nullableString("username"),
    languageCode: requiredString("language_code"),
    photoUrl: nullableString("photo_url"),
  };
}

function readChat(rawChat: string | undefined): MaxInitData["chat"] {
  if (rawChat === undefined) return undefined;
  try {
    const { value, id } = parseObjectWithId(rawChat, "MAX initData chat.id", true);
    if (value.type !== "DIALOG" && value.type !== "CHAT" && value.type !== "CHANNEL") throw new Error();
    return { id, type: value.type };
  } catch {
    throw new MaxInitDataError("MAX initData chat is invalid");
  }
}

const idField = /"id"\s*:\s*(-?(?:0|[1-9]\d*))(?=\s*[,}])/g;

function parseObjectWithId(rawValue: string, fieldName: string, allowNegative: boolean): { value: Record<string, unknown>; id: string } {
  // Quote the signed numeric lexeme before JSON.parse so IDs never become JS Numbers.
  const matches = [...rawValue.matchAll(idField)];
  if (matches.length !== 1) {
    throw new MaxInitDataError(`${fieldName} is invalid`);
  }
  const id = matches[0][1];
  const value = BigInt(id);
  if (id === "-0" || value > 9223372036854775807n || value < (allowNegative ? -9223372036854775808n : 1n)) {
    throw new MaxInitDataError(`${fieldName} is invalid`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawValue.replace(idField, (_match, numericId: string) => `"id":"${numericId}"`));
  } catch {
    throw new MaxInitDataError(`${fieldName} is invalid`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || (parsed as Record<string, unknown>).id !== id) {
    throw new MaxInitDataError(`${fieldName} is invalid`);
  }
  return { value: parsed as Record<string, unknown>, id };
}

export function validateMaxInitData(
  initData: string,
  botToken: string,
  maxAgeSeconds: number,
  now = new Date(),
): MaxInitData {
  const pairs = parsePairs(initData);
  const hash = pairs.find(([key]) => key === "hash")?.[1];
  if (!hash || !/^[a-f0-9]{64}$/i.test(hash)) throw new MaxInitDataError("MAX initData hash is missing or invalid");

  const launchParams = pairs
    .filter(([key]) => key !== "hash")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = hmac("WebAppData", botToken);
  const expectedHash = hmac(secretKey, launchParams);
  const actualHash = Buffer.from(hash, "hex");
  if (actualHash.length !== expectedHash.length || !timingSafeEqual(actualHash, expectedHash)) {
    throw new MaxInitDataError("MAX initData signature is invalid");
  }

  const data = Object.fromEntries(pairs);
  const authDate = Number(data.auth_date);
  const currentSeconds = Math.floor(now.getTime() / 1000);
  if (!Number.isInteger(authDate) || authDate <= 0 || authDate > currentSeconds + 60 || currentSeconds - authDate > maxAgeSeconds) {
    throw new MaxInitDataError("MAX initData has expired");
  }
  if (!data.user) throw new MaxInitDataError("MAX initData user is missing");

  return {
    authDate,
    queryId: data.query_id,
    ip: data.ip,
    chat: readChat(data.chat),
    startParam: data.start_param,
    user: readMaxUser(data.user),
  };
}
