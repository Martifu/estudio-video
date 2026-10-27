// ffmpeg argv for the final video encode of render.mjs (`v` mode). The libx264 path is the historical one and must stay
// byte-identical (engine/encoder-args.test.mjs freezes it). ESTUDIO_VIDEO_ENCODER=h264_nvenc opts into the NVIDIA encoder.
// Zero npm dependencies.

export const VIDEO_ENCODERS = ["libx264", "h264_nvenc"];

/** ESTUDIO_VIDEO_ENCODER -> {encoder, warning?}. Unknown values fall back to libx264 (never a silent broken encode). */
export function resolveEncoder(value) {
  const v = value == null ? "" : String(value).trim();
  if (v === "" || v === "libx264") return { encoder: "libx264" };
  if (v === "h264_nvenc") return { encoder: "h264_nvenc" };
  return { encoder: "libx264", warning: `ESTUDIO_VIDEO_ENCODER=${v} no se reconoce (usa libx264 o h264_nvenc); se usa libx264.` };
}

/**
 * Full ffmpeg argv that encodes the JPEG frame sequence (`framesPattern`) into `video`, muxing `audio` when given.
 * Everything except the codec block is shared by both encoders.
 */
export function finalEncodeArgv({ fps, framesPattern, audio = null, video, encoder = "libx264" }) {
  const nvenc = encoder === "h264_nvenc";
  return [
    "-y",
    "-framerate", String(fps),
    "-i", framesPattern,
    ...(audio ? ["-i", audio] : []),
    ...(nvenc
      ? ["-c:v", "h264_nvenc", "-preset", "p6", "-rc", "vbr", "-cq", "19", "-b:v", "0"]
      : ["-c:v", "libx264", "-preset", "slow", "-crf", "19"]),
    "-maxrate", "16M",
    "-bufsize", "32M",
    // JPEG frames are full range; social platforms expect limited (tv) range BT.709.
    "-vf", "scale=in_range=pc:out_range=tv:out_color_matrix=bt709",
    "-pix_fmt", "yuv420p",
    "-color_range", "tv",
    "-colorspace", "bt709",
    "-color_primaries", "bt709",
    "-color_trc", "bt709",
    // Grain changes every frame: libx264 has a grain tuning, NVENC (which rejects "grain") gets its high-quality tuning.
    "-tune", nvenc ? "hq" : "grain",
    ...(audio ? ["-c:a", "aac", "-b:a", "256k", "-shortest"] : []),
    "-movflags", "+faststart",
    video,
  ];
}
