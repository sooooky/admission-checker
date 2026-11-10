import { useEffect, useRef } from 'react';
import { BOOKMARKLET_HREF, encodePayload } from '../lib/autofill';
import { downloadTemplate } from '../lib/excel';
import { btn, copyText, toast } from './ui';

export function GuideView() {
  const linkRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    linkRef.current?.setAttribute('href', BOOKMARKLET_HREF);
  }, []);

  const practiceCls = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm';

  return (
    <div className="space-y-4 text-sm leading-relaxed">
      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="text-base font-bold">🔒 개인정보는 이렇게 보호됩니다</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-600">
          <li>엑셀 파일은 이 브라우저 안에서만 읽습니다. 서버가 없고, 어디에도 업로드되지 않습니다.</li>
          <li>
            이 앱은 보안 정책상 <b>외부로 데이터를 전송하는 기능 자체가 차단</b>되어 있습니다. (CSP connect-src 'none')
          </li>
          <li>학생 정보는 선생님이 정한 비밀번호로 AES-256 암호화되어 이 컴퓨터에만 저장됩니다.</li>
          <li>일정 시간 사용하지 않으면 자동으로 잠깁니다. 자리를 비울 때는 오른쪽 위 🔒 잠금을 눌러 주세요.</li>
          <li>휴대폰 번호는 화면에 가려서 표시하고, 필요한 순간에만 복사합니다.</li>
          <li>
            대학 조회 페이지에는 선생님이 직접 조회할 때와 똑같이 입력될 뿐, 이 앱이 대학 사이트에 자동 접속하지 않습니다.
          </li>
        </ul>
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-bold">📋 사용 순서</h2>
          <button className={btn.secondary} onClick={() => downloadTemplate()}>
            ⬇️ 샘플 엑셀(양식) 받기
          </button>
        </div>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-slate-600">
          <li>
            <b>엑셀 불러오기</b>: 오른쪽 위 [엑셀 불러오기]에서 학생·원서 목록을 불러옵니다. 양식이 없으면 위의 [샘플 엑셀]을 받아
            예시를 지우고 입력하세요. 열 순서는 상관없고, 열 이름(머리글)으로 자동 인식합니다.
          </li>
          <li>
            <b>조회 주소 등록</b>: [대학별 조회 주소] 탭에서 각 대학의 합격자 조회 페이지 주소를 붙여넣습니다.
          </li>
          <li>
            <b>조회</b>: [조회 목록]에서 원서마다 [조회 ↗]를 누르면 대학 페이지가 열리고 자동입력 코드가 복사됩니다.
          </li>
          <li>
            <b>입력</b>: 대학 페이지에서 아래 <b>자동입력 북마크</b>를 누르거나, 목록의 복사 버튼(수험번호·이름·생일·📱)으로
            붙여넣습니다.
          </li>
          <li>
            <b>기록</b>: 먼저 맨 위 <b>기록할 차수</b>(최초 발표, 1차 충원, 2차 충원…)를 고르고, 결과를 보고 [합격] [충원] [예비]
            [불합격] 버튼을 누릅니다. 예비는 번호를 적습니다.
          </li>
          <li>
            <b>충원 발표마다</b>: 기록할 차수를 다음 차수로 바꾸고 [이번 차수 미확인]을 누르면 아직 확인할 원서만 보입니다. 차수별
            예비번호 변화는 [예비 현황] 탭에서 표로 볼 수 있습니다.
          </li>
          <li>
            <b>내보내기</b>: [설정·백업]에서 결과를 엑셀로 내려받습니다.
          </li>
        </ol>
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="text-base font-bold">⚡ 자동입력 북마크 설치 (선택, 1회)</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-slate-600">
          <li>
            즐겨찾기 모음줄이 안 보이면 <kbd className="rounded bg-slate-100 px-1">Ctrl</kbd>+
            <kbd className="rounded bg-slate-100 px-1">Shift</kbd>+<kbd className="rounded bg-slate-100 px-1">B</kbd>를 누릅니다.
          </li>
          <li>
            아래 파란 버튼을 마우스로 <b>끌어서</b> 즐겨찾기 모음줄에 놓습니다.
          </li>
        </ol>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <a
            ref={linkRef}
            onClick={(e) => {
              e.preventDefault();
              toast('클릭이 아니라, 즐겨찾기 모음줄로 끌어다 놓아 주세요');
            }}
            className="inline-block cursor-grab rounded-xl bg-blue-600 px-4 py-2.5 font-bold text-white shadow active:cursor-grabbing"
          >
            🎓 입시조회 자동입력
          </a>
          <button className={btn.ghost} onClick={() => copyText(BOOKMARKLET_HREF, '북마크 코드')}>
            끌어놓기가 안 되면: 코드 복사
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          코드 복사를 쓰는 경우: 즐겨찾기 모음줄에서 오른쪽 클릭 → 즐겨찾기 추가 → 이름 "입시조회 자동입력", URL 칸에 붙여넣기.
        </p>
        <div className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
          처음 사용할 때 대학 사이트에서 "클립보드 읽기 허용" 창이 뜨면 <b>허용</b>을 눌러 주세요. 거부하면 붙여넣기 창이 대신
          나타납니다(Ctrl+V). 자동입력 후에는 클립보드를 비워 개인정보가 남지 않게 합니다. 학교마다 입력칸 구성이 달라 일부 칸은
          직접 입력해야 할 수 있습니다. <b>보안문자와 조회 버튼은 직접</b> 처리해 주세요.
        </div>
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="text-base font-bold">🧪 연습용 조회 양식</h2>
        <p className="mt-1 text-slate-600">
          ① [연습용 코드 복사] → ② 즐겨찾기 모음줄의 <b>입시조회 자동입력</b> 클릭 → 아래 칸이 채워지면 설치 성공입니다. (가상
          정보 사용)
        </p>
        <button
          className={`${btn.secondary} mt-3`}
          onClick={() =>
            copyText(encodePayload({ e: '20270001', n: '홍길동', b: '20070315', p: '01012345678' }), '연습용 자동입력 코드')
          }
        >
          연습용 코드 복사
        </button>
        <form className="mt-3 max-w-md" onSubmit={(e) => e.preventDefault()}>
          <table className="w-full border-separate border-spacing-y-2">
            <tbody>
              <tr>
                <th className="w-24 text-left font-medium text-slate-600">수험번호</th>
                <td>
                  <input className={practiceCls} name="suhumNo" />
                </td>
              </tr>
              <tr>
                <th className="text-left font-medium text-slate-600">성명</th>
                <td>
                  <input className={practiceCls} name="userNm" />
                </td>
              </tr>
              <tr>
                <th className="text-left font-medium text-slate-600">생년월일</th>
                <td>
                  <input className={practiceCls} name="birthDt" maxLength={6} placeholder="6자리 (예: 070315)" />
                </td>
              </tr>
              <tr>
                <th className="text-left font-medium text-slate-600">휴대전화</th>
                <td className="flex items-center gap-1">
                  <select className={practiceCls} name="hp1" defaultValue="">
                    <option value="">선택</option>
                    <option>010</option>
                    <option>011</option>
                  </select>
                  -
                  <input className={practiceCls} name="hp2" maxLength={4} />-
                  <input className={practiceCls} name="hp3" maxLength={4} />
                </td>
              </tr>
            </tbody>
          </table>
        </form>
      </section>
    </div>
  );
}
