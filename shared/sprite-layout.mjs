function spriteGrid(width, height, frames, grid) {
  const columns = grid.columns ?? frames, rows = grid.rows ?? 1
  if (!Number.isInteger(frames) || frames < 1 || frames > 128 || !Number.isInteger(columns) || !Number.isInteger(rows) || columns < 1 || rows < 1 || frames > columns * rows || columns * rows > 128 || !width || !height || width % columns !== 0 || height % rows !== 0) {
    throw new Error('动作图尺寸无法按指定行列和帧数划分')
  }
  const frameWidth = width / columns, frameHeight = height / rows
  return { frames, columns, rows, frameWidth, frameHeight, imageWidth: width, imageHeight: height, cropTop: 0, cropHeight: frameHeight, background: 'opaque', trimmed: false }
}

// Motion clips share a canvas and a ground line, so keep the full cell.
export function fixedSpriteLayout(image, frames, grid) {
  return spriteGrid(image.naturalWidth,image.naturalHeight,frames,grid)
}

function hasSolidEdge(length, alphaAt) {
  const minimum = Math.max(3, Math.ceil(length * .015))
  let run = 0
  for (let i = 0; i < length; i++) {
    run = alphaAt(i) >= 96 ? run + 1 : 0
    if (run >= minimum) return true
  }
  return false
}

function completeLoop(frames, width, height, alphaAt) {
  let start = 0, bestStart = 0, bestLength = 0
  for (let frame = 0; frame <= frames; frame++) {
    const end = frame === frames
    if (!end && !(
      hasSolidEdge(height, y => alphaAt(frame,0,y)) ||
      hasSolidEdge(height, y => alphaAt(frame,width-1,y)) ||
      hasSolidEdge(width, x => alphaAt(frame,x,0)) ||
      hasSolidEdge(width, x => alphaAt(frame,x,height-1))
    )) continue
    if (frame - start > bestLength) {
      bestStart = start
      bestLength = frame - start
    }
    start = frame + 1
  }
  if (bestLength === frames) return undefined
  if (bestLength < 3) return []

  // Reverse at each end of one intact run, avoiding a jump across missing frames.
  const run = Array.from({length:bestLength}, (_,i) => bestStart+i)
  return [...run,...run.slice(1,-1).reverse()]
}

// Shared by the web preview and Electron. The source image is never rewritten.
export function analyzeSpritePixels({ data, width, height }, frames = 4, grid = {}) {
  if (data.length !== width * height * 4) throw new Error('动作图尺寸无法按指定行列和帧数划分')
  const layout = spriteGrid(width,height,frames,grid)
  const {columns,frameWidth,frameHeight} = layout
  const step = Math.max(1, Math.floor(Math.max(width,height) / 768))
  const offset = (frame,x,y) => ((Math.floor(frame/columns)*frameHeight+y)*width+(frame%columns)*frameWidth+x)*4
  let edgeSamples = 0, clearEdges = 0, paleEdges = 0, transparentPixels = 0, samples = 0
  const pale = (r,g,b) => Math.min(r,g,b)>=205 && Math.max(r,g,b)-Math.min(r,g,b)<=24
  // Empty cells in the last row are deliberately excluded from analysis.
  for (let frame=0; frame<frames; frame++) for (let y=0; y<frameHeight; y+=step) for (let x=0; x<frameWidth; x+=step) {
    const i=offset(frame,x,y),a=data[i+3]
    samples++; if(a<240)transparentPixels++
    if(y<frameHeight*.06 || y>=frameHeight*.94) {
      edgeSamples++;if(a<24)clearEdges++
      if(a>=240 && pale(data[i],data[i+1],data[i+2]))paleEdges++
    }
  }
  layout.background=transparentPixels/samples>.01?'transparent':'opaque'
  if (grid.avoidClippedFrames && layout.background==='transparent') {
    layout.loopFrames = completeLoop(frames,frameWidth,frameHeight,(frame,x,y) => data[offset(frame,x,y)+3])
  }
  const alphaBackground=clearEdges/edgeSamples>.8,paleBackground=paleEdges/edgeSamples>.9
  if(!alphaBackground&&!paleBackground)return layout
  let top=frameHeight,bottom=-1
  const required=Math.max(3,Math.ceil(frameWidth/step*.006))
  for(let y=0;y<frameHeight;y+=step) {
    let count=0
    for(let frame=0;frame<frames;frame++) for(let x=0;x<frameWidth;x+=step) {
      const i=offset(frame,x,y),a=data[i+3]
      if(a<24)continue
      if(alphaBackground || Math.min(data[i],data[i+1],data[i+2])<190 || Math.max(data[i],data[i+1],data[i+2])-Math.min(data[i],data[i+1],data[i+2])>24)count++
    }
    if(count>=required){top=Math.min(top,y);bottom=Math.min(frameHeight,y+step)}
  }
  if(bottom<top)return layout
  const pad=Math.max(12,Math.ceil(frameHeight*.065))
  let cropTop=Math.max(0,top-pad),cropBottom=Math.min(frameHeight,bottom+pad)
  // A shared conservative crop keeps every frame's scale and baseline stable.
  const minimum=Math.ceil(frameHeight*.55)
  if(cropBottom-cropTop<minimum) {
    const middle=(cropTop+cropBottom)/2
    cropTop=Math.max(0,Math.min(frameHeight-minimum,Math.floor(middle-minimum/2)))
    cropBottom=cropTop+minimum
  }
  if(cropBottom-cropTop<=frameHeight*.9) {
    layout.cropTop=cropTop;layout.cropHeight=cropBottom-cropTop;layout.trimmed=true
  }
  return layout
}

export function frameIndexAt(elapsedMs, frames, fps = 1000/240) {
  const rate=Number.isFinite(fps)&&fps>0&&fps<=60?fps:1000/240
  return Math.floor(Math.max(0,elapsedMs)*rate/1000)%frames
}

export function createSpriteLayout(image, frames = 4, grid = {}) {
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth; canvas.height = image.naturalHeight
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('当前设备暂不支持动作预览')
  context.drawImage(image,0,0)
  return analyzeSpritePixels(context.getImageData(0,0,canvas.width,canvas.height),frames,grid)
}

export function frameGeometry(layout, index, width, height, padding = 8) {
  const frame = ((Math.floor(index) % layout.frames) + layout.frames) % layout.frames
  const scale = Math.max(0,Math.min((width-padding*2)/layout.frameWidth,(height-padding*2)/layout.cropHeight))
  const dw = layout.frameWidth*scale, dh = layout.cropHeight*scale
  return { sx:(frame%layout.columns)*layout.frameWidth, sy:Math.floor(frame/layout.columns)*layout.frameHeight+layout.cropTop, sw:layout.frameWidth, sh:layout.cropHeight, dx:(width-dw)/2, dy:(height-dh)/2, dw, dh }
}

export function drawSpriteFrame(context, image, layout, index, width, height, padding = 8) {
  const r = frameGeometry(layout,index,width,height,padding)
  context.clearRect(0,0,width,height)
  context.drawImage(image,r.sx,r.sy,r.sw,r.sh,r.dx,r.dy,r.dw,r.dh)
  return r
}
