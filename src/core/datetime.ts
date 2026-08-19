const pad = (n: number): string => String(n).padStart(2, '0');

export function formatLocalDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function formatLocalDateTime(d: Date): string {
  return `${formatLocalDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return formatLocalDate(new Date(y, m - 1, d + n));
}

export function dateOf(dueAt: string): string {
  return dueAt.slice(0, 10);
}

export function timeOf(dueAt: string): string | null {
  return dueAt.length > 10 ? dueAt.slice(11, 16) : null;
}

// Mėnesių pavadinimai kilmininko linksniu (naudojama su dienos numeriu, pvz.
// „rugpjūčio 20“) — būtent taip lietuviškai skaitomos datos, ne vardininku.
const LITHUANIAN_MONTHS_GENITIVE = [
  'sausio', 'vasario', 'kovo', 'balandžio', 'gegužės', 'birželio',
  'liepos', 'rugpjūčio', 'rugsėjo', 'spalio', 'lapkričio', 'gruodžio',
];

// Formatuoja datą lietuviškai, su mėnesio pavadinimu kilmininko linksniu.
// Metai rodomi tik tada, kai data ne tų pačių metų kaip `today` — tai
// atitinka natūralią lietuvišką kalbėseną („rugpjūčio 20“ šiais metais,
// bet „2027 m. sausio 5“ kitais). Sąmoningai neremiamasi `Intl`/
// `toLocaleDateString`: šis failas turi likti importuojamas naršyklės
// pakete tapačiai Electron, planšetės naršyklėje ir jsdom testuose,
// nepriklausomai nuo priimančiosios sistemos lokalės.
export function formatLithuanianDate(dateStr: string, today: string): string {
  const year = Number(dateStr.slice(0, 4));
  const month = Number(dateStr.slice(5, 7));
  const day = Number(dateStr.slice(8, 10));
  const time = timeOf(dateStr);
  const todayYear = Number(today.slice(0, 4));

  const monthName = LITHUANIAN_MONTHS_GENITIVE[month - 1];
  const datePart = year === todayYear ? `${monthName} ${day}` : `${year} m. ${monthName} ${day}`;
  return time === null ? datePart : `${datePart}, ${time}`;
}
