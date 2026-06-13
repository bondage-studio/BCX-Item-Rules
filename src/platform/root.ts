export type HostWindow = Window & Record<string, any>;

export function getRoot(): HostWindow {
  return (typeof unsafeWindow !== "undefined" ? unsafeWindow : window) as HostWindow;
}
