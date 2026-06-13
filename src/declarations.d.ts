declare const unsafeWindow: Window & Record<string, any>;
declare const __BCXIR_VERSION__: string;

interface Window {
  BCXItemRules?: unknown;
  LZString?: {
    compressToEncodedURIComponent(value: string): string;
    decompressFromEncodedURIComponent(value: string): string | null;
    compressToBase64(value: string): string;
    decompressFromBase64(value: string): string | null;
  };
}
