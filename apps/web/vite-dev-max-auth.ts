import { createHmac, randomUUID } from "node:crypto";

type DevIdentity = {
  botToken: string;
  userId: string;
  firstName: string;
  lastName: string;
};

function hmac(key: string | Buffer, value: string): Buffer {
  return createHmac("sha256", key).update(value).digest();
}

export function createDevMaxInitData(identity: DevIdentity, now = new Date()): string {
  if (!/^[1-9]\d*$/.test(identity.userId) || BigInt(identity.userId) > 9223372036854775807n) {
    throw new Error("Некорректный DEV MAX user ID");
  }
  if (!identity.botToken || !identity.firstName.trim() || !identity.lastName.trim()) {
    throw new Error("Не настроены данные DEV MAX пользователя или бота");
  }

  // Keep the numeric ID lexeme intact. JSON.stringify(Number(userId)) loses int64 precision.
  const user = `{"id":${identity.userId},"first_name":${JSON.stringify(identity.firstName)},"last_name":${JSON.stringify(identity.lastName)},"username":null,"language_code":"ru","photo_url":null}`;
  const values = {
    auth_date: String(Math.floor(now.getTime() / 1000)),
    query_id: randomUUID(),
    user,
  };
  const launchParams = Object.entries(values)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = hmac("WebAppData", identity.botToken);
  const hash = hmac(secret, launchParams).toString("hex");
  return `${Object.entries(values).map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join("&")}&hash=${hash}`;
}
