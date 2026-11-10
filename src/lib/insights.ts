// 등록 대학·정시 관련 판단 규칙과 통계
import type { Application, Student, VaultData } from './types';
import { admTypeOf } from './types';
import { findUniversity } from './univLookup';

export const isPass = (a: Application) => a.status === '합격' || a.status === '충원합격';

export interface StudentInsight {
  student: Student;
  apps: Application[];
  passed: Application[];
  enrolled?: Application;
  warnings: string[];
  /** 합격했는데 등록 대학이 정해지지 않음 */
  needsEnrollDecision: boolean;
}

export function studentInsight(student: Student, allApps: Application[]): StudentInsight {
  const apps = allApps.filter((a) => a.studentId === student.id);
  const passed = apps.filter(isPass);
  const enrolled = student.enrolledAppId ? apps.find((a) => a.id === student.enrolledAppId) : undefined;
  const warnings: string[] = [];

  const susiPassed = passed.filter((a) => admTypeOf(a) === '수시');
  const later = apps.filter((a) => admTypeOf(a) !== '수시');
  if (susiPassed.length && later.length) {
    warnings.push(`수시 합격자는 정시·추가모집에 지원할 수 없습니다 (수시 합격 ${susiPassed.length}곳, 정시·추가 원서 ${later.length}개)`);
  }
  for (const g of ['가', '나', '다'] as const) {
    const n = new Set(apps.filter((a) => admTypeOf(a) === '정시' && a.gun === g).map((a) => a.university)).size;
    if (n > 1) warnings.push(`정시 ${g}군 대학이 ${n}곳입니다 (군별 1곳만 지원 가능)`);
  }
  if (student.enrolledAppId && !enrolled) warnings.push('등록 대학으로 표시한 원서가 삭제되었습니다');
  if (enrolled && !isPass(enrolled)) warnings.push(`등록 대학(${enrolled.university})이 합격 상태가 아닙니다`);

  return { student, apps, passed, enrolled, warnings, needsEnrollDecision: passed.length > 0 && !enrolled };
}

export const allInsights = (d: VaultData) => d.students.map((s) => studentInsight(s, d.applications));

/** 내장 4년제 목록에 있으면 4년제, 아니면 그 외(전문대 등) */
export const univKind = (name: string) => (findUniversity(name).length ? '4년제' : '그 외(전문대 등)');

export interface UnivStat {
  university: string;
  kind: string;
  total: number;
  pass: number;
  extra: number; // 충원합격
  wait: number;
  fail: number;
  enrolled: number;
}

export function computeStats(d: VaultData) {
  const insights = allInsights(d);
  const enrolledIds = new Set(insights.map((i) => i.enrolled?.id).filter(Boolean));
  const byUniv = new Map<string, UnivStat>();
  for (const a of d.applications) {
    const u =
      byUniv.get(a.university) ??
      ({ university: a.university, kind: univKind(a.university), total: 0, pass: 0, extra: 0, wait: 0, fail: 0, enrolled: 0 } as UnivStat);
    u.total++;
    if (a.status === '합격') u.pass++;
    if (a.status === '충원합격') u.extra++;
    if (a.status === '예비') u.wait++;
    if (a.status === '불합격') u.fail++;
    if (enrolledIds.has(a.id)) u.enrolled++;
    byUniv.set(a.university, u);
  }
  const univs = [...byUniv.values()].sort((x, y) => y.pass + y.extra - (x.pass + x.extra) || y.total - x.total || x.university.localeCompare(y.university, 'ko'));

  const group = <K extends string>(keyOf: (a: Application) => K) => {
    const m = new Map<K, { total: number; passed: number; students: Set<string>; passedStudents: Set<string> }>();
    for (const a of d.applications) {
      const k = keyOf(a);
      const g = m.get(k) ?? { total: 0, passed: 0, students: new Set<string>(), passedStudents: new Set<string>() };
      g.total++;
      g.students.add(a.studentId);
      if (isPass(a)) {
        g.passed++;
        g.passedStudents.add(a.studentId);
      }
      m.set(k, g);
    }
    return [...m.entries()].map(([key, g]) => ({ key, total: g.total, passed: g.passed, students: g.students.size, passedStudents: g.passedStudents.size }));
  };

  const passCounts = insights.map((i) => i.passed.length);
  return {
    students: d.students.length,
    applications: d.applications.length,
    checked: d.applications.filter((a) => a.status !== '미조회').length,
    passedStudents: insights.filter((i) => i.passed.length > 0).length,
    passedApps: d.applications.filter(isPass).length,
    enrolledStudents: insights.filter((i) => i.enrolled).length,
    undecided: insights.filter((i) => i.needsEnrollDecision).length,
    byAdm: group((a) => admTypeOf(a)),
    byKind: group((a) => univKind(a.university)),
    distribution: [
      { label: '합격 0곳', n: passCounts.filter((n) => n === 0).length },
      { label: '합격 1곳', n: passCounts.filter((n) => n === 1).length },
      { label: '합격 2곳', n: passCounts.filter((n) => n === 2).length },
      { label: '합격 3곳 이상', n: passCounts.filter((n) => n >= 3).length },
    ],
    univs,
  };
}

export const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '-');
