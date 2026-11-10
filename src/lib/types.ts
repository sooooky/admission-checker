export const STATUSES = ['미조회', '합격', '충원합격', '예비', '불합격', '확인필요'] as const;
export type Status = (typeof STATUSES)[number];

export interface Student {
  id: string;
  name: string;
  /** YYYYMMDD (알 수 없으면 원본 숫자) */
  birth: string;
  /** 숫자만 (예: 01012345678). 없으면 빈 문자열 */
  phone: string;
  /** 학생 메모 (원서와 별개) */
  memo?: string;
  /** 최종 등록한 원서 id */
  enrolledAppId?: string;
}

export const ADM_TYPES = ['수시', '정시', '추가'] as const;
export type AdmType = (typeof ADM_TYPES)[number];
export const GUNS = ['가', '나', '다', '군외'] as const;
export type Gun = (typeof GUNS)[number] | '';
export const admTypeOf = (a: { admType?: AdmType }): AdmType => a.admType ?? '수시';
export const admLabel = (a: { admType?: AdmType; gun?: Gun }) => {
  const t = admTypeOf(a);
  if (t === '정시') return a.gun ? (a.gun === '군외' ? '정시 군외' : `정시 ${a.gun}군`) : '정시';
  return t === '추가' ? '추가모집' : '수시';
};

/** 엑셀 값 → 모집 시기·군 */
export function parseAdm(rawType: string, rawGun: string): { admType?: AdmType; gun?: Gun } {
  const t = rawType.replace(/\s/g, '');
  const g = rawGun.replace(/\s/g, '');
  let gun: Gun = '';
  if (/군외|산업대|전문대/.test(g)) gun = '군외';
  else if (/^가/.test(g)) gun = '가';
  else if (/^나/.test(g)) gun = '나';
  else if (/^다/.test(g)) gun = '다';
  let admType: AdmType | undefined;
  if (/추가/.test(t)) admType = '추가';
  else if (/정시/.test(t)) admType = '정시';
  else if (/수시/.test(t)) admType = '수시';
  if (!admType && gun) admType = '정시';
  // 모집시기 칸에 "가군" 처럼 군이 적힌 경우
  if (!gun && admType === undefined && /^[가나다]군?$/.test(t)) return { admType: '정시', gun: t[0] as Gun };
  return { admType, gun: admType === '정시' ? gun : '' };
}

export const MIN_REQ = ['', '확인필요', '충족', '미충족', '해당없음'] as const;
export type MinReq = (typeof MIN_REQ)[number];
/** 수능 최저가 있는 원서인지 ('' 와 '해당없음' 은 최저 없음으로 취급) */
export const hasMinReq = (m: MinReq | undefined) => m === '확인필요' || m === '충족' || m === '미충족';
/** 최저가 있는 원서의 칩을 누르면: 확인필요 → 충족 → 미충족 → 확인필요 */
export const nextMinReq = (m: MinReq | undefined): MinReq => (m === '확인필요' ? '충족' : m === '충족' ? '미충족' : '확인필요');

/** 엑셀 등의 값을 수능 최저 상태로 해석 */
export function parseMinReq(raw: string): MinReq {
  const v = raw.replace(/\s/g, '').toLowerCase();
  if (!v) return '';
  if (/미충족|불충족|미달|^x$|^×$|^✗$|^no$|^n$/.test(v)) return '미충족';
  if (/충족|^o$|^○$|^yes$|^y$|통과/.test(v)) return '충족';
  if (/해당없|없음|^무$|^-$|^없$|미적용/.test(v)) return '해당없음';
  return '확인필요';
}

/** 발표 차수: 0 = 최초 발표, n = n차 충원 */
export interface ResultEntry {
  round: number;
  status: Exclude<Status, '미조회'>;
  waitNo: string;
  at: string; // ISO, 기록한 시각
}

export const MAX_ROUND = 20;
export const roundLabel = (r: number) => (r === 0 ? '최초' : `${r}차`);
export const roundLongLabel = (r: number) => (r === 0 ? '최초 발표' : `${r}차 충원`);

export interface Application {
  id: string;
  studentId: string;
  university: string;
  track: string; // 전형명
  major: string; // 모집단위
  examNo: string; // 수험번호
  status: Status;
  waitNo: string; // 예비 번호
  round: string; // 충원 차수
  note: string;
  /** 수능 최저학력기준 충족 여부 */
  minReq?: MinReq;
  /** 모집 시기 (없으면 수시) */
  admType?: AdmType;
  /** 정시 모집군 */
  gun?: Gun;
  checkedAt: string | null; // ISO
  /** 차수별 결과 기록 (round 오름차순). status/waitNo/round/checkedAt 는 마지막 기록에서 계산됩니다. */
  history: ResultEntry[];
}

/** 암호화되어 저장되는 개인정보 */
export interface VaultData {
  version: 1;
  students: Student[];
  applications: Application[];
}

/** 대학별 조회 주소 (개인정보 아님 → 암호화하지 않음) */
export interface UniversityInfo {
  url: string; // 합격자 조회 페이지
  memo: string;
  /** 입학처 홈페이지 (비우면 내장 대학 목록에서 자동) */
  home?: string;
  /** 모집요강·시행계획 링크 (비우면 내장 대학 목록에서 자동) */
  plan?: string;
  /** 내장 목록에서 캠퍼스 등을 직접 고른 경우 그 이름 */
  dirName?: string;
}

/** 발표·등록 일정 (개인정보 아님) */
export interface ScheduleEvent {
  id: string;
  univ: string; // 공통 일정은 ''
  date: string; // YYYY-MM-DD
  endDate: string; // 기간 일정의 마지막 날 (없으면 '')
  time: string; // HH:MM (없으면 '')
  title: string;
  memo: string;
}

export const EVENT_PRESETS = [
  '최초합격 발표',
  ...Array.from({ length: 8 }, (_, i) => `${i + 1}차 충원 발표`),
  '합격자 등록',
  '충원 등록 마감',
  '면접·실기·논술',
  '서류 제출',
] as const;
export type UniversityRegistry = Record<string, UniversityInfo>;

export const emptyVault = (): VaultData => ({ version: 1, students: [], applications: [] });

export const newId = () => crypto.randomUUID();

/** history 로부터 현재 상태 필드를 다시 계산 */
export function withHistory(app: Application, history: ResultEntry[]): Application {
  const sorted = [...history].sort((a, b) => a.round - b.round);
  const last = sorted[sorted.length - 1];
  if (!last) return { ...app, history: [], status: '미조회', waitNo: '', round: '', checkedAt: null };
  return {
    ...app,
    history: sorted,
    status: last.status,
    waitNo: last.status === '예비' ? last.waitNo : '',
    round: last.status === '충원합격' && last.round > 0 ? String(last.round) : '',
    checkedAt: last.at,
  };
}

/** 이 차수의 결과를 기록(덮어쓰기). status 가 null 이면 이 차수 기록 삭제 */
export function recordRound(app: Application, round: number, status: ResultEntry['status'] | null, waitNo?: string): Application {
  const rest = app.history.filter((h) => h.round !== round);
  if (!status) return withHistory(app, rest);
  const prev = app.history.find((h) => h.round === round);
  const entry: ResultEntry = {
    round,
    status,
    waitNo: status === '예비' ? (waitNo ?? (prev?.status === '예비' ? prev.waitNo : '')) : '',
    at: new Date().toISOString(),
  };
  return withHistory(app, [...rest, entry]);
}

export const entryText = (h: ResultEntry) =>
  h.status === '예비' ? `예비${h.waitNo ? ' ' + h.waitNo : ''}` : h.status === '충원합격' ? '충원합격' : h.status;

export const historyText = (app: Application) =>
  app.history.map((h) => `${roundLabel(h.round)} ${entryText(h)}`).join(' → ');

/** 이전 버전 데이터(history 없음)를 새 구조로 변환 */
export function migrateVault(d: VaultData): VaultData {
  return {
    ...d,
    applications: d.applications.map((a) => {
      if (Array.isArray(a.history)) return a;
      const history: ResultEntry[] =
        a.status && a.status !== '미조회'
          ? [
              {
                round: a.status === '충원합격' && Number(a.round) > 0 ? Number(a.round) : 0,
                status: a.status,
                waitNo: a.waitNo ?? '',
                at: a.checkedAt ?? new Date().toISOString(),
              },
            ]
          : [];
      return { ...a, history };
    }),
  };
}
