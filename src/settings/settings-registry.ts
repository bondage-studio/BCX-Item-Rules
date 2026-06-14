import type { BCXAdapter } from "../platform/bcx-adapter";
import type { HostWindow } from "../platform/root";
import type { SettingsStore } from "./settings-storage";
import { SettingsMainScreen } from "./screens/settings-main";
import { SettingsItemRulesScreen } from "./screens/settings-item-rules";
import { SettingsRuntimeScreen } from "./screens/settings-runtime";
import { SettingsDiagnosticsScreen } from "./screens/settings-diagnostics";
import type { SettingsScreen } from "./screens/settings-screen";
import type { RuleSynchronizer } from "../core/sync";
import type { AuthoringSession } from "../authoring/authoring-session";
import type { ItemRuleTransport } from "../platform/item-rule-transport";
import { t } from "../shared/i18n";

export type SettingsScreenName = "main" | "itemRules" | "runtime" | "diagnostics";
export interface SettingsScreenOptions {
  itemName?: string | null;
}

export class SettingsRegistry {
  private current: SettingsScreen | null = null;
  private registered = false;
  private registeredConfig: any = null;

  constructor(
    public readonly root: HostWindow,
    private readonly settingsStore: SettingsStore,
    private readonly bcx: BCXAdapter,
    private readonly synchronizer: RuleSynchronizer,
    private readonly authoring?: AuthoringSession,
    private readonly itemRuleTransport?: ItemRuleTransport,
  ) {}

  register(): boolean {
    if (this.registered) return true;
    if (typeof this.root.PreferenceRegisterExtensionSetting !== "function") {
      console.warn("[BCXIR] Preference extension setting API is unavailable; settings menu not registered.");
      return false;
    }
    this.registeredConfig = {
      Identifier: "BCXIR",
      ButtonText: () => t(this.root, "extension.button"),
      Image: "Icons/Preference.png",
      load: () => this.load(),
      run: () => this.run(),
      click: () => this.click(),
      exit: () => this.exit(),
      unload: () => this.unload(),
    };
    this.root.PreferenceRegisterExtensionSetting(this.registeredConfig);
    this.registered = true;
    return true;
  }

  open(): boolean {
    if (!this.registered && !this.register()) return false;
    this.load();
    if (typeof this.root.CommonSetScreen === "function") {
      try {
        this.root.CommonSetScreen("Character", "Preference");
      } catch (error) {
        console.warn("[BCXIR] Failed to open Preference screen.", error);
      }
    }
    return true;
  }

  restoreItemRules(itemName?: string | null): boolean {
    if (!this.registered && !this.register()) return false;
    this.enterNativeExtensionSetting(itemName);
    return true;
  }

  load(): void {
    this.setScreen("main");
  }

  run(): void {
    this.current?.run();
  }

  click(): void {
    this.current?.click();
  }

  exit(): void {
    this.clearScreen();
    if (typeof this.root.PreferenceSubscreenExtensionsClear === "function") {
      this.root.PreferenceSubscreenExtensionsClear();
    }
  }

  unload(): void {
    this.clearScreen();
  }

  setScreen(screenName: SettingsScreenName, options: SettingsScreenOptions = {}): void {
    this.current?.unload();
    if (screenName === "itemRules") {
      this.current = new SettingsItemRulesScreen(this, this.synchronizer, this.authoring, options.itemName);
    } else if (screenName === "runtime") {
      this.current = new SettingsRuntimeScreen(this, this.settingsStore, this.synchronizer);
    } else if (screenName === "diagnostics") {
      this.current = new SettingsDiagnosticsScreen(this, this.settingsStore, this.bcx, this.synchronizer, this.authoring, this.itemRuleTransport);
    } else {
      this.current = new SettingsMainScreen(
        this,
        this.settingsStore,
        this.bcx,
        this.synchronizer,
        this.itemRuleTransport,
        () => {
          this.synchronizer.startFallbackTimer();
          this.synchronizer.scheduleSync("settings");
        },
      );
    }
    this.current.load();
  }

  private enterNativeExtensionSetting(itemName?: string | null): void {
    let screenResult: unknown;
    if (typeof this.root.CommonSetScreen === "function") {
      try {
        screenResult = this.root.CommonSetScreen("Character", "Preference");
      } catch (error) {
        console.warn("[BCXIR] Failed to restore Preference screen.", error);
      }
    }

    this.afterMaybePromise(screenResult, () => this.openExtensionsSubscreen(itemName));
  }

  private openExtensionsSubscreen(itemName?: string | null): void {
    try {
      if (typeof this.root.PreferenceOpenSubscreen === "function") {
        const openResult = this.root.PreferenceOpenSubscreen("Extensions");
        if (openResult && typeof openResult.then === "function") {
          void openResult.then(
            () => this.activateNativeExtensionSetting(itemName),
            (error: unknown) => {
              console.warn("[BCXIR] Failed to open Preference Extensions subscreen.", error);
              this.activateNativeExtensionSetting(itemName);
            },
          );
          return;
        }
      }
    } catch (error) {
      console.warn("[BCXIR] Failed to open Preference Extensions subscreen.", error);
    }

    this.activateNativeExtensionSetting(itemName);
  }

  private activateNativeExtensionSetting(itemName?: string | null): void {
    try {
      if (typeof this.root.PreferenceSubscreenExtensionsOpen === "function") {
        const openResult = this.root.PreferenceSubscreenExtensionsOpen("BCXIR");
        if (openResult && typeof openResult.then === "function") {
          void openResult.then(
            () => this.restoreItemRulesScreen(itemName),
            (error: unknown) => {
              console.warn("[BCXIR] Failed to open BCXIR extension setting.", error);
              this.restoreItemRulesScreen(itemName);
            },
          );
          return;
        }
        this.restoreItemRulesScreen(itemName);
        return;
      }
    } catch (error) {
      console.warn("[BCXIR] Failed to open BCXIR extension setting.", error);
    }

    this.registeredConfig?.load?.();
    this.restoreItemRulesScreen(itemName);
  }

  private restoreItemRulesScreen(itemName?: string | null): void {
    this.setScreen("itemRules", { itemName });
  }

  private afterMaybePromise(value: unknown, callback: () => void): void {
    if (value && typeof (value as Promise<unknown>).then === "function") {
      void (value as Promise<unknown>).then(
        () => callback(),
        (error: unknown) => {
          console.warn("[BCXIR] Failed while changing Preference screen.", error);
          callback();
        },
      );
      return;
    }
    callback();
  }

  private clearScreen(): void {
    this.current?.unload();
    this.current = null;
  }
}
