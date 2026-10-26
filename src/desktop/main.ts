import { app, BrowserWindow, dialog, globalShortcut, ipcMain, type Tray } from 'electron';
import { networkInterfaces } from 'node:os';
import { join } from 'node:path';
import { createBackupScheduler } from '../core/backup.js';
import { systemClock } from '../core/clock.js';
import { openDb } from '../core/db.js';
import { resolveLocale, t } from '../core/i18n.js';
import { createReminderScheduler } from '../core/reminders.js';
import { createSettingsStore, SETTING_DEFAULTS } from '../core/settings.js';
import { createTaskStore } from '../core/tasks.js';
import { dataDir, startServer } from '../server/index.js';
import { createAlarmQueue } from './alarmQueue.js';
import { syncAutostart } from './autostart.js';
import { createHotkeyManager } from './hotkey.js';
import { lanUrls } from './network.js';
import { createReminderWindows } from './reminderWindows.js';
import { shouldPlaySound } from './sound.js';
import { createTray } from './tray.js';
import { createWindows } from './windows.js';

// Electron nelaiko `Tray` gyvo už tave — jei vienintelė nuoroda į jį būtų
// vietinis kintamasis `whenReady()` grąžinimo funkcijoje, jis taptų
// šiukšlinamas, kai tik ta funkcija baigtų vykdymą (net jei uždarinių viduje
// jį naudoja kitos tvarkyklės — JS GC juo nesirūpina, jei jos pačios
// nebekviečiamos, pvz., karštojo klavišo registracijai nepavykus). Modulio
// lygio kintamasis ikoną prilaiko visą programos gyvavimo laiką.
let tray: Tray | null = null;

// `--lang` jungiklio ISTORIJA. Pats kvietimas gyvena `else` šakoje žemiau,
// kartu su paaiškinimu, kodėl jis privalo eiti prieš `whenReady()`.
//
// Datos čia nebefigūruoja. Kadaise šis jungiklis egzistavo dėl
// `<input type="date">`, ir su juo ėjo nemalonus kompromisas: `lt` lokalėje
// laukelio užuomina buvo `mmmm-mm-dd`, o pakeisti jos neįmanoma — ji ateina iš
// lokalės, ir natyviam datos laukui `placeholder` negalioja. (Bandyta `en-CA`
// tikintis ISO tvarkos; davė `dd/mm/yyyy` IR angliškus mėnesius, tad blogiau.)
//
// 2026-08-19 natyvūs datos laukeliai pakeisti savu `DateField` komponentu, nes
// planšetės naršyklėje šio jungiklio nėra ir lenta ten liko angliška. Kartu
// dingo ir kompromisas: užuominą dabar rašom patys (`yyyy-mm-dd`), savaitė
// prasideda pirmadieniu, o mėnesiai eina iš `core/calendar.ts`.
//
// Visos matomos datos nuo lokalės nepriklauso — jos eina per
// `formatDate`. Jei kada nors vėl atsirastų `<input type="date">`,
// e2e testas „lentoje neliko nė vieno natyvaus datos laukelio" tai pagaus.

// Duomenų katalogas išsprendžiamas ir Chromium profilis nukreipiamas dar PRIEŠ
// `requestSingleInstanceLock()`. Priežastis rasta paleidžiant: lock'as pasigamina
// `lockfile` tuo metu galiojančiame `userData` kelyje, o tas pagal nutylėjimą yra
// `%APPDATA%/<package.json name>` — TAS PATS katalogas, į kurį taikosi `dataDir()`.
// Vieno tokio failo užtektų, kad katalogas taptų netuščias be `tasks.db`, o tada
// `resolveDataDir` apsauginė šaka („kai neaišku — grąžinam seną") amžinai grįžtų
// prie `taskerpro`. Būtent tos klaidos šis nukreipimas ir vengia, tad jis privalo
// įvykti anksčiau už bet ką, kas gali ten rašyti.
//
// Electron savo Chromium profilį (podėlį, `localStorage`, `Preferences`) pagal
// nutylėjimą deda būtent ten; nuo šiol jis keliauja į `electron` poaplankį, o
// `%APPDATA%/sarka` lieka vien duomenims.
//
// Antram egzemplioriui tai nekenkia: `dataDir()` yra idempotentiškas, bazės
// neatidaro, o lock'ą pralaimėjęs procesas tuoj pat išeina. Abu egzemplioriai
// `setPath` iškviečia vienodai, tad ir pats lock'as skaičiuojamas nuo to paties
// kelio — kitaip jie vienas kito nebematytų.
// Sistemos kalba imama čia, PRIEŠ `dataDir()`, kad ja galėtų naudotis ir šio
// bloko avarinis dialogas žemiau — bazė (kurioje saugoma PASIRINKTA kalba)
// tuo metu dar neatidaryta, tad `resolveLocale` neturi ko kito skaityti.
const systemLocale = app.getPreferredSystemLanguages()[0];

let duomenys: string;
try {
  duomenys = dataDir();
  app.setPath('userData', join(duomenys, 'electron'));
} catch (err) {
  // Iki `whenReady()` langų dar nėra, bet `showErrorBox` veikia ir dabar.
  const avarineKalba = resolveLocale('system', systemLocale);
  dialog.showErrorBox(t(avarineKalba, 'app.name'), t(avarineKalba, 'dialog.dataDirFailed', { error: String(err) }));
  app.exit(1);
  throw err;
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // Sistemos kalba (`systemLocale`) paskaičiuota jau modulio viršuje, PRIEŠ
  // `dataDir()` bloką — jos reikia ir avariniam dialogui ten, dar prieš šią
  // `else` šaką. Čia ji tik naudojama toliau: serveriui, kopijoms, tray'ui ir
  // `--lang` jungikliui žemiau. `getPreferredSystemLanguages()`, o ne
  // `getLocale()`: pastarasis grąžina PROGRAMOS kalbą, t. y. būtent tą, kurią
  // žemiau nustatom patys.

  // Bazė atidaroma PRIEŠ `whenReady()` sąmoningai: `--lang` jungiklis po
  // `whenReady()` nebeveikia, o pasirinktą kalbą žino tik bazė.
  // `dataDir()` remiasi tik `process.env`, tad Electron
  // paruošimo jis nelaukia.
  //
  // Ta pati rankena (kartu su `settingsStore`) toliau gyvena visą programos
  // veikimo laiką, ne tik iki `locale` paskaičiavimo: per ją veikia užduočių
  // saugykla, kurią kas 15 s skaito priminimų ir kopijų planuokliai, o
  // `settingsStore` dar ir rašo tray meniu bei nustatymų langas. Todėl
  // uždaroma ji ne čia pat, o tik `before-quit` tvarkyklėje kartu su kitais
  // ištekliais (žr. komentarą prie jos žemiau).
  let db: ReturnType<typeof openDb>;
  let settingsStore: ReturnType<typeof createSettingsStore>;
  let settings: ReturnType<ReturnType<typeof createSettingsStore>['getAll']>;
  let locale: ReturnType<typeof resolveLocale>;
  try {
    db = openDb(join(duomenys, 'tasks.db'));

    // `createSettingsStore`/`getAll`/`resolveLocale` priklauso ŠIAM `try`,
    // nors patys retai meta: prieš pertvarkymą jie sukosi `whenReady().then()`
    // viduje, tad jų klaidą būtų pagavęs to grandinės `.catch()` ir parodęs
    // dialogą. Dabar jie vykdomi PRIEŠ `whenReady()`, tad be šio bloko ta
    // pati klaida taptų neapdorota išimtimi modulio lygyje — programa
    // „tyliai" neįsijungtų, lygiai kaip komentaras aukščiau perspėja apie
    // pačią `openDb`.
    settingsStore = createSettingsStore(db);
    settings = settingsStore.getAll();
    locale = resolveLocale(settings.locale, systemLocale);
  } catch (err) {
    // Iki `whenReady()` langų dar nėra, bet `showErrorBox` veikia ir dabar —
    // be jo sugadinta bazė reikštų tyliai neįsijungusią programą. Kalba čia
    // irgi sistemos: PASIRINKTA kalba gyvena pačioje bazėje, kurios atidaryti
    // kaip tik nepavyko.
    const avarineKalba = resolveLocale('system', systemLocale);
    dialog.showErrorBox(t(avarineKalba, 'app.name'), t(avarineKalba, 'dialog.dbFailed', { error: String(err) }));
    app.exit(1);
    throw err;
  }

  // Kalba tam, ką Chromium piešia pats: kontekstiniam meniu, teksto laukų
  // valdikliams ir panašiems sisteminiams elementams. PRIVALO būti iškviesta
  // PRIEŠ `app.whenReady()` — po jo jungiklis neveikia.
  app.commandLine.appendSwitch('lang', locale);

  app.whenReady()
    .then(async () => {
      const { port } = await startServer(join(app.getAppPath(), 'dist/ui'), systemLocale);

      const windows = createWindows(`http://127.0.0.1:${port}`, locale);

      // Autostartas sinchronizuojamas su Windows registru iš karto paleidus —
      // nustatymų lange padarytas pakeitimas (žr. `stopSettingsWatch` žemiau)
      // kitaip liktų neįgyvendintas tol, kol vartotojas paleistų programą iš
      // naujo.
      //
      // Abi vietos (čia ir žemiau, sekyklėje) saugomos `app.isPackaged`
      // patikrinimu. `setLoginItemSettings({ openAtLogin: true })` be aiškaus
      // kelio naudoja `process.execPath` — kūrimo metu tai yra
      // `node_modules\electron\dist\electron.exe` BE jokio argumento, tad
      // kiekvienas `npm run app` įrašytų HKCU\...\Run reikšmę, kuri paleidimo
      // metu atvertų plikas Electron langas, o ne šią programą. Įrašas
      // išgyventų net repo ištrynimą, ir NSIS diegėjas jo nepašalintų, nes
      // niekada jo nesukūrė. Autostartas kūrimo paleidimui neturi prasmės.
      const autostartApi = {
        get: () => app.getLoginItemSettings().openAtLogin,
        set: (enabled: boolean) => app.setLoginItemSettings({ openAtLogin: enabled }),
      };
      if (app.isPackaged) syncAutostart(settings.autostart, autostartApi);

      // Numatytasis kopijų aplankas inicializuojamas čia, o ne
      // `core/settings.ts`, nes `core` negali kreiptis į serverio `dataDir`.
      //
      // `try/catch` čia sąmoningai: `isValidBackupDir` (validatorius skirtas
      // HTTP įvesčiai) atmestų `join(dataDir(), 'backups')`, jei `%APPDATA%`
      // yra UNC kelias (domeno roaming profilis) arba `SARKA_DATA` nurodytas
      // reliatyviai — tada `patch` mestų, o ta klaida nukristų iki apatinio
      // `.catch()` ir programa apskritai nepasileistų. Ši reikšmė VIDINĖ, ne
      // nepatikimo kliento įvestis, tad dėl jos programa neturi žūti — be
      // nurodyto `backup_dir` kopijos tiesiog lieka išjungtos.
      if (settingsStore.getAll().backup_dir === '') {
        try {
          settingsStore.patch({ backup_dir: join(dataDir(), 'backups') });
        } catch (err) {
          console.error('Nepavyko nustatyti numatytojo kopijų aplanko:', err);
        }
      }

      const urls = () => lanUrls(port, networkInterfaces());

      // `tray` tampa `null` `before-quit` tvarkyklėje (žr. žemiau), bet
      // uždariniai vis tiek patikrina prieš naudodami — apsauga procesui
      // išeinant, kai Electron negarantuoja, kad joks kitas įvykis
      // (pvz., `second-instance`) po `before-quit` daugiau nebesuveiks.
      const toggleFromTray = (): void => { if (tray) windows.togglePopup(tray.getBounds()); };

      tray = createTray(app.getAppPath(), settings.sound, locale, {
        onQuickAdd: toggleFromTray,
        onOpenBoard: () => windows.openBoard(),
        onSoundChange: (value) => { settingsStore.patch({ sound: value }); },
        onSettings: () => windows.openSettings(urls()),
        onQuit: () => { windows.dispose(); app.quit(); },
      });

      const store = createTaskStore(db, systemClock);

      // `queue` deklaruojama po `reminderWindows`, bet naudojama jo viduje —
      // tvarka čia veikia, nes `onAlarmClosed` iškviečiamas tik vėliau, kai
      // abu jau sukurti. `onAlarmClosed` rašoma kaip rodyklinė funkcija (o
      // ne tiesioginė `queue.resolveCurrent` nuoroda), kad tai liktų
      // akivaizdu ir saugu net pasikeitus deklaracijų tvarkai.
      const reminderWindows = createReminderWindows(`http://127.0.0.1:${port}`, {
        soundFor: (kind) => {
          try {
            return shouldPlaySound(settingsStore.getAll().sound, kind);
          } catch (err) {
            // `db` gali jau būti uždaryta (žr. `before-quit`/`will-quit`
            // komentarą žemiau) — grąžiname numatytosios garso reikšmės
            // elgseną vietoje neapdorotos išimties Electron įvykio
            // tvarkyklės viduje (`win.on('closed', ...)`).
            //
            // Klaida logaujama sąmoningai: šis `catch` gaudo VISKĄ, ne tik
            // uždarytą bazę. Be pėdsako sugadinta schema atrodytų lygiai taip
            // pat — garsas tyliai virstų numatytuoju visam laikui, ir niekas
            // nesuprastų, kodėl.
            console.error('Nepavyko perskaityti garso nustatymo:', err);
            return shouldPlaySound(SETTING_DEFAULTS.sound, kind);
          }
        },
        onAlarmClosed: () => queue.resolveCurrent(),
        snooze: async (taskId, minutes) => {
          try {
            await fetch(`http://127.0.0.1:${port}/api/tasks/${taskId}/snooze`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ minutes }),
            });
          } catch {
            // Serveris nepasiekiamas — automatinis atidėjimas praleidžiamas.
            // Neapdorotas atmestas pažadas Node 22 aplinkoje nukirstų procesą.
          }
        },
        trayBounds: () => (tray === null ? null : tray.getBounds()),
      });

      const queue = createAlarmQueue((task, late) => reminderWindows.showAlarm(task, late));

      const stopScheduler = createReminderScheduler({
        tasks: store,
        settings: settingsStore,
        clock: systemClock,
        events: {
          onAlarm: (task, late) => queue.push(task, late),
          onDigest: () => reminderWindows.showDigest(),
        },
      }).start(15_000);

      const stopBackups = createBackupScheduler({
        db,
        tasks: store,
        settings: settingsStore,
        clock: systemClock,
        keep: 7,
        systemLocale,
      }).start(15_000);

      const hotkeys = createHotkeyManager({
        register: (acc, cb) => globalShortcut.register(acc, cb),
        unregister: (acc) => globalShortcut.unregister(acc),
      });

      const notifyHotkeyConflict = (hotkey: string): void => {
        void dialog.showMessageBox({
          type: 'warning',
          title: t(locale, 'app.name'),
          message: t(locale, 'dialog.hotkeyBusy', { hotkey }),
          detail: t(locale, 'dialog.hotkeyDetail'),
        });
      };

      if (!hotkeys.apply(settings.hotkey, toggleFromTray)) {
        notifyHotkeyConflict(settings.hotkey);
      }

      // Nustatymai keičiami kitame lange (nustatymų lange, per HTTP API), o šis
      // procesas juos turi pasiimti. Naudojame tą patį 15 s ritmą kaip
      // priminimų planuoklis — nustatymai keičiami retai, tad greitesnio
      // atsako nereikia, ir taip visiškai išvengiame dar vieno IPC kanalo.
      //
      // Sargas lygina su `hotkeys.current()` — GYVA būsena, o ne su atmintyje
      // laikoma paskutine bandyta reikšme. `hotkeys.apply` seną kombinaciją
      // atlaisvina PRIEŠ registruodamas naują, tad nepavykus registracijai
      // NIEKAS nebelieka užregistruota (`hotkeys.current()` grąžina `null`).
      // Jei sargas lygintų su atskiru „paskutinė pritaikyta" kintamuoju: `A`
      // veikia; naudotojas pasirenka užimtą `B` → registracija nepavyksta,
      // `A` jau atlaisvintas, bet kintamasis liko `A`; naudotojas grąžina `A`
      // atgal → sargas matytų `current.hotkey === "A"` ir praleistų —
      // naudotojas liktų be jokio veikiančio klavišo tyliai, o nustatymų
      // langas ir toliau rodytų `A` taip, lyg jis veiktų. Lyginant su
      // `hotkeys.current()` tas pats grąžinimas mato realų neatitikimą
      // (`current()` yra `null`, ne `"A"`) ir užregistruoja iš naujo.
      // Kiekvienas ritmas bando iš naujo (naudinga, jei konfliktavusi
      // programa vėliau užsidaro), o pranešimas rodomas tik kartą per
      // kiekvieną nepavykusią reikšmę, kad naudotojo neužverstų dialogo
      // langais kas 15 s.
      let lastFailedHotkey: string | null = null;
      const stopSettingsWatch = setInterval(() => {
        const current = settingsStore.getAll();
        if (app.isPackaged) syncAutostart(current.autostart, autostartApi);
        if (current.hotkey !== hotkeys.current()) {
          if (hotkeys.apply(current.hotkey, toggleFromTray)) {
            lastFailedHotkey = null;
          } else if (lastFailedHotkey !== current.hotkey) {
            lastFailedHotkey = current.hotkey;
            notifyHotkeyConflict(current.hotkey);
          }
        }
      }, 15_000);

      // Antras programos paleidimo bandymas (dvigubas paspaudimas ant .exe,
      // nuoroda meniu ir pan.) nepraeina pro `requestSingleInstanceLock`, bet
      // be šios tvarkyklės jis tiesiog nutrūktų be jokio ženklo — vartotojui
      // atrodytų, kad niekas neįvyko. Rodome langelį — tai ir yra veiksmas,
      // kurio tikimasi paleidus programą.
      app.on('second-instance', () => { if (tray) windows.showPopup(tray.getBounds()); });

      ipcMain.on('popup:hide', () => windows.hidePopup());
      ipcMain.on('board:open', () => windows.openBoard());

      ipcMain.handle('backup:pick', async (event) => {
        // Be tėvinio lango dialogas nemodalus ir gali atsidurti už nustatymų
        // lango (žr. 17 radinį).
        const parent = BrowserWindow.fromWebContents(event.sender);
        const result = parent
          ? await dialog.showOpenDialog(parent, { properties: ['openDirectory'] })
          : await dialog.showOpenDialog({ properties: ['openDirectory'] });
        return result.canceled ? null : result.filePaths[0];
      });

      // Visos išjungimo tvarkyklės surinktos į vieną `before-quit` ir vieną
      // `will-quit` (anksčiau buvo išbarstytos per tris atskiras
      // `will-quit` registracijas ir vieną `before-quit` — būtent tai leido
      // nepastebėti, kad nustatymų sekyklė liko neišvalyta laiku, žr. žemiau).
      //
      // `before-quit` iškviečiamas PRIEŠ Electron pradedant uždarinėti
      // langus, tad tai vienintelė vieta, kuri patikimai suveikia PRIEŠ tą
      // uždarinėjimo tarpą — ir todėl PRIEŠ `db.close()` čia pat žemiau
      // reikia sudėti viską, kas gali būti iškviesta TO tarpo metu:
      //
      // - `reminderWindows.beginShutdown()` pastato `disposed` sargą
      //   ANKSČIAU, nei bet koks langas spėja užsidaryti. Jei sargas būtų
      //   statomas tik `dispose()` viduje `will-quit` tvarkyklėje (kaip
      //   anksčiau), jis pastatomas per vėlai: Electron uždaro visus langus
      //   TARP `before-quit` ir `will-quit`, tad kiekvieno žadintuvo
      //   `closed` tvarkyklė suveiktų būtent šiame tarpe, kol sargas dar
      //   nuleistas — `onAlarmClosed` → eilės kitas žadintuvas → naujas
      //   `BrowserWindow` kuriamas TOKIU metu, kai Electron skaičiuoja, ar
      //   langų sąrašas ištuštėjo (tad `will-quit` gali niekada nesuveikti,
      //   ir `app.quit()` pakimba), o naujo žadintuvo `soundFor` skaitytų
      //   nustatymus iš `db`, kuri jau uždaryta.
      // - `tray?.destroy()` čia pat, PRIEŠ `db.close()`, nes kol ikona gyva,
      //   jos meniu lieka paspaudžiamas per visą uždarinėjimo tarpą —
      //   `onSoundChange` rašytų (`settingsStore.patch`) į bazę, kuri gali
      //   užsidaryti bet kurią akimirką. (Ankstesnis šios vietos komentaras
      //   teigė priešingai — kad `tray` privalo išgyventi iki `will-quit`
      //   pabaigos, nes `reminderWindows.dispose()`'o `closed` tvarkyklė
      //   galinti iškviesti `onAlarmClosed` → eilės kitą žadintuvą →
      //   `tray.getBounds()`. Tai buvo klaidinga: `dispose()` (dabar ir
      //   `beginShutdown()`) PIRMOJE eilutėje pastato `disposed`, tad tuo
      //   keliu `onAlarmClosed` fiziškai negali suveikti — žr. testus
      //   `tests/desktop/reminderWindows.test.ts`.)
      // - Tada sustabdomi abu planuokliai (priminimų ir kopijų) bei nustatymų
      //   sekyklė (anksčiau tai buvo daroma tik `will-quit` tvarkyklėje, tad
      //   tas pačias sekundes trunkantis uždarinėjimo tarpas leisdavo 15 s
      //   tikrinimui pataikyti į jau uždarytą bazę ir mesti neapdorotą
      //   išimtį iš `setInterval` viduje). Kopijų planuoklis (`stopBackups`)
      //   priklauso tai pačiai grupei — jis irgi skaito `db` kas 15 s.
      // - Ir tik pačioje pabaigoje uždaroma pati bazė.
      app.on('before-quit', () => {
        reminderWindows.beginShutdown();
        tray?.destroy();
        tray = null;
        stopScheduler();
        stopBackups();
        clearInterval(stopSettingsWatch);
        db.close();
      });

      // `will-quit`: sunaikina tai, kas `db` nebeliečia — likusius (jau
      // nebeturinčius poveikio bazei, nes `disposed` jau pastatytas)
      // priminimų langus ir karštojo klavišo registraciją.
      app.on('will-quit', () => {
        reminderWindows.dispose();
        hotkeys.dispose();
      });
    })
    .catch((err: unknown) => {
      // Be šito užimti visi portai (arba natyvaus modulio ABI klaida) reikštų
      // tylų atmestą pažadą: programa liktų kaboti be serverio ir be jokio
      // ženklo naudotojui.
      dialog.showErrorBox(t(locale, 'app.name'), t(locale, 'dialog.serverFailed', { error: String(err) }));
      // `db` nuo šio pertvarkymo (8 užduotis) atidaroma PRIEŠ `whenReady()`,
      // tad jei ŠIS `.catch()` suveikia (pvz., `startServer` nepavyksta),
      // didysis `before-quit` tvarkytojas žemiau dar NEUŽREGISTRUOTAS ir jo
      // `db.close()` niekada nepasiektų — be šios eilutės bazė liktų
      // atidaryta iki proceso pabaigos. Dukart neuždarysime: jei kodas būtų
      // nuėjęs iki `before-quit` registracijos, ŠIS `.catch()` apskritai
      // nebūtų pasiektas, nes po tos registracijos daugiau nieko, kas galėtų
      // mesti klaidą, nebelieka.
      db.close();
      app.quit();
    });

  // Programa gyvena tray'uje — uždaryti visus langus nereiškia išeiti.
  app.on('window-all-closed', () => {});
}
