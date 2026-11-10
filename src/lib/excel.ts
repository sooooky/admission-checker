import type * as ExcelJSType from 'exceljs';
import type { Application, Student, VaultData } from './types';
import { admLabel, entryDate, entryText, hasMinReq, historyText, newId, parseAdm, parseMinReq } from './types';
import { computeStats, pct } from './insights';
import { downloadBlob } from './storage';
import {
  KIND_MESSAGE,
  decodeText,
  detectFileKind,
  gridToSheet,
  parseDelimited,
  parseHtmlTables,
  readXlsxLite,
  type SheetData,
} from './sheetSources';
export type { SheetData } from './sheetSources';
import { formatBirth, formatDateTime, formatPhone, normalizeBirth, normalizePhone, normalizeUniv } from './format';

type ExcelJSModule = typeof ExcelJSType;

// 엑셀 라이브러리는 용량이 커서 필요할 때만 불러옵니다.
async function loadExcelJS(): Promise<ExcelJSModule> {
  const mod = (await import('exceljs')) as unknown as { default?: ExcelJSModule } & ExcelJSModule;
  return mod.default ?? mod;
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

/** xlsx(zip) 안의 문서 속성 파일을 제거합니다. 시트 데이터는 그대로 둡니다. */
async function stripDocProps(buf: ArrayBuffer): Promise<ArrayBuffer> {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(buf);
  for (const name of Object.keys(zip.files)) {
    if (/^\/?docProps\//i.test(name)) zip.remove(name);
  }
  return zip.generateAsync({ type: 'arraybuffer' });
}

export class ReadError extends Error {
  constructor(
    message: string,
    public detail = '',
  ) {
    super(message);
  }
}

/**
 * 파일을 읽어 표 목록으로 돌려줍니다.
 * xlsx → ExcelJS → (실패 시) 문서 속성 제거 후 ExcelJS → (실패 시) 예비 해석기.
 * NEIS 웹 형식(.xls 안의 HTML 표)과 CSV 도 읽습니다. 모두 브라우저 안에서만 처리합니다.
 */
export async function readWorkbook(file: File): Promise<SheetData[]> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const kind = detectFileKind(bytes.slice(0, 8192));
  const head = Array.from(bytes.slice(0, 8), (b) => b.toString(16).padStart(2, '0')).join(' ');

  if (kind === 'html') {
    const sheets = parseHtmlTables(decodeText(bytes));
    if (sheets.length) return sheets;
    throw new ReadError('파일 안에서 표를 찾지 못했습니다.', `html, ${file.name}`);
  }
  if (kind === 'text') {
    const sheet = gridToSheet(file.name, parseDelimited(decodeText(bytes)));
    if (sheet) return [sheet];
    throw new ReadError('파일 안에서 표를 찾지 못했습니다.', `text, ${file.name}`);
  }
  if (kind !== 'zip') throw new ReadError(KIND_MESSAGE[kind], `형식: ${kind}, 시작 바이트: ${head}`);

  const errors: string[] = [];
  const ExcelJS = await loadExcelJS();
  for (const attempt of ['그대로', '문서 속성 제거'] as const) {
    try {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(attempt === '그대로' ? buf : await stripDocProps(buf));
      const sheets = sheetsFromExcelJS(wb);
      if (sheets.length) return sheets;
      errors.push(`${attempt}: 표 없음`);
    } catch (e) {
      errors.push(`${attempt}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  try {
    const sheets = await readXlsxLite(buf);
    if (sheets.length) return sheets;
    errors.push('예비 해석기: 표 없음');
  } catch (e) {
    errors.push(`예비 해석기: ${e instanceof Error ? e.message : String(e)}`);
  }
  console.warn('엑셀 읽기 실패', errors);
  throw new ReadError(
    errors.every((e) => e.endsWith('표 없음'))
      ? '엑셀에서 표를 찾지 못했습니다. 1행(또는 위쪽 10행 안)에 "이름", "대학명" 같은 열 이름이 있는지 확인해 주세요.'
      : '이 엑셀 파일의 구조를 해석하지 못했습니다. 아래 "복사해서 붙여넣기"를 이용해 주세요.',
    errors.join(' / '),
  );
}

function sheetsFromExcelJS(wb: ExcelJSType.Workbook): SheetData[] {
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
    const sheet = gridToSheet(ws.name, Array.from(grid, (r) => r ?? []));
    if (sheet) sheets.push(sheet);
  });
  return sheets;
}

// ───────────────────────── 열 매핑 ─────────────────────────

export interface AppGroup {
  univ: number;
  major: number;
  examNo: number;
  minReq: number;
  admType: number;
  gun: number;
}
export interface ColumnMapping {
  name: number;
  birth: number;
  phone: number;
  memo: number;
  groups: AppGroup[];
}
export const emptyGroup = (): AppGroup => ({ univ: -1, major: -1, examNo: -1, minReq: -1, admType: -1, gun: -1 });

type Field = 'name' | 'birth' | 'phone' | 'memo' | 'univ' | 'major' | 'examNo' | 'minReq' | 'admType' | 'gun';

function classify(header: string): Field | null {
  const h = header.replace(/\s|\(|\)|\[|\]|_/g, '').toLowerCase();
  if (/보호자|학부모|부모|담임/.test(h)) return null;
  if (/최저/.test(h)) return 'minReq';
  if (/모집시기|수시정시|수시\/정시|^시기\d*$|^모집구분\d*$/.test(h)) return 'admType';
  if (/^(모집)?군\d*$|가나다군/.test(h)) return 'gun';
  if (/메모|비고|특이사항/.test(h)) return 'memo';
  if (/수험번호|수험|접수번호|exam/.test(h)) return 'examNo';
  if (/전형/.test(h)) return null; // 전형은 사용하지 않음
  if (/모집단위|학과|학부|전공|계열|major/.test(h)) return 'major';
  if (/생년월일|생일|birth|주민/.test(h)) return 'birth';
  if (/핸드폰|휴대폰|휴대전화|전화|연락처|phone|mobile|^hp/.test(h)) return 'phone';
  if (/^(학생)?(이름|성명|학생명|학생이름|name)$/.test(h.replace(/\d/g, ''))) return 'name';
  if (/출신|고등학교|고교/.test(h)) return null;
  if (/대학|학교|univ/.test(h)) return 'univ';
  return null;
}

export function guessMapping(headers: string[]): ColumnMapping {
  const m: ColumnMapping = { name: -1, birth: -1, phone: -1, memo: -1, groups: [] };
  const groups = new Map<string, AppGroup>();
  headers.forEach((header, i) => {
    const f = classify(header);
    if (!f) return;
    if (f === 'name' || f === 'birth' || f === 'phone' || f === 'memo') {
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
    const memo = get(row, mapping.memo);
    let student = byKey.get(studentKey(info));
    if (!student) {
      student = { id: newId(), ...info, memo };
      students.push(student);
      byKey.set(studentKey(info), student);
      addedStudents++;
    } else {
      // 이미 있는 학생: 비어 있는 칸만 채움 (앱에서 입력한 값은 덮어쓰지 않음)
      if (!student.phone && info.phone) student.phone = info.phone;
      if (!student.memo && memo) student.memo = memo;
    }
    for (const g of mapping.groups) {
      const university = normalizeUniv(get(row, g.univ));
      if (!university) continue;
      const app: Application = {
        id: newId(),
        studentId: student.id,
        university,
        track: '',
        major: get(row, g.major),
        examNo: get(row, g.examNo).replace(/\s/g, ''),
        status: '미조회',
        waitNo: '',
        round: '',
        note: '',
        minReq: parseMinReq(get(row, g.minReq)),
        ...parseAdm(get(row, g.admType), get(row, g.gun)),
        checkedAt: null,
        history: [],
      };
      const k = appKey(app);
      if (appKeys.has(k)) {
        const existing = applications.find((x) => appKey(x) === k);
        if (existing && !existing.minReq && app.minReq) existing.minReq = app.minReq;
        continue;
      }
      appKeys.add(k);
      applications.push(app);
      addedApplications++;
    }
  }
  return { data: { version: 2, students, applications }, addedStudents, addedApplications, skippedRows };
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
  const enrolledIds = new Set(data.students.map((s) => s.enrolledAppId).filter(Boolean));

  const ws = wb.addWorksheet('원서별 결과');
  ws.columns = [
    { header: '이름', key: 'name', width: 10 },
    ...(opts.includeBirth ? [{ header: '생년월일', key: 'birth', width: 12 }] : []),
    ...(opts.includePhone ? [{ header: '핸드폰', key: 'phone', width: 15 }] : []),
    { header: '모집시기', key: 'adm', width: 10 },
    { header: '대학', key: 'univ', width: 18 },
    { header: '모집단위', key: 'major', width: 18 },
    { header: '수험번호', key: 'examNo', width: 14 },
    { header: '수능최저', key: 'minReq', width: 10 },
    { header: '결과', key: 'status', width: 10 },
    { header: '예비번호', key: 'waitNo', width: 9 },
    { header: '등록', key: 'enrolled', width: 6 },
    { header: '기록 경과', key: 'history', width: 50 },
    { header: '원서 메모', key: 'note', width: 24 },
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
      adm: admLabel(a),
      univ: a.university,
      major: a.major,
      examNo: a.examNo,
      minReq: hasMinReq(a.minReq) ? a.minReq : '',
      status: a.status,
      waitNo: a.waitNo,
      enrolled: enrolledIds.has(a.id) ? '★' : '',
      history: historyText(a),
      note: a.note,
      checkedAt: formatDateTime(a.checkedAt),
    });
  }
  styleHeader(ws);

  const sum = wb.addWorksheet('학생별 요약');
  sum.columns = [
    { header: '이름', key: 'name', width: 10 },
    { header: '지원 대학 수', key: 'univs', width: 11 },
    { header: '원서 수', key: 'count', width: 8 },
    { header: '합격', key: 'pass', width: 40 },
    { header: '예비', key: 'wait', width: 40 },
    { header: '미조회', key: 'todo', width: 8 },
    { header: '등록 대학', key: 'enrolled', width: 26 },
    { header: '학생 메모', key: 'memo', width: 40 },
  ];
  for (const s of [...data.students].sort((a, b) => a.name.localeCompare(b.name, 'ko'))) {
    const apps = data.applications.filter((a) => a.studentId === s.id);
    const label = (a: Application) => `${a.university}${a.major ? ' ' + a.major : ''}`;
    sum.addRow({
      name: s.name,
      univs: new Set(apps.map((a) => a.university)).size,
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
      enrolled: (() => {
        const e = apps.find((a) => a.id === s.enrolledAppId);
        return e ? `${e.university}${e.major ? ' ' + e.major : ''}` : '';
      })(),
      memo: s.memo ?? '',
    });
  }
  styleHeader(sum);

  // 진학 실적
  const st = computeStats(data);
  const perf = wb.addWorksheet('진학 실적');
  perf.columns = [
    { header: '항목', key: 'k', width: 22 },
    { header: '값', key: 'v', width: 14 },
    { header: '', key: 'c', width: 12 },
    { header: '', key: 'd', width: 12 },
    { header: '', key: 'e', width: 12 },
    { header: '', key: 'f', width: 12 },
    { header: '', key: 'g', width: 12 },
  ];
  const kv: [string, string | number][] = [
    ['학생 수', st.students],
    ['원서 수', st.applications],
    ['합격 학생 수 (1곳 이상)', st.passedStudents],
    ['학생 기준 합격률', pct(st.passedStudents, st.students)],
    ['합격 원서 수 (충원 포함)', st.passedApps],
    ['등록 확정 학생 수', st.enrolledStudents],
    ['합격했으나 등록 미정', st.undecided],
  ];
  kv.forEach(([k, v]) => perf.addRow({ k, v }));
  perf.addRow({});
  perf.addRow({ k: '구분', v: '원서', c: '합격 원서', d: '지원 학생', e: '합격 학생' }).font = { bold: true };
  for (const g of [...st.byAdm, ...st.byKind]) perf.addRow({ k: g.key, v: g.total, c: g.passed, d: g.students, e: g.passedStudents });
  perf.addRow({});
  perf.addRow({ k: '대학', v: '구분', c: '원서', d: '합격', e: '충원합격', f: '예비', g: '등록' }).font = { bold: true };
  for (const u of st.univs) perf.addRow({ k: u.university, v: u.kind, c: u.total, d: u.pass, e: u.extra, f: u.wait, g: u.enrolled });
  styleHeader(perf);

  // 예비번호 변화: 예비를 한 번이라도 받은 원서 × 차수
  const waits = sorted.filter((a) => a.history.some((h) => h.status === '예비'));
  if (waits.length) {
    const maxLen = Math.max(...waits.map((a) => a.history.length));
    const wsw = wb.addWorksheet('예비번호 변화');
    wsw.columns = [
      { header: '이름', key: 'name', width: 10 },
      { header: '대학', key: 'univ', width: 18 },
      { header: '모집단위', key: 'major', width: 18 },
      { header: '처음 예비', key: 'first', width: 10 },
      { header: '최근 예비', key: 'last', width: 10 },
      { header: '현재', key: 'status', width: 10 },
      ...Array.from({ length: maxLen }, (_, i) => ({ header: `기록 ${i + 1}`, key: `h${i}`, width: 14 })),
    ];
    for (const a of waits) {
      const w = a.history.filter((h) => h.status === '예비' && h.waitNo);
      const row: Record<string, string | number> = {
        name: byId.get(a.studentId)?.name ?? '',
        univ: a.university,
        major: a.major,
        first: w[0] ? Number(w[0].waitNo) : '',
        last: w.length > 1 ? Number(w[w.length - 1].waitNo) : '',
        status: a.status,
      };
      a.history.forEach((h, i) => (row[`h${i}`] = `${entryDate(h)} ${entryText(h)}`));
      wsw.addRow(row);
    }
    styleHeader(wsw);
  }

  const d = new Date();
  await saveWorkbook(wb, `입시결과_${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.xlsx`);
}

// 샘플 파일의 예시 데이터 (모두 가상의 학생·대학입니다)
const SAMPLE_STUDENTS: { name: string; birth: string; phone: string; apps: [string, string, string][] }[] = [
  {
    name: '김예시',
    birth: '070315',
    phone: '010-0000-0001',
    apps: [
      ['가나대학교', '경영학과', '10000001'],
      ['다라대학교', '경영학부', 'A2000002'],
      ['마바대학교', '경제학과', '00301234'],
    ],
  },
  {
    name: '이연습',
    birth: '071102',
    phone: '010-0000-0002',
    apps: [
      ['사아전문대학', '간호학과', '27001001'],
      ['자차전문대학', '물리치료과', '27002002'],
      ['카타대학교', '보건행정학과', 'B3000003'],
      ['파하전문대학', '치위생과', '27003003'],
    ],
  },
  {
    name: '박샘플',
    birth: '060820',
    phone: '',
    apps: [
      ['가나대학교', '시각디자인과', '10000077'],
      ['다라대학교', '산업디자인학과', 'A2000099'],
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
    ['양식B', '학생 1명 = 1줄. 대학1·모집단위1·수험번호1 … 처럼 번호를 붙여 옆으로 나열합니다. 대학7, 대학8 … 처럼 열을 더 붙여도 됩니다.'],
    ['필수 열', '이름, 대학(대학명). 나머지(생년월일·핸드폰·모집단위·수험번호)는 비어 있어도 됩니다.'],
    ['모집시기·군', '정시 원서는 "모집시기" 열에 정시, "군" 열에 가/나/다/군외를 적으면 됩니다. 비워 두면 수시로 불러옵니다.'],
    ['선택 열', '수능최저와 학생 메모(비고) 열은 없어도 됩니다. 수능최저는 최저가 있는 원서만 적으세요(확인필요/충족/미충족, O/X도 가능). 비워 두면 "최저 없음"입니다.'],
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
  a.columns = ['이름', '생년월일', '핸드폰', '대학명', '모집단위', '수험번호', '수능최저', '학생 메모'].map((h) => ({
    header: h,
    width: h === '대학명' || h === '모집단위' ? 18 : h === '학생 메모' ? 28 : 14,
    style: text,
  }));
  const sampleMin = ['충족', '', ''];
  const sampleMemo: Record<string, string> = { 김예시: '정시 병행 예정', 이연습: '보건계열 희망', 박샘플: '' };
  for (const s of SAMPLE_STUDENTS)
    s.apps.forEach(([u, m, e], i) => a.addRow([s.name, s.birth, s.phone, u, m, e, sampleMin[i % 3], i === 0 ? sampleMemo[s.name] : '']));
  styleHeader(a);

  // ── 양식B: 학생별 한 줄 ──
  const b = wb.addWorksheet('양식B_학생별 한줄');
  const groups = Math.max(6, ...SAMPLE_STUDENTS.map((s) => s.apps.length));
  const headers = ['이름', '생년월일', '핸드폰'];
  for (let i = 1; i <= groups; i++) headers.push(`대학${i}`, `모집단위${i}`, `수험번호${i}`);
  b.columns = headers.map((h) => ({ header: h, width: /^대학|^모집/.test(h) ? 15 : 12, style: text }));
  for (const s of SAMPLE_STUDENTS) b.addRow([s.name, s.birth, s.phone, ...s.apps.flat()]);
  styleHeader(b);
  b.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }];

  await saveWorkbook(wb, '입시조회_샘플양식.xlsx');
}
