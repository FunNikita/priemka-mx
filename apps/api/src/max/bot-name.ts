export function isValidMaxBotName(value: string): boolean {
  return /^[A-Za-z0-9_]{5,64}$/.test(value);
}
