import { randomInt } from "node:crypto";

const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";

export function newPublicPhotoKey() {
  return Array.from({ length: 20 }, () => alphabet[randomInt(alphabet.length)]).join("");
}
