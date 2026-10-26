import type { PublicSettings, SettingsMap } from '../core/settings.js';
import type { Task, TaskInput, TaskPatch } from '../core/types.js';

export type ConnectionStatus = 'connected' | 'disconnected';

// Klaida neša kodą, ne tik tekstą: nuo šiol verčia klientas, o
// serverio `message` yra tik angliška atsarginė reikšmė nežinomiems kodams.
export class ApiClientError extends Error {
  constructor(public readonly code: string | null, message: string) {
    super(message);
    this.name = 'ApiClientError';
  }
}

// LIEKA atskira klasė: lenta pagal ją sprendžia, ar rodyti PIN ekraną vietoj
// klaidos juostos — tai ne pranešimo, o rodinio sprendimas.
export class UnauthorizedError extends ApiClientError {
  constructor() {
    super('unauthorized', 'Sign in required');
    this.name = 'UnauthorizedError';
  }
}

async function send<T>(path: string, method: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }

  let res: Response;
  try {
    res = await fetch(path, init);
  } catch {
    // `fetch` pats meta klaidą (nutrūkus ryšiui, DNS ir pan.) su naršyklės
    // angliška žinute — paverčiame ją kodu `offline`, kad klientas galėtų
    // parinkti savo (lietuvišką ar anglišką) tekstą, žr. `ui/errorText.ts`.
    throw new ApiClientError('offline', 'Could not reach the server');
  }
  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as
      | { error?: { code?: string; message?: string } }
      | null;
    // 401 pats savaime nereiškia „nėra sesijos" — neteisingas PIN irgi grąžina
    // 401, bet su kitu kodu. Skiriame pagal `error.code`, ne vien pagal
    // statusą: `unauthorized` yra vienintelis atvejis, kai lenta turi rodyti
    // PIN ekraną vietoj serverio žinutės (žr. login() naudojimą kitoje užduotyje).
    if (payload?.error?.code === 'unauthorized') throw new UnauthorizedError();
    throw new ApiClientError(payload?.error?.code ?? null, payload?.error?.message ?? 'Could not reach the server');
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const fetchTasks = (): Promise<Task[]> => send('/api/tasks', 'GET');
export const createTask = (input: TaskInput): Promise<Task> => send('/api/tasks', 'POST', input);
export const patchTask = (id: string, patch: TaskPatch): Promise<Task> =>
  send(`/api/tasks/${id}`, 'PATCH', patch);
export const deleteTask = (id: string): Promise<void> => send(`/api/tasks/${id}`, 'DELETE');
export const fetchSettings = (): Promise<PublicSettings> => send('/api/settings', 'GET');
// Parametras siaurinamas iki `SettingsMap` (o ne `PublicSettings`) sąmoningai:
// pastarasis turi ir išvestinius laukus (`has_pin`, `resolved_locale`),
// kuriuos serveris `PATCH /api/settings` atmestų 400 — plikesnis tipas leisdavo juos siųsti kompiliuojantis.
export const patchSettings = (values: Partial<SettingsMap>): Promise<PublicSettings> =>
  send('/api/settings', 'PATCH', values);
export const snoozeTask = (id: string, minutes: number): Promise<Task> =>
  send(`/api/tasks/${id}/snooze`, 'POST', { minutes });

export const login = (pin: string): Promise<void> => send('/api/session', 'POST', { pin });
export const setPin = (pin: string | null): Promise<void> => send('/api/pin', 'PUT', { pin });

export function subscribeToChanges(
  onChange: () => void,
  onStatus: (status: ConnectionStatus) => void,
): () => void {
  let source: EventSource | null = null;
  let delay = 1000;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const connect = (): void => {
    if (stopped) return;
    source = new EventSource('/api/events');

    source.onopen = () => {
      delay = 1000;
      onStatus('connected');
    };
    source.onmessage = () => { onChange(); };
    source.onerror = () => {
      source?.close();
      onStatus('disconnected');
      timer = setTimeout(connect, delay);
      delay = Math.min(delay * 2, 30_000);
    };
  };

  connect();

  return () => {
    stopped = true;
    if (timer !== null) clearTimeout(timer);
    source?.close();
  };
}
