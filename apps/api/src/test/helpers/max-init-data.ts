import { createHmac } from "node:crypto";

type InitDataValues = Record<string, string>;

function hmac(key: string | Buffer, value: string): Buffer {
  return createHmac("sha256", key).update(value).digest();
}

export function createSignedMaxInitData(botToken: string, overrides: Partial<InitDataValues> = {}): string {
  const values: InitDataValues = {
    auth_date: String(Math.floor(Date.now() / 1000)),
    chat: '{"id":9007199254740995,"type":"DIALOG"}',
    ip: "203.0.113.9",
    query_id: "test-query-id",
    start_param: "test-start-param",
    user: '{"id":9007199254740993,"first_name":"Макс","last_name":"Пользователь","username":null,"language_code":"ru","photo_url":null}',
    ...overrides,
  };
  const launchParams = Object.entries(values)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = hmac("WebAppData", botToken);
  const hash = hmac(secret, launchParams).toString("hex");
  return `${Object.entries(values).map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join("&")}&hash=${hash}`;
}
