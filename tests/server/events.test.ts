import { describe, expect, it, vi } from 'vitest';
import type { Response } from 'express';
import { createEventHub } from '../../src/server/events.js';

function fakeResponse() {
  return {
    write: vi.fn(),
    writeHead: vi.fn(),
    flushHeaders: vi.fn(),
  } as unknown as Response & { write: ReturnType<typeof vi.fn> };
}

describe('createEventHub', () => {
  it('nusiunčia įvykį visiems prenumeratoriams', () => {
    const hub = createEventHub();
    const a = fakeResponse();
    const b = fakeResponse();
    hub.subscribe(a);
    hub.subscribe(b);

    hub.broadcast('tasks-changed');

    expect(a.write).toHaveBeenCalledWith('data: {"type":"tasks-changed"}\n\n');
    expect(b.write).toHaveBeenCalledWith('data: {"type":"tasks-changed"}\n\n');
  });

  it('atsijungęs prenumeratorius nebegauna įvykių', () => {
    const hub = createEventHub();
    const a = fakeResponse();
    const unsubscribe = hub.subscribe(a);
    expect(hub.count()).toBe(1);

    unsubscribe();
    hub.broadcast('tasks-changed');

    expect(hub.count()).toBe(0);
    expect(a.write).not.toHaveBeenCalled();
  });

  it('nustato SSE antraštes prisijungus', () => {
    const hub = createEventHub();
    const a = fakeResponse();
    hub.subscribe(a);
    expect(a.writeHead).toHaveBeenCalledWith(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
  });

  it('vieno prenumeratoriaus mirtis nesustabdo transliacijos likusiems', () => {
    const hub = createEventHub();
    const dead = fakeResponse();
    dead.write.mockImplementation(() => {
      throw new Error('socket klaida');
    });
    const alive = fakeResponse();
    hub.subscribe(dead);
    hub.subscribe(alive);
    expect(hub.count()).toBe(2);

    hub.broadcast('tasks-changed');

    expect(alive.write).toHaveBeenCalledWith('data: {"type":"tasks-changed"}\n\n');
    expect(hub.count()).toBe(1);
  });
});
