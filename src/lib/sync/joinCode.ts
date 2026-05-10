// "Join codes" let an existing member share enough information for a new
// device to materialise a profile from the cloud in one paste:
//   { p: profileId, c: familyCode, n: profileName }
// encoded as URL-safe base64.

export interface JoinPayload {
  profileId: string;
  code: string;
  name: string;
}

const PREFIX = "mcz1:"; // version tag so we can evolve the format later.

function toBase64Url(s: string): string {
  // Works in browsers and modern Node.
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): string {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/") +
    "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function encodeJoinCode(payload: JoinPayload): string {
  const body = JSON.stringify({
    p: payload.profileId,
    c: payload.code,
    n: payload.name,
  });
  return PREFIX + toBase64Url(body);
}

export function decodeJoinCode(raw: string): JoinPayload {
  // Tolerate whitespace, line breaks and stray characters from copy/paste,
  // including the prefix appearing somewhere in the middle of a message.
  const cleaned = raw.replace(/\s+/g, "");
  const idx = cleaned.indexOf(PREFIX);
  if (idx < 0) {
    throw new Error("Código de invitación no reconocido.");
  }
  const trimmed = cleaned.slice(idx);
  const body = fromBase64Url(trimmed.slice(PREFIX.length));
  let obj: { p?: unknown; c?: unknown; n?: unknown };
  try {
    obj = JSON.parse(body) as typeof obj;
  } catch {
    throw new Error("Código de invitación corrupto.");
  }
  if (
    typeof obj.p !== "string" ||
    typeof obj.c !== "string" ||
    typeof obj.n !== "string"
  ) {
    throw new Error("Código de invitación incompleto.");
  }
  return { profileId: obj.p, code: obj.c, name: obj.n };
}
