import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { startServer } from './index.js';

// SARKA_RESET yra atskiras, sąmoningas jungiklis nuo SARKA_DATA.
// SARKA_DATA vien perkelia duomenų katalogą — jei ištrynimas priklausytų
// tik nuo jo, kiekvienas paleidimas su perkeltais duomenimis juos sunaikintų.
if (process.env.SARKA_RESET === '1' && process.env.SARKA_DATA !== undefined) {
  rmSync(process.env.SARKA_DATA, { recursive: true, force: true });
}

try {
  const { port } = await startServer(join(process.cwd(), 'dist/ui'));
  console.log(`Šarka klausosi porto ${port}`);
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}
