import type { Priority, Status } from './types.js';

// Žinutės gyvena `core`, nes jų reikia visiems sluoksniams: lentai, tray
// meniu, CSV eksportui ir žadintuvui. Modulis PRIVALO likti be Node builtinų —
// jį importuoja naršyklės paketas (žr. `docs/architektura.md` taisyklę apie
// `core` modulius, kuriuos naudoja `ui`).

export type Locale = 'lt' | 'en';
export type LocaleSetting = Locale | 'system';

export const LOCALES: Locale[] = ['lt', 'en'];

const LT = {
  // Prekės ženklas irgi verčiamas: lietuviškai „Šarka" (paukštis), angliškai
  // „Sharka" — diakritiko anglakalbis neperskaitys ir paieškoje neįves.
  // Diegimo failo `productName` (`electron-builder.yml`) lieka „Šarka".
  'app.name': 'Šarka',

  'bucket.today': 'Šiandien',
  'bucket.tomorrow': 'Rytoj',
  'bucket.week': 'Per savaitę',
  'bucket.later': 'Vėliau',

  'done.today': 'Šiandien',
  'done.yesterday': 'Vakar',
  'done.week': 'Šią savaitę',
  'done.earlier': 'Anksčiau',

  'status.todo': 'Reikia padaryti',
  'status.doing': 'Vykdoma',
  'status.done': 'Atlikta',

  'priority.1': 'Aukštas',
  'priority.2': 'Vidutinis',
  'priority.3': 'Žemas',

  'filter.date': 'Datos',
  'filter.status': 'Progresas',
  'filter.completed': 'Padaryta',
  'filter.showDone': 'Rodyti atliktas',

  'repeat.weekday': 'kas {day}',
  'repeat.monthday': 'kas {day} dieną',
  'repeat.lastDay': 'paskutinę mėnesio dieną',

  'csv.title': 'Pavadinimas',
  'csv.status': 'Būsena',
  'csv.priority': 'Prioritetas',
  'csv.due': 'Terminas',
  'csv.reminder': 'Priminimas',
  'csv.created': 'Sukurta',
  'csv.completed': 'Atlikta',
  'csv.repeat': 'Kartojimas',

  'quickAdd.label': 'Nauja užduotis',
  'quickAdd.placeholder': 'Nauja užduotis…',

  'board.loading': 'Kraunama…',
  'board.offline': 'Nėra ryšio su serveriu',
  'board.from': 'Nuo',
  'board.to': 'Iki',
  'board.review': 'Peržiūrėti',
  'board.rangeInvalid': 'Pradžios data vėlesnė už pabaigos.',
  'board.doneCount': 'Padaryta: {count}',
  'board.back': 'Grįžti',
  'board.doneWeek': 'Per savaitę padaryta {count}',
  'board.rangeEmpty': 'Per šį laikotarpį nieko nepadaryta.',
  'board.dragHandle': 'Užduoties kortelė, tempiama',

  'list.empty': 'Užduočių nėra',

  'card.markDone': 'Pažymėti atlikta',
  'card.title': 'Užduoties pavadinimas',
  'card.due': 'Keisti terminą',
  'card.delete': 'Ištrinti',

  'due.date': 'Data',
  'due.time': 'Laikas',
  'due.repeat': 'Kartojimas',
  'due.noRepeat': 'Nesikartoja',
  'due.priority': '{level} prioritetas',

  'date.calendar': '{label} — kalendorius',
  'date.prevMonth': 'Ankstesnis mėnuo',
  'date.nextMonth': 'Kitas mėnuo',

  'alarm.title': 'Priminimas',
  'alarm.late': 'vėluoja {minutes} min',
  'alarm.done': 'Atlikta',
  'alarm.snooze': 'Atidėti 10 min',
  'alarm.mute': 'Nutildyti',

  'common.close': 'Uždaryti',

  'digest.remaining': 'Šiandienai liko {count}',

  'settings.title': 'Nustatymai',
  'settings.port': 'Portas',
  'settings.portRestart': 'Portas įsigalios paleidus programą iš naujo',
  'settings.hotkey': 'Karštasis klavišas',
  'settings.sound': 'Garsas',
  'settings.soundAlways': 'Visada',
  'settings.soundAlarms': 'Tik žadintuvams',
  'settings.soundOff': 'Išjungta',
  'settings.digest': 'Dienos apžvalga',
  'settings.digestTime': 'Apžvalgos laikas',
  'settings.theme': 'Tema',
  'settings.themeSystem': 'Pagal sistemą',
  'settings.themeLight': 'Šviesi',
  'settings.themeDark': 'Tamsi',
  'settings.language': 'Kalba',
  'settings.langSystem': 'Pagal sistemą',
  'settings.autostart': 'Paleisti su Windows',
  'settings.backupDir': 'Kopijų aplankas',
  'settings.pickDir': 'Parinkti aplanką',
  'settings.backupHint': 'Kopija šalia originalo apsaugo nuo sugadinto failo, bet ne nuo mirusio disko. Nurodyk OneDrive, Dropbox ar tinklo disko aplanką.',
  'settings.backupOff': 'Atsarginės kopijos išjungtos — aplankas nenurodytas',
  'settings.backupLast': 'Paskutinė kopija: {when}',
  'settings.backupNever': 'dar nedaryta',
  'settings.backupFailed': 'paskutinis bandymas nepavyko — {error}',
  'settings.newPin': 'Naujas PIN',
  'settings.savePin': 'Išsaugoti PIN',
  'settings.removePin': 'Pašalinti PIN',
  'settings.lan': 'Leisti prieigą iš tinklo',
  'settings.lanNeedsPin': 'Tinklo prieigai pirma nustatyk PIN kodą.',
  'settings.lanRestart': 'Tinklo prieiga įsigalioja paleidus programą iš naujo.',
  'settings.forTablet': 'Planšetei',
  'settings.noAddresses': 'Tinklo adresų nerasta',
  'settings.loadFailed': 'Nepavyko užkrauti nustatymų: {error}',
  'settings.unknownError': 'nežinoma klaida',

  // Vertimas serverio klaidų kodams: serveris nuo šiol siunčia
  // tik anglišką `message` kaip atsarginę reikšmę, o tikrąjį tekstą pagal
  // `error.code` parenka `ui/errorText.ts`. Po vieną raktą kiekvienam
  // serverio ApiError kodui — žr. `src/server/routes/*.ts`.
  'error.invalid_title': 'Pavadinimas negali būti tuščias',
  'error.invalid_status': 'Nežinoma būsena',
  'error.invalid_priority': 'Prioritetas turi būti 1, 2 arba 3',
  'error.invalid_due_at': 'Netinkamas terminas',
  'error.invalid_remind_at': 'Netinkamas priminimo laikas',
  'error.invalid_repeat': 'Netinkamas kartojimo šablonas',
  'error.invalid_minutes': 'Minutės turi būti teigiamas skaičius',
  'error.not_found': 'Užduotis nerasta',
  'error.invalid_pin': 'Neteisingas PIN',
  'error.invalid_pin_format': 'PIN turi būti 4–8 skaitmenys',
  'error.too_many_attempts': 'Per daug bandymų. Pabandyk po 15 minučių',
  'error.protected_setting': 'PIN keičiamas per /api/pin',
  'error.invalid_setting': 'Netinkama nustatymo reikšmė',
  // Šią klaidą planšetė gali parodyti tikrai — savininkas prie savo
  // kompiuterio UNC kelią nustatyti gali, o iš kito įrenginio tinkle — ne.
  'error.remote_backup_dir': 'Tinklo kelio iš kito įrenginio nustatyti negalima',
  // Naudotojas šią klaidą gali pamatyti realiai: pvz., kai kompiuterio vardas
  // yra FQDN, o planšetė kreipiasi trumpuoju vardu — žr. `isAllowedHost`
  // (`server/hosts.ts`).
  'error.forbidden_host': 'Netikėtas kreipimosi adresas',
  'error.unauthorized': 'Reikia prisijungti',
  'error.offline': 'Nepavyko susisiekti su serveriu',
  'error.invalid_json': 'Netinkamas JSON kūnas',
  'error.internal': 'Vidinė klaida',
  'pin.label': 'PIN kodas',
  'pin.submit': 'Prisijungti',

  // Tray meniu ir Electron dialogai (`src/desktop/`) — React ten neveikia,
  // tad kalba imama tiesiai per `t`, ne per komponentus.
  'tray.newTask': 'Nauja užduotis',
  'tray.openBoard': 'Atidaryti lentą',
  'tray.sound': 'Garsas',
  'tray.quit': 'Išjungti',
  'dialog.hotkeyBusy': 'Kombinacija {hotkey} užimta',
  'dialog.hotkeyDetail': 'Pasirink kitą nustatymuose. Programa veikia — naudok tray ikoną.',
  'dialog.serverFailed': 'Nepavyko paleisti serverio:\n{error}',
  'dialog.dataDirFailed': 'Nepavyko paruošti duomenų katalogo:\n{error}',
  'dialog.dbFailed': 'Nepavyko atidaryti duomenų bazės:\n{error}',
} as const;

// Raktų aibė imama iš lietuviškos lentelės, tad TypeScript neleis angliškoje
// pamiršti rakto ar pridėti nesamo. Tai pigiau nei bet koks vykdymo meto
// tikrinimas — klaida matoma dar prieš paleidžiant testus.
export type MessageKey = keyof typeof LT;

const EN: Record<MessageKey, string> = {
  'app.name': 'Sharka',

  'bucket.today': 'Today',
  'bucket.tomorrow': 'Tomorrow',
  // Ne „This week": kolona apima šiandien+2…šiandien+7, tai slenkanti
  // savaitė, ne kalendorinė.
  // Ne „Within a week" (skambėjo kaip įpareigojimas šalia „Today" / „Tomorrow" /
  // „Later") — „Next 7 days" tiksliai atitinka slenkantį langą ir simetriškai
  // pritampa prie „Last 7 days" žemiau (`done.week`).
  'bucket.week': 'Next 7 days',
  'bucket.later': 'Later',

  'done.today': 'Today',
  'done.yesterday': 'Yesterday',
  // Ne „This week": bucket'as skaičiuoja atgal septynias dienas nuo šiandien
  // (žr. `completedBucketOf`), tad prieš šešias dienas atlikta užduotis
  // dažniausiai yra PRAĖJUSIOS, ne šios kalendorinės savaitės.
  'done.week': 'Last 7 days',
  'done.earlier': 'Earlier',

  'status.todo': 'To do',
  'status.doing': 'In progress',
  'status.done': 'Done',

  'priority.1': 'High',
  'priority.2': 'Medium',
  'priority.3': 'Low',

  'filter.date': 'Dates',
  'filter.status': 'Progress',
  // Ne „Done": tai mygtukas, perjungiantis į peržiūros ekraną, o „Done" jau
  // reiškia `status.done` — atskiro stulpelio antraštę. Lietuviškai šie du
  // dalykai sąmoningai skiriasi („Padaryta" vs „Atlikta"); „Completed" laiko
  // tą patį atskyrimą angliškai, kad greta atsiradus stulpeliui „Done"
  // (kita užduotis) mygtukas su juo nesusilietų į tą patį žodį.
  'filter.completed': 'Completed',
  'filter.showDone': 'Show completed',

  'repeat.weekday': 'every {day}',
  // Be kelintinių skaitvardžių: „15th" reikalautų galūnių lentelės, o
  // vienintelė nauda būtų grožis. Forma „monthly on day {day}", ne „on day
  // {day} of each month" — kad šalia „every {day}" (tas pats šaltinis, ↻
  // paaiškinimas ir CSV „Repeat" stulpelis) abu prasidėtų būdvardžiu/dažnumu,
  // ne prielinksniu.
  'repeat.monthday': 'monthly on day {day}',
  'repeat.lastDay': 'on the last day of the month',

  'csv.title': 'Title',
  'csv.status': 'Status',
  'csv.priority': 'Priority',
  // Ne vien „Due": stulpelis laiko datą, o plikas „Due" skaitosi kaip
  // vėliava/žymė, ne kaip stulpelio antraštė.
  'csv.due': 'Due date',
  'csv.reminder': 'Reminder',
  'csv.created': 'Created',
  'csv.completed': 'Completed',
  'csv.repeat': 'Repeat',

  'quickAdd.label': 'New task',
  'quickAdd.placeholder': 'New task…',

  'board.loading': 'Loading…',
  'board.offline': 'No connection to the server',
  'board.from': 'From',
  'board.to': 'To',
  // Ne „Review": mygtukas rodo užduočių sąrašą per pasirinktą laikotarpį, ne
  // peržiūros/patvirtinimo veiksmą — „Show" atitinka lietuvišką „Peržiūrėti"
  // šiame kontekste (parodyk rezultatą), be svetimos konotacijos.
  'board.review': 'Show',
  'board.rangeInvalid': 'The start date is after the end date.',
  'board.doneCount': 'Completed: {count}',
  'board.back': 'Back',
  'board.doneWeek': 'Completed this week: {count}',
  'board.rangeEmpty': 'Nothing was completed in this period.',
  'board.dragHandle': 'Task card, draggable',

  'list.empty': 'No tasks',

  'card.markDone': 'Mark done',
  'card.title': 'Task title',
  'card.due': 'Change due date',
  'card.delete': 'Delete',

  'due.date': 'Date',
  'due.time': 'Time',
  'due.repeat': 'Repeat',
  'due.noRepeat': 'Does not repeat',
  'due.priority': '{level} priority',

  'date.calendar': '{label} — calendar',
  'date.prevMonth': 'Previous month',
  'date.nextMonth': 'Next month',

  'alarm.title': 'Reminder',
  'alarm.late': '{minutes} min late',
  'alarm.done': 'Done',
  'alarm.snooze': 'Snooze 10 min',
  'alarm.mute': 'Mute',

  'common.close': 'Close',

  'digest.remaining': '{count} left for today',

  'settings.title': 'Settings',
  'settings.port': 'Port',
  'settings.portRestart': 'The port takes effect after a restart',
  'settings.hotkey': 'Global hotkey',
  'settings.sound': 'Sound',
  'settings.soundAlways': 'Always',
  'settings.soundAlarms': 'Alarms only',
  'settings.soundOff': 'Off',
  'settings.digest': 'Daily digest',
  'settings.digestTime': 'Digest time',
  'settings.theme': 'Theme',
  'settings.themeSystem': 'System',
  'settings.themeLight': 'Light',
  'settings.themeDark': 'Dark',
  'settings.language': 'Language',
  'settings.langSystem': 'System',
  'settings.autostart': 'Start with Windows',
  'settings.backupDir': 'Backup folder',
  'settings.pickDir': 'Choose folder',
  'settings.backupHint': 'A copy next to the original protects against a corrupted file, but not against a dead disk. Choose a OneDrive, Dropbox or network drive folder.',
  'settings.backupOff': 'Backups are off — no folder set',
  'settings.backupLast': 'Last backup: {when}',
  'settings.backupNever': 'not yet',
  'settings.backupFailed': 'the last attempt failed — {error}',
  'settings.newPin': 'New PIN',
  'settings.savePin': 'Save PIN',
  'settings.removePin': 'Remove PIN',
  'settings.lan': 'Allow access from the network',
  'settings.lanNeedsPin': 'Set a PIN before allowing network access.',
  'settings.lanRestart': 'Network access takes effect after a restart.',
  'settings.forTablet': 'For the tablet',
  'settings.noAddresses': 'No network addresses found',
  'settings.loadFailed': 'Could not load settings: {error}',
  'settings.unknownError': 'unknown error',

  'error.invalid_title': 'Title cannot be empty',
  'error.invalid_status': 'Unknown status',
  'error.invalid_priority': 'Priority must be 1, 2 or 3',
  'error.invalid_due_at': 'Invalid due date',
  'error.invalid_remind_at': 'Invalid reminder time',
  'error.invalid_repeat': 'Invalid repeat pattern',
  'error.invalid_minutes': 'Minutes must be a positive number',
  'error.not_found': 'Task not found',
  'error.invalid_pin': 'Wrong PIN',
  'error.invalid_pin_format': 'The PIN must be 4–8 digits',
  'error.too_many_attempts': 'Too many attempts. Try again in 15 minutes',
  'error.protected_setting': 'The PIN is changed via /api/pin',
  'error.invalid_setting': 'Invalid setting value',
  'error.remote_backup_dir': 'A network path cannot be set from another device',
  'error.forbidden_host': 'Unexpected Host header',
  'error.unauthorized': 'Sign in required',
  'error.offline': 'Could not reach the server',
  'error.invalid_json': 'Malformed JSON body',
  'error.internal': 'Internal error',
  'pin.label': 'PIN',
  'pin.submit': 'Sign in',

  'tray.newTask': 'New task',
  'tray.openBoard': 'Open board',
  'tray.sound': 'Sound',
  'tray.quit': 'Quit',
  'dialog.hotkeyBusy': 'The {hotkey} shortcut is taken',
  'dialog.hotkeyDetail': 'Choose another one in Settings. The app is running — use the tray icon.',
  'dialog.serverFailed': 'Could not start the server:\n{error}',
  'dialog.dataDirFailed': 'Could not prepare the data folder:\n{error}',
  'dialog.dbFailed': 'Could not open the database:\n{error}',
};

export const MESSAGES: Record<Locale, Record<MessageKey, string>> = { lt: LT, en: EN };

export function t(
  locale: Locale,
  key: MessageKey,
  params?: Record<string, string | number>,
): string {
  const sablonas = MESSAGES[locale][key];
  if (params === undefined) return sablonas;
  return sablonas.replace(/\{(\w+)\}/g, (visas, vardas: string) =>
    Object.prototype.hasOwnProperty.call(params, vardas) ? String(params[vardas]) : visas);
}

const STATUS_KEYS: Record<Status, MessageKey> = {
  todo: 'status.todo',
  doing: 'status.doing',
  done: 'status.done',
};

const PRIORITY_KEYS: Record<Priority, MessageKey> = {
  1: 'priority.1',
  2: 'priority.2',
  3: 'priority.3',
};

export function statusLabel(locale: Locale, status: Status): string {
  return t(locale, STATUS_KEYS[status]);
}

export function priorityLabel(locale: Locale, priority: Priority): string {
  return t(locale, PRIORITY_KEYS[priority]);
}

// Sistemos kalba ateina iš išorės (`navigator.language` naršyklėje,
// `app.getLocale()` Electron'e), nes `core` nežino, kur yra paleistas.
export function resolveLocale(setting: LocaleSetting, systemLocale: string | undefined): Locale {
  if (setting !== 'system') return setting;
  if (systemLocale === undefined) return 'en';
  const zyme = systemLocale.toLowerCase();
  return zyme === 'lt' || zyme.startsWith('lt-') ? 'lt' : 'en';
}
