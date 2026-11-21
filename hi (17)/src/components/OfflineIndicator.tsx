import { useOnlineStatus } from '../hooks/useOnlineStatus';

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed top-3 left-3 z-40 flex items-center gap-2 rounded-lg border border-[#ffe68a]/35 bg-[#0e153e]/92 px-3 py-2 text-xs font-medium text-[#ffe68a] shadow-md backdrop-blur-xs"
    >
      <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 5.636a9 9 0 010 12.728M5.636 18.364a9 9 0 010-12.728M12 12h.01" />
      </svg>
      <span>Offline mode — playing from cache</span>
    </div>
  );
}
