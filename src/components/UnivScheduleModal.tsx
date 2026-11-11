import { useState } from 'react';
import type { ScheduleEvent } from '../lib/types';
import { newId } from '../lib/types';
import { EventModal, nextPreset, shortDate, ymd } from './CalendarView';
import { Modal, btn, toast } from './ui';

/** 한 대학의 발표·등록 일정을 보고 추가·수정·삭제(기본 일정은 숨기기)하는 창 */
export function UnivScheduleModal({
  univ,
  events,
  onClose,
  onSave,
  onDelete,
  onHideBuiltin,
}: {
  univ: string;
  /** 이 대학의 일정 (직접 넣은 일정 + 기본 일정) */
  events: ScheduleEvent[];
  onClose: () => void;
  onSave: (ev: ScheduleEvent) => void;
  onDelete: (ev: ScheduleEvent) => void;
  onHideBuiltin: (univ: string, eventId: string) => void;
}) {
  const [editing, setEditing] = useState<{ ev: ScheduleEvent; isNew: boolean; from?: ScheduleEvent } | null>(null);
  const today = ymd(new Date());
  const sorted = [...events].sort((a, b) => (a.date + (a.time || '99')).localeCompare(b.date + (b.time || '99')));

  if (editing) {
    return (
      <EventModal
        key={editing.ev.id}
        event={editing.ev}
        isNew={editing.isNew}
        univOptions={[univ]}
        onClose={() => setEditing(null)}
        onSave={(ev, keepGoing) => {
          onSave(ev);
          if (editing.from) onHideBuiltin(univ, editing.from.id);
          toast('일정을 저장했습니다');
          setEditing(keepGoing ? { ev: { ...ev, id: newId(), title: nextPreset(ev.title), endDate: '', memo: '' }, isNew: true } : null);
        }}
      />
    );
  }

  return (
    <Modal title={`📅 ${univ} 일정`} onClose={onClose}>
      <div className="space-y-3">
        {sorted.length === 0 && <p className="text-sm text-slate-500">등록된 일정이 없습니다.</p>}
        <ul className="space-y-2">
          {sorted.map((e) => {
            const past = (e.endDate || e.date) < today;
            return (
              <li key={e.id} className={`rounded-xl border p-3 text-sm ${past ? 'border-slate-200 bg-slate-50 text-slate-400' : 'border-indigo-200 bg-indigo-50/50'}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">
                    {shortDate(e.date)}
                    {e.endDate && ` ~ ${shortDate(e.endDate)}`}
                    {e.time && ` ${e.time}`}
                  </span>
                  <span>{e.title}</span>
                  {e.builtin && <span className="rounded bg-white px-1.5 text-[11px] text-slate-500">기본 일정</span>}
                  {past && <span className="text-[11px]">지난 일정</span>}
                  <span className="ml-auto flex gap-1">
                    <button
                      className={btn.chip}
                      onClick={() =>
                        e.builtin
                          ? setEditing({
                              ev: { ...e, id: newId(), builtin: undefined, memo: e.memo.replace(/^📄\s*/, '') },
                              isNew: true,
                              from: e,
                            })
                          : setEditing({ ev: e, isNew: false })
                      }
                      title={e.builtin ? '내 일정으로 복사해서 고칩니다 (원래 기본 일정은 숨김)' : ''}
                    >
                      수정
                    </button>
                    <button
                      className={`${btn.chip} text-red-600`}
                      onClick={() => {
                        if (e.builtin) onHideBuiltin(univ, e.id);
                        else if (confirm(`${shortDate(e.date)} "${e.title}" 일정을 삭제할까요?`)) onDelete(e);
                      }}
                    >
                      {e.builtin ? '숨기기' : '삭제'}
                    </button>
                  </span>
                </div>
                {e.memo && <p className="mt-1 text-xs opacity-80">{e.memo}</p>}
              </li>
            );
          })}
        </ul>
        <div className="flex justify-between gap-2 pt-1">
          <button
            className={btn.primary}
            onClick={() =>
              setEditing({ ev: { id: newId(), univ, date: today, endDate: '', time: '', title: '최초합격 발표', memo: '' }, isNew: true })
            }
          >
            + 일정 추가
          </button>
          <button className={btn.secondary} onClick={onClose}>
            닫기
          </button>
        </div>
        <p className="text-xs text-slate-400">여기서 고친 일정은 [발표 일정]·[오늘 할 일]·[대학 정보]에도 똑같이 반영됩니다.</p>
      </div>
    </Modal>
  );
}
