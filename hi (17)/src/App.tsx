import { useEffect, useRef } from 'react';
import { Game } from './game/game';
import { OfflineIndicator } from './components/OfflineIndicator';
import { PWAInstallButton } from './components/PWAInstallButton';

/**
 * React shell: mounts the canvas, creates the Game and tears it down again.
 * All gameplay lives in src/game (plain TypeScript, no React in the loop).
 */
export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const root = rootRef.current!;
    const game = new Game(canvas, root);
    game.start();
    (window as unknown as { __game: Game }).__game = game; // handy for debugging in the console
    return () => game.destroy();
  }, []);

  return (
    <div ref={rootRef} className="fixed inset-0 overflow-hidden bg-black select-none" style={{ touchAction: 'none' }}>
      <canvas ref={canvasRef} className="block h-full w-full" style={{ imageRendering: 'pixelated', touchAction: 'none' }} />
      <OfflineIndicator />
      <PWAInstallButton />
    </div>
  );
}
