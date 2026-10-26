import { MESSAGES, t, type Locale } from '../core/i18n.js';
import { ApiClientError } from './api.js';

// Vertimas gyvena kliente, nes tik jis žino, kokia kalba dabar rodoma sąsaja.
// Nežinomas kodas (senesnė sąsaja, naujesnis serveris) nukrenta į serverio
// žinutę — ji angliška, bet konkreti, tad geriau už bendrą „klaida".
export function errorText(locale: Locale, err: unknown): string {
  if (err instanceof ApiClientError && err.code !== null) {
    const key = `error.${err.code}`;
    if (key in MESSAGES[locale]) {
      return t(locale, key as Parameters<typeof t>[1]);
    }
  }
  return err instanceof Error ? err.message : String(err);
}
