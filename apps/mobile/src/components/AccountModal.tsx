import { useState } from 'react';
import { motion } from 'motion/react';
import { CloudOff, Loader2, LogOut, RefreshCw, UserRound, X } from 'lucide-react';
import { ApiError, NetworkError } from '../lib/api.ts';
import { DEFAULT_SERVER_URL } from '../lib/session.ts';
import { useAppState } from '../state/AppState.tsx';
import { useDialogs } from './Dialogs.tsx';

export function AccountModal({ onClose, firstRun }: { onClose(): void; firstRun?: boolean }) {
  const { session } = useAppState();
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
    >
      <motion.div
        initial={{ scale: 0.95, y: 10 }}
        animate={{ scale: 1, y: 0 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-title"
        className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex justify-between items-center">
          <h3 id="account-title" className="font-bold text-gray-900 uppercase tracking-widest text-sm flex items-center gap-2">
            <UserRound size={18} className="text-orange-500" /> {session ? 'Account & Backup' : firstRun ? 'Welcome' : 'Sign In'}
          </h3>
          {!firstRun && (
            <button onClick={onClose} className="text-gray-400 hover:text-black" aria-label="Close">
              <X size={20} />
            </button>
          )}
        </div>
        {session ? <SignedIn onClose={onClose} /> : <SignInForm onDone={onClose} firstRun={firstRun} />}
      </motion.div>
    </motion.div>
  );
}

function SignedIn({ onClose }: { onClose(): void }) {
  const { session, sync, snapshot, actions, signOut } = useAppState();
  const dialogs = useDialogs();
  const pendingJobs = snapshot.jobs.length;

  const doSignOut = async () => {
    const unsaved = snapshot.unsynced + pendingJobs;
    const ok = await dialogs.confirm('Sign out?', {
      message:
        unsaved > 0
          ? `${unsaved} change(s) on this phone have not been backed up yet and will be lost.\nConnect to the internet and sync first to keep them.`
          : 'Your data stays backed up on the server and is removed from this phone.',
      confirmLabel: 'Sign out',
      danger: unsaved > 0,
    });
    if (!ok) return;
    await signOut();
    onClose();
  };

  return (
    <div className="space-y-4">
      <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 space-y-1">
        <div className="text-[10px] font-mono uppercase tracking-widest text-gray-400">Signed in as</div>
        <div className="text-sm font-bold text-gray-900 break-all">{session!.user.email}</div>
        <div className="text-[10px] text-gray-400 break-all">{session!.server_url}</div>
      </div>
      <dl className="grid grid-cols-2 gap-2 text-[11px]">
        <dt className="text-gray-500">Connection</dt>
        <dd className="font-bold text-right">{sync.online ? 'Online' : 'Offline'}</dd>
        <dt className="text-gray-500">Last backup</dt>
        <dd className="font-bold text-right">{sync.lastSyncAt ? new Date(sync.lastSyncAt).toLocaleString('en-IN') : 'Never'}</dd>
        <dt className="text-gray-500">Waiting to upload</dt>
        <dd className="font-bold text-right">{snapshot.unsynced} changes</dd>
        <dt className="text-gray-500">Extraction queue</dt>
        <dd className="font-bold text-right">{pendingJobs}</dd>
      </dl>
      {sync.lastError && <p className="text-[11px] text-red-600 bg-red-50 border border-red-100 rounded-lg p-2">{sync.lastError}</p>}
      <div className="flex gap-3">
        <button
          onClick={actions.syncNow}
          disabled={!sync.online || sync.syncing}
          className="flex-1 py-3 bg-black text-white font-bold rounded-xl uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <RefreshCw size={14} className={sync.syncing ? 'animate-spin' : ''} /> Sync now
        </button>
        <button
          onClick={doSignOut}
          className="flex-1 py-3 bg-gray-100 text-gray-600 font-bold rounded-xl uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 hover:bg-gray-200"
        >
          <LogOut size={14} /> Sign out
        </button>
      </div>
    </div>
  );
}

function SignInForm({ onDone, firstRun }: { onDone(): void; firstRun?: boolean }) {
  const { signIn } = useAppState();
  const dialogs = useDialogs();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [serverUrl, setServerUrl] = useState(DEFAULT_SERVER_URL);
  const [showServer, setShowServer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const ok = await signIn(mode, serverUrl, email, password, (other) =>
        dialogs.confirm('Replace data on this phone?', {
          message: `This phone holds data for ${other}. Signing in as ${email} removes it from this phone (it stays backed up in that account).`,
          confirmLabel: 'Replace',
          danger: true,
        }),
      );
      if (ok) onDone();
    } catch (err) {
      if (err instanceof NetworkError) setError('Could not reach the server. Check your internet connection and server address.');
      else if (err instanceof ApiError) setError(err.message);
      else setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-[11px] text-gray-500 leading-relaxed">
        {firstRun
          ? 'Sign in to back up your records and use AI extraction. You can also start offline and sign in later: everything you record stays on this phone until then.'
          : 'Sign in to back up your records, sync between devices and process queued AI extractions.'}
      </p>
      <div className="flex bg-gray-100 p-1 rounded-lg">
        {(['login', 'register'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`flex-1 py-2 rounded-md text-[10px] font-bold uppercase tracking-wider ${mode === m ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400'}`}
          >
            {m === 'login' ? 'Sign in' : 'Create account'}
          </button>
        ))}
      </div>
      <div>
        <label htmlFor="auth-email" className="text-[10px] font-mono uppercase tracking-widest text-gray-400 font-bold block mb-1">
          Email
        </label>
        <input
          id="auth-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none text-sm"
        />
      </div>
      <div>
        <label htmlFor="auth-password" className="text-[10px] font-mono uppercase tracking-widest text-gray-400 font-bold block mb-1">
          Password {mode === 'register' && <span className="normal-case tracking-normal">(8+ characters)</span>}
        </label>
        <input
          id="auth-password"
          type="password"
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none text-sm"
        />
      </div>
      {showServer ? (
        <div>
          <label htmlFor="auth-server" className="text-[10px] font-mono uppercase tracking-widest text-gray-400 font-bold block mb-1">
            Server address
          </label>
          <input
            id="auth-server"
            type="url"
            required
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none text-sm font-mono"
          />
        </div>
      ) : (
        <button type="button" onClick={() => setShowServer(true)} className="text-[10px] text-gray-400 underline">
          Server settings
        </button>
      )}
      {error && <p className="text-[11px] text-red-600 bg-red-50 border border-red-100 rounded-lg p-2">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="w-full py-3 bg-[var(--color-brand-primary)] text-white font-bold rounded-xl uppercase tracking-widest text-[11px] flex items-center justify-center gap-2 disabled:opacity-60"
      >
        {busy && <Loader2 size={14} className="animate-spin" />}
        {mode === 'login' ? 'Sign in' : 'Create account'}
      </button>
      {firstRun && (
        <button
          type="button"
          onClick={onDone}
          className="w-full py-3 bg-white border border-gray-200 text-gray-600 font-bold rounded-xl uppercase tracking-widest text-[10px] flex items-center justify-center gap-2"
        >
          <CloudOff size={14} /> Continue offline
        </button>
      )}
    </form>
  );
}
