import { useMemo, useState } from 'react';
import type { Application, ScheduleEvent, Student, UniversityRegistry } from '../lib/types';
import { EVENT_PRESETS, newId } from '../lib/types';
import { COMMON_SCHEDULE } from '../data/commonSchedule';
import { DIRECTORY } from '../lib/univLookup';
import { maskName, normalizeUniv } from '../lib/format';
import { STATUS_STYLE } from './status';
import { openLookup } from './ApplicationsView';
import { Modal, btn, inputCls, toast } from './ui';

// ───── 날짜 도우미 (모두 현지 시간 기준 YYYY-MM-DD) ─────
const pad = (n: number) => String(n).padStart(2, '0');
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseYmd = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
export const shortDate = (s: string) => {
  const d = parseYmd(s);
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEK[d.getDay()]})`;
};
/** "최초합격 발표" → "1차 충원 발표" → "2차 충원 발표" … */
export function nextPreset(title: string) {
  const m = title.match(/^(\d+)차 충원 발표$/);
  if (m) return `${Number(m[1]) + 1}차 충원 발표`;
  if (title === '최초합격 발표') return '1차 충원 발표';
  return title;
}
export const endOf = (e: ScheduleEvent) => e.endDate || e.date;
export const covers = (e: ScheduleEvent, day: string) => e.date <= day && day <= endOf(e);

/** 이 대학의 오늘 이후 첫 일정 */
export function nextEventFor(univ: string, schedule: ScheduleEvent[]) {
  const today = ymd(new Date());
  return schedule
    .filter((e) => e.univ === univ && endOf(e) >= today)
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0];
}

export function eventColor(e: ScheduleEvent) {
  if (!e.univ) return 'bg-slate-100 text-slate-700 border-slate-200';
  if (/충원/.test(e.title)) return 'bg-teal-50 text-teal-800 border-teal-200';
  if (/최초|합격/.test(e.title)) return 'bg-green-50 text-green-800 border-green-200';
  if (/등록/.test(e.title)) return 'bg-violet-50 text-violet-800 border-violet-200';
  return 'bg-indigo-50 text-indigo-800 border-indigo-200';
}

export const eventLabel = (e: ScheduleEvent) => `${e.univ ? e.univ.replace(/대학교/, '대') + ' ' : ''}${e.title}${e.time ? ' ' + e.time : ''}`;

interface Props {
  students: Student[];
  applications: Application[];
  universities: UniversityRegistry;
  schedule: ScheduleEvent[];
  hideInfo: boolean;
  onChangeSchedule: (next: ScheduleEvent[]) => void;
  onSetUnivUrl: (univ: string, url: string) => void;
}

export function CalendarView(p: Props) {
  const today = ymd(new Date());
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selected, setSelected] = useState(today);
  const [showCommon, setShowCommon] = useState(true);
  const [onlyApplied, setOnlyApplied] = useState(false);
  const [editing, setEditing] = useState<ScheduleEvent | null>(null);

  const appliedUnivs = useMemo(() => new Set(p.applications.map((a) => a.university)), [p.applications]);
  const events = useMemo(
    () =>
      [...(showCommon ? COMMON_SCHEDULE : []), ...p.schedule.filter((e) => !onlyApplied || appliedUnivs.has(e.univ))].sort((a, b) =>
        (a.date + (a.time || '99') + a.univ).localeCompare(b.date + (b.time || '99') + b.univ),
      ),
    [p.schedule, showCommon, onlyApplied, appliedUnivs],
  );

  const upcoming = events.filter((e) => endOf(e) >= today).slice(0, 8);

  // 달력 칸 (일요일 시작, 6주)
  const cells = useMemo(() => {
    const start = new Date(month);
    start.setDate(1 - start.getDay());
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [month]);

  const dayEvents = (day: string) => events.filter((e) => covers(e, day));
  const selectedEvents = dayEvents(selected);
  const byStudent = useMemo(() => new Map(p.students.map((s) => [s.id, s])), [p.students]);

  const newEvent = (date = selected): ScheduleEvent => ({ id: newId(), univ: '', date, endDate: '', time: '', title: '최초합격 발표', memo: '' });
  const save = (ev: ScheduleEvent) => {
    const exists = p.schedule.some((e) => e.id === ev.id);
    p.onChangeSchedule(exists ? p.schedule.map((e) => (e.id === ev.id ? ev : e)) : [...p.schedule, ev]);
  };
  const remove = (ev: ScheduleEvent) => {
    if (confirm(`"${eventLabel(ev)}" 일정을 삭제할까요?`)) p.onChangeSchedule(p.schedule.filter((e) => e.id !== ev.id));
  };

  return (
    <div className="space-y-4">
      {/* 다가오는 일정 */}
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold">📅 다가오는 일정</h2>
          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={showCommon} onChange={(e) => setShowCommon(e.target.checked)} /> 전국 공통 일정
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={onlyApplied} onChange={(e) => setOnlyApplied(e.target.checked)} /> 학생이 지원한 대학만
            </label>
            <button className={btn.primary} onClick={() => setEditing(newEvent())}>
              + 일정 추가
            </button>
          </div>
        </div>
        {upcoming.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">다가오는 일정이 없습니다. [+ 일정 추가]로 대학별 발표일을 등록해 보세요.</p>
        ) : (
          <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
            {upcoming.map((e) => {
              const n = e.univ ? p.applications.filter((a) => a.university === e.univ).length : 0;
              const dday = Math.round((parseYmd(e.date).getTime() - parseYmd(today).getTime()) / 86400000);
              return (
                <li key={e.id}>
                  <button
                    className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm ${eventColor(e)}`}
                    onClick={() => {
                      setSelected(e.date <= today && today <= endOf(e) ? today : e.date);
                      setMonth(new Date(parseYmd(e.date).getFullYear(), parseYmd(e.date).getMonth(), 1));
                    }}
                  >
                    <span className="w-14 shrink-0 text-xs font-bold">{dday < 0 ? '진행 중' : dday === 0 ? '오늘' : `D-${dday}`}</span>
                    <span className="shrink-0 text-xs">{shortDate(e.date)}</span>
                    <span className="min-w-0 flex-1 truncate font-medium">{eventLabel(e)}</span>
                    {n > 0 && <span className="shrink-0 text-xs opacity-70">원서 {n}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* 달력 */}
      <section className="rounded-2xl bg-white p-3 shadow-sm sm:p-4">
        <div className="mb-3 flex items-center justify-between">
          <button className={btn.ghost} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
            ◀
          </button>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold">
              {month.getFullYear()}년 {month.getMonth() + 1}월
            </h2>
            <button
              className="rounded-md border border-slate-200 px-2 py-0.5 text-xs text-slate-600"
              onClick={() => {
                const d = new Date();
                setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
                setSelected(today);
              }}
            >
              오늘
            </button>
          </div>
          <button className={btn.ghost} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
            ▶
          </button>
        </div>
        <div className="grid grid-cols-7 text-center text-xs font-semibold text-slate-500">
          {WEEK.map((w, i) => (
            <div key={w} className={`py-1 ${i === 0 ? 'text-rose-500' : i === 6 ? 'text-blue-500' : ''}`}>
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200">
          {cells.map((d) => {
            const day = ymd(d);
            const evs = dayEvents(day);
            const inMonth = d.getMonth() === month.getMonth();
            return (
              <button
                key={day}
                onClick={() => setSelected(day)}
                onDoubleClick={() => setEditing(newEvent(day))}
                className={`flex min-h-[4.5rem] flex-col items-stretch gap-0.5 bg-white p-1 text-left align-top sm:min-h-[6.5rem] ${
                  inMonth ? '' : 'bg-slate-50 text-slate-400'
                } ${selected === day ? 'ring-2 ring-inset ring-blue-500' : ''}`}
              >
                <span
                  className={`self-start rounded-full px-1.5 text-xs ${day === today ? 'bg-blue-600 font-bold text-white' : d.getDay() === 0 ? 'text-rose-500' : d.getDay() === 6 ? 'text-blue-500' : ''}`}
                >
                  {d.getDate()}
                </span>
                {evs.slice(0, 3).map((e) => (
                  <span key={e.id} className={`truncate rounded border px-1 text-[10px] leading-4 sm:text-[11px] ${eventColor(e)}`} title={eventLabel(e)}>
                    {eventLabel(e)}
                  </span>
                ))}
                {evs.length > 3 && <span className="text-[10px] text-slate-500">+{evs.length - 3}개 더</span>}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-slate-400">날짜를 누르면 아래에 그날 일정과 조회할 원서가 나옵니다. 두 번 누르면 그날 일정을 추가합니다.</p>
      </section>

      {/* 선택한 날 */}
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">{shortDate(selected)} 일정</h2>
          <button className={btn.secondary} onClick={() => setEditing(newEvent(selected))}>
            + 이날 일정 추가
          </button>
        </div>
        {selectedEvents.length === 0 && <p className="mt-2 text-sm text-slate-500">이날 일정이 없습니다.</p>}
        <ul className="mt-3 space-y-3">
          {selectedEvents.map((e) => {
            const apps = e.univ ? p.applications.filter((a) => a.university === e.univ) : [];
            return (
              <li key={e.id} className={`rounded-xl border p-3 ${eventColor(e)}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{eventLabel(e)}</span>
                  {e.endDate && <span className="text-xs">~ {shortDate(e.endDate)}</span>}
                  {!e.univ && <span className="rounded bg-white/70 px-1.5 text-[11px]">전국 공통</span>}
                  {e.univ && (
                    <span className="ml-auto flex gap-1">
                      <button className={btn.chip} onClick={() => setEditing(e)}>
                        수정
                      </button>
                      <button className={`${btn.chip} text-red-600`} onClick={() => remove(e)}>
                        삭제
                      </button>
                    </span>
                  )}
                </div>
                {e.memo && <p className="mt-1 text-xs">{e.memo}</p>}
                {apps.length > 0 && (
                  <ul className="mt-2 divide-y divide-black/5 rounded-lg bg-white">
                    {apps.map((a) => {
                      const s = byStudent.get(a.studentId);
                      return (
                        <li key={a.id} className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-700">
                          <span className="font-medium">{p.hideInfo ? maskName(s?.name ?? '') : s?.name}</span>
                          <span className="truncate text-xs text-slate-500">{a.major}</span>
                          <span className={`rounded px-1.5 text-[11px] ${STATUS_STYLE[a.status].badge}`}>
                            {a.status}
                            {a.status === '예비' && a.waitNo && ` ${a.waitNo}번`}
                          </span>
                          <button
                            className="ml-auto rounded-md bg-blue-600 px-2 py-0.5 text-xs font-semibold text-white"
                            onClick={() => openLookup(a, s, p.universities, p.onSetUnivUrl)}
                          >
                            조회 ↗
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {e.univ && apps.length === 0 && <p className="mt-1 text-xs opacity-70">이 대학에 지원한 원서가 없습니다.</p>}
              </li>
            );
          })}
        </ul>
      </section>

      {editing && (
        <EventModal
          key={editing.id}
          event={editing}
          isNew={!p.schedule.some((e) => e.id === editing.id)}
          univOptions={[...new Set([...appliedUnivs, ...Object.keys(p.universities), ...DIRECTORY.map((d) => d.name)])]}
          onClose={() => setEditing(null)}
          onSave={(ev, keepGoing) => {
            save(ev);
            toast('일정을 저장했습니다');
            if (keepGoing) {
              setEditing({ ...ev, id: newId(), title: nextPreset(ev.title), endDate: '', memo: '' });
            } else setEditing(null);
          }}
        />
      )}
    </div>
  );
}

export function EventModal({
  event,
  isNew,
  univOptions,
  onClose,
  onSave,
}: {
  event: ScheduleEvent;
  isNew: boolean;
  univOptions: string[];
  onClose: () => void;
  onSave: (e: ScheduleEvent, keepGoing: boolean) => void;
}) {
  const [e, setE] = useState(event);
  const [custom, setCustom] = useState(!(EVENT_PRESETS as readonly string[]).includes(event.title));
  const valid = e.univ.trim() && e.title.trim() && /^\d{4}-\d{2}-\d{2}$/.test(e.date) && (!e.endDate || e.endDate >= e.date);
  const submit = (keepGoing: boolean) => valid && onSave({ ...e, univ: normalizeUniv(e.univ), title: e.title.trim() }, keepGoing);
  const label = (t: string) => <span className="mb-1 block text-xs text-slate-500">{t}</span>;

  return (
    <Modal title={isNew ? '일정 추가' : '일정 수정'} onClose={onClose}>
      <div className="space-y-3">
        <label className="block">
          {label('대학 *')}
          <input
            className={inputCls}
            list="univ-options"
            value={e.univ}
            placeholder="대학명 입력 (목록에 없는 전문대도 직접 입력)"
            autoFocus={!e.univ}
            onChange={(x) => setE({ ...e, univ: x.target.value })}
          />
          <datalist id="univ-options">
            {univOptions.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
        </label>
        <label className="block">
          {label('구분 *')}
          <div className="flex gap-2">
            <select
              className={inputCls}
              value={custom ? '__custom' : e.title}
              onChange={(x) => {
                if (x.target.value === '__custom') {
                  setCustom(true);
                  setE({ ...e, title: '' });
                } else {
                  setCustom(false);
                  setE({ ...e, title: x.target.value });
                }
              }}
            >
              {EVENT_PRESETS.map((t) => (
                <option key={t}>{t}</option>
              ))}
              <option value="__custom">직접 입력…</option>
            </select>
            {custom && <input className={inputCls} value={e.title} placeholder="예: 예비 소집" onChange={(x) => setE({ ...e, title: x.target.value })} />}
          </div>
        </label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <label className="block">
            {label('날짜 *')}
            <input type="date" className={inputCls} value={e.date} onChange={(x) => setE({ ...e, date: x.target.value })} />
          </label>
          <label className="block">
            {label('시간')}
            <input type="time" className={inputCls} value={e.time} onChange={(x) => setE({ ...e, time: x.target.value })} />
          </label>
          <label className="col-span-2 block sm:col-span-1">
            {label('끝나는 날 (기간이면)')}
            <input type="date" className={inputCls} value={e.endDate} min={e.date} onChange={(x) => setE({ ...e, endDate: x.target.value })} />
          </label>
        </div>
        <label className="block">
          {label('메모')}
          <input className={inputCls} value={e.memo} placeholder="예: 홈페이지 14시 발표, 개별 통보" onChange={(x) => setE({ ...e, memo: x.target.value })} />
        </label>
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <button className={btn.secondary} onClick={onClose}>
            취소
          </button>
          {isNew && (
            <button className={btn.secondary} disabled={!valid} onClick={() => submit(true)} title="저장하고 같은 대학의 다음 차수 일정을 이어서 입력합니다">
              저장 후 다음 차수 계속
            </button>
          )}
          <button className={btn.primary} disabled={!valid} onClick={() => submit(false)}>
            저장
          </button>
        </div>
      </div>
    </Modal>
  );
}
