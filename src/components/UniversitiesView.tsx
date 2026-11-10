import { useMemo, useRef } from 'react';
import type { Application, UniversityRegistry } from '../lib/types';
import { downloadText } from '../lib/storage';
import { normalizeUniv } from '../lib/format';
import { isSafeUrl, openExternal } from './ApplicationsView';
import { btn, inputCls, toast } from './ui';

export function UniversitiesView({
  applications,
  universities,
  onChange,
}: {
  applications: Application[];
  universities: UniversityRegistry;
  onChange: (next: UniversityRegistry) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  const rows = useMemo(() => {
    const names = new Set([...applications.map((a) => a.university), ...Object.keys(universities)]);
    return [...names]
      .sort((a, b) => a.localeCompare(b, 'ko'))
      .map((name) => {
        const apps = applications.filter((a) => a.university === name);
        return { name, total: apps.length, pending: apps.filter((a) => a.status === '미조회').length };
      });
  }, [applications, universities]);

  const update = (name: string, patch: Partial<{ url: string; memo: string }>) => {
    const cur = universities[name] ?? { url: '', memo: '' };
    onChange({ ...universities, [name]: { ...cur, ...patch } });
  };

  const missing = rows.filter((r) => r.total > 0 && !universities[r.name]?.url).length;

  const importRegistry = async (file: File | undefined) => {
    if (!file) return;
    try {
      const json = JSON.parse(await file.text()) as { universities?: UniversityRegistry };
      const incoming = json.universities ?? {};
      const next = { ...universities };
      let n = 0;
      for (const [rawName, v] of Object.entries(incoming)) {
        const name = normalizeUniv(rawName);
        const url = typeof v?.url === 'string' && isSafeUrl(v.url) ? v.url : '';
        const memo = typeof v?.memo === 'string' ? v.memo.slice(0, 500) : '';
        if (!name || (!url && !memo)) continue;
        next[name] = { url: url || next[name]?.url || '', memo: memo || next[name]?.memo || '' };
        n++;
      }
      onChange(next);
      toast(`${n}개 대학의 조회 주소를 가져왔습니다`);
    } catch {
      toast('올바른 조회 주소 목록 파일이 아닙니다', 'err');
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white p-4 text-sm text-slate-600 shadow-sm">
        <p>
          대학별 <b>합격자 조회 페이지 주소</b>를 등록해 두면 목록에서 [조회 ↗] 한 번으로 바로 열립니다. 발표 시기마다 주소가
          바뀔 수 있으니 확인해 주세요.
        </p>
        <p className="mt-1 text-xs text-slate-500">
          이 목록에는 학생 개인정보가 들어 있지 않아, 파일로 내보내 동료 선생님과 공유할 수 있습니다.
        </p>
        {missing > 0 && <p className="mt-2 font-medium text-amber-700">⚠️ 주소가 등록되지 않은 대학이 {missing}곳 있습니다.</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            className={btn.secondary}
            onClick={() =>
              downloadText('대학_조회주소_목록.json', JSON.stringify({ format: 'admchk-universities', universities }, null, 2))
            }
          >
            ⬇️ 목록 내보내기
          </button>
          <button className={btn.secondary} onClick={() => fileRef.current?.click()}>
            ⬆️ 목록 가져오기
          </button>
          <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={(e) => importRegistry(e.target.files?.[0])} />
          <button
            className={btn.secondary}
            onClick={() => {
              const name = normalizeUniv(prompt('추가할 대학 이름') ?? '');
              if (name) update(name, {});
            }}
          >
            + 대학 추가
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
        {rows.length === 0 && <p className="p-8 text-center text-sm text-slate-500">엑셀을 불러오면 지원 대학이 자동으로 표시됩니다.</p>}
        <ul className="divide-y divide-slate-100">
          {rows.map((r) => {
            const info = universities[r.name] ?? { url: '', memo: '' };
            const bad = info.url && !isSafeUrl(info.url);
            return (
              <li key={r.name} className="grid gap-2 px-4 py-3 md:grid-cols-[12rem_1fr_14rem_auto] md:items-center">
                <div>
                  <p className="font-semibold">{r.name}</p>
                  <p className="text-xs text-slate-500">
                    원서 {r.total}건{r.pending > 0 && ` · 미조회 ${r.pending}`}
                  </p>
                </div>
                <input
                  className={`${inputCls} ${bad ? 'border-red-400' : ''}`}
                  placeholder="https://… 합격자 조회 페이지 주소"
                  defaultValue={info.url}
                  key={`u-${r.name}-${info.url}`}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && !isSafeUrl(v)) return toast('http:// 또는 https:// 로 시작해야 합니다', 'err');
                    if (v !== info.url) update(r.name, { url: v });
                  }}
                />
                <input
                  className={inputCls}
                  placeholder="메모 (발표일, 생년월일 6자리 등)"
                  defaultValue={info.memo}
                  key={`m-${r.name}-${info.memo}`}
                  onBlur={(e) => e.target.value !== info.memo && update(r.name, { memo: e.target.value })}
                />
                <div className="flex gap-1">
                  <button className={btn.chip} disabled={!info.url || !!bad} onClick={() => openExternal(info.url)}>
                    열기
                  </button>
                  <button
                    className={btn.chip}
                    title="네이버에서 이 대학의 합격자 조회 페이지를 검색합니다 (대학 이름만 전송)"
                    onClick={() =>
                      openExternal(`https://search.naver.com/search.naver?query=${encodeURIComponent(`${r.name} 합격자 발표 조회`)}`)
                    }
                  >
                    🔍 찾기
                  </button>
                  {r.total === 0 && (
                    <button
                      className={`${btn.chip} text-red-600`}
                      onClick={() => {
                        const next = { ...universities };
                        delete next[r.name];
                        onChange(next);
                      }}
                    >
                      삭제
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
