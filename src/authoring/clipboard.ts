import type { HostWindow } from "../platform/root";

export async function copyText(root: HostWindow, text: string): Promise<boolean> {
  try {
    const clipboard = root.navigator?.clipboard;
    if (clipboard && typeof clipboard.writeText === "function") {
      await clipboard.writeText(text);
      return true;
    }
  } catch {
    /* Fall through to the textarea fallback. */
  }

  try {
    const document = root.document;
    if (!document || typeof document.createElement !== "function") return false;
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.left = "-10000px";
    textarea.style.top = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = typeof document.execCommand === "function" && document.execCommand("copy");
    textarea.remove();
    return !!ok;
  } catch {
    return false;
  }
}
