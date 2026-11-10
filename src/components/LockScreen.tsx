import { useState } from 'react';
import { btn, inputCls } from './ui';

export function LockScreen({
  mode,
  onSubmit,
  onWipe,
}: {
  mode: 'setup' | 'unlock';
  onSubmit: (password: string) => Promise<string | null>;
  onWipe: () => void;
}) {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    if (mode === 'setup') {
      if (pw.length < 8) return setErr('비밀번호는 8자 이상으로 정해 주세요.');
      if (pw !== pw2) return setErr('비밀번호 확인이 일치하지 않습니다.');
    }
    setBusy(true);
    const msg = await onSubmit(pw);
    setBusy(false);
    if (msg) setErr(msg);
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-lg">
        <div className="mb-1 text-3xl">🎓</div>
        <h1 className="text-xl font-bold">입시 결과 조회 도우미</h1>
        <p className="mt-1 text-sm text-slate-500">
          {mode === 'setup'
            ? '처음 사용하시네요. 학생 정보를 암호화할 비밀번호를 정해 주세요.'
            : '학생 정보가 암호화되어 있습니다. 비밀번호를 입력해 주세요.'}
        </p>

        <form onSubmit={submit} className="mt-5 space-y-3">
          <input
            type="password"
            className={inputCls}
            placeholder="비밀번호"
            autoFocus
            autoComplete={mode === 'setup' ? 'new-password' : 'current-password'}
            value={pw}
            onChange={(e) => setPw(e.target.value)}
          />
          {mode === 'setup' && (
            <input
              type="password"
              className={inputCls}
              placeholder="비밀번호 확인"
              autoComplete="new-password"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
            />
          )}
          {err && <p className="text-sm text-red-600">{err}</p>}
          <button type="submit" className={`${btn.primary} w-full py-2.5`} disabled={busy || !pw}>
            {busy ? '처리 중…' : mode === 'setup' ? '시작하기' : '잠금 해제'}
          </button>
        </form>

        <div className="mt-5 rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
          🔒 학생 정보는 <b>이 컴퓨터의 브라우저 안에만</b> 암호화되어 저장되며, 어떤 서버로도 전송되지 않습니다.
          {mode === 'setup' && (
            <>
              <br />⚠️ 비밀번호를 잊으면 복구할 수 없습니다. 원본 엑셀 파일은 따로 안전하게 보관해 주세요.
            </>
          )}
        </div>

        {mode === 'unlock' && (
          <button
            className="mt-4 text-xs text-slate-400 underline hover:text-red-600"
            onClick={() => {
              if (confirm('비밀번호를 잊으셨나요?\n저장된 학생 정보를 모두 삭제하고 처음부터 시작합니다. (대학 조회 주소 목록은 유지)')) onWipe();
            }}
          >
            비밀번호를 잊었어요 (학생 정보 삭제 후 새로 시작)
          </button>
        )}
      </div>
    </div>
  );
}
