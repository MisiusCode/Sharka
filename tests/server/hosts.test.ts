import { describe, expect, it } from 'vitest';
import { isAllowedHost } from '../../src/server/hosts.js';

const vietiniai = () => ['192.168.1.10', 'kompiuteris'];

describe('isAllowedHost', () => {
  it('loopback vardai leidžiami visada, net išjungus tinklą', () => {
    for (const h of ['127.0.0.1:8080', 'localhost:8080', '[::1]:8080', 'LOCALHOST:8080']) {
      expect(isAllowedHost(h, false, vietiniai)).toBe(true);
    }
  });

  it('svetimas vardas atmetamas net per loopback — tai DNS rebinding', () => {
    expect(isAllowedHost('piktas.lt:8080', false, vietiniai)).toBe(false);
    expect(isAllowedHost('piktas.lt:8080', true, vietiniai)).toBe(false);
  });

  it('be tinklo prieigos vietiniai adresai neleidžiami', () => {
    expect(isAllowedHost('192.168.1.10:8080', false, vietiniai)).toBe(false);
  });

  it('įjungus tinklą leidžiami šio kompiuterio adresas ir vardas', () => {
    expect(isAllowedHost('192.168.1.10:8080', true, vietiniai)).toBe(true);
    expect(isAllowedHost('kompiuteris:8080', true, vietiniai)).toBe(true);
    expect(isAllowedHost('kompiuteris.local:8080', true, vietiniai)).toBe(true);
  });

  it('trūkstama antraštė atmetama', () => {
    expect(isAllowedHost(undefined, true, vietiniai)).toBe(false);
    expect(isAllowedHost('', true, vietiniai)).toBe(false);
  });

  it('portas reikšmės neturi', () => {
    expect(isAllowedHost('127.0.0.1', false, vietiniai)).toBe(true);
    expect(isAllowedHost('127.0.0.1:65535', false, vietiniai)).toBe(true);
  });

  it('vienas taškas gale — naršyklės tai laiko tuo pačiu loopback vardu', () => {
    expect(isAllowedHost('localhost.', false, vietiniai)).toBe(true);
    expect(isAllowedHost('localhost.:8080', false, vietiniai)).toBe(true);
  });

  it('bare ::1 (be skliaustų) leidžiamas lygiai kaip [::1]', () => {
    expect(isAllowedHost('::1', false, vietiniai)).toBe(true);
  });

  it('svetimas vardas su tašku gale vis tiek atmetamas — dot trick DNS rebinding neapgauna', () => {
    expect(isAllowedHost('piktas.lt.', false, vietiniai)).toBe(false);
    expect(isAllowedHost('piktas.lt.', true, vietiniai)).toBe(false);
  });

  it('IPv6 skliaustas su galiojančiu portu leidžiamas', () => {
    expect(isAllowedHost('[::1]', false, vietiniai)).toBe(true);
    expect(isAllowedHost('[::1]:8080', false, vietiniai)).toBe(true);
  });

  it('IPv6 skliaustas su šiukšlėmis po `]` atmetamas — dot trick DNS rebinding neapgauna', () => {
    expect(isAllowedHost('[::1].piktas.lt', false, vietiniai)).toBe(false);
  });

  it('IPv6 skliaustas be dvitaškio prieš priesagą atmetamas', () => {
    expect(isAllowedHost('[::1]piktas.lt', false, vietiniai)).toBe(false);
  });

  it('IPv6 skliaustas su papildomu dvitaškiu po porto atmetamas', () => {
    expect(isAllowedHost('[::1]:8080:x', false, vietiniai)).toBe(false);
  });

  it('neužsidarantis IPv6 skliaustas atmetamas', () => {
    expect(isAllowedHost('[::1', false, vietiniai)).toBe(false);
  });
});
