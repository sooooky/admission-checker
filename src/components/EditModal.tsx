import { useState } from 'react';
import type { Application, Student } from '../lib/types';
import { MAX_ROUND, STATUSES, newId, roundLongLabel, withHistory, type ResultEntry } from '../lib/types';
import { formatBirth, formatPhone, normalizeBirth, normalizePhone, normalizeUniv } from '../lib/format';
import { Modal, btn, inputCls } from './ui';

/** app 이 없으면 새 원서 추가 */
export function EditModal({
  app,
  students,
  onClose,
  onSave,
  onDelete,
}: {
  app: Application | null;
  students: Student[];
  onClose: () => void;
  onSave: (app: Application, student: Student) => void;
  onDelete: (app: Application) => void;
}) {
  const existing = app ? students.find((s) => s.id === app.studentId) : undefined;
  const [studentId, setStudentId] = useState<string>(existing?.id ?? '__new');
  const base = students.find((s) => s.id === studentId);
  const [name, setName] = useState(existing?.name ?? '');
  const [birth, setBirth] = useState(existing ? formatBirth(existing.birth) : '');
  const [phone, setPhone] = useState(existing ? formatPhone(existing.phone) : '');
  const [a, setA] = useState<Application>(
    app ?? {
      id: newId(),
      studentId: '',
      university: '',
      track: '',
      major: '',
      examNo: '',
      status: '미조회',
      waitNo: '',
      round: '',
      note: '',
      checkedAt: null,
      history: [],
    },
  );
  const [history, setHistory] = useState<ResultEntry[]>(app?.history ?? []);
  const setEntry = (i: number, patch: Partial<ResultEntry>) =>
    setHistory((h) => h.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const usedRounds = new Set(history.map((h) => h.round));
  const dupRound = history.length !== usedRounds.size;

  const pickStudent = (id: string) => {
    setStudentId(id);
    const s = students.find((x) => x.id === id);
    setName(s?.name ?? '');
    setBirth(s ? formatBirth(s.birth) : '');
    setPhone(s ? formatPhone(s.phone) : '');
  };

  const field = (label: string, el: React.ReactNode) => (
    <label className="block">
      <span className="mb-1 block text-xs text-slate-500">{label}</span>
      {el}
    </label>
  );

  const save = () => {
    const student: Student = {
      id: base?.id ?? newId(),
      name: name.trim(),
      birth: normalizeBirth(birth),
      phone: normalizePhone(phone),
    };
    onSave(
      withHistory(
        { ...a, university: normalizeUniv(a.university), studentId: student.id, examNo: a.examNo.replace(/\s/g, '') },
        history.map((h) => ({ ...h, waitNo: h.status === '예비' ? h.waitNo : '' })),
      ),
      student,
    );
    onClose();
  };

  return (
    <Modal title={app ? '원서 정보 수정' : '원서 직접 추가'} onClose={onClose}>
      <div className="space-y-4">
        <fieldset className="space-y-2 rounded-xl bg-slate-50 p-3">
          <legend className="px-1 text-xs font-semibold text-slate-600">학생</legend>
          {!app &&
            field(
              '학생 선택',
              <select className={inputCls} value={studentId} onChange={(e) => pickStudent(e.target.value)}>
                <option value="__new">+ 새 학생</option>
                {[...students]
                  .sort((x, y) => x.name.localeCompare(y.name, 'ko'))
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({formatBirth(s.birth)})
                    </option>
                  ))}
              </select>,
            )}
          <div className="grid gap-2 sm:grid-cols-3">
            {field('이름', <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />)}
            {field('생년월일', <input className={inputCls} value={birth} placeholder="2007.03.15" onChange={(e) => setBirth(e.target.value)} />)}
            {field('핸드폰', <input className={inputCls} value={phone} placeholder="010-0000-0000" onChange={(e) => setPhone(e.target.value)} />)}
          </div>
          {base && <p className="text-xs text-slate-500">학생 정보를 고치면 이 학생의 모든 원서에 반영됩니다.</p>}
        </fieldset>

        <div className="grid gap-2 sm:grid-cols-2">
          {field('대학 *', <input className={inputCls} value={a.university} onChange={(e) => setA({ ...a, university: e.target.value })} />)}
          {field('수험번호', <input className={inputCls} value={a.examNo} onChange={(e) => setA({ ...a, examNo: e.target.value })} />)}
          {field('모집단위', <input className={inputCls} value={a.major} onChange={(e) => setA({ ...a, major: e.target.value })} />)}
        </div>

        <fieldset className="space-y-2 rounded-xl bg-slate-50 p-3">
          <legend className="px-1 text-xs font-semibold text-slate-600">차수별 결과 기록</legend>
          {history.length === 0 && <p className="text-xs text-slate-500">아직 기록이 없습니다.</p>}
          {history.map((h, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_5rem_auto] items-center gap-2">
              <select
                className={`${inputCls} py-1.5`}
                value={h.round}
                onChange={(e) => setEntry(i, { round: Number(e.target.value) })}
              >
                {Array.from({ length: MAX_ROUND + 1 }, (_, r) => (
                  <option key={r} value={r}>
                    {roundLongLabel(r)}
                  </option>
                ))}
              </select>
              <select
                className={`${inputCls} py-1.5`}
                value={h.status}
                onChange={(e) => setEntry(i, { status: e.target.value as ResultEntry['status'] })}
              >
                {STATUSES.filter((x) => x !== '미조회').map((st) => (
                  <option key={st}>{st}</option>
                ))}
              </select>
              <input
                className={`${inputCls} py-1.5`}
                placeholder="예비번호"
                disabled={h.status !== '예비'}
                value={h.status === '예비' ? h.waitNo : ''}
                onChange={(e) => setEntry(i, { waitNo: e.target.value.replace(/[^\d]/g, '') })}
              />
              <button className="px-1 text-xs text-slate-400 hover:text-red-600" onClick={() => setHistory(history.filter((_, j) => j !== i))}>
                삭제
              </button>
            </div>
          ))}
          {dupRound && <p className="text-xs text-red-600">같은 차수가 두 번 들어 있습니다. 하나를 고치거나 지워 주세요.</p>}
          <button
            className={btn.ghost}
            onClick={() => {
              const next = history.length ? Math.max(...history.map((h) => h.round)) + 1 : 0;
              setHistory([...history, { round: Math.min(next, MAX_ROUND), status: '예비', waitNo: '', at: new Date().toISOString() }]);
            }}
          >
            + 차수 기록 추가
          </button>
        </fieldset>
        {field(
          '메모',
          <textarea className={inputCls} rows={2} value={a.note} onChange={(e) => setA({ ...a, note: e.target.value })} />,
        )}

        <div className="flex items-center justify-between gap-2">
          {app ? (
            <button
              className="text-sm text-red-600 hover:underline"
              onClick={() => {
                if (confirm('이 원서를 삭제할까요?')) {
                  onDelete(app);
                  onClose();
                }
              }}
            >
              원서 삭제
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button className={btn.secondary} onClick={onClose}>
              취소
            </button>
            <button className={btn.primary} disabled={!name.trim() || !a.university.trim() || dupRound} onClick={save}>
              저장
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
