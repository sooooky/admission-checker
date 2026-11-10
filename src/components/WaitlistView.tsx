import { useMemo, useState } from 'react';
import type { Application, Student } from '../lib/types';
import { roundLabel, roundLongLabel } from '../lib/types';
import { maskName } from '../lib/format';
import { STATUS_STYLE } from './status';

/** 예비번호를 한 번이라도 받은 원서의 차수별 변화를 표로 보여 줍니다. */
export function WaitlistView({
  students,
  applications,
  currentRound,
  hideInfo,
  onEdit,
}: {
  students: Student[];
  applications: Application[];
  currentRound: number;
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

  const maxRound = Math.max(currentRound, 0, ...rows.flatMap((a) => a.history.map((h) => h.round)));
  const rounds = Array.from({ length: maxRound + 1 }, (_, r) => r);

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
          [조회 목록]에서 "기록할 차수"를 바꿔 가며 예비번호를 적으면 여기에 차수별로 쌓입니다. 줄을 누르면 기록을 고칠 수 있습니다.
          ▼는 이전 차수보다 줄어든 번호입니다.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-2xl bg-white p-8 text-center text-sm text-slate-500">아직 예비번호를 받은 원서가 없습니다.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
          <table className="w-full min-w-max text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="sticky left-0 bg-slate-50 px-3 py-2 text-left font-semibold">학생</th>
                <th className="px-3 py-2 text-left font-semibold">대학 · 모집단위</th>
                {rounds.map((r) => (
                  <th
                    key={r}
                    className={`px-2 py-2 text-center font-semibold ${r === currentRound ? 'text-blue-700' : ''}`}
                    title={roundLongLabel(r)}
                  >
                    {roundLabel(r)}
                  </th>
                ))}
                <th className="px-3 py-2 text-center font-semibold">현재</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((a) => {
                const name = byId.get(a.studentId)?.name ?? '';
                let prevNo: number | null = null;
                return (
                  <tr key={a.id} className="cursor-pointer hover:bg-slate-50" onClick={() => onEdit(a)}>
                    <td className="sticky left-0 bg-white px-3 py-2 font-semibold">{hideInfo ? maskName(name) : name}</td>
                    <td className="px-3 py-2">
                      {a.university}
                      {a.major && <span className="text-slate-500"> · {a.major}</span>}
                    </td>
                    {rounds.map((r) => {
                      const h = a.history.find((x) => x.round === r);
                      if (!h) return <td key={r} className="px-2 py-2 text-center text-slate-300">·</td>;
                      let diff: number | null = null;
                      if (h.status === '예비' && h.waitNo) {
                        const n = Number(h.waitNo);
                        if (prevNo !== null && n < prevNo) diff = prevNo - n;
                        prevNo = n;
                      }
                      return (
                        <td key={r} className="px-1.5 py-1.5 text-center">
                          <span className={`inline-block min-w-[3.5rem] rounded-md px-1.5 py-1 text-xs font-medium ${STATUS_STYLE[h.status].badge}`}>
                            {h.status === '예비' ? (h.waitNo ? `${h.waitNo}번` : '예비') : STATUS_STYLE[h.status].short}
                            {diff !== null && <span className="ml-0.5 text-[10px] text-green-700">▼{diff}</span>}
                          </span>
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-center">
                      <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[a.status].badge}`}>{a.status}</span>
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
