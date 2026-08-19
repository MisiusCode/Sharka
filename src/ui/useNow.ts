import { useEffect, useState } from 'react';

// Laikrodis tikrinamas kartą per minutę — planšetė (ar tray langelis), palikti
// atidaryti per naktį, per tą laiką pastebi vidurnaktį be jokio vartotojo
// veiksmo.
const CLOCK_TICK_MS = 60_000;

// Bendras laikrodis Board ir QuickAddScreen ekranams. `initial` sėja pradinę
// reikšmę (testams — fiksuota data lieka, kol niekas jos nepajudina), o
// toliau jis gyvena savarankiškai: ekranas, paliktas atidarytas per naktį,
// kitaip amžinai rodytų vakarykštę „Šiandien" ir įrašytų neteisingą datą.
//
// `visibilitychange` klausytojas svarbesnis tray langeliui nei lentai: kol
// langelis paslėptas, naršyklės laikmačiai gali būti pristabdyti ar retinami,
// tad vien periodinio tikrinimo nepakanka — jam vėl tapus matomam, laikrodis
// turi persiskaičiuoti iš karto, o ne laukti iki kito 60s tiksėjimo.
export function useNow(initial: Date): Date {
  const [now, setNow] = useState(initial);

  useEffect(() => {
    const tick = (): void => setNow(new Date());
    const interval = setInterval(tick, CLOCK_TICK_MS);
    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return now;
}
