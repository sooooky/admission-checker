import { useMemo, useState } from 'react';
import type { Application, ScheduleEvent, Status, Student, UniversityRegistry } from '../lib/types';
import { MAX_ROUND, STATUSES, entryText, hasMinReq, nextMinReq, recordRound, roundLabel, roundLongLabel, type MinReq } from '../lib/types';
import { birthAs, formatBirth, formatDateTime, maskName, maskPhone } from '../lib/format';
import { encodePayload } from '../lib/autofill';
import type { Settings } from '../lib/storage';
import { STATUS_STYLE } from './status';
import { resolveUniv } from '../lib/univLookup';
import { nextEventFor, shortDate } from './CalendarView';
import { btn, copyText, inputCls, toast } from './ui';

interface Props {
  students: Student[];
  applications: Application[];
  universities: UniversityRegistry;
  settings: Settings;
  hideInfo: boolean;
  onChangeApp: (id: string, fn: (a: Application) => Application) => void;
  onRoundChange: (round: number) => void;
  schedule: ScheduleEvent[];
  onSetUnivUrl: (univ: string, url: string) => void;
  onEdit: (app: Application) => void;
  onAddSibling: (app: Application) => void;
  onAdd: () => void;
}

/** 이번 차수에 확인이 필요한 원서: 아직 결과가 확정되지 않았고 이번 차수 기록이 없는 것 */
export function needsCheck(a: Application, round: number) {
  if (a.history.some((h) => h.round === round)) return false;
  return a.status === '미조회' || a.status === '예비' || a.status === '확인필요';
}

export function isSafeUrl(url: string) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

export function openExternal(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer');
}

/** [조회 ↗]: 조회 주소(없으면 입학처 홈페이지)를 열고 자동입력 코드를 복사합니다. */
export async function openLookup(
  a: Application,
  s: Student | undefined,
  universities: UniversityRegistry,
  onSetUnivUrl: (univ: string, url: string) => void,
) {
  const r = resolveUniv(a.university, universities[a.university]);
  let url = r.url;
  let usedHome = false;
  if (!url && r.home) {
    url = r.home;
    usedHome = true;
  }
  if (!url) {
    const set = askUnivUrl(a.university, '', onSetUnivUrl);
    if (!set) return;
    url = set;
  }
  if (s) {
    try {
      await navigator.clipboard.writeText(encodePayload({ e: a.examNo, n: s.name, b: s.birth, p: s.phone }));
    } catch {
      /* 복사 실패해도 페이지는 엽니다 */
    }
  }
  toast(usedHome ? '입학처 홈페이지를 열었습니다 (합격자 조회 주소를 등록하면 바로 열립니다)' : '조회 페이지를 열고 자동입력 코드를 복사했습니다');
  openExternal(url);
}

export function askUnivUrl(univ: string, current: string, onSet: (univ: string, url: string) => void): string | null {
  const input = prompt(`${univ} 합격자 조회 페이지 주소를 붙여넣어 주세요.\n(대학 입학처 또는 원서접수 사이트의 합격자 발표 페이지)`, current);
  if (input === null) return null;
  const url = input.trim();
  if (url && !isSafeUrl(url)) {
    toast('http:// 또는 https:// 로 시작하는 주소여야 합니다', 'err');
    return null;
  }
  onSet(univ, url);
  return url;
}

export function ApplicationsView(p: Props) {
  const [groupBy, setGroupBy] = useState<'univ' | 'student'>('univ');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<Status | '전체' | '이번차수' | '최저확인필요' | '최저미충족'>('전체');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const studentById = useMemo(() => new Map(p.students.map((s) => [s.id, s])), [p.students]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return p.applications.filter((a) => {
      if (statusFilter === '이번차수') {
        if (!needsCheck(a, p.settings.currentRound)) return false;
      } else if (statusFilter === '최저확인필요') {
        if (a.minReq !== '확인필요') return false;
      } else if (statusFilter === '최저미충족') {
        if (a.minReq !== '미충족') return false;
      } else if (statusFilter !== '전체' && a.status !== statusFilter) return false;
      if (!q) return true;
      const s = studentById.get(a.studentId);
      return [s?.name, s?.memo, a.university, a.major, a.examNo, a.note].some((x) => x?.toLowerCase().includes(q));
    });
  }, [p.applications, query, statusFilter, studentById, p.settings.currentRound]);

  const groups = useMemo(() => {
    const map = new Map<string, Application[]>();
    for (const a of filtered) {
      const key = groupBy === 'univ' ? a.university : a.studentId;
      map.set(key, [...(map.get(key) ?? []), a]);
    }
    const nameOf = (k: string) => (groupBy === 'univ' ? k : studentById.get(k)?.name ?? '');
    return [...map.entries()]
      .sort(([a], [b]) => nameOf(a).localeCompare(nameOf(b), 'ko'))
      .map(([key, apps]) => ({
        key,
        // 같은 학생·같은 대학 원서는 붙어서(원래 순서대로) 나오도록 정렬
        apps: apps.sort((x, y) =>
          groupBy === 'univ'
            ? (studentById.get(x.studentId)?.name ?? '').localeCompare(studentById.get(y.studentId)?.name ?? '', 'ko') ||
              x.studentId.localeCompare(y.studentId)
            : x.university.localeCompare(y.university, 'ko'),
        ),
      }));
  }, [filtered, groupBy, studentById]);

  /** 학생·대학별 원서 수 (한 대학에 여러 원서) */
  const clusterSize = useMemo(() => {
    const m = new Map<string, number>();
    p.applications.forEach((a) => m.set(`${a.studentId}|${a.university}`, (m.get(`${a.studentId}|${a.university}`) ?? 0) + 1));
    return m;
  }, [p.applications]);

  const counts = useMemo(() => {
    const c = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<Status, number>;
    p.applications.forEach((a) => c[a.status]++);
    return c;
  }, [p.applications]);

  const needCount = useMemo(
    () => p.applications.filter((a) => needsCheck(a, p.settings.currentRound)).length,
    [p.applications, p.settings.currentRound],
  );
  const total = p.applications.length;
  const done = total - counts['미조회'];

  const lookup = (a: Application) => openLookup(a, studentById.get(a.studentId), p.universities, p.onSetUnivUrl);

  return (
    <div className="space-y-4">
      {/* 진행 현황 */}
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm text-slate-500">
            원서 <b className="text-slate-800">{total}</b>건 중 <b className="text-blue-700">{done}</b>건 확인
          </p>
          <p className="text-xs text-slate-400">학생 {p.students.length}명</p>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full bg-blue-500 transition-all" style={{ width: total ? `${(done / total) * 100}%` : 0 }} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-blue-50 px-3 py-2">
          <span className="text-sm font-semibold text-blue-900">기록할 차수</span>
          <select
            className="rounded-lg border border-blue-200 bg-white px-2 py-1 text-sm font-semibold text-blue-800"
            value={p.settings.currentRound}
            onChange={(e) => p.onRoundChange(Number(e.target.value))}
          >
            {Array.from({ length: MAX_ROUND + 1 }, (_, r) => (
              <option key={r} value={r}>
                {roundLongLabel(r)}
              </option>
            ))}
          </select>
          <button
            onClick={() => setStatusFilter(statusFilter === '이번차수' ? '전체' : '이번차수')}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${statusFilter === '이번차수' ? 'bg-blue-700 text-white' : 'bg-white text-blue-700'}`}
          >
            이번 차수 미확인 {needCount}
          </button>
          <span className="text-xs text-blue-800/70">결과 버튼은 선택한 차수의 결과로 기록됩니다.</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {(['전체', ...STATUSES] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                statusFilter === s ? 'bg-slate-800 text-white' : s === '전체' ? 'bg-slate-100' : STATUS_STYLE[s].badge
              }`}
            >
              {s} {s === '전체' ? total : counts[s]}
            </button>
          ))}
          {p.applications.some((a) => hasMinReq(a.minReq)) && (
            <>
              <span className="mx-1 self-center text-slate-300">|</span>
              {(
                [
                  ['최저확인필요', '최저 확인필요', '확인필요'],
                  ['최저미충족', '최저 미충족', '미충족'],
                ] as const
              ).map(([k, label, m]) => (
                <button
                  key={k}
                  onClick={() => setStatusFilter(statusFilter === k ? '전체' : k)}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${statusFilter === k ? 'bg-slate-800 text-white' : MIN_STYLE[m]}`}
                >
                  {label} {p.applications.filter((a) => a.minReq === m).length}
                </button>
              ))}
            </>
          )}
        </div>
      </div>

      {/* 도구 줄 */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          className={`${inputCls} max-w-xs flex-1`}
          placeholder="이름·대학·학과·수험번호 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="flex rounded-lg border border-slate-300 bg-white p-0.5 text-sm">
          {(
            [
              ['univ', '대학별'],
              ['student', '학생별'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setGroupBy(k)}
              className={`rounded-md px-3 py-1.5 ${groupBy === k ? 'bg-slate-800 text-white' : 'text-slate-600'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <button className={btn.secondary} onClick={p.onAdd}>
          + 원서 직접 추가
        </button>
      </div>

      {groups.length === 0 && (
        <p className="rounded-2xl bg-white p-8 text-center text-sm text-slate-500">조건에 맞는 원서가 없습니다.</p>
      )}

      {groups.map(({ key, apps }) => {
        const isUniv = groupBy === 'univ';
        const student = isUniv ? undefined : studentById.get(key);
        const title = isUniv ? key : p.hideInfo ? maskName(student?.name ?? '') : student?.name ?? '';
        const pending = apps.filter((a) => a.status === '미조회').length;
        const isCollapsed = collapsed[key];
        return (
          <section key={key} className="overflow-hidden rounded-2xl bg-white shadow-sm">
            <header className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-3">
              <button
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                onClick={() => setCollapsed({ ...collapsed, [key]: !isCollapsed })}
              >
                <span className="text-slate-400">{isCollapsed ? '▸' : '▾'}</span>
                <span className="truncate font-bold">{title}</span>
                <span className="shrink-0 text-xs text-slate-500">
                  {apps.length}건{pending > 0 && <span className="text-blue-600"> · 미조회 {pending}</span>}
                </span>
              </button>
              {isUniv && <UnivHeaderLinks univ={key} {...p} />}
              {!isUniv && student && (
                <span className="text-xs text-slate-500">
                  {p.hideInfo ? '****' : formatBirth(student.birth)}
                  {student.phone && ` · ${maskPhone(student.phone)}`}
                  {student.memo && <span className="ml-2 rounded bg-yellow-50 px-1.5 py-0.5 text-yellow-800">📝 {student.memo}</span>}
                </span>
              )}
            </header>
            {!isCollapsed && (
              <ul className="divide-y divide-slate-100">
                {apps.map((a, i) => (
                  <AppRow
                    key={a.id}
                    continued={i > 0 && apps[i - 1].studentId === a.studentId && apps[i - 1].university === a.university}
                    firstExamNo={apps.find((x) => x.studentId === a.studentId && x.university === a.university)?.examNo ?? ''}
                    clusterSize={clusterSize.get(`${a.studentId}|${a.university}`) ?? 1}
                    app={a}
                    student={studentById.get(a.studentId)}
                    showUniv={!isUniv}
                    linkKind={linkKind(a.university, p.universities)}
                    {...p}
                    onLookup={() => lookup(a)}
                  />
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

function AppRow({
  app: a,
  student: s,
  showUniv,
  linkKind,
  settings,
  hideInfo,
  onChangeApp,
  onEdit,
  onAddSibling,
  onLookup,
  continued,
  firstExamNo,
  clusterSize,
}: Props & {
  app: Application;
  student?: Student;
  showUniv: boolean;
  linkKind: LinkKind;
  onLookup: () => void;
  /** 같은 학생·같은 대학의 두 번째 이후 원서 */
  continued: boolean;
  firstExamNo: string;
  clusterSize: number;
}) {
  const round = settings.currentRound;
  const thisEntry = a.history.find((h) => h.round === round);
  const prevWait = [...a.history].reverse().find((h) => h.round < round && h.status === '예비');
  const record = (st: Exclude<Status, '미조회'>) =>
    onChangeApp(a.id, (x) => recordRound(x, round, thisEntry?.status === st ? null : st));
  const name = s?.name ?? '(학생 정보 없음)';
  const birth = s?.birth ?? '';
  const other = settings.birthDigits === 6 ? 8 : 6;

  return (
    <li
      className={`flex flex-col gap-3 py-3 pr-4 lg:flex-row lg:items-center ${continued ? 'bg-slate-50/70 pl-9' : 'pl-4'}`}
    >
      <div className={`min-w-0 ${continued ? 'lg:w-[15.75rem]' : 'lg:w-72'}`}>
        <div className="flex items-center gap-2">
          {continued ? (
            <span className="font-semibold text-slate-700">↳ {a.major || '모집단위 미입력'}</span>
          ) : (
            <span className="font-semibold">{showUniv ? a.university : hideInfo ? maskName(name) : name}</span>
          )}
          {!continued && !showUniv && s?.memo && (
            <button className="text-xs" title={`학생 메모: ${s.memo}`} onClick={() => onEdit(a)}>
              📝
            </button>
          )}
          <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${STATUS_STYLE[a.status].badge}`}>
            {a.status}
            {a.status === '예비' && a.waitNo && ` ${a.waitNo}번`}
            {a.status === '충원합격' && a.round && ` ${a.round}차`}
          </span>
          {hasMinReq(a.minReq) && (
            <button
              className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${MIN_STYLE[a.minReq ?? '']}`}
              onClick={() => onChangeApp(a.id, (x) => ({ ...x, minReq: nextMinReq(x.minReq) }))}
              title="수능 최저: 누를 때마다 확인필요 → 충족 → 미충족 (최저 없음으로 되돌리려면 ✎ 수정)"
            >
              {MIN_LABEL[a.minReq ?? '']}
            </button>
          )}
        </div>
        <p className="truncate text-xs text-slate-500">
          {!continued && (a.major || '모집단위 미입력')}
          {!continued && clusterSize > 1 && <span className="font-medium text-blue-600"> · 이 대학 원서 {clusterSize}개</span>}
          {a.checkedAt && <span className="text-slate-400">{continued ? '' : ' · '}{formatDateTime(a.checkedAt)} 확인</span>}
        </p>
        {a.history.length > 0 && (
          <div className="mt-1 flex flex-wrap items-center gap-0.5 text-[11px]">
            {a.history.map((h, i) => (
              <span key={h.round} className="flex items-center gap-0.5">
                {i > 0 && <span className="text-slate-300">→</span>}
                <span
                  className={`rounded px-1 py-px ${STATUS_STYLE[h.status].badge} ${h.round === round ? 'ring-1 ring-blue-400' : ''}`}
                >
                  <span className="opacity-60">{roundLabel(h.round)}</span> {entryText(h)}
                </span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 조회 + 복사 (같은 대학 둘째 원서부터는 첫 줄에서 한 번만 조회) */}
      {continued ? (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
          {a.examNo && a.examNo !== firstExamNo ? (
            <button className={btn.chip} onClick={() => copyText(a.examNo, '수험번호')} title="수험번호 복사">
              #{hideInfo ? '••••' : a.examNo}
            </button>
          ) : (
            <span>위 원서와 같은 조회 결과에서 확인</span>
          )}
        </div>
      ) : (
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          className={`rounded-md px-2.5 py-1 text-xs font-semibold text-white ${LINK_STYLE[linkKind]}`}
          onClick={onLookup}
          title={
            linkKind === 'url'
              ? '조회 페이지를 새 탭으로 열고, 자동입력 코드를 클립보드에 복사합니다'
              : linkKind === 'home'
                ? '조회 주소가 없어 입학처 홈페이지를 엽니다'
                : '조회 주소를 등록합니다'
          }
        >
          {linkKind === 'home' ? '입학처 ↗' : '조회 ↗'}
        </button>
        <button className={btn.chip} onClick={() => copyText(a.examNo, '수험번호')} title="수험번호 복사">
          #{hideInfo ? '••••' : a.examNo || '없음'}
        </button>
        <button className={btn.chip} onClick={() => copyText(name, '이름')}>
          이름
        </button>
        <button
          className={btn.chip}
          onClick={() => copyText(birthAs(birth, settings.birthDigits), `생년월일 ${settings.birthDigits}자리`)}
          title={hideInfo ? '' : formatBirth(birth)}
        >
          생일{settings.birthDigits}
        </button>
        <button className={`${btn.chip} text-slate-400`} onClick={() => copyText(birthAs(birth, other), `생년월일 ${other}자리`)}>
          {other}자리
        </button>
        {s?.phone && (
          <button className={btn.chip} onClick={() => copyText(s.phone, '핸드폰 번호')} title={maskPhone(s.phone)}>
            📱 {maskPhone(s.phone).slice(-4)}
          </button>
        )}
      </div>
      )}

      {/* 이번 차수 결과 기록 */}
      <div className="flex flex-wrap items-center gap-1 lg:ml-auto">
        <span className="mr-0.5 text-[11px] font-semibold text-blue-700">{roundLabel(round)}</span>
        {STATUSES.filter((x) => x !== '미조회').map((st) => (
          <button
            key={st}
            onClick={() => record(st)}
            className={`rounded-md px-2 py-1 text-xs font-medium ${thisEntry?.status === st ? STATUS_STYLE[st].on : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            {STATUS_STYLE[st].short}
          </button>
        ))}
        {thisEntry?.status === '예비' && (
          <input
            className="w-20 rounded-md border border-amber-300 px-2 py-1 text-xs"
            placeholder={prevWait?.waitNo ? `이전 ${prevWait.waitNo}` : '예비번호'}
            inputMode="numeric"
            autoFocus={!thisEntry.waitNo}
            value={thisEntry.waitNo}
            onChange={(e) => onChangeApp(a.id, (x) => recordRound(x, round, '예비', e.target.value.replace(/[^\d]/g, '')))}
          />
        )}
        {!continued && (
          <button
            className="rounded-md px-1.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50"
            onClick={() => onAddSibling(a)}
            title="같은 대학에 지원한 다른 모집단위·전형의 원서를 추가합니다"
          >
            +학과
          </button>
        )}
        <button className="rounded-md px-2 py-1 text-xs text-slate-400 hover:bg-slate-100" onClick={() => onEdit(a)} title="수정·기록 정정·메모">
          ✎{a.note && <span className="ml-0.5 text-blue-500">•</span>}
        </button>
      </div>
    </li>
  );
}

type LinkKind = 'url' | 'home' | 'none';
const LINK_STYLE: Record<LinkKind, string> = {
  url: 'bg-blue-600 hover:bg-blue-700',
  home: 'bg-sky-500 hover:bg-sky-600',
  none: 'bg-amber-500 hover:bg-amber-600',
};
function linkKind(univ: string, universities: UniversityRegistry): LinkKind {
  const r = resolveUniv(univ, universities[univ]);
  return r.url ? 'url' : r.home ? 'home' : 'none';
}

function UnivHeaderLinks({ univ, universities, schedule, onSetUnivUrl }: Props & { univ: string }) {
  const info = universities[univ];
  const r = resolveUniv(univ, info);
  const next = nextEventFor(univ, schedule);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {next && (
        <span className="rounded-md bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700" title={next.memo}>
          📅 {shortDate(next.date)} {next.title}
        </span>
      )}
      {info?.memo && <span className="hidden max-w-[14rem] truncate text-xs text-slate-500 md:inline">📝 {info.memo}</span>}
      {r.plan && (
        <button className={btn.chip} onClick={() => openExternal(r.plan)} title="2027학년도 대학입학전형 시행계획">
          📄 시행계획
        </button>
      )}
      {r.home && (
        <button className={btn.chip} onClick={() => openExternal(r.home)}>
          🏫 입학처
        </button>
      )}
      {r.url ? (
        <button className={btn.chip} onClick={() => openExternal(r.url)}>
          🔗 조회 페이지
        </button>
      ) : (
        <button
          className={`${btn.chip} border-amber-300 bg-amber-50 text-amber-800`}
          onClick={() => askUnivUrl(univ, '', onSetUnivUrl)}
        >
          ⚠️ 조회 주소 등록
        </button>
      )}
    </div>
  );
}

const MIN_STYLE: Record<MinReq, string> = {
  '': 'border border-dashed border-slate-300 text-slate-400',
  확인필요: 'bg-amber-100 text-amber-800',
  충족: 'bg-green-100 text-green-800',
  미충족: 'bg-rose-100 text-rose-800',
  해당없음: 'bg-slate-100 text-slate-400',
};
const MIN_LABEL: Record<MinReq, string> = {
  '': '최저 ?',
  확인필요: '최저 확인',
  충족: '최저 충족',
  미충족: '최저 미충족',
  해당없음: '최저 없음',
};
