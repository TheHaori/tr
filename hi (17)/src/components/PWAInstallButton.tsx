import { useEffect, useState } from 'react';
import type { PointerEvent, TouchEvent } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';

const stopCanvasInput = (e: PointerEvent | TouchEvent) => {
  e.stopPropagation();
};

export function PWAInstallButton() {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  useEffect(() => {
    if (!showIOSGuide) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowIOSGuide(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showIOSGuide]);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        onPointerDown={stopCanvasInput}
        onTouchStart={stopCanvasInput}
        className="fixed top-3 right-3 z-40 inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-lg border border-[#3fc2b8]/45 bg-[#0e153e]/90 px-4 py-2 text-xs font-semibold tracking-wide text-[#ffe68a] shadow-md backdrop-blur-xs transition-colors hover:border-[#ffe68a]/70 hover:bg-[#182359] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ffe68a]"
      >
        <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        Install Game
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          onPointerDown={stopCanvasInput}
          onTouchStart={stopCanvasInput}
          className="fixed top-3 right-3 z-40 inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-lg border border-[#3fc2b8]/45 bg-[#0e153e]/90 px-4 py-2 text-xs font-semibold tracking-wide text-[#ffe68a] shadow-md backdrop-blur-xs transition-colors hover:border-[#ffe68a]/70 hover:bg-[#182359] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ffe68a]"
        >
          Install on iOS
        </button>

        {showIOSGuide && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="ios-install-title"
            onClick={() => setShowIOSGuide(false)}
            onPointerDown={stopCanvasInput}
            onTouchStart={stopCanvasInput}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-xl border border-[#3fc2b8]/35 bg-[#0e153e] p-6 text-[#e6edf7] shadow-2xl"
            >
              <div className="flex items-center gap-3">
                <img
                  src="/icons/pwa-192x192.png"
                  alt="Lumen Reach app icon"
                  className="h-12 w-12 shrink-0 rounded-xl border border-white/15"
                />
                <div>
                  <h2 id="ios-install-title" className="text-base font-semibold text-[#ffe68a]">
                    Install Lumen Reach
                  </h2>
                  <p className="text-xs text-[#9fb3d6]">Play fullscreen on iPhone &amp; iPad</p>
                </div>
              </div>
              <ol className="mt-4 space-y-2 text-sm leading-relaxed text-[#d7e2f5]">
                <li>1. Tap the <strong className="text-white">Share</strong> button in Safari&apos;s toolbar.</li>
                <li>2. Scroll down and tap <strong className="text-white">Add to Home Screen</strong>.</li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 min-h-11 w-full rounded-lg border border-[#3fc2b8]/40 bg-[#1a265c] px-4 py-2 text-sm font-medium text-[#ffe68a] transition-colors hover:bg-[#233275] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ffe68a]"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
}
