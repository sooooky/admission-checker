// 대학별 기본 일정(발표·고사)을 화면용 일정으로 만듭니다.
import { UNIV_SCHEDULE } from '../data/univSchedule';
import type { ScheduleEvent, UniversityRegistry } from './types';
import { resolveUniv } from './univLookup';

type Row = (typeof UNIV_SCHEDULE)[number];

// 대학별로 묶고, 같은 날·같은 구분이 여러 개면 순번을 붙여 고유 id 를 만듭니다.
const byDir = new Map<string, { row: Row; id: string }[]>();
{
  const seq = new Map<string, number>();
  for (const row of UNIV_SCHEDULE) {
    const [dir, date, , title] = row;
    const k = `${dir}:${date}:${title}`;
    const n = (seq.get(k) ?? 0) + 1;
    seq.set(k, n);
    byDir.set(dir, [...(byDir.get(dir) ?? []), { row, id: `builtin:${k}:${n}` }]);
  }
}

export const hasBuiltinSchedule = (dirName: string) => byDir.has(dirName);

/** 면접·논술·실기 같은 고사 일정인지 */
export const isExamEvent = (e: Pick<ScheduleEvent, 'title'>) => /^(면접|논술|실기)/.test(e.title);

/**
 * @param univNames 학생이 지원했거나 등록한 대학 이름(선생님이 쓰는 이름 그대로)
 * @param includeAll true 면 목록의 다른 대학 일정도 모두 (대학명은 내장 목록 이름)
 */
export function builtinEvents(univNames: string[], universities: UniversityRegistry, includeAll = false): ScheduleEvent[] {
  const out: ScheduleEvent[] = [];
  const covered = new Set<string>();
  for (const name of new Set(univNames)) {
    const info = universities[name];
    const dir = resolveUniv(name, info).dir;
    if (!dir) continue;
    covered.add(dir.name);
    const hidden = new Set(info?.hiddenBuiltin ?? []);
    for (const { row, id } of byDir.get(dir.name) ?? []) {
      if (!hidden.has(id)) out.push(toEvent(name, id, row));
    }
  }
  if (includeAll) {
    for (const [d, items] of byDir) {
      if (!covered.has(d)) for (const { row, id } of items) out.push(toEvent(d, id, row));
    }
  }
  return out;
}

function toEvent(univ: string, id: string, [, date, time, title, memo]: Row): ScheduleEvent {
  return { id: `${id}@${univ}`, univ, date, endDate: '', time, title, memo: memo ? `📄 ${memo}` : '', builtin: true };
}

/** 화면용 id(`builtin:…@선생님대학명`) → 숨김 목록에 넣을 id */
export const builtinBaseId = (eventId: string) => eventId.split('@')[0];
