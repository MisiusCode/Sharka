import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MESSAGES } from '../../src/core/i18n.js';

// Sutartis: klientas verčia pagal `error.code`, tad kiekvienas
// serverio grąžinamas kodas privalo turėti raktą. Skaitom TIKRĄ šaltinį, o ne
// rankomis prižiūrimą sąrašą — kitaip testas sensta kartu su sąrašu.
function serverioFailai(kelias: string): string[] {
  const rasta: string[] = [];
  for (const irasas of readdirSync(kelias, { withFileTypes: true })) {
    const pilnas = join(kelias, irasas.name);
    if (irasas.isDirectory()) rasta.push(...serverioFailai(pilnas));
    else if (irasas.name.endsWith('.ts')) rasta.push(pilnas);
  }
  return rasta;
}

describe('klaidų kodų sutartis', () => {
  it('kiekvienas serverio kodas turi vertimą abiejose kalbose', () => {
    const kodai = new Set<string>();
    for (const failas of serverioFailai(join(process.cwd(), 'src', 'server'))) {
      const tekstas = readFileSync(failas, 'utf8');
      for (const m of tekstas.matchAll(/new ApiError\(\s*\d+\s*,\s*'([a-z_]+)'/g)) kodai.add(m[1]);
      for (const m of tekstas.matchAll(/code:\s*'([a-z_]+)'/g)) kodai.add(m[1]);
    }

    // `invalid_setting` sąmoningai be rakto: jo žinutė sudaroma iš nustatymo
    // vardo, tad bendras vertimas prarastų tai, kas joje vertingiausia.
    kodai.delete('invalid_setting');

    expect(kodai.size).toBeGreaterThan(10);
    for (const kodas of kodai) {
      expect(MESSAGES.lt, `trūksta error.${kodas}`).toHaveProperty(`error.${kodas}`);
      expect(MESSAGES.en, `trūksta error.${kodas}`).toHaveProperty(`error.${kodas}`);
    }
  });
});
