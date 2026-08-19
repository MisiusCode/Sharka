import { describe, expect, it } from 'vitest';
import { popupBounds } from '../../src/desktop/windowPosition.js';

const EKRANAS = { x: 0, y: 0, width: 1920, height: 1040 }; // juosta apačioje, 40px
const DYDIS = { width: 380, height: 480 };

describe('popupBounds', () => {
  it('juostai apačioje langą deda virš jos ir centruoja ties ikona', () => {
    const b = popupBounds({ x: 1700, y: 1040, width: 24, height: 40 }, EKRANAS, DYDIS);
    expect(b.y + b.height).toBe(1032); // 8px tarpas nuo darbo srities apačios
    expect(b.x + b.width / 2).toBe(1712);
  });

  it('neleidžia langui išlįsti pro dešinį kraštą', () => {
    const b = popupBounds({ x: 1900, y: 1040, width: 24, height: 40 }, EKRANAS, DYDIS);
    expect(b.x + b.width).toBe(1912);
  });

  it('neleidžia langui išlįsti pro kairį kraštą', () => {
    const b = popupBounds({ x: 10, y: 1040, width: 24, height: 40 }, EKRANAS, DYDIS);
    expect(b.x).toBe(8);
  });

  it('juostai viršuje langą deda po ja', () => {
    const virsuje = { x: 0, y: 40, width: 1920, height: 1040 };
    const b = popupBounds({ x: 1700, y: 0, width: 24, height: 40 }, virsuje, DYDIS);
    expect(b.y).toBe(48);
  });

  it('siauresniame nei langas ekrane neišstumia lango už kairiojo krašto', () => {
    const siauras = { x: 0, y: 0, width: 300, height: 1040 };
    const b = popupBounds({ x: 150, y: 1040, width: 24, height: 40 }, siauras, DYDIS);
    expect(b.x).toBe(8);
  });

  it('tray ikonai esant darbo srities viduje, arti apačios, langą vis tiek deda apačioje', () => {
    // Tikras naudotojo pranešimas: Windows 11 tray.y ne visada lygus tiksliai
    // workArea apačiai — gali būti ir šiek tiek virš jos, bet vis tiek apatinėje pusėje.
    const b = popupBounds({ x: 1700, y: 1000, width: 24, height: 40 }, EKRANAS, DYDIS);
    expect(b.y + b.height).toBe(1032); // 8px tarpas nuo darbo srities apačios
  });

  it('tray ikonai esant arti viršutinės juostos viršaus, langą deda po ja', () => {
    const virsuje = { x: 0, y: 40, width: 1920, height: 1040 };
    const b = popupBounds({ x: 1700, y: 5, width: 24, height: 40 }, virsuje, DYDIS);
    expect(b.y).toBe(48);
  });
});
