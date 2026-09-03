import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTask, deleteTask, fetchTasks, login, patchTask, UnauthorizedError } from '../../src/ui/api.js';

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

  it('klaidos atsakymą paverčia meta klaida su serverio žinute', async () => {
    stubFetch(400, { error: { code: 'invalid_title', message: 'Pavadinimas negali būti tuščias' } });
    await expect(createTask({ title: '' })).rejects.toThrow('Pavadinimas negali būti tuščias');
  });

  it('nutrūkus ryšiui meta lietuvišką klaidą, o ne naršyklės tekstą', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(fetchTasks()).rejects.toThrow('Nepavyko susisiekti su serveriu');
  });

  it('401 verčiamas atpažįstama klaida, o ne bendra žinute', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: { code: 'unauthorized', message: 'Reikia prisijungti' } }),
    }) as unknown as typeof fetch;

    await expect(fetchTasks()).rejects.toBeInstanceOf(UnauthorizedError);
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
