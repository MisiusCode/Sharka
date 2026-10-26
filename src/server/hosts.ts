import { hostname, networkInterfaces } from 'node:os';

// Vardai, kuriais programa pati save vadina. Skaičiuojama iškvietimo metu, o ne
// modulio krovimo: tinklo adresai keičiasi (WiFi, VPN), o serveris gyvena ilgai.
export function localHostNames(): string[] {
  const vardai = [hostname().toLowerCase()];
  for (const sasajos of Object.values(networkInterfaces())) {
    for (const s of sasajos ?? []) {
      if (s.family === 'IPv4' && !s.internal) vardai.push(s.address);
    }
  }
  return vardai;
}

// Loopback vardai leidžiami VISADA: per juos kalba visi Electron langai.
const VISADA = ['127.0.0.1', 'localhost', '::1', '[::1]'];

// `Host` antraštė atskiriama nuo porto. Portas saugumui nesvarbus — ataka
// remiasi vardu — o `createApp` jo ir nežino, nes portas parenkamas tik
// `startServer` metu.
function vardasBePorto(host: string): string {
  const s = host.trim().toLowerCase();
  // IPv6 skliaustuose: `[::1]:8080` → `[::1]`. Po `]` RFC 3986 leidžia TIK
  // `:portas` arba nieko — tai vienintelės dvi vietos, kur baigiasi `Host`
  // antraštė. Jei ten yra kas nors kita (`[::1].piktas.lt`, `[::1]piktas.lt`),
  // tai nebe IPv6 literalas su portu, o svetimas vardas, kuris tiesiog
  // prasideda leistinu prefiksu — grąžinus vien `[::1]` (senas `slice` iki
  // `]`) tokia užklausa tyliai praeitų DNS rebinding patikrą. Todėl netikusiu
  // atveju grąžinama VISA pradinė eilutė: ji niekad nesutaps su `VISADA` ar
  // vietiniu vardu, tad bus teisingai atmesta.
  if (s.startsWith('[')) {
    const uzsidaro = s.indexOf(']');
    if (uzsidaro === -1) return s;
    const iki = s.slice(0, uzsidaro + 1);
    const po = s.slice(uzsidaro + 1);
    if (po !== '' && !/^:\d+$/.test(po)) return s;
    return iki;
  }
  // Bare `::1` (be skliaustų, be porto): RFC 3986 IPv6 literalą su portu
  // liepia rašyti skliaustuose, tad be skliaustų esantis vardas niekada
  // nėra host:port — jis pats yra adresas. Be šios išimties žemiau esantis
  // `lastIndexOf(':')` nukirstų viską po pirmojo iš dviejų dvitaškių ir
  // `vardas` taptų vienu pačiu dvitaškiu (`:`), tad `::1` niekada
  // nepatektų į `VISADA`, nors ten jau įrašytas. Tikrinama SIMBOLIS Į
  // SIMBOLĮ šiam vienam vardui, o ne bendra taisykle „daugiau nei vienas
  // dvitaškis — nekirpti": platesnė taisyklė galėtų praleisti kitą,
  // nematytą IPv6 vardą be skliaustų.
  if (s === '::1') return s;
  const dvitaskis = s.lastIndexOf(':');
  const beParto = dvitaskis === -1 ? s : s.slice(0, dvitaskis);
  // Vienas taškas gale: naršyklės DNS „vardas." laiko identišku „vardas"
  // (absoliutus FQDN įrašas), tad be šio nuėmimo teisėtas `localhost.`
  // klientas būtų atmestas. Kerpama TIK VIENA — platesnis nuėmimas galėtų
  // netyčia priimti kitą vardą (pvz. „piktas.lt.." liktų su vienu tašku
  // gale ir toliau neatitiktų nei `VISADA`, nei jokio vietinio vardo, tad
  // liktų teisingai atmestas).
  return beParto.endsWith('.') ? beParto.slice(0, -1) : beParto;
}

// Apsauga nuo DNS rebinding: puolėjo svetainė gali priversti naršyklę jungtis
// prie mūsų loopback, bet ne pakeisti `Host` antraštės — ji lieka puolėjo
// vardas. Be šios patikros toks ryšys atrodytų kaip vietinis ir praeitų be PIN.
export function isAllowedHost(
  host: string | undefined,
  lan: boolean,
  vietiniai: () => string[] = localHostNames,
): boolean {
  if (host === undefined || host === '') return false;
  const vardas = vardasBePorto(host);
  if (VISADA.includes(vardas)) return true;
  if (!lan) return false;
  return vietiniai().some((v) => v === vardas || `${v}.local` === vardas);
}
