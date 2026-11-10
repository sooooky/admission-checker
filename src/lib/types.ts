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
}

/** 암호화되어 저장되는 개인정보 */
export interface VaultData {
  version: 1;
  students: Student[];
  applications: Application[];
}

/** 대학별 조회 주소 (개인정보 아님 → 암호화하지 않음) */
export interface UniversityInfo {
  url: string;
  memo: string;
}
export type UniversityRegistry = Record<string, UniversityInfo>;

export const emptyVault = (): VaultData => ({ version: 1, students: [], applications: [] });

export const newId = () => crypto.randomUUID();
