import { useMemo, useRef, useState } from 'react';
import type { Application, ScheduleEvent, UniversityInfo, UniversityRegistry } from '../lib/types';
import { newId } from '../lib/types';
import { downloadText } from '../lib/storage';
import { normalizeUniv } from '../lib/format';
import { DIRECTORY, resolveUniv } from '../lib/univLookup';
import { UNIV_DIRECTORY_SOURCE } from '../data/univDirectory';
import { mergeSchedule } from '../lib/schedule';
import { isSafeUrl, openExternal } from './ApplicationsView';
import { EventModal, nextEventFor, nextPreset, shortDate, ymd } from './CalendarView';
import { btn, inputCls, toast } from './ui';

export function UniversitiesView({
  applications,
  universities,
  schedule,
  builtin,
  onChange,
  onChangeSchedule,
}: {
  applications: Application[];
  universities: UniversityRegistry;
  schedule: ScheduleEvent[];
  /** 모집요강 내장 일정 (표시용) */
  builtin: ScheduleEvent[];
  onChange: (next: UniversityRegistry) => void;
  onChangeSchedule: (next: ScheduleEvent[]) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [newName, setNewName] = useState('');
  const [query, setQuery] = useState('');
  const [editingEvent, setEditingEvent] = useState<ScheduleEvent | null>(null);

  const rows = useMemo(() => {
    const names = new Set([...applications.map((a) => a.university), ...Object.keys(universities), ...schedule.map((e) => e.univ)]);
    const q = query.trim();
    return [...names]
      .filter((n) => !q || n.includes(q))
      .sort((a, b) => a.localeCompare(b, 'ko'))
      .map((name) => {
        const apps = applications.filter((a) => a.university === name);
        return { name, total: apps.length, pending: apps.filter((a) => a.status === '미조회').length };
      });
  }, [applications, universities, schedule, query]);

  const update = (name: string, patch: Partial<UniversityInfo>) => {
    const cur = universities[name] ?? { url: '', memo: '' };
    onChange({ ...universities, [name]: { ...cur, ...patch } });
  };

  const addUniv = () => {
    const name = normalizeUniv(newName);
    if (!name) return;
    if (!universities[name]) update(name, {});
    const r = resolveUniv(name);
    toast(r.dir ? `${name}: 입학처·시행계획 링크를 연결했습니다` : r.candidates.length ? `${name}: 캠퍼스를 골라 주세요` : `${name}을(를) 추가했습니다 (목록에 없어 링크는 직접 입력)`);
    setNewName('');
  };

  const stats = useMemo(() => {
    const applied = [...new Set(applications.map((a) => a.university))];
    return {
      noLink: applied.filter((n) => !resolveUniv(n, universities[n]).home).length,
      noEvent: applied.filter((n) => ![...schedule, ...builtin].some((e) => e.univ === n)).length,
    };
  }, [applications, universities, schedule, builtin]);

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const json = JSON.parse(await file.text()) as { universities?: UniversityRegistry; schedule?: unknown[] };
      const next = { ...universities };
      let n = 0;
      for (const [rawName, v] of Object.entries(json.universities ?? {})) {
        const name = normalizeUniv(rawName);
        const safe = (x: unknown) => (typeof x === 'string' && isSafeUrl(x) ? x : '');
        const memo = typeof v?.memo === 'string' ? v.memo.slice(0, 500) : '';
        if (!name) continue;
        const cur = next[name] ?? { url: '', memo: '' };
        next[name] = {
          url: safe(v?.url) || cur.url,
          memo: memo || cur.memo,
          home: safe(v?.home) || cur.home,
          plan: safe(v?.plan) || cur.plan,
          dirName: typeof v?.dirName === 'string' ? v.dirName : cur.dirName,
          hiddenBuiltin: Array.isArray(v?.hiddenBuiltin)
            ? v.hiddenBuiltin.filter((x: unknown): x is string => typeof x === 'string').slice(0, 500)
            : cur.hiddenBuiltin,
        };
        n++;
      }
      onChange(next);
      const before = schedule.length;
      const merged = mergeSchedule(schedule, Array.isArray(json.schedule) ? json.schedule : []);
      onChangeSchedule(merged);
      toast(`대학 ${n}곳, 일정 ${merged.length - before}개를 가져왔습니다`);
    } catch {
      toast('올바른 대학 정보 파일이 아닙니다', 'err');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white p-4 text-sm text-slate-600 shadow-sm">
        <p>
          4년제 대학 <b>{DIRECTORY.length}곳</b>의 <b>입학처</b>와 <b>2027 시행계획</b> 링크가 들어 있어, 대학 이름만 있으면 자동으로
          연결됩니다. 합격자 조회 페이지 주소를 등록하면 [조회 ↗]가 그 페이지로 바로 열리고, 없으면 입학처 홈페이지가 열립니다.
        </p>
        <p className="mt-1 text-xs text-slate-400">출처: {UNIV_DIRECTORY_SOURCE} · 전문대학은 포함되어 있지 않아 링크를 직접 입력해 주세요.</p>
        <div className="mt-2 flex flex-wrap gap-3 text-xs">
          {stats.noLink > 0 && <span className="font-medium text-amber-700">⚠️ 링크 없는 지원 대학 {stats.noLink}곳</span>}
          {stats.noEvent > 0 && <span className="font-medium text-indigo-700">📅 일정 미등록 지원 대학 {stats.noEvent}곳</span>}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <input
            className={`${inputCls} max-w-xs`}
            list="dir-univs"
            placeholder="대학 추가 (예: 경희대학교)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addUniv()}
          />
          <datalist id="dir-univs">
            {DIRECTORY.map((d) => (
              <option key={d.name} value={d.name}>
                {d.region}
              </option>
            ))}
          </datalist>
          <button className={btn.primary} onClick={addUniv} disabled={!newName.trim()}>
            + 대학 추가
          </button>
          <input className={`${inputCls} max-w-[12rem]`} placeholder="목록에서 찾기" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
          <span className="self-center text-xs text-slate-500">동료와 공유 (개인정보 없음):</span>
          <button
            className={btn.secondary}
            onClick={() =>
              downloadText('대학정보_조회주소_일정.json', JSON.stringify({ format: 'admchk-universities', universities, schedule }, null, 2))
            }
          >
            ⬇️ 내보내기
          </button>
          <button className={btn.secondary} onClick={() => fileRef.current?.click()}>
            ⬆️ 가져오기
          </button>
          <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={(e) => importFile(e.target.files?.[0])} />
        </div>
      </div>

      <div className="space-y-2">
        {rows.length === 0 && (
          <p className="rounded-2xl bg-white p-8 text-center text-sm text-slate-500">
            {query ? '검색 결과가 없습니다.' : '엑셀을 불러오거나 위에서 대학을 추가하면 여기에 표시됩니다.'}
          </p>
        )}
        {rows.map((r) => (
          <UnivRow
            key={r.name}
            row={r}
            info={universities[r.name] ?? { url: '', memo: '' }}
            schedule={[...schedule, ...builtin]}
            onUpdate={(patch) => update(r.name, patch)}
            onAddEvent={() =>
              setEditingEvent({ id: newId(), univ: r.name, date: ymd(new Date()), endDate: '', time: '', title: '최초합격 발표', memo: '' })
            }
            onRemove={() => {
              const next = { ...universities };
              delete next[r.name];
              onChange(next);
            }}
          />
        ))}
      </div>

      {editingEvent && (
        <EventModal
          key={editingEvent.id}
          event={editingEvent}
          isNew
          univOptions={[editingEvent.univ]}
          onClose={() => setEditingEvent(null)}
          onSave={(ev, keepGoing) => {
            onChangeSchedule(schedule.some((x) => x.id === ev.id) ? schedule.map((x) => (x.id === ev.id ? ev : x)) : [...schedule, ev]);
            toast('일정을 저장했습니다');
            setEditingEvent(keepGoing ? { ...ev, id: newId(), title: nextPreset(ev.title), endDate: '', memo: '' } : null);
          }}
        />
      )}
    </div>
  );
}

function UnivRow({
  row,
  info,
  schedule,
  onUpdate,
  onAddEvent,
  onRemove,
}: {
  row: { name: string; total: number; pending: number };
  info: UniversityInfo;
  schedule: ScheduleEvent[];
  onUpdate: (patch: Partial<UniversityInfo>) => void;
  onAddEvent: () => void;
  onRemove: () => void;
}) {
  const r = resolveUniv(row.name, info);
  const [showLinks, setShowLinks] = useState(false);
  const events = schedule.filter((e) => e.univ === row.name);
  const next = nextEventFor(row.name, schedule);
  const notInDir = !r.dir && r.candidates.length === 0;
  const urlField = (key: 'url' | 'home' | 'plan', placeholder: string) => (
    <input
      className={`${inputCls} ${info[key] && !isSafeUrl(info[key] ?? '') ? 'border-red-400' : ''}`}
      placeholder={placeholder}
      defaultValue={info[key] ?? ''}
      key={`${key}-${row.name}-${info[key] ?? ''}`}
      onBlur={(e) => {
        const v = e.target.value.trim();
        if (v && !isSafeUrl(v)) return toast('http:// 또는 https:// 로 시작해야 합니다', 'err');
        if (v !== (info[key] ?? '')) onUpdate({ [key]: v });
      }}
    />
  );

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-bold">{row.name}</span>
        {r.dir && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">{r.dir.region}</span>}
        {r.dir && r.dir.name !== row.name && <span className="text-[11px] text-slate-400">→ {r.dir.name}</span>}
        {notInDir && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-700">내장 목록에 없음 (전문대 등)</span>}
        <span className="text-xs text-slate-500">
          {row.total > 0 ? `원서 ${row.total}건${row.pending ? ` · 미조회 ${row.pending}` : ''}` : '지원 원서 없음'}
        </span>
        <div className="ml-auto flex flex-wrap gap-1">
          {r.plan && (
            <button className={btn.chip} onClick={() => openExternal(r.plan)}>
              📄 시행계획
            </button>
          )}
          {r.home && (
            <button className={btn.chip} onClick={() => openExternal(r.home)}>
              🏫 입학처
            </button>
          )}
          {r.url && isSafeUrl(r.url) && (
            <button className={btn.chip} onClick={() => openExternal(r.url)}>
              🔗 조회
            </button>
          )}
          <button
            className={btn.chip}
            title="네이버에서 이 대학의 합격자 조회 페이지를 검색합니다 (대학 이름만 전송)"
            onClick={() => openExternal(`https://search.naver.com/search.naver?query=${encodeURIComponent(`${row.name} 합격자 발표 조회`)}`)}
          >
            🔍 찾기
          </button>
          <button className={btn.chip} onClick={() => setShowLinks(!showLinks)}>
            {showLinks ? '접기' : '링크 수정'}
          </button>
          {row.total === 0 && (
            <button className={`${btn.chip} text-red-600`} onClick={onRemove} title="대학 정보 삭제 (일정은 남습니다)">
              삭제
            </button>
          )}
        </div>
      </div>

      {r.candidates.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          캠퍼스를 골라 주세요:
          {r.candidates.map((c) => (
            <button key={c.name} className={btn.chip} onClick={() => onUpdate({ dirName: c.name })}>
              {c.name}
            </button>
          ))}
        </div>
      )}

      <div className="mt-2 grid gap-2 md:grid-cols-[1fr_16rem]">
        {urlField('url', 'https://… 합격자 조회 페이지 주소 (등록하면 [조회 ↗]가 바로 열림)')}
        <input
          className={inputCls}
          placeholder="메모 (생년월일 8자리 등)"
          defaultValue={info.memo}
          key={`m-${row.name}-${info.memo}`}
          onBlur={(e) => e.target.value !== info.memo && onUpdate({ memo: e.target.value })}
        />
      </div>

      {(showLinks || (notInDir && !info.home && !info.plan)) && (
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          {urlField('home', r.dir ? `입학처 (기본: ${r.dir.home})` : '입학처 홈페이지 주소')}
          {urlField('plan', r.dir?.plan ? '시행계획·모집요강 (기본: 내장 링크)' : '모집요강·시행계획 링크')}
          {info.dirName && (
            <button className="text-left text-xs text-slate-500 underline" onClick={() => onUpdate({ dirName: undefined })}>
              캠퍼스 선택 취소 ({info.dirName})
            </button>
          )}
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-slate-500">
          📅 일정 {events.length}개{events.some((e) => e.builtin) && ` (모집요강 ${events.filter((e) => e.builtin).length})`}
        </span>
        {next && (
          <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-indigo-700">
            다음: {shortDate(next.date)} {next.title}
            {next.time && ` ${next.time}`}
          </span>
        )}
        <button className="rounded px-1.5 py-0.5 font-medium text-blue-700 hover:bg-blue-50" onClick={onAddEvent}>
          + 일정 추가
        </button>
        {(info.hiddenBuiltin?.length ?? 0) > 0 && (
          <button className="rounded px-1.5 py-0.5 text-slate-500 underline" onClick={() => onUpdate({ hiddenBuiltin: [] })}>
            숨긴 모집요강 일정 {info.hiddenBuiltin!.length}개 다시 보기
          </button>
        )}
      </div>
    </div>
  );
}
