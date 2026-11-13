import { createContext, useContext, type ReactNode } from 'react';

/** 대학 일정 창을 여는 함수 (App 에서 제공) */
export const OpenScheduleContext = createContext<(univ: string) => void>(() => {});

/** 누르면 그 대학의 일정 창(보기·추가·수정)이 열리는 대학 이름 */
export function UnivLink({ univ, children, className = '' }: { univ: string; children?: ReactNode; className?: string }) {
  const open = useContext(OpenScheduleContext);
  return (
    <span
      role="button"
      tabIndex={0}
      className={`cursor-pointer decoration-dotted underline-offset-2 hover:text-indigo-700 hover:underline ${className}`}
      title={`${univ} 일정 보기·추가·수정`}
      onClick={(e) => {
        e.stopPropagation();
        open(univ);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          open(univ);
        }
      }}
    >
      {children ?? univ}
    </span>
  );
}

/** 일정 제목: 대학 이름 부분만 링크로 (예: [경희대] 합격자 발표 18:00) */
export function EventTitle({ univ, title, time }: { univ: string; title: string; time?: string }) {
  return (
    <>
      {univ && (
        <>
          <UnivLink univ={univ}>{univ.replace(/대학교/, '대')}</UnivLink>{' '}
        </>
      )}
      {title}
      {time ? ` ${time}` : ''}
    </>
  );
}
