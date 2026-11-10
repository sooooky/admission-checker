import { useMemo, useState } from 'react';
import type { VaultData } from '../lib/types';
import { computeStats, pct } from '../lib/insights';
import { exportResults } from '../lib/excel';
import { btn, toast } from './ui';

export function StatsView({ data }: { data: VaultData }) {
  const st = useMemo(() => computeStats(data), [data]);
  const [kind, setKind] = useState<'전체' | '4년제' | '그 외(전문대 등)'>('전체');
  const univs = st.univs.filter((u) => kind === '전체' || u.kind === kind);

  const Tile = ({ label, value, sub }: { label: string; value: string | number; sub?: string }) => (
    <div className="rounded-xl bg-slate-50 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-0.5 text-2xl font-bold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
  );

  const groupTable = (title: string, rows: { key: string; total: number; passed: number; students: number; passedStudents: number }[]) => (
    <div>
      <h3 className="mb-1 text-sm font-semibold text-slate-600">{title}</h3>
      <table className="w-full text-sm">
        <thead className="text-xs text-slate-500">
          <tr>
            <th className="py-1 text-left font-medium">구분</th>
            <th className="py-1 text-right font-medium">원서</th>
            <th className="py-1 text-right font-medium">합격 원서</th>
            <th className="py-1 text-right font-medium">지원 학생</th>
            <th className="py-1 text-right font-medium">합격 학생</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 tabular-nums">
          {rows.map((r) => (
            <tr key={r.key}>
              <td className="py-1.5">{r.key === '추가' ? '추가모집' : r.key}</td>
              <td className="py-1.5 text-right">{r.total}</td>
              <td className="py-1.5 text-right">{r.passed}</td>
              <td className="py-1.5 text-right">{r.students}</td>
              <td className="py-1.5 text-right">
                {r.passedStudents} <span className="text-xs text-slate-400">({pct(r.passedStudents, r.students)})</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  if (!data.applications.length) {
    return <p className="rounded-2xl bg-white p-8 text-center text-sm text-slate-500">원서를 불러오면 진학 실적이 표시됩니다.</p>;
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold">📊 진학 실적</h2>
          <button
            className={btn.secondary}
            onClick={() => exportResults(data, { includePhone: false, includeBirth: false }).then(() => toast('결과 엑셀을 내려받았습니다 ("진학 실적" 시트 포함)'))}
          >
            ⬇️ 엑셀로 받기 (개인정보 제외)
          </button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Tile label="학생" value={st.students} />
          <Tile label="원서" value={st.applications} sub={`확인 ${st.checked}건`} />
          <Tile label="합격 학생" value={st.passedStudents} sub={`학생 기준 ${pct(st.passedStudents, st.students)}`} />
          <Tile label="합격 원서" value={st.passedApps} sub="충원합격 포함" />
          <Tile label="등록 확정" value={st.enrolledStudents} sub={`합격 학생의 ${pct(st.enrolledStudents, st.passedStudents)}`} />
          <Tile label="등록 미정" value={st.undecided} sub="합격했으나 미정" />
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          {st.distribution.map((d) => (
            <span key={d.label} className="rounded-full bg-slate-100 px-3 py-1">
              {d.label} <b>{d.n}</b>명
            </span>
          ))}
        </div>
      </section>

      <section className="grid gap-4 rounded-2xl bg-white p-4 shadow-sm md:grid-cols-2">
        {groupTable('모집 시기별', st.byAdm)}
        {groupTable('대학 구분별', st.byKind)}
        <p className="text-xs text-slate-400 md:col-span-2">
          대학 구분: 내장 목록(4년제 214개교)에 있으면 4년제, 없으면 "그 외(전문대 등)"로 셉니다.
        </p>
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold">대학별 현황</h2>
          <div className="flex rounded-lg border border-slate-300 bg-white p-0.5 text-xs">
            {(['전체', '4년제', '그 외(전문대 등)'] as const).map((k) => (
              <button key={k} onClick={() => setKind(k)} className={`rounded-md px-2.5 py-1 ${kind === k ? 'bg-slate-800 text-white' : 'text-slate-600'}`}>
                {k}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-2 py-2 text-left font-semibold">대학</th>
                <th className="px-2 py-2 text-right font-semibold">원서</th>
                <th className="px-2 py-2 text-right font-semibold">합격</th>
                <th className="px-2 py-2 text-right font-semibold">충원합격</th>
                <th className="px-2 py-2 text-right font-semibold">예비</th>
                <th className="px-2 py-2 text-right font-semibold">불합격</th>
                <th className="px-2 py-2 text-right font-semibold">등록</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 tabular-nums">
              {univs.map((u) => (
                <tr key={u.university}>
                  <td className="px-2 py-1.5">
                    {u.university}
                    <span className="ml-1 text-[11px] text-slate-400">{u.kind === '4년제' ? '' : '그 외'}</span>
                  </td>
                  <td className="px-2 py-1.5 text-right">{u.total}</td>
                  <td className="px-2 py-1.5 text-right font-semibold text-green-700">{u.pass || ''}</td>
                  <td className="px-2 py-1.5 text-right text-teal-700">{u.extra || ''}</td>
                  <td className="px-2 py-1.5 text-right text-amber-700">{u.wait || ''}</td>
                  <td className="px-2 py-1.5 text-right text-rose-700">{u.fail || ''}</td>
                  <td className="px-2 py-1.5 text-right">{u.enrolled ? `★ ${u.enrolled}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
