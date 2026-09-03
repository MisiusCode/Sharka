import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import { listenWithFallback } from '../../src/server/index.js';

const open: Server[] = [];

afterEach(async () => {
  await Promise.all(open.splice(0).map((s) => new Promise((r) => s.close(r))));
});

describe('listenWithFallback', () => {
  it('užimtą portą praleidžia ir pasiima kitą', async () => {
    const first = await listenWithFallback(express(), 0, 5);
    open.push(first.server);

    const second = await listenWithFallback(express(), first.port, 5);
    open.push(second.server);

    expect(second.port).toBe(first.port + 1);
  });

  it('išnaudojus bandymus meta klaidą', async () => {
    const held = await listenWithFallback(express(), 0, 5);
    open.push(held.server);

    await expect(listenWithFallback(express(), held.port, 1)).rejects.toThrow(
      /Nepavyko užimti porto/,
    );
  });

  it('po paleidimo klaidos logina ir nenukerta proceso', async () => {
    const started = await listenWithFallback(express(), 0, 5);
    open.push(started.server);

    const logged: unknown[] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((...args) => {
      logged.push(args);
    });

    expect(() => started.server.emit('error', new Error('pirma'))).not.toThrow();
    expect(() => started.server.emit('error', new Error('antra'))).not.toThrow();
    expect(logged).toHaveLength(2);

    spy.mockRestore();
  });

  it('be host argumento prisiriša tik prie loopback', async () => {
    const app = express();
    const { server, port } = await listenWithFallback(app, 0, 1);
    const address = server.address();
    expect(typeof address === 'object' && address !== null ? address.address : '')
      .toBe('127.0.0.1');
    expect(port).toBeGreaterThan(0);
    server.close();
  });

  it('gavęs 0.0.0.0 prisiriša prie visų sąsajų', async () => {
    const app = express();
    const { server } = await listenWithFallback(app, 0, 1, '0.0.0.0');
    const address = server.address();
    expect(typeof address === 'object' && address !== null ? address.address : '')
      .toBe('0.0.0.0');
    server.close();
  });
});
