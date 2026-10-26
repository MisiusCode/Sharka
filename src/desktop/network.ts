export interface NetworkAddress {
  address: string;
  family: string;
  internal: boolean;
}

export type NetworkInterfaces = Record<string, NetworkAddress[] | undefined>;

const VIRTUALUS = /vethernet|virtualbox|vmware|hyper-v|docker|wsl/i;

export function lanUrls(port: number, interfaces: NetworkInterfaces): string[] {
  const entries: { name: string; address: string }[] = [];

  for (const [name, addresses] of Object.entries(interfaces)) {
    for (const a of addresses ?? []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      entries.push({ name, address: a.address });
    }
  }

  return entries
    .sort((a, b) => Number(VIRTUALUS.test(a.name)) - Number(VIRTUALUS.test(b.name)))
    .map((e) => `http://${e.address}:${port}`);
}
