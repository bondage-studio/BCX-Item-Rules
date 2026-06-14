declare const unsafeWindow: Window & Record<string, any>;
declare const __BCXIR_VERSION__: string;
declare const CraftingID: {
  root?: string;
  rightPanel?: string;
};

interface Window {
  BCXItemRules?: unknown;
  LZString?: {
    compressToEncodedURIComponent(value: string): string;
    decompressFromEncodedURIComponent(value: string): string | null;
    compressToBase64(value: string): string;
    decompressFromBase64(value: string): string | null;
  };
}
