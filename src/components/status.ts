import type { Status } from '../lib/types';

export const STATUS_STYLE: Record<Status, { on: string; badge: string; short: string }> = {
  미조회: { on: 'bg-slate-600 text-white', badge: 'bg-slate-100 text-slate-600', short: '미조회' },
  합격: { on: 'bg-green-600 text-white', badge: 'bg-green-100 text-green-800', short: '합격' },
  충원합격: { on: 'bg-teal-600 text-white', badge: 'bg-teal-100 text-teal-800', short: '충원' },
  예비: { on: 'bg-amber-500 text-white', badge: 'bg-amber-100 text-amber-800', short: '예비' },
  불합격: { on: 'bg-rose-600 text-white', badge: 'bg-rose-100 text-rose-800', short: '불합격' },
  확인필요: { on: 'bg-violet-600 text-white', badge: 'bg-violet-100 text-violet-800', short: '확인필요' },
};
