import type { EncryptedBlob } from './crypto';
import { isEncryptedBlob } from './crypto';
import type { ScheduleEvent, UniversityRegistry } from './types';

const VAULT_KEY = 'admchk_vault_v1';
const UNIV_KEY = 'admchk_universities_v1';
const SETTINGS_KEY = 'admchk_settings_v1';
export const SCHEDULE_KEY = 'admchk_schedule_v1';

export interface Settings {
  autoLockMinutes: number;
  birthDigits: 6 | 8;
  /** 지금 기록 중인 발표 차수 (0 = 최초 발표) */
  currentRound: number;
}
export const defaultSettings: Settings = { autoLockMinutes: 15, birthDigits: 6, currentRound: 0 };

function readJSON<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export const loadVaultBlob = (): EncryptedBlob | null => {
  const b = readJSON<unknown>(VAULT_KEY);
  return isEncryptedBlob(b) ? b : null;
};
export const saveVaultBlob = (blob: EncryptedBlob) => localStorage.setItem(VAULT_KEY, JSON.stringify(blob));

export const loadUniversities = (): UniversityRegistry => readJSON<UniversityRegistry>(UNIV_KEY) ?? {};
export const saveUniversities = (r: UniversityRegistry) => localStorage.setItem(UNIV_KEY, JSON.stringify(r));

export const loadSchedule = (): ScheduleEvent[] => {
  const s = readJSON<ScheduleEvent[]>(SCHEDULE_KEY);
  return Array.isArray(s) ? s : [];
};
export const saveSchedule = (s: ScheduleEvent[]) => localStorage.setItem(SCHEDULE_KEY, JSON.stringify(s));

export const loadSettings = (): Settings => ({ ...defaultSettings, ...(readJSON<Partial<Settings>>(SETTINGS_KEY) ?? {}) });
export const saveSettings = (s: Settings) => localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));

/** 학생 정보(암호화 금고)만 삭제 */
export const wipeVault = () => localStorage.removeItem(VAULT_KEY);
/** 이 앱이 저장한 모든 것을 삭제 */
export const wipeAll = () => {
  [VAULT_KEY, UNIV_KEY, SETTINGS_KEY, SCHEDULE_KEY].forEach((k) => localStorage.removeItem(k));
};

export function downloadText(filename: string, text: string, mime = 'application/json') {
  downloadBlob(filename, new Blob([text], { type: mime }));
}
export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
