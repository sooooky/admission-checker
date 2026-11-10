// 엑셀 파일 이외의 경로(붙여넣기, NEIS 웹 형식 .xls, CSV)와 예비 xlsx 해석기, 파일 형식 진단.
// 모두 브라우저 안에서만 처리하며 외부로 전송하지 않습니다.

export interface SheetData {
  name: string;
  headers: string[];
  rows: string[][];
}

/** 2차원 표 → 머리글 행을 찾아 SheetData 로 */
export function gridToSheet(name: string, grid: string[][]): SheetData | null {
  const dense = grid.map((r) => (r ?? []).map((c) => (c ?? '').toString().trim()));
  // 머리글 행: 위쪽 10줄 중 서로 다른 값이 2칸 이상 있는 첫 행
  // (병합된 제목 줄 "2027학년도 ○○ 현황" 은 같은 값만 반복되므로 건너뜀)
  const headerIdx = dense.slice(0, 10).findIndex((r) => new Set(r.filter((c) => c)).size >= 2);
  if (headerIdx < 0) return null;
  const width = Math.max(...dense.map((r) => r.length));
  const pad = (r: string[]) => Array.from({ length: width }, (_, i) => r[i] ?? '');
  const headers = pad(dense[headerIdx]).map((h, i) => h || `(열 ${i + 1})`);
  const rows = dense
    .slice(headerIdx + 1)
    .map(pad)
    .filter((r) => r.some((c) => c));
  return { name, headers, rows };
}

// ───────────────────────── 파일 형식 진단 ─────────────────────────

export type FileKind = 'zip' | 'ole' | 'ole-encrypted' | 'html' | 'text' | 'unknown';

export function detectFileKind(bytes: Uint8Array): FileKind {
  if (bytes.length < 4) return 'unknown';
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) return 'zip';
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) {
    // 암호가 걸린 xlsx 는 OLE 안에 "EncryptedPackage" 스트림(UTF-16)이 있습니다.
    const u16 = new TextDecoder('utf-16le').decode(bytes);
    return u16.includes('EncryptedPackage') || u16.includes('EncryptionInfo') ? 'ole-encrypted' : 'ole';
  }
  const head = decodeText(bytes.slice(0, 4096)).replace(/^﻿/, '').trimStart().toLowerCase();
  if (/^<(\?xml|!doctype html|html|table|meta|head|body)/.test(head) || head.includes('<table')) return 'html';
  // 사람이 읽을 수 있는 글자가 대부분이고 줄바꿈이 있으면 CSV/TSV 텍스트
  const sample = bytes.slice(0, 2048);
  let ctrl = 0;
  sample.forEach((b) => {
    if (b < 9 || (b > 13 && b < 32)) ctrl++;
  });
  if (ctrl / Math.max(1, sample.length) < 0.01 && /[\t,]/.test(head) && /\n/.test(head)) return 'text';
  return 'unknown';
}

export const KIND_MESSAGE: Record<Exclude<FileKind, 'zip' | 'html' | 'text'>, string> = {
  'ole-encrypted':
    '열기 암호가 설정된 파일입니다. 엑셀에서 [파일 → 정보 → 통합 문서 보호 → 암호 설정]의 암호를 지운 뒤 저장하거나, 아래 "복사해서 붙여넣기"를 이용해 주세요.',
  ole: '예전 엑셀 형식(.xls)이거나 문서보안(DRM)이 적용된 파일로 보입니다. 엑셀에서 "다른 이름으로 저장 → Excel 통합 문서(*.xlsx)"로 저장해 보시고, 그래도 안 되면 아래 "복사해서 붙여넣기"를 이용해 주세요.',
  unknown:
    '문서보안(DRM)이 적용된 파일로 보입니다. 학교 업무용 PC에서 저장한 파일은 자동으로 암호화되어 웹 브라우저가 내용을 읽을 수 없습니다. 아래 "복사해서 붙여넣기"를 이용해 주세요. (엑셀에서 표 전체 선택 → Ctrl+C → 아래 칸에 Ctrl+V)',
};

/** UTF-8 로 읽어 보고 깨지면 EUC-KR(CP949) 로 */
export function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    try {
      return new TextDecoder('euc-kr').decode(bytes);
    } catch {
      return new TextDecoder('utf-8').decode(bytes);
    }
  }
}

// ───────────────────────── 붙여넣기 / CSV ─────────────────────────

/** 엑셀에서 복사한 표(탭 구분) 또는 CSV 를 2차원 표로. 따옴표 안의 줄바꿈도 처리합니다. */
export function parseDelimited(text: string): string[][] {
  const t = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const firstLine = t.split('\n', 1)[0] ?? '';
  const delim = firstLine.includes('\t') ? '\t' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (quoted) {
      if (ch === '"') {
        if (t[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === delim) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

// ───────────────────────── NEIS 웹 형식(.xls = HTML 표) ─────────────────────────

export function parseHtmlTables(html: string): SheetData[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const out: SheetData[] = [];
  doc.querySelectorAll('table').forEach((table, ti) => {
    const grid: string[][] = [];
    const spans: Record<string, string> = {}; // rowspan 으로 아래 칸까지 이어지는 값
    table.querySelectorAll('tr').forEach((tr, ri) => {
      const row: string[] = [];
      let ci = 0;
      const take = () => {
        while (spans[`${ri},${ci}`] !== undefined) row[ci] = spans[`${ri},${ci++}`];
      };
      take();
      tr.querySelectorAll('th,td').forEach((cell) => {
        take();
        const v = (cell.textContent ?? '').replace(/\s+/g, ' ').trim();
        const cs = Number(cell.getAttribute('colspan')) || 1;
        const rs = Number(cell.getAttribute('rowspan')) || 1;
        for (let k = 0; k < cs; k++) {
          row[ci + k] = v;
          for (let r = 1; r < rs; r++) spans[`${ri + r},${ci + k}`] = v;
        }
        ci += cs;
      });
      take();
      grid.push(Array.from(row, (x) => x ?? ''));
    });
    const sheet = gridToSheet(`표 ${ti + 1}`, grid);
    if (sheet && sheet.rows.length) out.push(sheet);
  });
  return out;
}

// ───────────────────────── 예비 xlsx 해석기 ─────────────────────────
// ExcelJS 가 읽지 못하는 파일(한셀 저장본, Strict 형식, 접두어가 붙은 XML 등)을 위해
// 네임스페이스와 무관하게 셀 값만 읽습니다.

const byLocal = (root: Document | Element, name: string) => Array.from(root.getElementsByTagNameNS('*', name));
const attr = (el: Element, local: string) => {
  for (const a of Array.from(el.attributes)) if (a.localName === local) return a.value;
  return null;
};

function colIndex(ref: string) {
  const m = ref.match(/^([A-Z]+)/i);
  if (!m) return -1;
  return m[1].toUpperCase().split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
}

function isDateFormat(id: number, code: string | undefined) {
  if ((id >= 14 && id <= 22) || (id >= 27 && id <= 36) || (id >= 45 && id <= 47) || (id >= 50 && id <= 58)) return true;
  if (!code) return false;
  const c = code.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '');
  return /[yd]/i.test(c) || /m.*[d]|y.*m/i.test(c);
}

const serialToDate = (n: number) => {
  const d = new Date(Math.round((n - 25569) * 86400000));
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
};

export async function readXlsxLite(buf: ArrayBuffer): Promise<SheetData[]> {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(buf);
  const parser = new DOMParser();
  const xml = async (path: string) => {
    const f = zip.file(path) ?? zip.file(path.replace(/^\//, ''));
    return f ? parser.parseFromString(await f.async('string'), 'application/xml') : null;
  };
  const resolve = (base: string, target: string) => {
    if (target.startsWith('/')) return target.slice(1);
    const parts = base.split('/').slice(0, -1);
    for (const seg of target.split('/')) {
      if (seg === '..') parts.pop();
      else if (seg !== '.') parts.push(seg);
    }
    return parts.join('/');
  };

  // 통합 문서 위치
  let wbPath = 'xl/workbook.xml';
  const rootRels = await xml('_rels/.rels');
  if (rootRels) {
    const r = byLocal(rootRels, 'Relationship').find((x) => /officeDocument$/.test(attr(x, 'Type') ?? ''));
    if (r) wbPath = resolve('', attr(r, 'Target') ?? wbPath);
  }
  const wb = await xml(wbPath);
  if (!wb) throw new Error('workbook.xml 없음');
  const relsPath = wbPath.replace(/([^/]+)$/, '_rels/$1.rels');
  const rels = new Map<string, string>();
  const relDoc = await xml(relsPath);
  if (relDoc) byLocal(relDoc, 'Relationship').forEach((r) => rels.set(attr(r, 'Id') ?? '', resolve(wbPath, attr(r, 'Target') ?? '')));

  // 공유 문자열
  const shared: string[] = [];
  const ssTarget = [...rels.values()].find((t) => /sharedStrings/i.test(t));
  const ss = ssTarget ? await xml(ssTarget) : null;
  if (ss) {
    for (const si of byLocal(ss, 'si')) {
      shared.push(
        byLocal(si, 't')
          .filter((t) => (t.parentElement?.localName ?? '') !== 'rPh' && t.parentElement?.parentElement?.localName !== 'rPh')
          .map((t) => t.textContent ?? '')
          .join(''),
      );
    }
  }

  // 서식 (날짜·앞자리 0)
  const xfFmt: number[] = [];
  const customFmt = new Map<number, string>();
  const stTarget = [...rels.values()].find((t) => /styles/i.test(t));
  const st = stTarget ? await xml(stTarget) : null;
  if (st) {
    byLocal(st, 'numFmt').forEach((n) => customFmt.set(Number(attr(n, 'numFmtId')), attr(n, 'formatCode') ?? ''));
    const cellXfs = byLocal(st, 'cellXfs')[0];
    if (cellXfs) Array.from(cellXfs.children).forEach((xf) => xfFmt.push(Number(attr(xf, 'numFmtId') ?? 0)));
  }

  const sheets: SheetData[] = [];
  for (const sh of byLocal(wb, 'sheet')) {
    const name = attr(sh, 'name') ?? `시트${sheets.length + 1}`;
    const target = rels.get(attr(sh, 'id') ?? '');
    const doc = target ? await xml(target) : null;
    if (!doc) continue;
    const grid: string[][] = [];
    byLocal(doc, 'row').forEach((rowEl, ri) => {
      const rIdx = Number(attr(rowEl, 'r') ?? ri + 1) - 1;
      const row: string[] = [];
      let next = 0;
      for (const c of byLocal(rowEl, 'c')) {
        const ref = attr(c, 'r');
        const ci = ref ? colIndex(ref) : next;
        next = ci + 1;
        const t = attr(c, 't') ?? 'n';
        const v = byLocal(c, 'v')[0]?.textContent ?? '';
        let val = '';
        if (t === 's') val = shared[Number(v)] ?? '';
        else if (t === 'inlineStr') val = byLocal(c, 't').map((x) => x.textContent ?? '').join('');
        else if (t === 'b') val = v === '1' ? 'TRUE' : 'FALSE';
        else if (t === 'str' || t === 'e') val = t === 'e' ? '' : v;
        else if (v !== '') {
          const num = Number(v);
          const fmtId = xfFmt[Number(attr(c, 's') ?? 0)] ?? 0;
          const code = customFmt.get(fmtId);
          if (!Number.isNaN(num) && isDateFormat(fmtId, code)) val = serialToDate(num);
          else {
            val = Number.isInteger(num) ? num.toFixed(0) : v;
            if (code && /^0+$/.test(code) && val.length < code.length) val = val.padStart(code.length, '0');
          }
        }
        row[ci] = val.trim();
      }
      grid[rIdx] = Array.from(row, (x) => x ?? '');
    });
    const sheet = gridToSheet(name, Array.from(grid, (r) => r ?? []));
    if (sheet) sheets.push(sheet);
  }
  return sheets;
}
