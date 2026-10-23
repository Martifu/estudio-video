// Face + upper-body tracking for the estudio-video overlay engine (Apple Vision, no installs).
//
//   swift faces.swift <frames-dir> [--step 3] [--out faces.json]      (or compile once: swiftc -O faces.swift -o faces)
//
// Reads <frames-dir>/%04d.jpg (the 1080x1920 cover-cropped frames made by overlay.py), runs VNDetectFaceRectanglesRequest and
// VNDetectHumanRectanglesRequest (upper body) on every `step`-th frame and writes JSON boxes in 1080x1920 canvas pixels
// (top-left origin). Frames are already cover-fitted to the canvas, so normalized Vision boxes map linearly; for a frame of a
// different size the same cover fit the template uses is applied (scale = max(W/iw, H/ih), centered).
//   {"version":1,"n":394,"step":3,"fps":30,"samples":[{"f":1,"face":[x,y,w,h]|null,"person":[x,y,w,h]|null}, ...]}
// "f" is the 1-based frame index. With several faces the largest one wins. Null = nothing detected in that sample (the
// consumer holds the last known box). Exit code 0 even when nothing is detected; non-zero only on unusable input.
import Foundation
import Vision
import ImageIO
import CoreGraphics

let CW = 1080.0, CH = 1920.0

var args = Array(CommandLine.arguments.dropFirst())
var step = 3
var outPath: String? = nil
var dirArg: String? = nil
var i = 0
while i < args.count {
    switch args[i] {
    case "--step": i += 1; step = max(1, Int(args[i]) ?? 3)
    case "--out": i += 1; outPath = args[i]
    default: dirArg = args[i]
    }
    i += 1
}
guard let dir = dirArg else {
    FileHandle.standardError.write("usage: faces <frames-dir> [--step 3] [--out faces.json]\n".data(using: .utf8)!)
    exit(2)
}
let fm = FileManager.default
let files = ((try? fm.contentsOfDirectory(atPath: dir)) ?? []).filter { $0.hasSuffix(".jpg") }.sorted()
if files.isEmpty {
    FileHandle.standardError.write("no jpg frames in \(dir)\n".data(using: .utf8)!)
    exit(2)
}

// Vision rect (normalized, bottom-left origin, in the image) -> canvas pixels (top-left origin) with the cover fit.
func toCanvas(_ r: CGRect, iw: Double, ih: Double) -> [Int] {
    let k = max(CW / iw, CH / ih)
    let ox = (CW - iw * k) / 2, oy = (CH - ih * k) / 2
    let x = r.minX * iw * k + ox
    let y = (1 - r.maxY) * ih * k + oy
    let w = r.width * iw * k, h = r.height * ih * k
    let x0 = max(0, x), y0 = max(0, y), x1 = min(CW, x + w), y1 = min(CH, y + h)
    return [Int(x0.rounded()), Int(y0.rounded()), Int(max(0, x1 - x0).rounded()), Int(max(0, y1 - y0).rounded())]
}

func largest(_ rects: [CGRect]) -> CGRect? {
    return rects.max(by: { $0.width * $0.height < $1.width * $1.height })
}

var samples: [[String: Any]] = []
var hits = 0
var idx = 0
while idx < files.count {
    let url = URL(fileURLWithPath: dir).appendingPathComponent(files[idx])
    var entry: [String: Any] = ["f": idx + 1, "face": NSNull(), "person": NSNull()]
    if let src = CGImageSourceCreateWithURL(url as CFURL, nil), let img = CGImageSourceCreateImageAtIndex(src, 0, nil) {
        let iw = Double(img.width), ih = Double(img.height)
        let faceReq = VNDetectFaceRectanglesRequest()
        let humanReq = VNDetectHumanRectanglesRequest()
        humanReq.upperBodyOnly = true
        let handler = VNImageRequestHandler(cgImage: img, options: [:])
        try? handler.perform([faceReq, humanReq])
        if let f = largest((faceReq.results ?? []).map { $0.boundingBox }) {
            entry["face"] = toCanvas(f, iw: iw, ih: ih)
            hits += 1
        }
        if let p = largest((humanReq.results ?? []).map { $0.boundingBox }) {
            entry["person"] = toCanvas(p, iw: iw, ih: ih)
        }
    }
    samples.append(entry)
    idx += step
}

let doc: [String: Any] = ["version": 1, "n": files.count, "step": step, "fps": 30, "detected": hits, "samples": samples]
let data = try JSONSerialization.data(withJSONObject: doc, options: [.sortedKeys])
if let p = outPath { try data.write(to: URL(fileURLWithPath: p)) } else { FileHandle.standardOutput.write(data) }
FileHandle.standardError.write("faces: \(hits)/\(samples.count) samples with a face\n".data(using: .utf8)!)
