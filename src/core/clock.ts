export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

export interface FixedClock extends Clock {
  set(iso: string): void;
  advance(ms: number): void;
}

export function fixedClock(iso: string): FixedClock {
  let current = new Date(iso);
  return {
    now: () => new Date(current),
    set: (next: string) => { current = new Date(next); },
    advance: (ms: number) => { current = new Date(current.getTime() + ms); },
  };
}
