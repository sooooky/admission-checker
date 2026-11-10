import { UNIV_DIRECTORY } from '../data/univDirectory';
import type { UniversityInfo } from './types';

export interface DirEntry {
  name: string;
  region: string;
  home: string;
  plan: string;
}

export const DIRECTORY: DirEntry[] = UNIV_DIRECTORY.map(([name, region, home, plan]) => ({ name, region, home, plan }));

// 자주 쓰는 줄임말·영문 이름
const ALIASES: Record<string, string> = {
  카이스트: '한국과학기술원',
  kaist: '한국과학기술원',
  유니스트: '울산과학기술원',
  unist: '울산과학기술원',
  지스트: '광주과학기술원',
  gist: '광주과학기술원',
  디지스트: '대구경북과학기술원',
  dgist: '대구경북과학기술원',
  포스텍: '포항공과대학교',
  postech: '포항공과대학교',
  포항공대: '포항공과대학교',
  켄텍: '한국에너지공과대학교',
  kentech: '한국에너지공과대학교',
  한예종: '한국예술종합학교',
  서울과기대: '서울과학기술대학교',
  한기대: '한국기술교육대학교',
  코리아텍: '한국기술교육대학교',
  이대: '이화여자대학교',
  숙대: '숙명여자대학교',
  교원대: '한국교원대학교',
};

/** "건국대학교(서울)", "건국대 글로컬캠퍼스" → { base: "건국", campus: "서울" | "글로컬" } */
function parse(name: string) {
  let raw = name.trim();
  const alias = ALIASES[raw.replace(/\s+/g, '').toLowerCase()];
  if (alias) raw = alias;
  // 괄호 없이 띄어 쓴 캠퍼스: "동국대학교 WISE캠퍼스" → "동국대학교(WISE)"
  const sp = raw.match(/^(\S+?(?:대학교|대학|대))\s+(\S+?)(?:캠퍼스)?$/);
  if (sp) raw = `${sp[1]}(${sp[2]})`;
  const s = raw.replace(/\s+/g, '');
  const m = s.match(/^(.*?)[(（[]([^)）\]]*)[)）\]]?$/);
  let base = (m ? m[1] : s).replace(/^국립/, '');
  base = base.replace(/(대학교|대학원|대학|대)$/, '');
  const CAMPUS_ALIAS: Record<string, string> = { 에리카: 'ERICA', 와이즈: 'WISE', 경주: 'WISE', 원주: '미래', 글로벌: '용인', 안산: 'ERICA' };
  let campus = (m ? m[2] : '').replace(/캠퍼스$/, '').toUpperCase();
  campus = CAMPUS_ALIAS[campus] ?? campus;
  return { base, campus };
}

const parsed = DIRECTORY.map((d) => ({ d, ...parse(d.name) }));


/**
 * 학생 엑셀에 적힌 대학명으로 목록에서 대학을 찾습니다.
 * 정확히 하나면 그 대학, 캠퍼스가 여러 곳이면 후보 여러 개, 못 찾으면 빈 배열.
 */
export function findUniversity(name: string): DirEntry[] {
  const { base, campus } = parse(name);
  if (!base) return [];
  let hits = parsed.filter((p) => p.base === base);
  if (!hits.length && base.length >= 2) {
    // "한국외대" → "한국외국어", "서울과기대" 같은 줄임말
    hits = parsed.filter((p) => p.base.startsWith(base) || (base.startsWith(p.base) && p.base.length >= 3));
  }
  if (campus) {
    const c = hits.filter((p) => p.campus === campus || p.campus.includes(campus) || campus.includes(p.campus));
    if (c.length) hits = c;
  }
  return hits.map((p) => p.d);
}

export const exactDirectoryName = (name: string) => DIRECTORY.find((d) => d.name === name.replace(/\s+/g, ''));

export interface ResolvedUniv {
  /** 합격자 조회 페이지 (선생님이 등록) */
  url: string;
  /** 입학처 홈페이지 (직접 입력 > 내장 목록) */
  home: string;
  /** 시행계획·모집요강 (직접 입력 > 내장 목록) */
  plan: string;
  /** 내장 목록에서 찾은 대학 (하나로 정해진 경우) */
  dir?: DirEntry;
  /** 캠퍼스가 여러 곳이라 골라야 하는 경우의 후보 */
  candidates: DirEntry[];
}

const cache = new Map<string, DirEntry[]>();
const findCached = (name: string) => {
  let r = cache.get(name);
  if (!r) cache.set(name, (r = findUniversity(name)));
  return r;
};

export function resolveUniv(name: string, info?: UniversityInfo): ResolvedUniv {
  const pinned = info?.dirName ? DIRECTORY.find((d) => d.name === info.dirName) : undefined;
  const found = pinned ? [pinned] : findCached(name);
  const dir = found.length === 1 ? found[0] : undefined;
  return {
    url: info?.url ?? '',
    home: info?.home || dir?.home || '',
    plan: info?.plan || dir?.plan || '',
    dir,
    candidates: found.length > 1 ? found : [],
  };
}
