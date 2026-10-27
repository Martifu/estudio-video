// node --test engine/encoder-args.test.mjs
// The libx264 argv is the historical render argv of main (engine/render.mjs): it must not change (md5 regression of the final video).
import test from "node:test";
import assert from "node:assert/strict";
import { finalEncodeArgv, resolveEncoder } from "./encoder-args.mjs";

const base = { fps: 30, framesPattern: "/run/c/out/frames-v/%05d.jpg", video: "/run/c/out/c-9x16.mp4" };

test("default libx264 argv with audio is byte-identical to the historical render argv", () => {
  assert.deepEqual(finalEncodeArgv({ ...base, audio: "/run/c/out/mix.wav" }), [
    "-y", "-framerate", "30", "-i", "/run/c/out/frames-v/%05d.jpg", "-i", "/run/c/out/mix.wav",
    "-c:v", "libx264", "-preset", "slow", "-crf", "19", "-maxrate", "16M", "-bufsize", "32M",
    "-vf", "scale=in_range=pc:out_range=tv:out_color_matrix=bt709", "-pix_fmt", "yuv420p",
    "-color_range", "tv", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
    "-tune", "grain", "-c:a", "aac", "-b:a", "256k", "-shortest", "-movflags", "+faststart", "/run/c/out/c-9x16.mp4",
  ]);
});

test("default libx264 argv without audio (--no-audio) is the historical one minus the audio inputs and codec", () => {
  assert.deepEqual(finalEncodeArgv({ ...base, audio: null }), [
    "-y", "-framerate", "30", "-i", "/run/c/out/frames-v/%05d.jpg",
    "-c:v", "libx264", "-preset", "slow", "-crf", "19", "-maxrate", "16M", "-bufsize", "32M",
    "-vf", "scale=in_range=pc:out_range=tv:out_color_matrix=bt709", "-pix_fmt", "yuv420p",
    "-color_range", "tv", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
    "-tune", "grain", "-movflags", "+faststart", "/run/c/out/c-9x16.mp4",
  ]);
  assert.deepEqual(finalEncodeArgv({ ...base, audio: null }), finalEncodeArgv({ ...base, audio: null, encoder: "libx264" }));
});

test("h264_nvenc swaps only the codec options (no libx264-only -tune grain, cq instead of crf)", () => {
  const nv = finalEncodeArgv({ ...base, audio: "/run/c/out/mix.wav", encoder: "h264_nvenc" });
  const i = nv.indexOf("-c:v");
  assert.deepEqual(nv.slice(i, i + 9), ["-c:v", "h264_nvenc", "-preset", "p6", "-rc", "vbr", "-cq", "19", "-b:v"]);
  assert.equal(nv[i + 9], "0");
  assert.ok(!nv.includes("libx264"));
  assert.ok(!nv.includes("-crf"));
  assert.equal(nv[nv.indexOf("-tune") + 1], "hq");
  // everything else is shared with the libx264 argv
  const sw = finalEncodeArgv({ ...base, audio: "/run/c/out/mix.wav" });
  const shared = (a) => a.filter((x, k) => k < a.indexOf("-c:v") || k >= a.indexOf("-maxrate"));
  assert.deepEqual(shared(nv).filter((x) => x !== "-tune" && x !== "hq" && x !== "grain"), shared(sw).filter((x) => x !== "-tune" && x !== "grain"));
});

test("ESTUDIO_VIDEO_ENCODER: only libx264 and h264_nvenc are accepted; anything else falls back to libx264 with a warning", () => {
  assert.deepEqual(resolveEncoder(undefined), { encoder: "libx264" });
  assert.deepEqual(resolveEncoder(""), { encoder: "libx264" });
  assert.deepEqual(resolveEncoder(" h264_nvenc "), { encoder: "h264_nvenc" });
  assert.deepEqual(resolveEncoder("libx264"), { encoder: "libx264" });
  const typo = resolveEncoder("h264_nvec");
  assert.equal(typo.encoder, "libx264");
  assert.match(typo.warning, /h264_nvec/);
});
