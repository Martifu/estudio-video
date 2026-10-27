// Google Chrome lookup shared by the doctor (engine/doctor.mjs) and the render side (render.mjs, studio/server.mjs).
// The CHROME env var always wins. Otherwise the first existing candidate for the OS is used; when none exists the
// first candidate is returned anyway (same as the historical macOS default), so the launch error names a real path.
// Zero npm dependencies. Platform-injectable: pass `platform` to get the win32 or posix path flavour regardless of the host.
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export const pathFor = (platform) => (platform === "win32" ? path.win32 : path.posix);

/** Ordered Chrome candidates for an OS. Same list the doctor has always checked. */
export function chromeCandidates({ platform = process.platform, env = process.env, homedir = os.homedir() } = {}) {
  const P = pathFor(platform);
  if (platform === "darwin") {
    return [
      { kind: "chrome", path: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" },
      { kind: "chrome", path: P.join(homedir, "Applications", "Google Chrome.app", "Contents", "MacOS", "Google Chrome") },
    ];
  }
  if (platform === "win32") {
    const pf = env.ProgramFiles || "C:\\Program Files";
    const pf86 = env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
    const local = env.LOCALAPPDATA || P.join(homedir, "AppData", "Local");
    return [
      { kind: "chrome", path: P.join(pf, "Google", "Chrome", "Application", "chrome.exe") },
      { kind: "chrome", path: P.join(pf86, "Google", "Chrome", "Application", "chrome.exe") },
      { kind: "chrome", path: P.join(local, "Google", "Chrome", "Application", "chrome.exe") },
    ];
  }
  return [
    { kind: "chrome", path: "/usr/bin/google-chrome" },
    { kind: "chrome", path: "/usr/bin/chromium" },
  ];
}

/** Path of the Chrome binary to drive: CHROME env, else the first existing candidate, else the first candidate. */
export function resolveChrome({ platform = process.platform, env = process.env, homedir = os.homedir(), exists = existsSync } = {}) {
  if (env.CHROME) return env.CHROME;
  const list = chromeCandidates({ platform, env, homedir });
  return (list.find((c) => exists(c.path)) ?? list[0]).path;
}
