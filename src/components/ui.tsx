import { useEffect, useState, type ReactNode } from 'react';

// ───── 알림(토스트) ─────
type ToastItem = { id: number; msg: string; kind: 'ok' | 'err' };
let listeners: ((t: ToastItem[]) => void)[] = [];
let items: ToastItem[] = [];
let seq = 0;
export function toast(msg: string, kind: 'ok' | 'err' = 'ok') {
  const id = ++seq;
  items = [...items, { id, msg, kind }].slice(-3);
  listeners.forEach((l) => l(items));
  setTimeout(() => {
    items = items.filter((t) => t.id !== id);
    listeners.forEach((l) => l(items));
  }, 2600);
}
export function Toaster() {
  const [list, setList] = useState<ToastItem[]>(items);
  useEffect(() => {
    listeners.push(setList);
    return () => {
      listeners = listeners.filter((l) => l !== setList);
    };
  }, []);
  return (
    <div className="fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2 px-4">
      {list.map((t) => (
        <div
          key={t.id}
          className={`rounded-full px-4 py-2 text-sm text-white shadow-lg ${t.kind === 'ok' ? 'bg-slate-800' : 'bg-red-600'}`}
        >
          {t.msg}
        </div>
      ))}
    </div>
  );
}

export async function copyText(text: string, label: string) {
  if (!text) {
    toast(`${label} 정보가 없습니다`, 'err');
    return false;
  }
  try {
    await navigator.clipboard.writeText(text);
    toast(`${label} 복사됨`);
    return true;
  } catch {
    toast('복사에 실패했습니다. 브라우저 권한을 확인해 주세요.', 'err');
    return false;
  }
}

// ───── 모달 ─────
export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center">
      <div className={`w-full rounded-2xl bg-white shadow-xl ${wide ? 'max-w-4xl' : 'max-w-lg'}`}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h2 className="text-base font-bold">{title}</h2>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100" aria-label="닫기">
            ✕
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export const btn = {
  primary: 'rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50',
  secondary: 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50',
  danger: 'rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50',
  ghost: 'rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100',
  chip: 'rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:border-blue-400 hover:bg-blue-50 active:bg-blue-100',
};
export const inputCls =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
