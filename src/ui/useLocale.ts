import { resolveLocale, type Locale } from '../core/i18n.js';
import type { PublicSettings } from '../core/settings.js';

interface Narsykle { userAgent: string; language: string }

// Kalbos sąsaja neskaičiuoja pati — paprastai ją atsiunčia serveris
// (`resolved_locale`). Viena išimtis: „pagal sistemą" planšetėje turi reikšti
// TOS planšetės kalbą, o serveris žino tik kompiuterio, kuriame pats sukasi,
// kalbą. Electron lange `navigator.language` seka mūsų pačių
// `--lang` jungiklį, tad ten jo klausti beprasmiška — kalbą jau
// teisingai išsprendė serveris; Electron langą atskiriame per `userAgent`,
// kuriame jis visada turi `Electron/`.
export function localeOf(
  settings: PublicSettings | null,
  narsykle: Narsykle = navigator,
): Locale {
  if (settings === null) return 'lt';
  if (settings.locale === 'system' && !narsykle.userAgent.includes('Electron/')) {
    return resolveLocale('system', narsykle.language);
  }
  return settings.resolved_locale;
}

// PIN ekranas yra vienintelė vieta, kur nustatymų parsisiųsti NEĮMANOMA:
// serveris į viską atsako 401, kol nėra sesijos. Naršyklės kalba čia
// legitimi — `--lang` jungiklis veikia tik Electron languose, o
// jie eina per loopback ir PIN ekrano nemato niekada.
export function browserLocale(): Locale {
  return resolveLocale('system', navigator.language);
}
