# CLAUDE.md

입시 결과 조회 도우미 — 교사용, 서버 없는 React 18 + TypeScript + Vite + Tailwind v4 SPA. UI 문구는 한국어로 유지.

## 명령어
- `npm run dev` / `npm run build` (build 가 `tsc --noEmit` 포함) / `npm run typecheck`
- 테스트 스위트 없음. 변경 후 Playwright 로 `vite preview` 를 띄워 직접 확인.

## 구조
- `src/App.tsx`: 잠금 상태(setup/locked/unlocked), 암호화 금고 데이터(`VaultData`), 대학 조회 주소, 설정을 모두 보유.
- `src/lib/crypto.ts`: PBKDF2 → AES-GCM. 학생 정보는 반드시 암호화된 상태로만 localStorage(`admchk_vault_v1`)에 저장.
- `src/lib/excel.ts`: ExcelJS(동적 import)로 읽기/쓰기, 열 자동 매핑(`guessMapping`). 읽기 순서: 형식 진단 → ExcelJS → docProps 제거 후 ExcelJS → `sheetSources.ts`의 예비 해석기(`readXlsxLite`).
- `src/lib/sheetSources.ts`: 파일 형식 진단(DRM·암호·xls·HTML·CSV), 붙여넣기/CSV(`parseDelimited`), NEIS 웹 형식 .xls(`parseHtmlTables`), 머리글 탐지(`gridToSheet`). 학교 업무용 PC의 문서보안(DRM) 파일은 브라우저에서 읽을 수 없어 붙여넣기로 우회.
- `src/lib/autofill.ts`: 자동입력 코드 인코딩 + 북마클릿. `admchkAutofill` 함수는 `toString()` 으로 북마클릿이 되므로 외부 참조 금지.
- 결과는 `Application.history`(시간순 `ResultEntry` 배열, 마지막이 현재 상태)가 원본이고, `status/waitNo/round/checkedAt` 은 `withHistory()` 로 계산되는 값. 결과 기록은 `recordResult()`(이전 기록 보존, 30분 안 재기록은 고침), 취소는 `undoLast()`. 예전 데이터(version 1, 차수별)는 `migrateVault()` 가 차수 순으로 정렬해 version 2 로 변환.
- 대학 조회 주소(`admchk_universities_v1`), 일정(`admchk_schedule_v1`), 설정은 개인정보가 아니므로 평문 저장.
- `src/data/univDirectory.ts`: 내장 4년제 대학 목록(입학처·시행계획 링크). 대학명 매칭은 `lib/univLookup.ts`의 `findUniversity`/`resolveUniv`(캠퍼스·줄임말 처리).
- `src/lib/insights.ts`: 등록 대학·정시 규칙 경고(`studentInsight`)와 진학 실적 집계(`computeStats`). 모집 시기는 `admTypeOf()`(없으면 수시).
- `src/data/commonSchedule.ts`: 전국 공통 일정. `src/data/univSchedule.ts`: 모집요강에서 뽑은 대학별 최초합격 발표일(내장 일정). `lib/builtinSchedule.ts` 가 학생 지원·등록 대학에 맞춰 화면용 일정(`builtin: true`, 저장하지 않음)으로 만들고, 숨김은 `UniversityInfo.hiddenBuiltin`. 학년도가 바뀌면 data 폴더 파일들을 갱신.

## 원칙
- 학생 개인정보를 외부로 전송하는 코드를 추가하지 말 것. 배포 빌드의 CSP(`vite.config.ts`)는 `connect-src 'none'`.
- `base: '/admission-checker/'` (GitHub Pages).
