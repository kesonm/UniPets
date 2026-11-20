import sharp from 'sharp'

// Compare the visible subject when frames have alpha. Including the silhouette
// catches posture changes that average color alone can miss.
export function frameDistance(a: Buffer, b: Buffer) {
  let difference = 0
  let visibleArea = 0
  for (let pixel = 0; pixel < a.length; pixel += 4) {
    const alphaA = a[pixel + 3] / 255
    const alphaB = b[pixel + 3] / 255
    const luminanceA = (a[pixel] * 0.21 + a[pixel + 1] * 0.72 + a[pixel + 2] * 0.07) / 255
    const luminanceB = (b[pixel] * 0.21 + b[pixel + 1] * 0.72 + b[pixel + 2] * 0.07) / 255
    difference += Math.abs(alphaA - alphaB) + Math.abs(alphaA * luminanceA - alphaB * luminanceB)
    visibleArea += Math.max(alphaA, alphaB)
  }
  return difference / (2 * Math.max(visibleArea, 1))
}

export function frameThumbnail(frame: Buffer) {
  return sharp(frame).resize(64,64).toColourspace('srgb').ensureAlpha().raw().toBuffer()
}

export function blendRgba(a: Buffer, b: Buffer, fraction: number) {
  const blended = Buffer.alloc(a.length)
  for (let pixel = 0; pixel < a.length; pixel += 4) {
    const weightA = a[pixel + 3] * (1 - fraction)
    const weightB = b[pixel + 3] * fraction
    const alpha = weightA + weightB
    blended[pixel + 3] = Math.round(alpha)
    if (!blended[pixel + 3]) continue
    for (let channel = 0; channel < 3; channel++) {
      const index = pixel + channel
      blended[index] = Math.round((a[index] * weightA + b[index] * weightB) / alpha)
    }
  }
  return blended
}

export async function makeSleepLoop(frames: Buffer[], fps: number): Promise<Buffer[]> {
  const thumbnails = await Promise.all(frames.map(frameThumbnail))
  const steps = thumbnails.slice(1).map((frame, index) => frameDistance(thumbnails[index], frame))
  const maxFrameChange = 0.045
  const minMotion = 0.002
  const end = thumbnails.length - 1

  // Keep a complete quiet cycle when the source already closes cleanly.
  if (steps.every(change => change <= maxFrameChange) && thumbnails.some(frame => frameDistance(frame, thumbnails[0]) >= minMotion)) {
    const seam = frameDistance(thumbnails[0], thumbnails[end])
    if (seam <= Math.min(0.012, Math.max(steps[0], steps.at(-1)!) * 1.25 + minMotion)) return frames
  }

  // The end is where the pet has settled, including older clips that start upright.
  // Use at least half a second and at most 1.25 seconds of contiguous subtle motion.
  let start = end
  const earliest = Math.max(0, end - Math.round(fps * 1.25))
  while (start > earliest && steps[start - 1] <= maxFrameChange && frameDistance(thumbnails[start - 1], thumbnails[end]) <= 0.085) {
    start--
  }
  if (end - start < Math.ceil(fps / 2) || !thumbnails.slice(start, end).some(frame => frameDistance(frame, thumbnails[end]) >= minMotion)) {
    throw new Error('视频末尾没有稳定且有轻微起伏的睡觉片段')
  }

  const restingFrames = frames.slice(start)
  const pixels = await Promise.all(restingFrames.map(frame => sharp(frame).ensureAlpha().raw().toBuffer({resolveWithObject:true})))
  const {width, height} = pixels[0].info
  if (pixels.some(frame => frame.info.width !== width || frame.info.height !== height)) throw new Error('睡觉动作的帧尺寸不一致')
  const last = pixels.length - 1

  // Ease across the small breathing motion and back. This gives the inhale and
  // exhale zero velocity at their endpoints, including at the loop boundary.
  return Promise.all(frames.map((_, index) => {
    const position = last * (1 - Math.cos(2 * Math.PI * index / frames.length)) / 2
    const before = Math.floor(position)
    const fraction = position - before
    if (fraction < 0.001 || before === last) return restingFrames[before]
    const rgba = blendRgba(pixels[before].data, pixels[before + 1].data, fraction)
    return sharp(rgba, {raw:{width,height,channels:4}}).png().toBuffer()
  }))
}
