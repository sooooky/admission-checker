const digits = (s: string) => s.replace(/\D/g, '');

/** 다양한 생년월일 표기 → YYYYMMDD. 해석 불가 시 숫자만 반환 */
export function normalizeBirth(raw: string): string {
  const s = raw.trim();
  if (!s) return '';
  // 2007-03-15, 2007.3.15, 2007/03/15, 07.03.15
  const m = s.match(/^(\d{2}|\d{4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/);
  if (m) return fullYear(m[1]) + m[2].padStart(2, '0') + m[3].padStart(2, '0');
  let d = digits(s);
  if (d.length === 13 || d.length === 7) d = d.slice(0, 6); // 주민번호 형태가 들어온 경우 앞자리만
  if (d.length === 5) d = '0' + d; // 엑셀에서 앞자리 0이 빠진 경우 (70315 → 070315)
  if (d.length === 6) return fullYear(d.slice(0, 2)) + d.slice(2);
  return d;
}

function fullYear(y: string) {
  if (y.length === 4) return y;
  const n = Number(y);
  const cur = new Date().getFullYear() % 100;
  return (n <= cur ? '20' : '19') + y.padStart(2, '0');
}

export function birthAs(birth: string, digitsCount: 6 | 8): string {
  if (birth.length !== 8) return birth;
  return digitsCount === 8 ? birth : birth.slice(2);
}

export function formatBirth(birth: string) {
  return birth.length === 8 ? `${birth.slice(0, 4)}.${birth.slice(4, 6)}.${birth.slice(6)}` : birth;
}

export function normalizePhone(raw: string): string {
  let d = digits(raw);
  if (d.startsWith('82') && d.length >= 11) d = '0' + d.slice(2);
  if (d.length === 10 && d.startsWith('1')) d = '0' + d; // 앞자리 0이 빠진 경우
  return d;
}

export function formatPhone(p: string) {
  if (p.length === 11) return `${p.slice(0, 3)}-${p.slice(3, 7)}-${p.slice(7)}`;
  if (p.length === 10) return `${p.slice(0, 3)}-${p.slice(3, 6)}-${p.slice(6)}`;
  return p;
}

export function maskPhone(p: string) {
  if (!p) return '';
  if (p.length >= 10) return `${p.slice(0, 3)}-****-${p.slice(-4)}`;
  return '*'.repeat(Math.max(0, p.length - 4)) + p.slice(-4);
}

export function maskName(name: string) {
  if (name.length <= 1) return name;
  if (name.length === 2) return name[0] + '*';
  return name[0] + '*'.repeat(name.length - 2) + name[name.length - 1];
}

export const normalizeUniv = (s: string) => s.replace(/\s+/g, ' ').trim();

export function formatDateTime(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
