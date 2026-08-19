import type { SettingsMap } from '../core/settings.js';
import type { Task, TaskInput, TaskPatch } from '../core/types.js';

export type ConnectionStatus = 'connected' | 'disconnected';

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
    // angliška žinute — ją paverčiame ta pačia lietuviška, kaip ir serverio
    // grąžintas klaidos atsakymas žemiau.
    throw new Error('Nepavyko susisiekti su serveriu');
  }
  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as
      | { error?: { message?: string } }
      | null;
    throw new Error(payload?.error?.message ?? 'Nepavyko susisiekti su serveriu');
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const fetchTasks = (): Promise<Task[]> => send('/api/tasks', 'GET');
export const createTask = (input: TaskInput): Promise<Task> => send('/api/tasks', 'POST', input);
export const patchTask = (id: string, patch: TaskPatch): Promise<Task> =>
  send(`/api/tasks/${id}`, 'PATCH', patch);
export const deleteTask = (id: string): Promise<void> => send(`/api/tasks/${id}`, 'DELETE');
export const fetchSettings = (): Promise<SettingsMap> => send('/api/settings', 'GET');
export const patchSettings = (values: Partial<SettingsMap>): Promise<SettingsMap> =>
  send('/api/settings', 'PATCH', values);
export const snoozeTask = (id: string, minutes: number): Promise<Task> =>
  send(`/api/tasks/${id}/snooze`, 'POST', { minutes });

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
