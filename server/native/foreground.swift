import Foundation
import CoreImage
import CoreVideo
import Vision

struct MatteError: LocalizedError {
    let message: String
    var errorDescription: String? { message }
}

struct Subject {
    let width: Int
    let height: Int
    let pixels: [UInt8]
    let area: Int
}

// Vision labels visible instances independently in each image. Prefer the main
// foreground object first, then maintain its identity by overlap with the last frame.
@available(macOS 14.0, *)
func selectSubject(_ observation: VNInstanceMaskObservation, previous: Subject?) throws -> (IndexSet, Subject) {
    let buffer = observation.instanceMask
    guard CVPixelBufferGetPixelFormatType(buffer) == kCVPixelFormatType_OneComponent8,
          CVPixelBufferLockBaseAddress(buffer, .readOnly) == kCVReturnSuccess else {
        throw MatteError(message: "Invalid foreground mask")
    }
    defer { CVPixelBufferUnlockBaseAddress(buffer, .readOnly) }

    let width = CVPixelBufferGetWidth(buffer), height = CVPixelBufferGetHeight(buffer)
    let rowBytes = CVPixelBufferGetBytesPerRow(buffer), size = width * height
    guard width > 0, height > 0, let base = CVPixelBufferGetBaseAddress(buffer) else {
        throw MatteError(message: "Empty foreground mask")
    }
    let data = base.assumingMemoryBound(to: UInt8.self)
    let prior = previous.flatMap { $0.width == width && $0.height == height ? $0 : nil }
    var labels = [UInt8](repeating: 0, count: size)
    var area = [Int](repeating: 0, count: 256)
    var center = area, overlap = area
    for y in 0 ..< height {
        for x in 0 ..< width {
            let i = y * width + x, value = data[y * rowBytes + x]
            if value == 0 { continue }
            labels[i] = value
            let label = Int(value)
            area[label] += 1
            if x >= width / 4 && x < 3 * width / 4 && y >= height / 5 && y < 4 * height / 5 { center[label] += 1 }
            if prior?.pixels[i] == 1 { overlap[label] += 1 }
        }
    }
    let candidates = observation.allInstances.filter { $0 > 0 && $0 < 256 && area[$0] >= size / 100 && area[$0] < size * 95 / 100 }
    func score(_ id: Int) -> Double {
        let salience = Double(area[id] + center[id]) / Double(size)
        guard let prior else { return salience }
        let union = max(1, prior.area + area[id] - overlap[id])
        return salience + 2 * Double(overlap[id]) / Double(union)
    }
    guard let winner = candidates.max(by: { score($0) < score($1) }) else {
        throw MatteError(message: "No usable foreground subject")
    }
    let pixels = labels.map { $0 == UInt8(winner) ? UInt8(1) : 0 }
    return (IndexSet(integer: winner), Subject(width: width, height: height, pixels: pixels, area: area[winner]))
}

@available(macOS 14.0, *)
func removeBackground(input: URL, output: URL) throws {
    let files = try FileManager.default.contentsOfDirectory(atPath: input.path).filter {
        $0.range(of: #"^frame-[0-9]{3}\.png$"#, options: .regularExpression) != nil
    }.sorted()
    guard !files.isEmpty && files.count <= 48 else { throw MatteError(message: "Invalid frame sequence") }
    let context = CIContext(options: [.cacheIntermediates: false])
    let colorSpace = CGColorSpace(name: CGColorSpace.sRGB)!
    let request = VNGenerateForegroundInstanceMaskRequest()
    var previous: Subject?
    for filename in files {
        try autoreleasepool {
            let handler = VNImageRequestHandler(url: input.appendingPathComponent(filename), options: [:])
            try handler.perform([request])
            guard let result = request.results?.first else { throw MatteError(message: "Foreground recognition failed at \(filename)") }
            let (instance, subject) = try selectSubject(result, previous: previous)
            let masked = try result.generateMaskedImage(ofInstances: instance, from: handler, croppedToInstancesExtent: false)
            try context.writePNGRepresentation(of: CIImage(cvPixelBuffer: masked), to: output.appendingPathComponent(filename), format: .RGBA8, colorSpace: colorSpace)
            previous = subject
        }
    }
}

do {
    let arguments = CommandLine.arguments
    guard arguments.count == 3 else { throw MatteError(message: "Usage: foreground input-directory output-directory") }
    guard #available(macOS 14.0, *) else { throw MatteError(message: "Foreground masking requires macOS 14 or later") }
    try removeBackground(input: URL(fileURLWithPath: arguments[1], isDirectory: true), output: URL(fileURLWithPath: arguments[2], isDirectory: true))
} catch {
    FileHandle.standardError.write(Data("\(error.localizedDescription)\n".utf8))
    exit(1)
}
