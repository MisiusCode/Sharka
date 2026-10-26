import { describe, expect, it } from 'vitest';
import { lanUrls } from '../../src/desktop/network.js';

const INTERFACES = {
  Ethernet: [
    { address: '192.168.1.10', family: 'IPv4', internal: false },
    { address: 'fe80::1', family: 'IPv6', internal: false },
  ],
  'Loopback Pseudo-Interface 1': [
    { address: '127.0.0.1', family: 'IPv4', internal: true },
  ],
  'vEthernet (WSL)': [
    { address: '172.20.0.1', family: 'IPv4', internal: false },
  ],
};

describe('lanUrls', () => {
  it('grąžina IPv4 adresus su portu', () => {
    expect(lanUrls(8080, INTERFACES)).toContain('http://192.168.1.10:8080');
  });

  it('praleidžia vidinius ir IPv6 adresus', () => {
    const urls = lanUrls(8080, INTERFACES);
    expect(urls.some((u) => u.includes('127.0.0.1'))).toBe(false);
    expect(urls.some((u) => u.includes('fe80'))).toBe(false);
  });

  it('virtualius adapterius rikiuoja į galą', () => {
    const urls = lanUrls(8080, INTERFACES);
    expect(urls[0]).toBe('http://192.168.1.10:8080');
    expect(urls.at(-1)).toBe('http://172.20.0.1:8080');
  });

  it('neradus nė vieno adreso grąžina tuščią sąrašą', () => {
    expect(lanUrls(8080, {})).toEqual([]);
  });
});
