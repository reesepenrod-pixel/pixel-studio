// Placeholder shell until the Art workspace port lands (Phase 1, task 1.5).
// It states plainly that the editor isn't here yet rather than showing inert controls.
export function App() {
  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">PIXEL STUDIO</div>
        <div className="muted">FOUNDATION BUILD · PHASE 1</div>
      </header>
      <main className="placeholder">
        <p>THE ART WORKSPACE IS BEING PORTED.</p>
        <p className="muted">
          UNTIL IT ARRIVES, OPEN <code>Pixel Studio.html</code> TO DRAW.
        </p>
      </main>
    </div>
  );
}
