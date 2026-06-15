import { SETTINGS_EXTENSION_KEY } from "./constants";
import type { HostWindow } from "../platform/root";

export function decodeExtensionSettingsRaw(root: HostWindow, raw: unknown): unknown | null {
  if (typeof raw !== "string" || !raw) return null;
  const lz = getLz(root);
  if (!lz) throw new Error("LZString base64 codec is unavailable");
  const json = lz.decompressFromBase64(raw);
  if (!json) throw new Error("extension settings decompression failed");
  return JSON.parse(json);
}

export function encodeExtensionSettingsRaw(root: HostWindow, value: unknown): string {
  const lz = getLz(root);
  if (!lz) throw new Error("LZString base64 codec is unavailable");
  const encoded = lz.compressToBase64(JSON.stringify(value));
  if (typeof encoded !== "string" || !encoded) throw new Error("extension settings compression failed");
  return encoded;
}

export function getExtensionSettingsRaw(root: HostWindow): unknown | null {
  return decodeExtensionSettingsRaw(root, root.Player?.ExtensionSettings?.[SETTINGS_EXTENSION_KEY]);
}

function getLz(root: HostWindow): Pick<NonNullable<Window["LZString"]>, "compressToBase64" | "decompressFromBase64"> | null {
  const lz = root.LZString || (globalThis as any).LZString;
  if (
    lz &&
    typeof lz.compressToBase64 === "function" &&
    typeof lz.decompressFromBase64 === "function"
  ) {
    return lz;
  }
  return null;
}
