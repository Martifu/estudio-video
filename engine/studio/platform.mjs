// OS-specific bits of the studio server: opening a file or folder in the user's app, and the env the render children get.
// Zero npm dependencies. Pure helpers take the platform as an argument so tests can exercise every OS on any host.
import { execFile } from "node:child_process";
import { resolveChrome } from "../chrome-path.mjs";

/**
 * [command, args] that opens `file` for the user.
 *   darwin: `open [-a app] file` (unchanged from the original Mac-only code)
 *   win32:  `cmd /d /c start "" file` (default app for the file type, or the default browser for a URL)
 *   other:  `xdg-open file`
 * `app` is honoured on macOS only (Windows and Linux pick the default app).
 */
export function openCommand(file, { app, platform = process.platform, comspec = process.env.ComSpec } = {}) {
  if (platform === "darwin") return ["open", app ? ["-a", app, file] : [file]];
  if (platform === "win32") return [comspec || "cmd.exe", ["/d", "/c", "start", "", file]];
  return ["xdg-open", [file]];
}

/** Opens `file`. Resolves null on success or the error message (callers log it; this never rejects). */
export function openPath(file, opts = {}, { exec = execFile, platform = process.platform } = {}) {
  const [cmd, args] = openCommand(file, { ...opts, platform });
  return new Promise((resolve) => {
    exec(cmd, args, (err) => resolve(err ? err.message : null));
  });
}

/** Env added to every render child (render.mjs, variants.py): CHROME resolved for this OS when the caller did not set it. */
export function renderEnv({ platform = process.platform, env = process.env, homedir, exists } = {}) {
  return { CHROME: resolveChrome({ platform, env, homedir, exists }) };
}
