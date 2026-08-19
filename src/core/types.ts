export type Status = 'todo' | 'doing' | 'done';
export type Priority = 1 | 2 | 3;

export interface Task {
  id: string;
  title: string;
  status: Status;
  priority: Priority;
  due_at: string | null;
  due_has_time: boolean;
  remind_at: string | null;
  reminded_at: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  repeat: string | null;
}

export interface TaskInput {
  title: string;
  due_at?: string | null;
  due_has_time?: boolean;
  remind_at?: string | null;
  priority?: Priority;
  repeat?: string | null;
}

export type TaskPatch = Partial<
  Pick<Task, 'title' | 'status' | 'priority' | 'due_at' | 'due_has_time' | 'remind_at' | 'repeat'>
>;
