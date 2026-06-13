import type { BCXAdapter } from "../platform/bcx-adapter";
import type { HostWindow } from "../platform/root";
import type { SettingsStore } from "./settings-storage";
import { SettingsMainScreen } from "./screens/settings-main";
import type { RuleSynchronizer } from "../core/sync";

export class SettingsRegistry {
  private current: SettingsMainScreen | null = null;
  private registered = false;

  constructor(
    public readonly root: HostWindow,
    private readonly settingsStore: SettingsStore,
    private readonly bcx: BCXAdapter,
    private readonly synchronizer: RuleSynchronizer,
  ) {}

  register(): boolean {
    if (this.registered) return true;
    if (typeof this.root.PreferenceRegisterExtensionSetting !== "function") {
      console.warn("[BCXIR] Preference extension setting API is unavailable; settings menu not registered.");
      return false;
    }
    this.root.PreferenceRegisterExtensionSetting({
      Identifier: "BCXIR",
      ButtonText: "BCXIR Settings",
      Image: "Icons/Preference.png",
      load: () => this.load(),
      run: () => this.run(),
      click: () => this.click(),
      exit: () => this.exit(),
      unload: () => this.unload(),
    });
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

  load(): void {
    this.setScreen(new SettingsMainScreen(
      this,
      this.settingsStore,
      this.bcx,
      () => {
        this.synchronizer.startFallbackTimer();
        this.synchronizer.scheduleSync("settings");
      },
    ));
  }

  run(): void {
    this.current?.run();
  }

  click(): void {
    this.current?.click();
  }

  exit(): void {
    this.setScreen(null);
    if (typeof this.root.PreferenceSubscreenExtensionsClear === "function") {
      this.root.PreferenceSubscreenExtensionsClear();
    }
  }

  unload(): void {
    this.setScreen(null);
  }

  private setScreen(screen: SettingsMainScreen | null): void {
    this.current?.unload();
    this.current = screen;
    this.current?.load();
  }
}
