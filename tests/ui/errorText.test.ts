import { describe, expect, it } from 'vitest';
import { ApiClientError } from '../../src/ui/api.js';
import { errorText } from '../../src/ui/errorText.js';

describe('errorText', () => {
  it('žinomą kodą verčia pasirinkta kalba', () => {
    const err = new ApiClientError('invalid_title', 'Title cannot be empty');
    expect(errorText('lt', err)).toBe('Pavadinimas negali būti tuščias');
    expect(errorText('en', err)).toBe('Title cannot be empty');
  });

  it('nežinomam kodui palieka serverio žinutę', () => {
    // Serveris gali būti naujesnis už sąsają (planšetė kešuoja seną paketą) —
    // tada angliška serverio žinutė yra geriau nei bendras „klaida".
    const err = new ApiClientError('brand_new_code', 'Something specific happened');
    expect(errorText('lt', err)).toBe('Something specific happened');
  });

  it('paprastą Error palieka kaip yra', () => {
    expect(errorText('lt', new Error('Kažkas nutiko'))).toBe('Kažkas nutiko');
  });
});
