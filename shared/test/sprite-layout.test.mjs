import test from 'node:test'
import assert from 'node:assert/strict'
import { analyzeSpritePixels, frameGeometry, drawSpriteFrame } from '../sprite-layout.mjs'

function sheet(background = [255,255,255,255]) {
  const width = 400, height = 240, data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < data.length; i += 4) data.set(background, i)
  return { data, width, height }
}
function rect(image, x, y, width, height, color = [120,80,40,255]) {
  for (let row = y; row < y + height; row++) for (let column = x; column < x + width; column++) image.data.set(color, (row * image.width + column) * 4)
}

test('four equal source frames stay inside the image, preserve aspect and wrap correctly', () => {
  const image = sheet([20,30,40,255]), layout = analyzeSpritePixels(image)
  for (let index = 0; index < 8; index++) {
    const r = frameGeometry(layout, index, 320, 230)
    assert.equal(r.sx, index % 4 * 100)
    assert.equal(r.sw, 100)
    assert.equal(r.sh, 240)
    assert.ok(Math.abs(r.dw / r.dh - r.sw / r.sh) < 1e-8)
    assert.ok(r.dx >= 8 && r.dy >= 8 && r.dx + r.dw <= 312 && r.dy + r.dh <= 222)
  }
})

test('all frames share a conservative crop including motion at the extremes', () => {
  const image = sheet()
  for (let frame = 0; frame < 4; frame++) rect(image, frame * 100 + 20, 85, 60, 65)
  rect(image, 20, 55, 15, 30) // raised tail in frame 1
  rect(image, 340, 150, 20, 35) // lower paw in frame 4
  const before = image.data.slice()
  const layout = analyzeSpritePixels(image)
  assert.equal(layout.trimmed, true)
  assert.ok(layout.cropTop < 55)
  assert.ok(layout.cropTop + layout.cropHeight > 185)
  assert.ok(layout.cropHeight < image.height)
  assert.deepEqual(image.data, before, 'analysis must not change source pixels')
  assert.equal(frameGeometry(layout, 0, 320, 230).sy, frameGeometry(layout, 3, 320, 230).sy)
})

test('painted checkerboards remain opaque; actual alpha backgrounds are distinguished', () => {
  const fake = sheet()
  for (let y = 0; y < fake.height; y += 10) for (let x = 0; x < fake.width; x += 10) if ((x + y) % 20 === 0) rect(fake, x, y, 10, 10, [224,224,224,255])
  for (let frame = 0; frame < 4; frame++) rect(fake, frame * 100 + 20, 85, 60, 65)
  const layout = analyzeSpritePixels(fake)
  assert.equal(layout.background, 'opaque')
  assert.equal(layout.trimmed, true)
  const alpha = sheet([0,0,0,0])
  for (let frame = 0; frame < 4; frame++) rect(alpha, frame * 100 + 20, 85, 60, 65, [250,250,250,255])
  const transparent = analyzeSpritePixels(alpha)
  assert.equal(transparent.background, 'transparent')
  assert.equal(transparent.trimmed, true, 'white fur on actual alpha is preserved')
})

test('idle playback reverses within an intact run instead of crossing clipped frames', () => {
  const image = { width: 200, height: 100, data: new Uint8ClampedArray(200 * 100 * 4) }
  const grid = {columns:4,rows:2,avoidClippedFrames:true}
  for (let frame = 0; frame < 8; frame++) {
    rect(image, (frame%4)*50+14, Math.floor(frame/4)*50+12, 23, 30)
  }
  assert.equal(analyzeSpritePixels(image,8,grid).loopFrames,undefined,'keep the usual playback when all frames fit')
  rect(image, 100, 24, 17, 8) // frame 3 extends through its left edge
  rect(image, 188, 24, 12, 8) // frame 4 extends through its right edge
  assert.deepEqual(analyzeSpritePixels(image,8,grid).loopFrames,[4,5,6,7,6,5])
  assert.equal(analyzeSpritePixels(image,8,{columns:4,rows:2}).loopFrames,undefined,'source previews still read every frame')
  rect(image, 70, 50, 12, 6) // frame 6 also extends through the top edge
  assert.deepEqual(analyzeSpritePixels(image,8,grid).loopFrames,[])
})

test('busy backgrounds are not cropped; full-frame view can always restore the source extent', () => {
  const image = sheet([40,90,30,255]), layout = analyzeSpritePixels(image)
  assert.equal(layout.trimmed, false)
  assert.equal(layout.cropTop, 0)
  assert.equal(layout.cropHeight, image.height)
  const r = frameGeometry({ ...layout, cropTop: 0, cropHeight: image.height }, 2, 320, 230)
  assert.equal(r.sy, 0)
  assert.equal(r.sh, 240)
})

test('drawing clears the old frame before rendering exactly one source rectangle', () => {
  const layout = analyzeSpritePixels(sheet([40,90,30,255])), calls = []
  const context = { clearRect: (...args) => calls.push(['clear', ...args]), drawImage: (...args) => calls.push(['draw', ...args]) }
  const image = {}
  drawSpriteFrame(context, image, layout, 2, 320, 230)
  assert.deepEqual(calls[0], ['clear', 0, 0, 320, 230])
  assert.equal(calls[1][1], image)
  assert.deepEqual(calls[1].slice(2,6), [200,0,100,240])
})

test('invalid frame geometry is rejected instead of showing a misaligned strip', () => {
  assert.throws(() => analyzeSpritePixels(sheet(), 3), /无法/)
  assert.throws(() => analyzeSpritePixels(sheet(), 0), /无法/)
  assert.throws(() => analyzeSpritePixels({ data: new Uint8Array(4), width: 400, height: 240 }), /无法/)
})

test('a 36-frame grid advances across rows and never shows unused cells', () => {
  const image={width:80,height:50,data:new Uint8ClampedArray(80*50*4).fill(255)}
  const layout=analyzeSpritePixels(image,36,{columns:8,rows:5})
  assert.equal(layout.frameWidth,10)
  assert.equal(layout.frameHeight,10)
  assert.deepEqual([frameGeometry(layout,8,100,100).sx,frameGeometry(layout,8,100,100).sy],[0,10])
  assert.deepEqual([frameGeometry(layout,35,100,100).sx,frameGeometry(layout,35,100,100).sy],[30,40])
  assert.equal(frameGeometry(layout,36,100,100).sy,0)
  assert.throws(()=>analyzeSpritePixels(image,48,{columns:8,rows:5}),/无法/)
})

test('video playback uses recorded fps while legacy image playback retains its pace', async () => {
  const {frameIndexAt}=await import('../sprite-layout.mjs')
  assert.equal(frameIndexAt(250,36,12),3)
  assert.equal(frameIndexAt(2999,36,12),35)
  assert.equal(frameIndexAt(3000,36,12),0)
  assert.equal(frameIndexAt(480,4),2)
  assert.equal(frameIndexAt(960,4),0)
})
