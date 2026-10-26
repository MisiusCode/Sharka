import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type { Clock } from './clock.js';
import { formatLocalDate, formatLocalDateTime, timeOf } from './datetime.js';
import { nextOccurrence } from './repeat.js';
import type { Task, TaskInput, TaskPatch } from './types.js';

export interface TaskStore {
  list(): Task[];
  get(id: string): Task | null;
  create(input: TaskInput): Task;
  update(id: string, patch: TaskPatch): Task | null;
  remove(id: string): boolean;
  snooze(id: string, minutes: number): Task | null;
  markReminded(id: string): Task | null;
}

interface Row extends Omit<Task, 'due_has_time'> {
  due_has_time: number;
}

const toTask = (row: Row): Task => ({ ...row, due_has_time: row.due_has_time === 1 });

const PATCHABLE = ['title', 'status', 'priority', 'due_at', 'due_has_time', 'remind_at', 'repeat'] as const;

export function createTaskStore(db: Database.Database, clock: Clock): TaskStore {
  const selectAll = db.prepare('SELECT * FROM tasks');
  const selectOne = db.prepare('SELECT * FROM tasks WHERE id = ?');
  const deleteOne = db.prepare('DELETE FROM tasks WHERE id = ?');

  const get = (id: string): Task | null => {
    const row = selectOne.get(id) as Row | undefined;
    return row ? toTask(row) : null;
  };

  const writeFields = (id: string, fields: Record<string, unknown>): Task | null => {
    const keys = Object.keys(fields);
    if (keys.length === 0) return get(id);
    const assignments = keys.map((k) => `${k} = @${k}`).join(', ');
    const info = db
      .prepare(`UPDATE tasks SET ${assignments} WHERE id = @id`)
      .run({ ...fields, id });
    return info.changes === 0 ? null : get(id);
  };

  return {
    list: () => (selectAll.all() as Row[]).map(toTask),
    get,

    create(input) {
      const title = input.title.trim();
      if (title === '') throw new Error('Tuščias pavadinimas');

      const now = clock.now().toISOString();
      const repeat = input.repeat ?? null;
      // Pasikartojanti užduotis visada turi terminą (3 skyrius). Prieš šį
      // taisymą create() apskritai neskaičiavo termino, tad
      // `POST /api/tasks { title, repeat: 'w:2' }` grąžindavo due_at: null
      // (4 radinys). „Nėra due_at" apima ir undefined (raktas apskritai
      // nepridėtas — žalias API kreipinys), ir null (QuickAdd visada siunčia
      // due_at kaip lauką, tiesiog jo reikšmė tebėra numatytoji null, kol
      // vartotojas nepaliečia datos) — abu atvejai realiai pasitaiko, o
      // pasikartojanti užduotis be datos yra tiesiog negaliojanti būsena
      // nepriklausomai nuo to, kuriuo pavidalu ji atkeliavo.
      const dueAtProvided = input.due_at !== undefined && input.due_at !== null;
      const due_at = repeat !== null && !dueAtProvided
        ? nextOccurrence(repeat, formatLocalDate(clock.now()))
        : (input.due_at ?? null);
      // Apskaičiuotas terminas yra vien data, be laiko dalies — due_has_time
      // tokiu atveju negali būti true, nepriklausomai nuo to, ką (jei ką nors)
      // kreipinys pridėjo.
      const due_has_time = repeat !== null && !dueAtProvided
        ? false
        : (input.due_has_time ?? false);

      const task: Task = {
        id: randomUUID(),
        title,
        status: 'todo',
        priority: input.priority ?? 2,
        due_at,
        due_has_time,
        remind_at: input.remind_at ?? null,
        reminded_at: null,
        created_at: now,
        updated_at: now,
        completed_at: null,
        repeat,
      };

      db.prepare(
        `INSERT INTO tasks (id, title, status, priority, due_at, due_has_time, remind_at,
                            reminded_at, created_at, updated_at, completed_at, repeat)
         VALUES (@id, @title, @status, @priority, @due_at, @due_has_time, @remind_at,
                 @reminded_at, @created_at, @updated_at, @completed_at, @repeat)`,
      ).run({ ...task, due_has_time: task.due_has_time ? 1 : 0 });

      return task;
    },

    update(id, patch) {
      const before = get(id);
      if (before === null) return null;

      const now = clock.now().toISOString();
      const fields: Record<string, unknown> = { updated_at: now };

      for (const key of PATCHABLE) {
        if (patch[key] === undefined) continue;
        fields[key] = key === 'due_has_time' ? (patch.due_has_time ? 1 : 0) : patch[key];
      }

      // Pasikartojanti užduotis neužsidaro — ji peršoka į kitą kartą. Ši
      // taisyklė gyvena čia, o ne sąsajoje, todėl lenta, tray langelis,
      // dienos apžvalga ir žadintuvas visi gauna ją nemokamai. Kiti tame
      // pačiame patch'e keičiami laukai (title, priority, ...) jau surinkti
      // aukščiau esančiame `fields' — čia jie tik papildomi peršokimo
      // reikšmėmis, o ne pakeičiami disjunkčiu rašymu.
      //
      // Jei tame pačiame patch'e kartu keičiamas ir repeat, naudojamas
      // patch'e nurodytas naujas šablonas (arba, jei jis aiškiai išvalytas
      // į null, užduotis užsidaro kaip vienkartinė) — tai atspindi ką tik
      // pateiktą vartotojo ketinimą, o ne pasenusią būseną prieš patch'ą.
      const effectiveRepeat = patch.repeat !== undefined ? patch.repeat : before.repeat;
      if (patch.status === 'done' && effectiveRepeat !== null) {
        // `time` (taigi ir due_has_time žemiau) privalo skaityti iš PO-KREIPIMO
        // (efektyvaus) termino, ne vien iš `before' — kitaip tame pačiame
        // patch'e atsiųstas due_at/due_has_time būtų tyliai ignoruojamas
        // skaičiuojant, o rezultate due_at ir due_has_time liktų nesuderinti
        // (2 radinys).
        const effectiveDueAt = patch.due_at !== undefined ? patch.due_at : before.due_at;
        const effectiveDueHasTime = patch.due_has_time !== undefined ? patch.due_has_time : before.due_has_time;
        const time = effectiveDueAt !== null && effectiveDueHasTime ? timeOf(effectiveDueAt) : null;
        const nextDate = nextOccurrence(effectiveRepeat, formatLocalDate(clock.now()));
        const due = time === null ? nextDate : `${nextDate}T${time}`;

        return writeFields(id, {
          ...fields,
          status: 'todo',
          due_at: due,
          due_has_time: time !== null ? 1 : 0,
          // Data-be-laiko pasikartojanti užduotis peršokdama praranda bet
          // kokį tame pačiame kreipinyje atsiųstą remind_at — tai sąmoninga
          // (6 skyrius): be laiko dalies žadintuvui nėra prie ko prisikabinti
          // naujame termine, tad jis nutildomas, o ne perkeliamas tuščiu
          // laiku (10 radinys).
          remind_at: time === null ? null : due,
          reminded_at: null,
          completed_at: null,
          repeat: effectiveRepeat,
        });
      }

      if (patch.status !== undefined && patch.status !== before.status) {
        if (patch.status === 'done') {
          fields.completed_at = now;
          fields.reminded_at = now;
        } else if (before.status === 'done') {
          fields.completed_at = null;
        }
      }

      // Pasirinkus šabloną, terminas iš karto perskaičiuojamas į artimiausią
      // kitą kartą (skaičiuojant nuo šiandien). Repeat išvalymas į null
      // laukų kopijavimo aukščiau jau paliko terminą nepakeistą. Žadintuvas
      // perkeliamas tik jei jis jau buvo sukonfigūruotas — priešingu atveju
      // vien tik šablono pasirinkimas neturi savaime įjungti priminimo,
      // kurio vartotojas niekada neprašė.
      //
      // KRITINIS (1 radinys): ši sąlyga anksčiau tikrino, ar `patch` TURI
      // `repeat`, o ne ar jis PASIKEITĖ. Sąsaja visada siunčia visą DueValue
      // (Board.tsx, digest/main.tsx, QuickAddScreen.tsx — TaskCard.tsx užpildo
      // `repeat: task.repeat`), tad bet koks termino redaktoriaus pakeitimas
      // (datos čipas, laikas, net prioriteto taškas) atkeliaudavo su
      // nepakitusiu `repeat`, ir ši šaka tyliai nustelbdavo ką tik nurodytą
      // due_at savo perskaičiavimu. `repeatSet` reikalauja TIKRO pokyčio
      // (patch.repeat !== before.repeat), o `patch.due_at === undefined`
      // užtikrina, kad aiškiai nurodytas due_at (11 sk. — sankcionuotas būdas
      // rankiniu būdu praleisti vieną kartą) visada laimi: šis skaičiavimas
      // suveikia tik tada, kai kreipinys due_at apskritai nepridėjo. Nuo 4
      // radinio taisymo DueEditor'is repeat pasirinkimo pakeitimą siunčia
      // būtent taip — vien `{ repeat }`, be due_at.
      const repeatSet =
        patch.repeat !== undefined && patch.repeat !== null && patch.repeat !== before.repeat;
      if (repeatSet && patch.due_at === undefined) {
        // `repeatSet` jau užtikrino, kad patch.repeat nei undefined, nei null —
        // TS to iš atskiro boolean kintamojo savaime nesusiaurina, tad reikšmė
        // paimama į savo kintamąjį su neabejotinu tipu.
        const repeat = patch.repeat as string;
        const nextDate = nextOccurrence(repeat, formatLocalDate(clock.now()));
        const time = before.due_at !== null && before.due_has_time ? timeOf(before.due_at) : null;
        const due = time === null ? nextDate : `${nextDate}T${time}`;
        fields.due_at = due;
        if (before.remind_at !== null) fields.remind_at = time === null ? null : due;
        fields.reminded_at = null;
      }

      const timingChanged =
        (patch.remind_at !== undefined && patch.remind_at !== before.remind_at) ||
        (patch.due_at !== undefined && patch.due_at !== before.due_at);
      if (timingChanged) fields.reminded_at = null;

      return writeFields(id, fields);
    },

    remove: (id) => deleteOne.run(id).changes > 0,

    snooze(id, minutes) {
      if (get(id) === null) return null;
      const target = new Date(clock.now().getTime() + minutes * 60_000);
      return writeFields(id, {
        remind_at: formatLocalDateTime(target),
        reminded_at: null,
        updated_at: clock.now().toISOString(),
      });
    },

    markReminded(id) {
      if (get(id) === null) return null;
      const now = clock.now().toISOString();
      return writeFields(id, { reminded_at: now, updated_at: now });
    },
  };
}
