import { useRef, useState } from 'react';
import type { Settings } from '../lib/storage';
import type { ScheduleEvent, UniversityRegistry, VaultData } from '../lib/types';
import { decryptJSON, isEncryptedBlob } from '../lib/crypto';
import { exportResults } from '../lib/excel';
import { Modal, btn, inputCls, toast } from './ui';

export interface BackupPayload {
  vault: VaultData;
  universities: UniversityRegistry;
  schedule?: ScheduleEvent[];
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2 border-b border-slate-100 pb-4 last:border-0 last:pb-0">
      <h3 className="text-sm font-bold">{title}</h3>
      {children}
    </section>
  );
}

export function SettingsModal({
  settings,
  data,
  onClose,
  onSettings,
  onChangePassword,
  onExportBackup,
  onRestoreBackup,
  onWipeAll,
}: {
  settings: Settings;
  data: VaultData;
  onClose: () => void;
  onSettings: (s: Settings) => void;
  onChangePassword: (pw: string) => Promise<void>;
  onExportBackup: () => Promise<void>;
  onRestoreBackup: (b: BackupPayload) => void;
  onWipeAll: () => void;
}) {
  const [includePhone, setIncludePhone] = useState(false);
  const [includeBirth, setIncludeBirth] = useState(false);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const restore = async (file: File | undefined) => {
    if (!file) return;
    try {
      const blob = JSON.parse(await file.text());
      if (!isEncryptedBlob(blob)) throw new Error();
      const password = prompt('백업 파일을 만들 때 사용한 비밀번호를 입력해 주세요');
      if (!password) return;
      let payload: BackupPayload;
      try {
        payload = (await decryptJSON<BackupPayload>(blob, password)).data;
      } catch {
        return toast('비밀번호가 맞지 않습니다', 'err');
      }
      if (!payload?.vault?.applications) throw new Error();
      if (!confirm(`백업에서 학생 ${payload.vault.students.length}명, 원서 ${payload.vault.applications.length}건을 복원합니다.\n현재 목록은 백업 내용으로 바뀝니다. 계속할까요?`)) return;
      onRestoreBackup(payload);
      toast('백업을 복원했습니다');
      onClose();
    } catch {
      toast('올바른 백업 파일이 아닙니다', 'err');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <Modal title="설정 · 내보내기 · 백업" onClose={onClose}>
      <div className="space-y-4 text-sm">
        <Section title="📊 결과 엑셀로 내보내기">
          <div className="flex flex-wrap gap-4 text-slate-600">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={includeBirth} onChange={(e) => setIncludeBirth(e.target.checked)} /> 생년월일 포함
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={includePhone} onChange={(e) => setIncludePhone(e.target.checked)} /> 핸드폰 포함
            </label>
          </div>
          <p className="text-xs text-slate-500">보고용이라면 개인정보는 빼고 내보내는 것을 권장합니다.</p>
          <button
            className={btn.primary}
            disabled={!data.applications.length}
            onClick={() => exportResults(data, { includePhone, includeBirth }).then(() => toast('엑셀 파일을 내려받았습니다'))}
          >
            ⬇️ 결과 엑셀 받기
          </button>
        </Section>

        <Section title="💾 암호화 백업 (다른 PC로 옮기기)">
          <p className="text-xs text-slate-500">
            백업 파일은 현재 비밀번호로 암호화됩니다. 브라우저 기록 삭제에 대비해 가끔 백업해 두세요.
          </p>
          <div className="flex flex-wrap gap-2">
            <button className={btn.secondary} onClick={() => onExportBackup().then(() => toast('백업 파일을 저장했습니다'))}>
              백업 파일 저장
            </button>
            <button className={btn.secondary} onClick={() => fileRef.current?.click()}>
              백업에서 복원
            </button>
            <input ref={fileRef} type="file" accept=".admchk,.json" className="hidden" onChange={(e) => restore(e.target.files?.[0])} />
          </div>
        </Section>

        <Section title="⚙️ 사용 설정">
          <label className="flex items-center justify-between gap-2">
            <span>자동 잠금</span>
            <select
              className={`${inputCls} w-36`}
              value={settings.autoLockMinutes}
              onChange={(e) => onSettings({ ...settings, autoLockMinutes: Number(e.target.value) })}
            >
              {[5, 10, 15, 30, 60].map((m) => (
                <option key={m} value={m}>
                  {m}분 미사용 시
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center justify-between gap-2">
            <span>생년월일 기본 복사 형식</span>
            <select
              className={`${inputCls} w-36`}
              value={settings.birthDigits}
              onChange={(e) => onSettings({ ...settings, birthDigits: Number(e.target.value) as 6 | 8 })}
            >
              <option value={6}>6자리 (070315)</option>
              <option value={8}>8자리 (20070315)</option>
            </select>
          </label>
        </Section>

        <Section title="🔑 비밀번호 변경">
          <div className="grid gap-2 sm:grid-cols-2">
            <input type="password" className={inputCls} placeholder="새 비밀번호 (8자 이상)" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
            <input type="password" className={inputCls} placeholder="새 비밀번호 확인" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />
          </div>
          <button
            className={btn.secondary}
            disabled={pw.length < 8 || pw !== pw2}
            onClick={() =>
              onChangePassword(pw).then(() => {
                setPw('');
                setPw2('');
                toast('비밀번호를 변경했습니다');
              })
            }
          >
            변경
          </button>
          {pw && pw2 && pw !== pw2 && <p className="text-xs text-red-600">비밀번호 확인이 일치하지 않습니다.</p>}
        </Section>

        <Section title="🗑️ 모든 데이터 삭제">
          <p className="text-xs text-slate-500">입시가 끝나면 이 컴퓨터에 저장된 학생 정보를 완전히 삭제해 주세요.</p>
          <button
            className={btn.danger}
            onClick={() => {
              if (confirm('학생 정보, 결과 기록, 대학 조회 주소, 설정을 이 컴퓨터에서 모두 삭제합니다.\n되돌릴 수 없습니다. 계속할까요?')) onWipeAll();
            }}
          >
            모두 삭제
          </button>
        </Section>
      </div>
    </Modal>
  );
}
