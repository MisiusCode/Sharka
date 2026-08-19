import { Router } from 'express';
import { isValidRepeat } from '../../core/repeat.js';
import type { TaskStore } from '../../core/tasks.js';
import type { Priority, Status, TaskPatch } from '../../core/types.js';
import type { EventHub } from '../events.js';

const STATUSES: Status[] = ['todo', 'doing', 'done'];
const PRIORITIES: Priority[] = [1, 2, 3];

class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

function validatePatch(body: Record<string, unknown>): TaskPatch {
  const patch: TaskPatch = {};

  if (body.title !== undefined) {
    if (typeof body.title !== 'string' || body.title.trim() === '') {
      throw new ApiError(400, 'invalid_title', 'Pavadinimas negali būti tuščias');
    }
    patch.title = body.title.trim();
  }
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status as Status)) {
      throw new ApiError(400, 'invalid_status', 'Nežinoma būsena');
    }
    patch.status = body.status as Status;
  }
  if (body.priority !== undefined) {
    if (!PRIORITIES.includes(body.priority as Priority)) {
      throw new ApiError(400, 'invalid_priority', 'Prioritetas turi būti 1, 2 arba 3');
    }
    patch.priority = body.priority as Priority;
  }
  if (body.due_at !== undefined) {
    if (body.due_at !== null && typeof body.due_at !== 'string') {
      throw new ApiError(400, 'invalid_due_at', 'Netinkamas terminas');
    }
    patch.due_at = body.due_at as string | null;
  }
  if (body.due_has_time !== undefined) patch.due_has_time = Boolean(body.due_has_time);
  if (body.remind_at !== undefined) {
    if (body.remind_at !== null && typeof body.remind_at !== 'string') {
      throw new ApiError(400, 'invalid_remind_at', 'Netinkamas priminimo laikas');
    }
    patch.remind_at = body.remind_at as string | null;
  }
  if (body.repeat !== undefined) {
    if (body.repeat !== null && !isValidRepeat(body.repeat)) {
      throw new ApiError(400, 'invalid_repeat', 'Netinkamas kartojimo šablonas');
    }
    patch.repeat = body.repeat as string | null;
  }

  return patch;
}

export function tasksRouter(tasks: TaskStore, events: EventHub): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json(tasks.list());
  });

  router.post('/', (req, res) => {
    const patch = validatePatch((req.body ?? {}) as Record<string, unknown>);
    if (patch.title === undefined) {
      throw new ApiError(400, 'invalid_title', 'Pavadinimas negali būti tuščias');
    }
    const created = tasks.create({
      title: patch.title,
      due_at: patch.due_at,
      due_has_time: patch.due_has_time,
      remind_at: patch.remind_at,
      priority: patch.priority,
      repeat: patch.repeat,
    });
    events.broadcast('tasks-changed');
    res.status(201).json(created);
  });

  router.patch('/:id', (req, res) => {
    const updated = tasks.update(req.params.id, validatePatch((req.body ?? {}) as Record<string, unknown>));
    if (updated === null) throw new ApiError(404, 'not_found', 'Užduotis nerasta');
    events.broadcast('tasks-changed');
    res.json(updated);
  });

  router.delete('/:id', (req, res) => {
    if (!tasks.remove(req.params.id)) throw new ApiError(404, 'not_found', 'Užduotis nerasta');
    events.broadcast('tasks-changed');
    res.status(204).end();
  });

  router.post('/:id/snooze', (req, res) => {
    const minutes = Number(((req.body ?? {}) as { minutes?: unknown }).minutes);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      throw new ApiError(400, 'invalid_minutes', 'Minutės turi būti teigiamas skaičius');
    }
    const updated = tasks.snooze(req.params.id, minutes);
    if (updated === null) throw new ApiError(404, 'not_found', 'Užduotis nerasta');
    events.broadcast('tasks-changed');
    res.json(updated);
  });

  return router;
}

export { ApiError };
