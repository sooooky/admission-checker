import type * as ExcelJSType from 'exceljs';
import type { Application, Student, VaultData } from './types';
import { historyText, newId, roundLongLabel } from './types';
import { downloadBlob } from './storage';
import { formatBirth, formatDateTime, formatPhone, normalizeBirth, normalizePhone, normalizeUniv } from './format';

type ExcelJSModule = typeof ExcelJSType;

// 엑셀 라이브러리는 용량이 커서 필요할 때만 불러옵니다.
async function loadExcelJS(): Promise<ExcelJSModule> {
  const mod = (await import('exceljs')) as unknown as { default?: ExcelJSModule } & ExcelJSModule;
  return mod.default ?? mod;
}

export interface SheetData {
  name: string;
  headers: string[];
  rows: string[][];
}

function cellToString(cell: ExcelJSType.Cell): string {
  return valueToString(cell.value, cell.numFmt);
}

function valueToString(v: ExcelJSType.CellValue, numFmt?: string): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) {
    // ExcelJS 는 엑셀의 날짜를 UTC 기준 Date 로 돌려줍니다.
    const p = (n: number) => String(n).padStart(2, '0');
    return `${v.getUTCFullYear()}-${p(v.getUTCMonth() + 1)}-${p(v.getUTCDate())}`;
  }
  if (typeof v === 'number') {
    let s = Number.isInteger(v) ? v.toFixed(0) : String(v);
    // 서식이 "00000000" 처럼 0 채움이면 앞자리 0 복원
    if (numFmt && /^0+$/.test(numFmt) && s.length < numFmt.length) s = s.padStart(numFmt.length, '0');
    return s;
  }
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map((r) => r.text).join('').trim();
    if ('formula' in v || 'sharedFormula' in v) {
      return valueToString((v as ExcelJSType.CellFormulaValue).result as ExcelJSType.CellValue, numFmt);
    }
    if ('text' in v) return String((v as ExcelJSType.CellHyperlinkValue).text).trim();
  }
  return '';
}

export async function readWorkbook(file: File): Promise<SheetData[]> {
  if (!/\.xlsx$/i.test(file.name)) {
    throw new Error('.xlsx 형식만 지원합니다. 엑셀에서 "다른 이름으로 저장 → Excel 통합 문서(*.xlsx)"로 저장해 주세요.');
  }
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const sheets: SheetData[] = [];
  wb.eachSheet((ws) => {
    const grid: string[][] = [];
    ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      const arr: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        arr[col - 1] = cellToString(cell);
      });
      grid[rowNumber - 1] = Array.from(arr, (x) => x ?? '');
    });
    const dense = Array.from(grid, (r) => r ?? []);
    // 머리글 행: 위쪽 10줄 중 값이 2칸 이상 채워진 첫 행
    const headerIdx = dense.slice(0, 10).findIndex((r) => r.filter((c) => c).length >= 2);
    if (headerIdx < 0) return;
    const width = Math.max(...dense.map((r) => r.length));
    const pad = (r: string[]) => Array.from({ length: width }, (_, i) => r[i] ?? '');
    const headers = pad(dense[headerIdx]).map((h, i) => h || `(열 ${i + 1})`);
    const rows = dense
      .slice(headerIdx + 1)
      .map(pad)
      .filter((r) => r.some((c) => c));
    sheets.push({ name: ws.name, headers, rows });
  });
  if (!sheets.length) throw new Error('엑셀에서 표를 찾지 못했습니다.');
  return sheets;
}

// ───────────────────────── 열 매핑 ─────────────────────────

export interface AppGroup {
  univ: number;
  track: number;
  major: number;
  examNo: number;
}
export interface ColumnMapping {
  name: number;
  birth: number;
  phone: number;
  groups: AppGroup[];
}
export const emptyGroup = (): AppGroup => ({ univ: -1, track: -1, major: -1, examNo: -1 });

type Field = 'name' | 'birth' | 'phone' | 'univ' | 'track' | 'major' | 'examNo';

function classify(header: string): Field | null {
  const h = header.replace(/\s|\(|\)|\[|\]|_/g, '').toLowerCase();
  if (/보호자|학부모|부모|담임/.test(h)) return null;
  if (/수험번호|수험|접수번호|exam/.test(h)) return 'examNo';
  if (/전형/.test(h)) return 'track';
  if (/모집단위|학과|학부|전공|계열|major/.test(h)) return 'major';
  if (/생년월일|생일|birth|주민/.test(h)) return 'birth';
  if (/핸드폰|휴대폰|휴대전화|전화|연락처|phone|mobile|^hp/.test(h)) return 'phone';
  if (/^(학생)?(이름|성명|학생명|학생이름|name)$/.test(h.replace(/\d/g, ''))) return 'name';
  if (/출신|고등학교|고교/.test(h)) return null;
  if (/대학|학교|univ/.test(h)) return 'univ';
  return null;
}

export function guessMapping(headers: string[]): ColumnMapping {
  const m: ColumnMapping = { name: -1, birth: -1, phone: -1, groups: [] };
  const groups = new Map<string, AppGroup>();
  headers.forEach((header, i) => {
    const f = classify(header);
    if (!f) return;
    if (f === 'name' || f === 'birth' || f === 'phone') {
      if (m[f] < 0) m[f] = i;
      return;
    }
    const suffix = (header.match(/\d+/) ?? [''])[0];
    const g = groups.get(suffix) ?? emptyGroup();
    if (g[f] < 0) g[f] = i;
    groups.set(suffix, g);
  });
  m.groups = [...groups.entries()]
    .filter(([, g]) => g.univ >= 0)
    .sort(([a], [b]) => Number(a || 0) - Number(b || 0))
    .map(([, g]) => g);
  if (!m.groups.length) m.groups = [emptyGroup()];
  return m;
}

export interface ImportResult {
  data: VaultData;
  addedStudents: number;
  addedApplications: number;
  skippedRows: number;
}

const studentKey = (s: Pick<Student, 'name' | 'birth' | 'phone'>) => `${s.name}|${s.birth || s.phone}`;
const appKey = (a: Pick<Application, 'studentId' | 'university' | 'major' | 'examNo'>) =>
  `${a.studentId}|${a.university}|${a.major}|${a.examNo}`;

export function buildImport(
  sheet: SheetData,
  mapping: ColumnMapping,
  base: VaultData,
  mode: 'append' | 'replace',
): ImportResult {
  const students = mode === 'replace' ? [] : base.students.map((s) => ({ ...s }));
  const applications = mode === 'replace' ? [] : base.applications.map((a) => ({ ...a }));
  const byKey = new Map(students.map((s) => [studentKey(s), s]));
  const appKeys = new Set(applications.map(appKey));
  let addedStudents = 0;
  let addedApplications = 0;
  let skippedRows = 0;
  const get = (row: string[], i: number) => (i >= 0 ? (row[i] ?? '').trim() : '');

  for (const row of sheet.rows) {
    const name = get(row, mapping.name);
    if (!name) {
      skippedRows++;
      continue;
    }
    const info = { name, birth: normalizeBirth(get(row, mapping.birth)), phone: normalizePhone(get(row, mapping.phone)) };
    let student = byKey.get(studentKey(info));
    if (!student) {
      student = { id: newId(), ...info };
      students.push(student);
      byKey.set(studentKey(info), student);
      addedStudents++;
    } else if (!student.phone && info.phone) {
      student.phone = info.phone;
    }
    for (const g of mapping.groups) {
      const university = normalizeUniv(get(row, g.univ));
      if (!university) continue;
      const app: Application = {
        id: newId(),
        studentId: student.id,
        university,
        track: get(row, g.track),
        major: get(row, g.major),
        examNo: get(row, g.examNo).replace(/\s/g, ''),
        status: '미조회',
        waitNo: '',
        round: '',
        note: '',
        checkedAt: null,
        history: [],
      };
      const k = appKey(app);
      if (appKeys.has(k)) continue;
      appKeys.add(k);
      applications.push(app);
      addedApplications++;
    }
  }
  return { data: { version: 1, students, applications }, addedStudents, addedApplications, skippedRows };
}

// ───────────────────────── 내보내기 ─────────────────────────

async function saveWorkbook(wb: ExcelJSType.Workbook, filename: string) {
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  downloadBlob(filename, blob);
}

function styleHeader(ws: ExcelJSType.Worksheet) {
  const row = ws.getRow(1);
  row.font = { bold: true };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

export async function exportResults(data: VaultData, opts: { includePhone: boolean; includeBirth: boolean }) {
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  const byId = new Map(data.students.map((s) => [s.id, s]));

  const ws = wb.addWorksheet('원서별 결과');
  ws.columns = [
    { header: '이름', key: 'name', width: 10 },
    ...(opts.includeBirth ? [{ header: '생년월일', key: 'birth', width: 12 }] : []),
    ...(opts.includePhone ? [{ header: '핸드폰', key: 'phone', width: 15 }] : []),
    { header: '대학', key: 'univ', width: 18 },
    { header: '전형', key: 'track', width: 16 },
    { header: '모집단위', key: 'major', width: 18 },
    { header: '수험번호', key: 'examNo', width: 14 },
    { header: '결과', key: 'status', width: 10 },
    { header: '예비번호', key: 'waitNo', width: 9 },
    { header: '충원차수', key: 'round', width: 9 },
    { header: '경과', key: 'history', width: 40 },
    { header: '메모', key: 'note', width: 24 },
    { header: '확인일시', key: 'checkedAt', width: 12 },
  ];
  const sorted = [...data.applications].sort((a, b) => {
    const sa = byId.get(a.studentId)?.name ?? '';
    const sb = byId.get(b.studentId)?.name ?? '';
    return sa.localeCompare(sb, 'ko') || a.university.localeCompare(b.university, 'ko');
  });
  for (const a of sorted) {
    const s = byId.get(a.studentId);
    ws.addRow({
      name: s?.name ?? '',
      birth: s ? formatBirth(s.birth) : '',
      phone: s ? formatPhone(s.phone) : '',
      univ: a.university,
      track: a.track,
      major: a.major,
      examNo: a.examNo,
      status: a.status,
      waitNo: a.waitNo,
      round: a.round,
      history: historyText(a),
      note: a.note,
      checkedAt: formatDateTime(a.checkedAt),
    });
  }
  styleHeader(ws);

  const sum = wb.addWorksheet('학생별 요약');
  sum.columns = [
    { header: '이름', key: 'name', width: 10 },
    { header: '원서 수', key: 'count', width: 8 },
    { header: '합격', key: 'pass', width: 40 },
    { header: '예비', key: 'wait', width: 40 },
    { header: '미조회', key: 'todo', width: 8 },
  ];
  for (const s of [...data.students].sort((a, b) => a.name.localeCompare(b.name, 'ko'))) {
    const apps = data.applications.filter((a) => a.studentId === s.id);
    const label = (a: Application) => `${a.university}${a.major ? ' ' + a.major : ''}`;
    sum.addRow({
      name: s.name,
      count: apps.length,
      pass: apps
        .filter((a) => a.status === '합격' || a.status === '충원합격')
        .map((a) => label(a) + (a.status === '충원합격' ? `(충원${a.round ? ' ' + a.round + '차' : ''})` : ''))
        .join(', '),
      wait: apps
        .filter((a) => a.status === '예비')
        .map((a) => label(a) + (a.waitNo ? `(${a.waitNo}번)` : ''))
        .join(', '),
      todo: apps.filter((a) => a.status === '미조회').length,
    });
  }
  styleHeader(sum);

  // 예비번호 변화: 예비를 한 번이라도 받은 원서 × 차수
  const waits = sorted.filter((a) => a.history.some((h) => h.status === '예비'));
  if (waits.length) {
    const maxRound = Math.max(0, ...waits.flatMap((a) => a.history.map((h) => h.round)));
    const wsw = wb.addWorksheet('예비번호 변화');
    wsw.columns = [
      { header: '이름', key: 'name', width: 10 },
      { header: '대학', key: 'univ', width: 18 },
      { header: '모집단위', key: 'major', width: 18 },
      ...Array.from({ length: maxRound + 1 }, (_, r) => ({ header: roundLongLabel(r), key: `r${r}`, width: 11 })),
      { header: '현재', key: 'status', width: 10 },
    ];
    for (const a of waits) {
      const row: Record<string, string | number> = {
        name: byId.get(a.studentId)?.name ?? '',
        univ: a.university,
        major: a.major,
        status: a.status,
      };
      for (const h of a.history) {
        row[`r${h.round}`] = h.status === '예비' ? (h.waitNo ? Number(h.waitNo) : '예비') : h.status;
      }
      wsw.addRow(row);
    }
    styleHeader(wsw);
  }

  const d = new Date();
  await saveWorkbook(wb, `입시결과_${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.xlsx`);
}

// 샘플 파일의 예시 데이터 (모두 가상의 학생·대학입니다)
const SAMPLE_STUDENTS: { name: string; birth: string; phone: string; apps: [string, string, string, string][] }[] = [
  {
    name: '김예시',
    birth: '070315',
    phone: '010-0000-0001',
    apps: [
      ['가나대학교', '학생부종합', '경영학과', '10000001'],
      ['다라대학교', '학생부교과', '경영학부', 'A2000002'],
      ['마바대학교', '논술', '경제학과', '00301234'],
    ],
  },
  {
    name: '이연습',
    birth: '071102',
    phone: '010-0000-0002',
    apps: [
      ['사아전문대학', '일반고 특별전형', '간호학과', '27001001'],
      ['자차전문대학', '일반전형', '물리치료과', '27002002'],
      ['카타대학교', '학생부교과', '보건행정학과', 'B3000003'],
      ['파하전문대학', '면접전형', '치위생과', '27003003'],
    ],
  },
  {
    name: '박샘플',
    birth: '060820',
    phone: '',
    apps: [
      ['가나대학교', '실기위주', '시각디자인과', '10000077'],
      ['다라대학교', '학생부종합', '산업디자인학과', 'A2000099'],
    ],
  },
];

export async function downloadTemplate() {
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  const text = { numFmt: '@' }; // 텍스트 서식: 수험번호·생년월일의 앞자리 0 보존

  // ── 작성 안내 ──
  const g = wb.addWorksheet('작성 안내');
  g.columns = [
    { header: '항목', key: 'k', width: 14 },
    { header: '설명', key: 'v', width: 90 },
  ];
  const guide: [string, string][] = [
    ['사용 방법', '양식A 또는 양식B 중 편한 시트 하나에 학생 정보를 입력한 뒤, 앱의 [엑셀 불러오기]에서 이 파일을 선택하세요.'],
    ['예시 행', '각 시트의 예시(김예시·이연습·박샘플)는 가상의 학생·대학입니다. 지우고 실제 학생 정보를 입력하세요.'],
    ['양식A', '원서 1건 = 1줄. 원서가 많은 학생(전문대 포함 10~20개)도 줄만 추가하면 되어 가장 편합니다.'],
    ['양식B', '학생 1명 = 1줄. 대학1·전형1·모집단위1·수험번호1 … 처럼 번호를 붙여 옆으로 나열합니다. 대학7, 대학8 … 처럼 열을 더 붙여도 됩니다.'],
    ['필수 열', '이름, 대학(대학명). 나머지(생년월일·핸드폰·전형·모집단위·수험번호)는 비어 있어도 됩니다.'],
    ['열 순서', '열 순서는 상관없습니다. 앱이 열 이름(머리글)을 보고 자동으로 맞추며, 불러오기 화면에서 직접 바꿀 수도 있습니다.'],
    ['생년월일', '070315, 20070315, 2007-03-15, 2007.3.15 모두 가능합니다.'],
    ['핸드폰', '학생 본인 번호. 대학 조회에 휴대폰 번호가 필요한 경우에만 쓰입니다. 010-1234-5678 또는 01012345678.'],
    ['수험번호', '앞자리 0이 사라지지 않도록 이 파일의 칸은 "텍스트" 서식으로 되어 있습니다. 그대로 입력하세요.'],
    ['보호자 연락처', '"보호자", "학부모"가 들어간 열은 학생 핸드폰으로 인식하지 않습니다.'],
    ['개인정보', '파일은 앱이 브라우저 안에서만 읽으며 업로드되지 않습니다. 불러온 뒤에는 공용 PC에 파일을 남겨두지 마세요.'],
  ];
  guide.forEach(([k, v]) => g.addRow({ k, v }));
  g.getColumn('v').alignment = { wrapText: true, vertical: 'top' };
  g.getColumn('k').font = { bold: true };
  styleHeader(g);

  // ── 양식A: 원서별 한 줄 ──
  const a = wb.addWorksheet('양식A_원서별 한줄');
  a.columns = ['이름', '생년월일', '핸드폰', '대학명', '전형명', '모집단위', '수험번호'].map((h) => ({
    header: h,
    width: h === '대학명' || h === '모집단위' || h === '전형명' ? 18 : 14,
    style: text,
  }));
  for (const s of SAMPLE_STUDENTS) for (const [u, t, m, e] of s.apps) a.addRow([s.name, s.birth, s.phone, u, t, m, e]);
  styleHeader(a);

  // ── 양식B: 학생별 한 줄 ──
  const b = wb.addWorksheet('양식B_학생별 한줄');
  const groups = Math.max(6, ...SAMPLE_STUDENTS.map((s) => s.apps.length));
  const headers = ['이름', '생년월일', '핸드폰'];
  for (let i = 1; i <= groups; i++) headers.push(`대학${i}`, `전형${i}`, `모집단위${i}`, `수험번호${i}`);
  b.columns = headers.map((h) => ({ header: h, width: /^대학|^모집|^전형/.test(h) ? 15 : 12, style: text }));
  for (const s of SAMPLE_STUDENTS) b.addRow([s.name, s.birth, s.phone, ...s.apps.flat()]);
  styleHeader(b);
  b.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }];

  await saveWorkbook(wb, '입시조회_샘플양식.xlsx');
}
