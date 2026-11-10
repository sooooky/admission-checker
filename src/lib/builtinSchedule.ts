// 모집요강에서 뽑은 대학별 최초합격 발표일(내장 일정)을 화면용 일정으로 만듭니다.
import { UNIV_SCHEDULE } from '../data/univSchedule';
import type { ScheduleEvent, UniversityRegistry } from './types';
import { resolveUniv } from './univLookup';

const byDir = new Map<string, (typeof UNIV_SCHEDULE)[number][]>();
for (const row of UNIV_SCHEDULE) byDir.set(row[0], [...(byDir.get(row[0]) ?? []), row]);

export const builtinId = (dirName: string, date: string) => `builtin:${dirName}:${date}`;
export const hasBuiltinSchedule = (dirName: string) => byDir.has(dirName);

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
    for (const [d, date, time, memo, verify] of byDir.get(dir.name) ?? []) {
      const id = builtinId(d, date);
      if (hidden.has(id)) continue;
      out.push(toEvent(name, id, date, time, memo, verify));
    }
  }
  if (includeAll) {
    for (const [d, rows] of byDir) {
      if (covered.has(d)) continue;
      for (const [, date, time, memo, verify] of rows) out.push(toEvent(d, builtinId(d, date), date, time, memo, verify));
    }
  }
  return out;
}

function toEvent(univ: string, id: string, date: string, time: string, memo: string, verify: boolean): ScheduleEvent {
  return {
    id: `${id}@${univ}`,
    univ,
    date,
    endDate: '',
    time,
    title: '최초합격 발표',
    memo: `📄 모집요강${verify ? ' (확인 권장)' : ''}: ${memo}`,
    builtin: true,
  };
}

/** 화면용 id(`builtin:대학:날짜@선생님대학명`) → 숨김 목록에 넣을 id */
export const builtinBaseId = (eventId: string) => eventId.split('@')[0];
