import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// jsdom neturi garso variklio ir rašo „Not implemented: HTMLMediaElement's
// play()" į savo virtualią konsolę, kurios komponento try/catch nepasiekia.
// Tildome čia, kad testų išvestis liktų švari.
vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});

afterEach(() => cleanup());
