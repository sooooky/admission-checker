# CLAUDE.md

입시 결과 조회 도우미 — 교사용, 서버 없는 React 18 + TypeScript + Vite + Tailwind v4 SPA. UI 문구는 한국어로 유지.

## 명령어
- `npm run dev` / `npm run build` (build 가 `tsc --noEmit` 포함) / `npm run typecheck`
- 테스트 스위트 없음. 변경 후 Playwright 로 `vite preview` 를 띄워 직접 확인.

## 구조
- `src/App.tsx`: 잠금 상태(setup/locked/unlocked), 암호화 금고 데이터(`VaultData`), 대학 조회 주소, 설정을 모두 보유.
- `src/lib/crypto.ts`: PBKDF2 → AES-GCM. 학생 정보는 반드시 암호화된 상태로만 localStorage(`admchk_vault_v1`)에 저장.
- `src/lib/excel.ts`: ExcelJS(동적 import)로 읽기/쓰기, 열 자동 매핑(`guessMapping`).
- `src/lib/autofill.ts`: 자동입력 코드 인코딩 + 북마클릿. `admchkAutofill` 함수는 `toString()` 으로 북마클릿이 되므로 외부 참조 금지.
- 결과는 `Application.history`(차수별 `ResultEntry`, 0=최초 발표, n=n차 충원)가 원본이고, `status/waitNo/round/checkedAt` 은 `withHistory()` 로 계산되는 값. 결과 변경은 `recordRound()` 사용. 예전 데이터는 `migrateVault()` 로 변환.
- 대학 조회 주소(`admchk_universities_v1`)와 설정은 개인정보가 아니므로 평문 저장.

## 원칙
- 학생 개인정보를 외부로 전송하는 코드를 추가하지 말 것. 배포 빌드의 CSP(`vite.config.ts`)는 `connect-src 'none'`.
- `base: '/admission-checker/'` (GitHub Pages).
