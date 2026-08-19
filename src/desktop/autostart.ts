export interface AutostartApi {
  get(): boolean;
  set(enabled: boolean): void;
}

export function syncAutostart(enabled: boolean, api: AutostartApi): void {
  if (api.get() === enabled) return;
  api.set(enabled);
}
