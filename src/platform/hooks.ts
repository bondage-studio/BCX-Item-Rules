import { FULL_NAME, MOD_ID, VERSION } from "../shared/constants";
import type { HostWindow } from "./root";
import type { RuleSynchronizer } from "../core/sync";
import type { AuthoringSession } from "../authoring/authoring-session";
import type { ItemRuleTransport } from "./item-rule-transport";
import type { CreatorSenderQueryTransport } from "./creator-sender-query-transport";
import type { UseMeQueryTransport } from "./use-me-query-transport";

export function registerModSdkHooks(
  root: HostWindow,
  synchronizer: RuleSynchronizer,
  authoring?: AuthoringSession,
  itemRuleTransport?: ItemRuleTransport,
  creatorSenderTransport?: CreatorSenderQueryTransport,
  useMeTransport?: UseMeQueryTransport,
): boolean {
  const sdk = root.bcModSdk;
  if (!sdk || typeof sdk.registerMod !== "function") return false;
  try {
    const modApi = sdk.registerMod({
      name: MOD_ID,
      fullName: FULL_NAME,
      version: VERSION,
      repository: "https://github.com/bondage-studio/BCX-Item-Rules",
    }, { allowReplace: true });

    const hookAfter = (fnName: string, reason: string, characterIndex: number | null): void => {
      try {
        modApi.hookFunction(fnName, 1, (args: any[], next: (args: any[]) => unknown) => {
          const result = next(args);
          const C = characterIndex == null ? root.Player : args[characterIndex];
          if (!C || C === root.Player || (typeof C.IsPlayer === "function" && C.IsPlayer())) {
            synchronizer.scheduleSync(reason);
          }
          return result;
        });
      } catch (error) {
        console.warn("[BCXIR] Failed to hook " + fnName, error);
      }
    };

    hookAfter("CharacterRefresh", "CharacterRefresh", 0);
    hookAfter("ServerAppearanceLoadFromBundle", "ServerAppearanceLoadFromBundle", 0);
    hookAfter("ChatRoomSync", "ChatRoomSync", null);
    if (authoring) {
      authoring.setModApi(modApi);
    }
    itemRuleTransport?.install(modApi);
    creatorSenderTransport?.install(modApi);
    useMeTransport?.install(modApi);
    return true;
  } catch (error) {
    console.warn("[BCXIR] Mod SDK registration failed.", error);
    return false;
  }
}
