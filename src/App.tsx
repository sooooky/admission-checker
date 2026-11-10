import { useCallback, useEffect, useRef, useState } from 'react';
import type { Application, Student, UniversityRegistry, VaultData } from './lib/types';
import { emptyVault } from './lib/types';
import { createKey, decryptJSON, encryptJSON, type KeyHandle } from './lib/crypto';
import {
  downloadText,
  loadSettings,
  loadUniversities,
  loadVaultBlob,
  saveSettings,
  saveUniversities,
  saveVaultBlob,
  wipeAll,
  wipeVault,
  type Settings,
} from './lib/storage';
import { LockScreen } from './components/LockScreen';
import { ApplicationsView } from './components/ApplicationsView';
import { UniversitiesView } from './components/UniversitiesView';
import { GuideView } from './components/GuideView';
import { ImportModal } from './components/ImportModal';
import { EditModal } from './components/EditModal';
import { SettingsModal, type BackupPayload } from './components/SettingsModal';
import { Toaster, btn, toast } from './components/ui';

type Phase = 'setup' | 'locked' | 'unlocked';
type Tab = 'list' | 'univ' | 'guide';

export default function App() {
  const [phase, setPhase] = useState<Phase>(() => (loadVaultBlob() ? 'locked' : 'setup'));
  const [data, setData] = useState<VaultData>(emptyVault);
  const [universities, setUniversities] = useState<UniversityRegistry>(loadUniversities);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [tab, setTab] = useState<Tab>('list');
  const [hideInfo, setHideInfo] = useState(false);
  const [modal, setModal] = useState<null | 'import' | 'settings' | { edit: Application | null }>(null);

  const keyRef = useRef<KeyHandle | null>(null);
  const dirtyRef = useRef(false);
  const saveChain = useRef(Promise.resolve());

  // ── 잠금 / 해제 ──
  const dataRef = useRef(data);
  dataRef.current = data;

  /** flush=true 이면 잠그기 전에 마지막 변경을 저장합니다. */
  const lock = useCallback((flush = true) => {
    const handle = keyRef.current;
    if (flush && handle && dirtyRef.current) {
      const snapshot = dataRef.current;
      saveChain.current = saveChain.current.then(async () => saveVaultBlob(await encryptJSON(handle, snapshot)));
    }
    keyRef.current = null;
    dirtyRef.current = false;
    setData(emptyVault());
    setModal(null);
    setPhase(loadVaultBlob() ? 'locked' : 'setup');
  }, []);

  const unlock = async (password: string): Promise<string | null> => {
    if (phase === 'setup') {
      const handle = await createKey(password);
      saveVaultBlob(await encryptJSON(handle, emptyVault()));
      keyRef.current = handle;
      setData(emptyVault());
      setPhase('unlocked');
      setTab('guide');
      return null;
    }
    const blob = loadVaultBlob();
    if (!blob) {
      setPhase('setup');
      return '저장된 데이터가 없습니다. 새로 시작해 주세요.';
    }
    try {
      const { data: d, handle } = await decryptJSON<VaultData>(blob, password);
      keyRef.current = handle;
      setData(d);
      setPhase('unlocked');
      return null;
    } catch {
      return '비밀번호가 맞지 않습니다.';
    }
  };

  // ── 변경 시 암호화 저장 (순차 처리) ──
  const commit = useCallback((updater: (d: VaultData) => VaultData) => {
    dirtyRef.current = true;
    setData(updater);
  }, []);

  useEffect(() => {
    if (phase !== 'unlocked' || !dirtyRef.current || !keyRef.current) return;
    const handle = keyRef.current;
    const t = setTimeout(() => {
      saveChain.current = saveChain.current
        .then(async () => saveVaultBlob(await encryptJSON(handle, data)))
        .catch(() => toast('저장에 실패했습니다. 브라우저 저장공간을 확인해 주세요.', 'err'));
    }, 300);
    return () => clearTimeout(t);
  }, [data, phase]);

  useEffect(() => saveUniversities(universities), [universities]);
  useEffect(() => saveSettings(settings), [settings]);

  // ── 자동 잠금 ──
  useEffect(() => {
    if (phase !== 'unlocked') return;
    let last = Date.now();
    const bump = () => (last = Date.now());
    const evs = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'] as const;
    evs.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const iv = setInterval(() => {
      if (Date.now() - last > settings.autoLockMinutes * 60_000) {
        lock();
        toast('오래 사용하지 않아 자동으로 잠갔습니다');
      }
    }, 15_000);
    return () => {
      evs.forEach((e) => window.removeEventListener(e, bump));
      clearInterval(iv);
    };
  }, [phase, settings.autoLockMinutes, lock]);

  // ── 다른 탭에서 데이터가 바뀌면 덮어쓰지 않도록 잠금 ──
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'admchk_vault_v1' && phase === 'unlocked') {
        lock(false);
        toast('다른 탭에서 데이터가 변경되어 잠갔습니다. 한 탭에서만 사용해 주세요.', 'err');
      }
      if (e.key === 'admchk_universities_v1') setUniversities(loadUniversities());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [phase, lock]);

  // ── 데이터 조작 ──
  const updateApp = (id: string, patch: Partial<Application>) =>
    commit((d) => ({ ...d, applications: d.applications.map((a) => (a.id === id ? { ...a, ...patch } : a)) }));

  const saveEdited = (app: Application, student: Student) =>
    commit((d) => {
      const students = d.students.some((s) => s.id === student.id)
        ? d.students.map((s) => (s.id === student.id ? student : s))
        : [...d.students, student];
      const applications = d.applications.some((a) => a.id === app.id)
        ? d.applications.map((a) => (a.id === app.id ? app : a))
        : [...d.applications, app];
      return { ...d, students, applications };
    });

  const deleteApp = (app: Application) =>
    commit((d) => {
      const applications = d.applications.filter((a) => a.id !== app.id);
      const used = new Set(applications.map((a) => a.studentId));
      return { ...d, applications, students: d.students.filter((s) => used.has(s.id)) };
    });

  const setUnivUrl = (univ: string, url: string) =>
    setUniversities((u) => ({ ...u, [univ]: { memo: u[univ]?.memo ?? '', url } }));

  const exportBackup = async () => {
    if (!keyRef.current) return;
    const payload: BackupPayload = { vault: data, universities };
    const blob = await encryptJSON(keyRef.current, payload);
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    downloadText(`입시조회_백업_${stamp}.admchk`, JSON.stringify(blob));
  };

  const changePassword = async (pw: string) => {
    const handle = await createKey(pw);
    await saveChain.current;
    saveVaultBlob(await encryptJSON(handle, data));
    keyRef.current = handle;
  };

  if (phase !== 'unlocked') {
    return (
      <>
        <LockScreen
          key={phase}
          mode={phase === 'setup' ? 'setup' : 'unlock'}
          onSubmit={unlock}
          onWipe={() => {
            wipeVault();
            setPhase('setup');
          }}
        />
        <Toaster />
      </>
    );
  }

  const tabs: [Tab, string][] = [
    ['list', '조회 목록'],
    ['univ', '대학별 조회 주소'],
    ['guide', '사용법 · 자동입력'],
  ];

  return (
    <div className="min-h-screen pb-16">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 py-3">
          <h1 className="mr-auto text-lg font-bold">🎓 입시 결과 조회 도우미</h1>
          <button className={btn.primary} onClick={() => setModal('import')}>
            엑셀 불러오기
          </button>
          <button className={btn.secondary} onClick={() => setModal('settings')}>
            설정·백업
          </button>
          <button
            className={`${btn.ghost} ${hideInfo ? 'bg-slate-800 text-white hover:bg-slate-700' : ''}`}
            onClick={() => setHideInfo(!hideInfo)}
            title="화면 공유·발표 시 이름과 수험번호를 가립니다"
          >
            {hideInfo ? '🙈 가림' : '👁 가리기'}
          </button>
          <button className={btn.ghost} onClick={() => lock()} title="잠금">
            🔒 잠금
          </button>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 px-4">
          {tabs.map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`border-b-2 px-3 py-2 text-sm font-medium ${tab === k ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-5">
        {tab === 'list' &&
          (data.applications.length === 0 ? (
            <div className="rounded-2xl bg-white p-10 text-center shadow-sm">
              <p className="text-4xl">📄</p>
              <p className="mt-2 font-semibold">아직 불러온 원서가 없습니다</p>
              <p className="mt-1 text-sm text-slate-500">학생·원서 목록 엑셀을 불러오거나 직접 추가해 주세요.</p>
              <div className="mt-4 flex justify-center gap-2">
                <button className={btn.primary} onClick={() => setModal('import')}>
                  엑셀 불러오기
                </button>
                <button className={btn.secondary} onClick={() => setModal({ edit: null })}>
                  직접 추가
                </button>
              </div>
            </div>
          ) : (
            <ApplicationsView
              students={data.students}
              applications={data.applications}
              universities={universities}
              settings={settings}
              hideInfo={hideInfo}
              onUpdateApp={updateApp}
              onSetUnivUrl={setUnivUrl}
              onEdit={(a) => setModal({ edit: a })}
              onAdd={() => setModal({ edit: null })}
            />
          ))}
        {tab === 'univ' && (
          <UniversitiesView applications={data.applications} universities={universities} onChange={setUniversities} />
        )}
        {tab === 'guide' && <GuideView />}
      </main>

      {modal === 'import' && <ImportModal data={data} onClose={() => setModal(null)} onImport={(d) => commit(() => d)} />}
      {modal === 'settings' && (
        <SettingsModal
          settings={settings}
          data={data}
          onClose={() => setModal(null)}
          onSettings={setSettings}
          onChangePassword={changePassword}
          onExportBackup={exportBackup}
          onRestoreBackup={(b) => {
            commit(() => b.vault);
            setUniversities((u) => ({ ...u, ...(b.universities ?? {}) }));
          }}
          onWipeAll={() => {
            wipeAll();
            keyRef.current = null;
            dirtyRef.current = false;
            setData(emptyVault());
            setUniversities({});
            setSettings(loadSettings());
            setModal(null);
            setPhase('setup');
            toast('모든 데이터를 삭제했습니다');
          }}
        />
      )}
      {modal && typeof modal === 'object' && (
        <EditModal
          app={modal.edit}
          students={data.students}
          onClose={() => setModal(null)}
          onSave={saveEdited}
          onDelete={deleteApp}
        />
      )}
      <Toaster />
    </div>
  );
}
