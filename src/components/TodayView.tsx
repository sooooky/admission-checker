import { useMemo } from 'react';
import type { ScheduleEvent } from '../lib/types';
import { COMMON_SCHEDULE } from '../data/commonSchedule';
import { resolveUniv } from '../lib/univLookup';
import { allInsights } from '../lib/insights';
import { maskName } from '../lib/format';
import { covers, endOf, eventColor, eventLabel, parseYmd, shortDate, ymd } from './CalendarView';
import { AppRows, needsCheck, StudentBadges, type Props as RowProps } from './ApplicationsView';

type Tab = 'list' | 'wait' | 'calendar' | 'stats' | 'univ';

export function TodayView(
  p: RowProps & {
    onNavigate: (tab: Tab) => void;
  },
) {
  const now = new Date();
  const today = ymd(now);
  const tomorrow = ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  const in7 = ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7));
  const byId = useMemo(() => new Map(p.students.map((s) => [s.id, s])), [p.students]);
  const nameOf = (id: string) => {
    const n = byId.get(id)?.name ?? '';
    return p.hideInfo ? maskName(n) : n;
  };

  const events = useMemo(
    () => [...COMMON_SCHEDULE, ...p.schedule].sort((a, b) => (a.date + (a.time || '99')).localeCompare(b.date + (b.time || '99'))),
    [p.schedule],
  );
  const todayEvents = events.filter((e) => covers(e, today));
  const tomorrowEvents = events.filter((e) => covers(e, tomorrow) && !covers(e, today));
  const deadlines = events.filter((e) => /마감|등록/.test(e.title) && endOf(e) > today && endOf(e) <= in7);

  const insights = useMemo(() => allInsights({ version: 2, students: p.students, applications: p.applications }), [p.students, p.applications]);
  const appliedUnivs = [...new Set(p.applications.map((a) => a.university))];
  const todo = {
    undecided: insights.filter((i) => i.needsEnrollDecision),
    warned: insights.filter((i) => i.warnings.length),
    waiting: p.applications.filter((a) => a.status === '예비'),
    minCheck: p.applications.filter((a) => a.minReq === '확인필요'),
    roundCheck: p.applications.filter((a) => needsCheck(a)),
    noLink: appliedUnivs.filter((u) => !resolveUniv(u, p.universities[u]).url && !resolveUniv(u, p.universities[u]).home),
    noEvent: appliedUnivs.filter((u) => !p.schedule.some((e) => e.univ === u)),
  };

  // 컴포넌트가 아닌 함수로 그려야 다시 그릴 때 예비번호 입력칸이 초기화되지 않습니다.
  const eventBlock = (e: ScheduleEvent, withApps: boolean) => {
    const apps = e.univ ? p.applications.filter((a) => a.university === e.univ) : [];
    const pending = apps.filter((a) => needsCheck(a));
    return (
      <li key={e.id} className={`rounded-xl border p-3 ${eventColor(e)}`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{eventLabel(e)}</span>
          {!e.univ && <span className="rounded bg-white/70 px-1.5 text-[11px]">전국 공통</span>}
          {e.builtin && <span className="rounded bg-white/70 px-1.5 text-[11px]">기본 일정</span>}
          {e.univ && <span className="text-xs">원서 {apps.length}건 · 오늘 미확인 {pending.length}건</span>}
        </div>
        {e.memo && <p className="mt-1 text-xs">{e.memo}</p>}
        {withApps && apps.length > 0 && (
          <div className="mt-2 overflow-hidden rounded-lg bg-white text-slate-800">
            <AppRows {...p} apps={apps} showUniv={false} />
          </div>
        )}
      </li>
    );
  };

  const Card = ({ n, label, tab, tone, children }: { n: number; label: string; tab: Tab; tone: string; children?: React.ReactNode }) =>
    n === 0 ? null : (
      <div className={`rounded-xl border p-3 ${tone}`}>
        <button className="flex w-full items-baseline justify-between gap-2 text-left" onClick={() => p.onNavigate(tab)}>
          <span className="text-sm font-semibold">{label}</span>
          <span className="text-xl font-bold">{n}</span>
        </button>
        {children && <div className="mt-1 text-xs">{children}</div>}
      </div>
    );

  const names = (ids: string[], max = 6) => {
    const uniq = [...new Set(ids)];
    return uniq.slice(0, max).map(nameOf).join(', ') + (uniq.length > max ? ` 외 ${uniq.length - max}명` : '');
  };
  const anyTodo = Object.values(todo).some((v) => v.length);

  return (
    <div className="space-y-4">
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-bold">{shortDate(today)} 오늘 할 일</h2>

        </div>
        <h3 className="mt-3 text-sm font-semibold text-slate-600">오늘 일정</h3>
        {todayEvents.length === 0 ? (
          <p className="mt-1 text-sm text-slate-500">오늘 등록된 발표·마감 일정이 없습니다.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {todayEvents.map((e) => (
              eventBlock(e, true)
            ))}
          </ul>
        )}
        {tomorrowEvents.length > 0 && (
          <>
            <h3 className="mt-4 text-sm font-semibold text-slate-600">내일 일정</h3>
            <ul className="mt-2 space-y-2">
              {tomorrowEvents.map((e) => (
                eventBlock(e, true)
              ))}
            </ul>
          </>
        )}
        {deadlines.length > 0 && (
          <>
            <h3 className="mt-4 text-sm font-semibold text-slate-600">7일 안의 마감</h3>
            <ul className="mt-2 flex flex-wrap gap-2">
              {deadlines.map((e) => {
                const d = Math.round((parseYmd(endOf(e)).getTime() - parseYmd(today).getTime()) / 86400000);
                return (
                  <li key={e.id} className={`rounded-lg border px-3 py-1.5 text-sm ${eventColor(e)}`}>
                    <b className="mr-1">D-{d}</b>
                    {shortDate(endOf(e))} {eventLabel(e)}
                  </li>
                );
              })}
            </ul>
          </>
        )}
        <button className="mt-3 text-xs text-blue-700 underline" onClick={() => p.onNavigate('calendar')}>
          발표 일정 달력 보기 →
        </button>
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="font-bold">처리가 필요한 것</h2>
        {!anyTodo && <p className="mt-2 text-sm text-slate-500">지금은 처리할 일이 없습니다. 👍</p>}
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <Card n={todo.warned.length} label="⚠️ 확인이 필요한 학생" tab="list" tone="border-rose-200 bg-rose-50 text-rose-900">
            <ul className="space-y-1">
              {todo.warned.slice(0, 4).map((i) => (
                <li key={i.student.id}>
                  <b>{nameOf(i.student.id)}</b>: {i.warnings[0]}
                </li>
              ))}
            </ul>
          </Card>
          <Card n={todo.undecided.length} label="합격했지만 등록 대학 미정" tab="list" tone="border-yellow-200 bg-yellow-50 text-yellow-900">
            {names(todo.undecided.map((i) => i.student.id))}
          </Card>
          <Card n={todo.roundCheck.length} label="오늘 미확인 원서 (결과 미확정)" tab="list" tone="border-blue-200 bg-blue-50 text-blue-900">
            [조회 목록] → "오늘 미확인" 필터
          </Card>
          <Card n={todo.waiting.length} label="예비 대기 중인 원서" tab="wait" tone="border-amber-200 bg-amber-50 text-amber-900">
            {names(todo.waiting.map((a) => a.studentId))}
          </Card>
          <Card n={todo.minCheck.length} label="수능 최저 확인필요" tab="list" tone="border-orange-200 bg-orange-50 text-orange-900">
            {names(todo.minCheck.map((a) => a.studentId))}
          </Card>
          <Card n={todo.noEvent.length} label="발표 일정 미등록 대학" tab="univ" tone="border-indigo-200 bg-indigo-50 text-indigo-900">
            {todo.noEvent.slice(0, 5).join(', ')}
            {todo.noEvent.length > 5 && ` 외 ${todo.noEvent.length - 5}곳`}
          </Card>
          <Card n={todo.noLink.length} label="조회 주소·입학처 링크 없는 대학" tab="univ" tone="border-slate-200 bg-slate-50 text-slate-700">
            {todo.noLink.slice(0, 5).join(', ')}
            {todo.noLink.length > 5 && ` 외 ${todo.noLink.length - 5}곳`}
          </Card>
        </div>
      </section>

      {todo.warned.length > 0 && (
        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="font-bold">⚠️ 학생별 확인 사항</h2>
          <ul className="mt-2 space-y-2">
            {todo.warned.map((i) => (
              <li key={i.student.id} className="flex flex-wrap items-center gap-2 text-sm">
                <button className="font-semibold underline" onClick={() => i.apps[0] && p.onEdit(i.apps[0])}>
                  {nameOf(i.student.id)}
                </button>
                <StudentBadges insight={i} />
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-500">
            ※ 수시 합격자(최초·충원 합격)는 등록 여부와 관계없이 정시·추가모집에 지원할 수 없습니다. 모집 시기와 결과가 맞게 기록됐는지 확인해 주세요.
          </p>
        </section>
      )}
    </div>
  );
}
