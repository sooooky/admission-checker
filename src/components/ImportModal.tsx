import { useMemo, useState } from 'react';
import type { VaultData } from '../lib/types';
import {
  buildImport,
  downloadTemplate,
  emptyGroup,
  guessMapping,
  readWorkbook,
  type AppGroup,
  type ColumnMapping,
  type SheetData,
} from '../lib/excel';
import { formatBirth, maskPhone, normalizeBirth, normalizePhone } from '../lib/format';
import { Modal, btn, inputCls, toast } from './ui';

function ColSelect({ headers, value, onChange }: { headers: string[]; value: number; onChange: (v: number) => void }) {
  return (
    <select className={`${inputCls} py-1.5`} value={value} onChange={(e) => onChange(Number(e.target.value))}>
      <option value={-1}>— 없음 —</option>
      {headers.map((h, i) => (
        <option key={i} value={i}>
          {h}
        </option>
      ))}
    </select>
  );
}

export function ImportModal({
  data,
  onClose,
  onImport,
}: {
  data: VaultData;
  onClose: () => void;
  onImport: (next: VaultData) => void;
}) {
  const [sheets, setSheets] = useState<SheetData[] | null>(null);
  const [sheetIdx, setSheetIdx] = useState(0);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [mode, setMode] = useState<'append' | 'replace'>(data.applications.length ? 'append' : 'replace');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const sheet = sheets?.[sheetIdx];

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setErr('');
    setLoading(true);
    try {
      const s = await readWorkbook(file);
      // 이름 열이 인식되는 시트를 우선 선택
      const best = Math.max(0, s.findIndex((x) => guessMapping(x.headers).name >= 0));
      setSheets(s);
      setSheetIdx(best);
      setMapping(guessMapping(s[best].headers));
    } catch (e) {
      setErr(e instanceof Error ? e.message : '엑셀을 읽지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const preview = useMemo(() => {
    if (!sheet || !mapping) return null;
    return buildImport(sheet, mapping, data, mode);
  }, [sheet, mapping, data, mode]);

  const setGroup = (gi: number, patch: Partial<AppGroup>) =>
    setMapping((m) => m && { ...m, groups: m.groups.map((g, i) => (i === gi ? { ...g, ...patch } : g)) });

  const firstRow = sheet?.rows[0];
  const sample = (i: number) => (i >= 0 && firstRow ? firstRow[i] : '');

  return (
    <Modal title="엑셀에서 학생·원서 불러오기" onClose={onClose} wide>
      {!sheets ? (
        <div className="space-y-4">
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 p-8 text-center hover:border-blue-400 hover:bg-blue-50">
            <span className="text-3xl">📄</span>
            <span className="mt-2 font-semibold">{loading ? '읽는 중…' : '엑셀 파일(.xlsx) 선택'}</span>
            <span className="mt-1 text-xs text-slate-500">파일은 이 브라우저 안에서만 읽히며 어디에도 업로드되지 않습니다.</span>
            <input type="file" accept=".xlsx" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
            <p className="font-semibold text-slate-700">지원하는 엑셀 형태</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              <li>
                <b>원서별 한 줄</b>: 이름 | 생년월일 | 핸드폰 | 대학명 | 전형명 | 모집단위 | 수험번호
              </li>
              <li>
                <b>학생별 한 줄</b>: 이름 | 생년월일 | 핸드폰 | 대학1 | 전형1 | 모집단위1 | 수험번호1 | 대학2 | …
              </li>
              <li>열 이름이 달라도 다음 화면에서 직접 지정할 수 있습니다. 핸드폰 열은 없어도 됩니다.</li>
            </ul>
            <button className={`${btn.secondary} mt-3`} onClick={() => downloadTemplate()}>
              ⬇️ 샘플 엑셀(양식) 받기
            </button>
          </div>
        </div>
      ) : (
        sheet &&
        mapping && (
          <div className="space-y-5">
            {sheets.length > 1 && (
              <div>
                <p className="mb-1 text-sm font-semibold">시트 선택</p>
                <select
                  className={inputCls}
                  value={sheetIdx}
                  onChange={(e) => {
                    const i = Number(e.target.value);
                    setSheetIdx(i);
                    setMapping(guessMapping(sheets[i].headers));
                  }}
                >
                  {sheets.map((s, i) => (
                    <option key={i} value={i}>
                      {s.name} ({s.rows.length}행)
                    </option>
                  ))}
                </select>
              </div>
            )}

            <section>
              <p className="mb-2 text-sm font-semibold">① 학생 정보 열</p>
              <div className="grid gap-3 sm:grid-cols-3">
                {(
                  [
                    ['name', '이름 *', (v: string) => v],
                    ['birth', '생년월일', (v: string) => formatBirth(normalizeBirth(v))],
                    ['phone', '핸드폰 (선택)', (v: string) => maskPhone(normalizePhone(v))],
                  ] as const
                ).map(([key, label, fmt]) => (
                  <div key={key}>
                    <p className="mb-1 text-xs text-slate-500">{label}</p>
                    <ColSelect headers={sheet.headers} value={mapping[key]} onChange={(v) => setMapping({ ...mapping, [key]: v })} />
                    <p className="mt-1 truncate text-xs text-slate-400">예: {fmt(sample(mapping[key])) || '-'}</p>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold">② 원서 정보 열 {mapping.groups.length > 1 && `(${mapping.groups.length}개 묶음)`}</p>
                <button
                  className={btn.ghost}
                  onClick={() => setMapping({ ...mapping, groups: [...mapping.groups, emptyGroup()] })}
                >
                  + 묶음 추가
                </button>
              </div>
              <div className="space-y-2">
                {mapping.groups.map((g, gi) => (
                  <div key={gi} className="grid items-end gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-[repeat(4,1fr)_auto]">
                    {(
                      [
                        ['univ', '대학 *'],
                        ['track', '전형'],
                        ['major', '모집단위'],
                        ['examNo', '수험번호'],
                      ] as const
                    ).map(([key, label]) => (
                      <div key={key}>
                        <p className="mb-1 text-xs text-slate-500">
                          {mapping.groups.length > 1 ? `${gi + 1}. ` : ''}
                          {label}
                        </p>
                        <ColSelect headers={sheet.headers} value={g[key]} onChange={(v) => setGroup(gi, { [key]: v })} />
                      </div>
                    ))}
                    {mapping.groups.length > 1 && (
                      <button
                        className="mb-1 rounded px-2 py-1 text-xs text-slate-400 hover:text-red-600"
                        onClick={() => setMapping({ ...mapping, groups: mapping.groups.filter((_, i) => i !== gi) })}
                      >
                        삭제
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>

            <section className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input type="radio" checked={mode === 'append'} onChange={() => setMode('append')} />
                기존 목록에 추가 (중복은 건너뜀, 결과 기록 유지)
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" checked={mode === 'replace'} onChange={() => setMode('replace')} />
                기존 목록을 지우고 새로 불러오기
              </label>
            </section>

            {preview && (
              <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">
                새 학생 <b>{preview.addedStudents}</b>명 · 새 원서 <b>{preview.addedApplications}</b>건을 불러옵니다.
                {preview.skippedRows > 0 && ` (이름이 비어 있는 ${preview.skippedRows}행은 제외)`}
                {mapping.name < 0 && <p className="mt-1 text-red-600">이름 열을 지정해 주세요.</p>}
                {mapping.groups.every((g) => g.univ < 0) && <p className="mt-1 text-red-600">대학 열을 지정해 주세요.</p>}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button className={btn.secondary} onClick={() => setSheets(null)}>
                다른 파일
              </button>
              <button
                className={btn.primary}
                disabled={!preview || mapping.name < 0 || preview.addedApplications + preview.addedStudents === 0}
                onClick={() => {
                  if (!preview) return;
                  if (mode === 'replace' && data.applications.length && !confirm('기존 목록과 기록한 결과가 모두 지워집니다. 계속할까요?')) return;
                  onImport(preview.data);
                  toast(`원서 ${preview.addedApplications}건을 불러왔습니다`);
                  onClose();
                }}
              >
                불러오기
              </button>
            </div>
            <p className="text-xs text-slate-500">
              💡 불러온 뒤에는 원본 엑셀 파일을 공용 PC의 다운로드 폴더 등에 남겨두지 않도록 주의해 주세요.
            </p>
          </div>
        )
      )}
    </Modal>
  );
}
