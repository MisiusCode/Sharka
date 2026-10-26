// `npm run app` paleidimo apvalkalas.
//
// `ELECTRON_RUN_AS_NODE` privalo būti VISIŠKAI pašalintas, o ne nustatytas į
// tuščią reikšmę: Electron tikrina kintamojo BUVIMĄ, ne jo turinį. Tuščias
// `ELECTRON_RUN_AS_NODE=` veikia lygiai kaip `=1` — `electron.exe` pasileidžia
// kaip paprastas Node ir nulūžta ties `isolate_data->snapshot_data() != nullptr`
// dar nespėjęs parodyti lango.
//
// Anksčiau čia buvo `cross-env ELECTRON_RUN_AS_NODE= electron .`. Ketinimas
// teisingas — `cmd.exe` `set VAR=` kintamąjį IŠTRINA, tad idioma atrodė
// pažįstama, — bet `cross-env` vaikui perduoda tuščią reikšmę, o ne pašalinimą,
// todėl komanda neveikė niekam, kad ir kokia švari būtų aplinka.
import { spawn } from 'node:child_process';
import electron from 'electron';

delete process.env.ELECTRON_RUN_AS_NODE;

const vaikas = spawn(electron, ['.'], { stdio: 'inherit' });
vaikas.on('exit', (kodas) => process.exit(kodas ?? 0));
