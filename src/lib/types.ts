export const STATUSES = ['미조회', '합격', '충원합격', '예비', '불합격', '확인필요'] as const;
export type Status = (typeof STATUSES)[number];

export interface Student {
  id: string;
  name: string;
  /** YYYYMMDD (알 수 없으면 원본 숫자) */
  birth: string;
  /** 숫자만 (예: 01012345678). 없으면 빈 문자열 */
  phone: string;
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
