import { beforeEach, describe, expect, it } from 'vitest';
import { openDb } from '../../src/core/db.js';
import { createSettingsStore } from '../../src/core/settings.js';

let store: ReturnType<typeof createSettingsStore>;

beforeEach(() => {
  store = createSettingsStore(openDb(':memory:'));
});

it('grąžina numatytąsias reikšmes tuščioje bazėje', () => {
  expect(store.getAll()).toEqual({
    grouping: 'date',
    theme: 'system',
    sound: 'alarms',
    digest_times: ['10:00', '15:30'],
    port: 8080,
    hotkey: 'Ctrl+Alt+Space',
    autostart: true,
    last_digest: null,
    backup_dir: '',
    last_backup: null,
    last_backup_error: null,
  });
});

it('išsaugo pakeitimą ir palieka likusius nepaliestus', () => {
  const after = store.patch({ grouping: 'status', port: 9090 });
  expect(after.grouping).toBe('status');
  expect(after.port).toBe(9090);
  expect(after.theme).toBe('system');
  expect(store.getAll().grouping).toBe('status');
});

it('išlaiko sudėtinių reikšmių tipus', () => {
  const after = store.patch({ digest_times: ['09:00'], autostart: false });
  expect(after.digest_times).toEqual(['09:00']);
  expect(after.autostart).toBe(false);
});

it('atmeta nežinomą raktą', () => {
  expect(() => store.patch({ nesamas: 1 } as never)).toThrow('Nežinomas nustatymas: nesamas');
});

it('atmeta netinkamą portą', () => {
  expect(() => store.patch({ port: 'abc' } as never)).toThrow('Netinkama nustatymo reikšmė: port');
  expect(() => store.patch({ port: 0 })).toThrow('Netinkama nustatymo reikšmė: port');
  expect(() => store.patch({ port: 65536 })).toThrow('Netinkama nustatymo reikšmė: port');
  expect(() => store.patch({ port: 1.5 })).toThrow('Netinkama nustatymo reikšmė: port');
});

it('atmeta netinkamą grupavimą', () => {
  expect(() => store.patch({ grouping: 'kita' } as never)).toThrow(
    'Netinkama nustatymo reikšmė: grouping',
  );
});

it('grupavimas priima trečią reikšmę', () => {
  expect(() => store.patch({ grouping: 'completed' })).not.toThrow();
  expect(store.getAll().grouping).toBe('completed');
});

it('atmeta netinkamą temą', () => {
  expect(() => store.patch({ theme: 'melyna' } as never)).toThrow(
    'Netinkama nustatymo reikšmė: theme',
  );
});

it('atmeta netinkamą garso reikšmę', () => {
  expect(() => store.patch({ sound: 'garsiai' } as never)).toThrow(
    'Netinkama nustatymo reikšmė: sound',
  );
});

it('atmeta netinkamą hotkey', () => {
  expect(() => store.patch({ hotkey: '' })).toThrow('Netinkama nustatymo reikšmė: hotkey');
  expect(() => store.patch({ hotkey: 5 } as never)).toThrow('Netinkama nustatymo reikšmė: hotkey');
});

it('atmeta netinkamą autostart', () => {
  expect(() => store.patch({ autostart: 'taip' } as never)).toThrow(
    'Netinkama nustatymo reikšmė: autostart',
  );
});

it('atmeta netinkamus digest_times', () => {
  expect(() => store.patch({ digest_times: 'abc' } as never)).toThrow(
    'Netinkama nustatymo reikšmė: digest_times',
  );
  expect(() => store.patch({ digest_times: ['25:00'] })).toThrow(
    'Netinkama nustatymo reikšmė: digest_times',
  );
  expect(() => store.patch({ digest_times: ['10:60'] })).toThrow(
    'Netinkama nustatymo reikšmė: digest_times',
  );
  expect(() => store.patch({ digest_times: ['9:00'] })).toThrow(
    'Netinkama nustatymo reikšmė: digest_times',
  );
});

it('atmeta netinkamą last_digest', () => {
  expect(() => store.patch({ last_digest: 42 } as never)).toThrow(
    'Netinkama nustatymo reikšmė: last_digest',
  );
});

it('leidžia last_digest lygų null', () => {
  expect(store.patch({ last_digest: null }).last_digest).toBeNull();
});

it('galiojantis pataisymas vis tiek pritaikomas', () => {
  const after = store.patch({ port: 9090, grouping: 'status', digest_times: ['09:30'] });
  expect(after.port).toBe(9090);
  expect(after.grouping).toBe('status');
  expect(after.digest_times).toEqual(['09:30']);
});

it('nerodo schema_version tarp nustatymų', () => {
  expect(store.getAll()).not.toHaveProperty('schema_version');
});

it('grąžina savarankišką kopiją, o ne bendrą numatytųjų reikšmių nuorodą', () => {
  const first = store.getAll();
  first.digest_times.push('12:00');

  expect(store.getAll().digest_times).toEqual(['10:00', '15:30']);
});

describe('karštojo klavišo validacija', () => {
  it('priima kombinacijas su modifikatoriumi', () => {
    for (const ok of ['Ctrl+Alt+Space', 'Ctrl+Shift+T', 'Alt+F9', 'CommandOrControl+K']) {
      expect(() => store.patch({ hotkey: ok })).not.toThrow();
      expect(store.getAll().hotkey).toBe(ok);
    }
  });

  it('atmeta pliką klavišą — kitaip programa pasisavintų jį visoje sistemoje', () => {
    expect(() => store.patch({ hotkey: 'T' })).toThrow('Netinkama nustatymo reikšmė: hotkey');
    expect(() => store.patch({ hotkey: 'Space' })).toThrow();
    expect(() => store.patch({ hotkey: 'F9' })).toThrow();
  });

  it('atmeta vien modifikatorius ir tuščias reikšmes', () => {
    for (const bad of ['Ctrl', 'Ctrl+', 'Ctrl+Alt', '', '+', 'Ctrl+Nesamas+']) {
      expect(() => store.patch({ hotkey: bad })).toThrow();
    }
  });

  it('atmeta AltGr — Windows jį registruoja kaip pliką klavišą', () => {
    // Electron `AltGr+T` išparsuoja į `EF_ALTGR_DOWN`, kurio Chromium'o
    // Windows globalaus sparčiojo klavišo registratorius nemato (jo kaukė
    // sudaroma tik iš Shift/Ctrl/Alt/Cmd) — registracija virsta plikos `T`
    // registracija visoje sistemoje. Jei šis testas kada nors ims žlugti,
    // tai reiškia, kad `AltGr` grąžintas į `MODIFIKATORIAI` sąrašą, o tai
    // vėl atvertų šią spragą.
    expect(() => store.patch({ hotkey: 'AltGr+T' })).toThrow('Netinkama nustatymo reikšmė: hotkey');
  });
});

describe('atsarginių kopijų nustatymai', () => {
  it('numatytieji yra tuščias kelias ir jokios istorijos', () => {
    const s = store.getAll();
    expect(s.backup_dir).toBe('');
    expect(s.last_backup).toBeNull();
    expect(s.last_backup_error).toBeNull();
  });

  it('priima kelią ir datą', () => {
    store.patch({ backup_dir: 'D:\\Kopijos', last_backup: '2026-08-17' });
    expect(store.getAll().backup_dir).toBe('D:\\Kopijos');
    expect(store.getAll().last_backup).toBe('2026-08-17');
  });

  it('atmeta ne tekstinį kelią', () => {
    expect(() => store.patch({ backup_dir: 7 as never })).toThrow('Netinkama nustatymo reikšmė: backup_dir');
  });
});
