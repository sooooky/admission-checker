import type { ScheduleEvent } from './types';
import { normalizeUniv } from './format';

const key = (e: ScheduleEvent) => `${e.univ}|${e.date}|${e.title}`;

/** 가져온 일정을 합칩니다. 같은 id 이거나 (대학·날짜·구분)이 같으면 덮어쓰지 않고 건너뜁니다. */
export function mergeSchedule(cur: ScheduleEvent[], incoming: unknown[]): ScheduleEvent[] {
  const ids = new Set(cur.map((e) => e.id));
  const keys = new Set(cur.map(key));
  const out = [...cur];
  for (const raw of incoming) {
    const e = sanitizeEvent(raw);
    if (!e || ids.has(e.id) || keys.has(key(e))) continue;
    ids.add(e.id);
    keys.add(key(e));
    out.push(e);
  }
  return out;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
function sanitizeEvent(raw: unknown): ScheduleEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.slice(0, max) : '');
  const e: ScheduleEvent = {
    id: str(r.id, 64) || crypto.randomUUID(),
    univ: normalizeUniv(str(r.univ, 100)),
    date: str(r.date, 10),
    endDate: str(r.endDate, 10),
    time: str(r.time, 5),
    title: str(r.title, 60),
    memo: str(r.memo, 300),
  };
  if (!e.univ || !e.title || !DATE.test(e.date)) return null;
  if (e.endDate && (!DATE.test(e.endDate) || e.endDate < e.date)) e.endDate = '';
  if (e.time && !/^\d{2}:\d{2}$/.test(e.time)) e.time = '';
  return e;
}
