export interface ShortcutApi {
  register(accelerator: string, callback: () => void): boolean;
  unregister(accelerator: string): void;
}

export interface HotkeyManager {
  apply(accelerator: string, callback: () => void): boolean;
  current(): string | null;
  dispose(): void;
}

export function createHotkeyManager(api: ShortcutApi): HotkeyManager {
  let active: string | null = null;

  const release = (): void => {
    if (active !== null) {
      api.unregister(active);
      active = null;
    }
  };

  return {
    apply(accelerator, callback) {
      release();
      if (!api.register(accelerator, callback)) return false;
      active = accelerator;
      return true;
    },
    current: () => active,
    dispose: release,
  };
}
