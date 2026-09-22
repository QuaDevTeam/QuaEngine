# Dependency patches

## @xterm/xterm 6.0.0

The DOM renderer's `handleSelectionChanged` redraws all terminal rows. xterm calls it on every scroll even when its IntersectionObserver has paused the normal render path. Consequently a hidden editor terminal still allocates/updates row DOM during heavy output.

The patch records selection state while paused and defers its redraw until the existing full-refresh/resume path. It updates the TypeScript source and the package's published ESM/CommonJS artifacts; the large diff is caused by the upstream minified distributions. It adds no runtime bundle or renderer API dependency. Keep the catalog version pinned until the upstream equivalent is verified.

Regression: `node packages/editor/electron/scripts/terminal-smoke.mjs` observes **zero row DOM mutations** while the hidden terminal drains 40000 output lines, then verifies the final output after showing it. It also checks bounded visible DOM and real PTY lifecycle behavior. Re-run when changing xterm or this patch.
