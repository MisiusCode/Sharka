import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTask, deleteTask, fetchTasks, login, patchTask, UnauthorizedError } from '../../src/ui/api.js';
import { errorText } from '../../src/ui/errorText.js';

afterEach(() => { vi.unstubAllGlobals(); });

function stubFetch(status: number, body: unknown) {
  const spy = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

describe('api', () => {
  it('fetchTasks kreipiasi į /api/tasks', async () => {
    const spy = stubFetch(200, [{ id: 'a' }]);
    expect(await fetchTasks()).toEqual([{ id: 'a' }]);
    expect(spy).toHaveBeenCalledWith('/api/tasks', expect.objectContaining({ method: 'GET' }));
  });

  it('createTask siunčia JSON kūną', async () => {
    const spy = stubFetch(201, { id: 'a', title: 'X' });
    await createTask({ title: 'X' });
    expect(spy).toHaveBeenCalledWith('/api/tasks', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'X' }),
    }));
  });

  it('patchTask naudoja PATCH ir id kelyje', async () => {
    const spy = stubFetch(200, { id: 'a' });
    await patchTask('a', { status: 'done' });
    expect(spy).toHaveBeenCalledWith('/api/tasks/a', expect.objectContaining({ method: 'PATCH' }));
  });

  it('deleteTask nelaukia JSON kūno', async () => {
    stubFetch(204, undefined);
    await expect(deleteTask('a')).resolves.toBeUndefined();
  });

  it('klaidos atsakymą paverčia meta klaida su serverio kodu ir žinute', async () => {
    // Serveris nuo šiol siunčia anglišką `message` — lietuvišką
    // tekstą pagal `code` parenka `errorText`, ne pats `send()`.
    stubFetch(400, { error: { code: 'invalid_title', message: 'Title cannot be empty' } });
    const err: unknown = await createTask({ title: '' }).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'invalid_title', message: 'Title cannot be empty' });
    expect(errorText('lt', err)).toBe('Pavadinimas negali būti tuščias');
  });

  it('nutrūkus ryšiui meta klaidą su kodu offline, o ne naršyklės tekstą', async () => {
    // Nuo šiol žinutė angliška (tik atsarginė reikšmė) — lietuvišką tekstą
    // pagal `offline` kodą parenka `errorText` (žr. `tests/ui/errorText.test.ts`).
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const err: unknown = await fetchTasks().catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'offline' });
    expect((err as Error).message).toBe('Could not reach the server');
    expect(errorText('lt', err)).toBe('Nepavyko susisiekti su serveriu');
  });

  it('klaidos atsakymo kodą perduoda toliau, ne tik žinutę', async () => {
    stubFetch(400, { error: { code: 'invalid_title', message: 'Title cannot be empty' } });
    await expect(fetchTasks()).rejects.toMatchObject({ code: 'invalid_title' });
  });

  it('401 verčiamas atpažįstama klaida, o ne bendra žinute', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: { code: 'unauthorized', message: 'Sign in required' } }),
    }) as unknown as typeof fetch;

    await expect(fetchTasks()).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('401 su invalid_pin kodu praleidžia serverio žinutę, o ne UnauthorizedError', async () => {
    // Neteisingas PIN taip pat grąžina 401, bet tai NE „nėra sesijos" atvejis —
    // vartotojas jau bando prisijungti, tad ekranas turi rodyti klaidą su kodu
    // `invalid_pin`, o ne bendrą `UnauthorizedError`. Serverio `message` čia jau
    // tik angliška atsarginė reikšmė — lietuvišką „Neteisingas PIN"
    // parenka `errorText` pagal kodą, ne serveris.
    stubFetch(401, { error: { code: 'invalid_pin', message: 'Wrong PIN' } });

    const err: unknown = await login('0000').catch((e: unknown) => e);
    expect(err).not.toBeInstanceOf(UnauthorizedError);
    expect(err).toMatchObject({ code: 'invalid_pin', message: 'Wrong PIN' });
    expect(errorText('lt', err)).toBe('Neteisingas PIN');
  });

  it('login siunčia PIN į /api/session', async () => {
    const spy = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) });
    globalThis.fetch = spy as unknown as typeof fetch;

    await login('1234');

    expect(spy).toHaveBeenCalledWith('/api/session', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ pin: '1234' }),
    }));
  });
});
