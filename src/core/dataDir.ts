import { existsSync, readdirSync, renameSync, rmdirSync } from 'node:fs';
import { join } from 'node:path';

export const DIR_NAME = 'sarka';

// Vardas iki 2026-08-19 pervadinimo. Kai visi įrenginiai bus pasileidę bent
// kartą, ši eilutė ir `resolveDataDir` perkėlimo šaka nebereikalingos — bet
// ištrinti jas galima tik įsitikinus, kad seno aplanko niekur nebeliko.
export const LEGACY_DIR_NAME = 'taskerpro';

const DB_FILE = 'tasks.db';

// Parenka duomenų katalogą ir, jei reikia, vienkartinai perkelia seną.
//
// Visos šakos parinktos taip, kad nė vienoje nebūtų įmanoma prarasti duomenų.
// Kai neaišku — grąžinamas SENAS katalogas: programa su senu keliu ir tikrais
// duomenimis yra teisingesnė būsena nei nauju keliu ir tuščia.
export function resolveDataDir(base: string): string {
  const naujas = join(base, DIR_NAME);
  const senas = join(base, LEGACY_DIR_NAME);

  // Naujajame jau yra duomenų bazė — perkėlimas įvykęs, daugiau nieko neliečiam.
  if (existsSync(join(naujas, DB_FILE))) return naujas;

  // Sename duomenų bazės nėra — nėra ko perkelti (švarus diegimas).
  if (!existsSync(join(senas, DB_FILE))) return naujas;

  try {
    if (existsSync(naujas)) {
      // Naujajame kažkas yra, bet ne duomenų bazė. Suliejimas dviejų katalogų
      // po vieną failą galėtų nutrūkti įpusėjus ir palikti duomenis perskeltus,
      // tad nerizikuojam — dirbam su senuoju.
      //
      // Elgesio ši eilutė nekeičia: `rmdirSync` ant netuščio katalogo ir taip
      // meta ENOTEMPTY, kurį pagauna `catch` žemiau (patikrinta mutacija —
      // ją pašalinus nė vienas testas nenulūžta). Palikta sąmoningai: ji
      // nepriklauso nuo to, kaip `rmdirSync` elgiasi su netuščiu katalogu, o
      // šitoje šakoje klaidos kaina yra svetimo turinio ištrynimas.
      if (readdirSync(naujas).length > 0) return senas;
      // Tuščias katalogas pašalinamas, kad pervadinimas liktų atomiškas ir
      // WAL palydovai (`tasks.db-wal`, `tasks.db-shm`) keliautų kartu.
      rmdirSync(naujas);
    }
    renameSync(senas, naujas);
    return naujas;
  } catch {
    // Nepavyko: failas užrakintas veikiančios programos, kitas diskas, teisės.
    // Nieko neištrinta — dirbam iš seno katalogo ir bandom vėl kitą paleidimą.
    return senas;
  }
}
