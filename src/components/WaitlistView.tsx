import { useMemo, useState } from 'react';
import type { Application, Student } from '../lib/types';
import { entryDate } from '../lib/types';
import { maskName } from '../lib/format';
import { STATUS_STYLE } from './status';
import { HistoryChips } from './ApplicationsView';

/** 예비번호를 한 번이라도 받은 원서의 번호 변화를 시간순으로 보여 줍니다. */
export function WaitlistView({
  students,
  applications,
  hideInfo,
  onEdit,
}: {
  students: Student[];
  applications: Application[];
  hideInfo: boolean;
  onEdit: (a: Application) => void;
}) {
  const [onlyActive, setOnlyActive] = useState(false);
  const byId = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);

  const rows = useMemo(
    () =>
      applications
        .filter((a) => a.history.some((h) => h.status === '예비'))
        .filter((a) => !onlyActive || a.status === '예비')
        .sort(
          (x, y) =>
            (byId.get(x.studentId)?.name ?? '').localeCompare(byId.get(y.studentId)?.name ?? '', 'ko') ||
            x.university.localeCompare(y.university, 'ko'),
        ),
    [applications, byId, onlyActive],
  );

  const summary = useMemo(() => {
    const all = applications.filter((a) => a.history.some((h) => h.status === '예비'));
    return {
      total: all.length,
      active: all.filter((a) => a.status === '예비').length,
      passed: all.filter((a) => a.status === '충원합격' || a.status === '합격').length,
    };
  }, [applications]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <span>
            예비 받은 원서 <b>{summary.total}</b>건
          </span>
          <span className="text-amber-700">
            대기 중 <b>{summary.active}</b>
          </span>
          <span className="text-teal-700">
            충원·합격 <b>{summary.passed}</b>
          </span>
          <label className="ml-auto flex items-center gap-1.5 text-slate-600">
            <input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} />
            아직 예비인 원서만
          </label>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          [조회 목록]에서 예비번호를 새로 적을 때마다 날짜와 함께 쌓입니다. 줄을 누르면 기록을 고치거나 지울 수 있습니다. ▼는 이전보다
          줄어든 번호입니다.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-2xl bg-white p-8 text-center text-sm text-slate-500">아직 예비번호를 받은 원서가 없습니다.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
          <table className="w-full min-w-[46rem] text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">학생</th>
                <th className="px-3 py-2 text-left font-semibold">대학 · 모집단위</th>
                <th className="px-3 py-2 text-center font-semibold">처음</th>
                <th className="px-3 py-2 text-center font-semibold">최근</th>
                <th className="px-3 py-2 text-left font-semibold">기록 경과</th>
                <th className="px-3 py-2 text-center font-semibold">현재</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((a) => {
                const name = byId.get(a.studentId)?.name ?? '';
                const waits = a.history.filter((h) => h.status === '예비' && h.waitNo);
                const first = waits[0];
                const last = waits[waits.length - 1];
                const drop = first && last ? Number(first.waitNo) - Number(last.waitNo) : 0;
                return (
                  <tr key={a.id} className="cursor-pointer align-top hover:bg-slate-50" onClick={() => onEdit(a)}>
                    <td className="px-3 py-2 font-semibold whitespace-nowrap">{hideInfo ? maskName(name) : name}</td>
                    <td className="px-3 py-2">
                      {a.university}
                      {a.major && <span className="text-slate-500"> · {a.major}</span>}
                    </td>
                    <td className="px-3 py-2 text-center whitespace-nowrap tabular-nums">
                      {first ? (
                        <>
                          {first.waitNo}번<div className="text-[11px] text-slate-400">{entryDate(first)}</div>
                        </>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-3 py-2 text-center whitespace-nowrap tabular-nums">
                      {last && last !== first ? (
                        <>
                          <b>{last.waitNo}번</b>
                          {drop > 0 && <span className="ml-1 text-xs text-green-700">▼{drop}</span>}
                          <div className="text-[11px] text-slate-400">{entryDate(last)}</div>
                        </>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <HistoryChips history={a.history} max={12} />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={`rounded px-1.5 py-0.5 text-xs font-semibold whitespace-nowrap ${STATUS_STYLE[a.status].badge}`}>
                        {a.status}
                        {a.status === '예비' && a.waitNo && ` ${a.waitNo}번`}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
