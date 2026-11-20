// Offsets are fractions of the visible cat height. Positive y moves downward.
const neutral = { root:[0,0], paw:[0,0], bend:0 }
const stand = { front:neutral, rear:neutral }
const squat = {
  front:{root:[-0.025,0.045],paw:[0,0],bend:0.038},
  rear:{root:[0.025,0.14],paw:[0,0],bend:-0.10},
}
const liftFront = {
  front:{root:[-0.045,-0.07],paw:[-0.045,-0.20],bend:0.105},
  rear:{root:[0.012,0.08],paw:[0,0],bend:-0.055},
}
const pushOff = {
  front:{root:[-0.066,-0.16],paw:[-0.085,-0.30],bend:0.105},
  rear:{root:[-0.028,-0.10],paw:[0,0],bend:-0.02},
}
const tuck = {
  front:{root:[-0.05,-0.13],paw:[0.025,-0.30],bend:0.14},
  rear:{root:[-0.022,-0.15],paw:[-0.145,-0.26],bend:-0.10},
}
const reach = {
  front:{root:[-0.074,-0.045],paw:[-0.155,-0.105],bend:0.035},
  rear:{root:[-0.05,-0.17],paw:[-0.06,-0.29],bend:-0.08},
}
const frontTouch = {
  front:{root:[-0.07,0.045],paw:[0,0],bend:0.04},
  rear:{root:[-0.045,-0.14],paw:[-0.015,-0.17],bend:-0.045},
}
const absorb = {
  front:{root:[-0.047,0.115],paw:[0,0],bend:0.075},
  rear:{root:[-0.055,-0.03],paw:[-0.024,-0.12],bend:-0.058},
}
const rearTouch = {
  front:{root:[-0.025,0.075],paw:[0,0],bend:0.035},
  rear:{root:[-0.026,0.07],paw:[0,0],bend:-0.058},
}

const stages = {
  charge:[[0,stand],[1,squat]],
  push:[[0,squat],[0.50,liftFront],[1,pushOff]],
  air:[[0,pushOff],[0.33,tuck],[0.73,reach],[1,frontTouch]],
  land:[[0,frontTouch],[0.27,absorb],[0.64,rearTouch],[1,stand]],
}
const clamp = (value,low,high) => Math.max(low,Math.min(high,value))
const mix = (from,to,t) => from+(to-from)*t
const smooth = t => t*t*(3-2*t)

export const jumpStageFrames = { charge:7, push:5, air:17, land:11 }
export const jumpFps = 20
export const jumpFrameCount = Object.values(jumpStageFrames).reduce((sum,count)=>sum+count,0)

export function jumpFrameIndex(stage,progress) {
  let offset = 0
  for (const [key,count] of Object.entries(jumpStageFrames)) {
    if (key===stage) return offset+Math.round(clamp(progress,0,1)*(count-1))
    offset += count
  }
  throw new Error('未知的跳跃阶段')
}

export function jumpPoseAt(stage, progress) {
  const keys = stages[stage]
  const t = clamp(progress,0,1)
  const end = keys.findIndex(([at],i)=>i>0 && t<=at)
  const [startAt,start] = keys[end-1], [endAt,target] = keys[end]
  if (t===startAt) return start
  if (t===endAt) return target
  const p = (t-startAt)/(endAt-startAt)
  const weight = stage==='air' ? p : smooth(p)
  const limb = key => ({
    root:start[key].root.map((value,i)=>mix(value,target[key].root[i],weight)),
    paw:start[key].paw.map((value,i)=>mix(value,target[key].paw[i],weight)),
    bend:mix(start[key].bend,target[key].bend,weight),
  })
  return {front:limb('front'),rear:limb('rear')}
}

export function catJumpLandmarks(data,width,height) {
  let top = height, bottom = -1
  for (let y=0;y<height;y++) {
    let count = 0
    for (let x=0;x<width;x++) if (data[(y*width+x)*4+3]>=150) count++
    if (count<width*0.012) continue
    top = Math.min(top,y)
    bottom = y
  }
  const scale = bottom-top
  if (scale<height*0.23 || scale>height*0.95) return null

  const band = Math.max(5,Math.round(scale*0.105))
  const paw = Array.from({length:width},(_,x)=>{
    let count = 0
    for (let y=bottom-band;y<=bottom;y++) if (data[(y*width+x)*4+3]>=140) count++
    return count>=Math.ceil(band*0.19) ? count : 0
  })
  const left = paw.findIndex(count=>count>0), right = paw.findLastIndex(count=>count>0)
  if (left<0 || right-left<width*0.24) return null

  let split = Math.round((left+right)/2), gapSize = 0
  for (let x=left;x<=right;x++) {
    if (paw[x]) continue
    const start = x
    while (x<right && !paw[x]) x++
    const center = (start+x)/2
    if (x-start>gapSize && center>mix(left,right,0.27) && center<mix(left,right,0.73)) {
      split = Math.round(center)
      gapSize = x-start
    }
  }
  if (gapSize<width*0.018) return null
  const centerOf = (start,end) => {
    let weight = 0, sum = 0
    for (let x=start;x<end;x++) {weight+=paw[x];sum+=paw[x]*x}
    return weight ? sum/weight : NaN
  }
  const front = centerOf(left,split), rear = centerOf(split,right+1)
  if (!Number.isFinite(front) || !Number.isFinite(rear) || rear-front<width*0.2) return null
  return {front,rear,floor:bottom,hip:bottom-scale*0.39,scale}
}

export function buildJumpMesh(data,width,height) {
  const landmarks = catJumpLandmarks(data,width,height)
  if (!landmarks) return null
  const {front,rear,hip,floor} = landmarks
  const xs = [0,width,front,rear,...Array.from({length:7},(_,i)=>width*(i+1)/8)].sort((a,b)=>a-b)
  const ys = [0,hip*0.5,hip,hip+(floor-hip)*0.24,hip+(floor-hip)*0.5,hip+(floor-hip)*0.76,floor,height]
  return {xs,ys,width,height,...landmarks}
}

export function createJumpRig(bitmap,index) {
  const {frames,columns,frameWidth,frameHeight,cropTop,cropHeight} = bitmap.layout
  const tile = document.createElement('canvas')
  const width = tile.width = Math.min(256,frameWidth), height = tile.height = Math.min(256,cropHeight)
  const context = tile.getContext('2d',{willReadFrequently:true})
  if (!context) return null
  const frame = index%frames
  context.drawImage(bitmap.image,(frame%columns)*frameWidth,Math.floor(frame/columns)*frameHeight+cropTop,
    frameWidth,cropHeight,0,0,width,height)
  const mesh = buildJumpMesh(context.getImageData(0,0,width,height).data,width,height)
  return mesh && {...mesh,texture:tile}
}

export function deformJumpPoint(rig,x,y,pose) {
  const t = clamp((y-rig.hip)/(rig.floor-rig.hip),0,1)
  const bend = 4*t*(1-t)
  const blendWidth = (rig.rear-rig.front)*0.60
  const side = smooth(clamp((x-mix(rig.front,rig.rear,0.20))/blendWidth,0,1))
  const {front,rear} = pose
  const frontX = mix(front.root[0],front.paw[0],t)+front.bend*bend
  const rearX = mix(rear.root[0],rear.paw[0],t)+rear.bend*bend
  // Limit the change through the torso so the texture cannot fold across the legs.
  const difference = Math.max(rearX-frontX,-blendWidth*0.60/rig.scale)
  const dx = (frontX+rearX)/2+difference*(side-0.5)
  const dy = mix(mix(front.root[1],front.paw[1],t),mix(rear.root[1],rear.paw[1],t),side)
  return {x:x+dx*rig.scale,y:y+dy*rig.scale}
}

function expandedTriangle(a,b,c) {
  // Overlap adjacent clips by a fraction of a pixel to hide antialias seams.
  const center = {x:(a.x+b.x+c.x)/3,y:(a.y+b.y+c.y)/3}
  return [a,b,c].map(point=>{
    const distance = Math.max(1,Math.hypot(point.x-center.x,point.y-center.y))
    return {x:point.x+(point.x-center.x)*0.65/distance,y:point.y+(point.y-center.y)*0.65/distance}
  })
}

export function* jumpTriangles(rig,pose,rect) {
  const {xs,ys,width,height} = rig
  const grid = ys.map(y=>xs.map(x=>{
    const point = deformJumpPoint(rig,x,y,pose)
    return {x:rect.dx+point.x*rect.dw/width,y:rect.dy+point.y*rect.dh/height}
  }))
  for (let row=0;row<ys.length-1;row++) for (let col=0;col<xs.length-1;col++) {
    const x = xs[col], y = ys[row], dx = xs[col+1]-x, dy = ys[row+1]-y
    if (dx<=0 || dy<=0) continue
    const a = grid[row][col], b = grid[row][col+1], c = grid[row+1][col], d = grid[row+1][col+1]
    const triangle = (from,first) => {
      const ux = {x:(b.x-from.x)/dx,y:(b.y-from.y)/dx}
      const uy = {x:(c.x-from.x)/dy,y:(c.y-from.y)/dy}
      const origin = {x:from.x-ux.x*x-uy.x*y,y:from.y-ux.y*x-uy.y*y}
      return {points:expandedTriangle(first,b,c),matrix:[ux.x,ux.y,uy.x,uy.y,origin.x,origin.y]}
    }
    yield triangle(a,a)
    const extension = {x:b.x+c.x-d.x,y:b.y+c.y-d.y}
    yield triangle(extension,d)
  }
}

export function drawJumpRig(context,rig,pose,rect) {
  for (const {points:[a,b,c],matrix} of jumpTriangles(rig,pose,rect)) {
    context.save()
    context.beginPath()
    context.moveTo(a.x,a.y)
    context.lineTo(b.x,b.y)
    context.lineTo(c.x,c.y)
    context.closePath()
    context.clip()
    context.transform(...matrix)
    context.drawImage(rig.texture,0,0)
    context.restore()
  }
}
