import { catDefaultAction, catJumpAction, catSleepAction, type CatClipId } from '../../shared/cat-motion.mjs'
import { jumpFrameCount, jumpFrameIndex, jumpFps, jumpStageFrames, type JumpStage } from '../../shared/jump-motion.mjs'
import { createSpriteLayout, fixedSpriteLayout, frameIndexAt } from '../../shared/sprite-layout.mjs'
import { mediaObjectUrl } from '../lib/api'
import type { MotionPreviewAsset } from '../lib/types'
import { clampRoomPoint, interpolatePoint, startPoint, type GroundPoint, type RoomCamera } from './pet-room-layout'

type Facing = 'left'|'right'
type Sprite = {image:HTMLImageElement;layout:ReturnType<typeof fixedSpriteLayout>;fps:number;startFoot:number;endFoot:number}
export type RoomSprites = Map<CatClipId,Sprite>
export type RoomActor = {
  point:GroundPoint; height:number; facing:Facing;
  sprite?:Sprite; frame:number; flip:boolean; foot:number;
}
type RoomStep = {duration:number;draw:(progress:number) => void}
export type RoomActivity = 'idle'|'walking'|'jumping'|'settling'|'sleeping'|'waking'
type Gait = 'idle'|'turn'|'start'|'walk'|'stop'

function footLine(image:HTMLImageElement,layout:Sprite['layout'],frame:number) {
  const canvas = document.createElement('canvas')
  const w = canvas.width = layout.frameWidth, h = canvas.height = layout.frameHeight
  const ctx = canvas.getContext('2d',{willReadFrequently:true})!
  ctx.drawImage(image,(frame%layout.columns)*w,Math.floor(frame/layout.columns)*h,w,h,0,0,w,h)
  const {data} = ctx.getImageData(0,0,w,h)
  for (let y=h-1;y>=0;y--) {
    let count=0
    for (let x=0;x<w;x++) if (data[(y*w+x)*4+3]>=115) count++
    if (count>=4) return (y+1)/h
  }
  return .82
}

export async function loadRoomSprite(asset:MotionPreviewAsset) {
  if (!asset.imagePath || !asset.backgroundRemoved) throw new Error('动作素材不可用')
  const image = new Image()
  const url = await mediaObjectUrl(asset.imagePath)
  try {
    image.src=url
    await image.decode()
    const grid = {columns:asset.columns,rows:asset.rows}
    const layout = fixedSpriteLayout(image,asset.frames,grid)
    if (asset.action===catDefaultAction || asset.action===catSleepAction) {
      layout.loopFrames=createSpriteLayout(image,asset.frames,{...grid,avoidClippedFrames:true}).loopFrames
    }
    return {image,layout,fps:asset.fps,startFoot:footLine(image,layout,0),endFoot:footLine(image,layout,asset.frames-1)}
  } finally {
    URL.revokeObjectURL(url)
  }
}

const walkActions: readonly CatClipId[] = [catDefaultAction,
  'start_left','walk_left','stop_left','turn_right','start_right','walk_right','stop_right','turn_left']
const settlingClips = ['lower_to_crouch','crouch_to_lie','lie_to_sleep'] as const
const wakingClips = ['wake_up','lie_to_stand'] as const
const restActions = [...settlingClips,catSleepAction,...wakingClips]
export const roomActionClips = [...walkActions,catJumpAction,...restActions]

export function roomCapabilities(sprites:RoomSprites) {
  return {walk:walkActions.every(action=>sprites.has(action)),jump:sprites.get(catJumpAction)?.layout.frames===jumpFrameCount,
    rest:restActions.every(action=>sprites.has(action))}
}

function show(actor:RoomActor,sprite:Sprite,frame:number,flip:boolean,foot:number) {
  actor.sprite=sprite
  actor.frame=frame
  actor.flip=flip
  actor.foot=foot
}

function loopFrame(actor:RoomActor,sprites:RoomSprites,clip:CatClipId,ms:number,flip=false) {
  const sprite = sprites.get(clip)
  if (!sprite) return
  const intact = sprite.layout.loopFrames
  const frame = intact ? (intact[frameIndexAt(ms,intact.length||1,sprite.fps)]??0) : frameIndexAt(ms,sprite.layout.frames,sprite.fps)
  show(actor,sprite,frame,flip,sprite.startFoot)
}

const lerp = (from:number,to:number,t:number) => from+(to-from)*t
const facingToward = (direction:number,current:Facing):Facing => Math.abs(direction)<.13 ? current : direction<0 ? 'left' : 'right'

function playFrame(actor:RoomActor,sprite:Sprite,progress:number,flip=false) {
  const t = Math.min(1,progress)
  show(actor,sprite,Math.round(t*(sprite.layout.frames-1)),flip,lerp(sprite.startFoot,sprite.endFoot,t))
}

function* restMotion(actor:RoomActor,sprites:RoomSprites,waking:boolean):Generator<RoomStep,void> {
  for (const clip of waking ? wakingClips : settlingClips) {
    yield {duration:430,draw:t=>playFrame(actor,sprites.get(clip)!,t,actor.facing==='right')}
  }
}

function* jumpMotion(actor:RoomActor,sprites:RoomSprites,direction:GroundPoint):Generator<RoomStep,void> {
  const sprite = sprites.get(catJumpAction)!
  const from = actor.point, to = clampRoomPoint({x:from.x+direction.x*2.6,z:from.z+direction.z*2.6})
  const phases = ['charge','push','air','land'] as const satisfies readonly JumpStage[]
  for (const phase of phases) {
    yield {duration:jumpStageFrames[phase]/jumpFps*790,draw(t) {
      if (phase==='air') {
        actor.point=interpolatePoint(from,to,t)
        actor.height=3.8*t*(1-t)
      }
      show(actor,sprite,jumpFrameIndex(phase,t),actor.facing==='right',sprite.startFoot)
    }}
  }
}

const still = {x:0,z:0}
const gaitDuration = {turn:240,start:210,stop:200} as const

export function createRoomPlayer(sprites:RoomSprites) {
  const actor: RoomActor = {point:startPoint,height:0,facing:'left',frame:0,flip:false,foot:1}
  let activity: RoomActivity = 'idle'
  let gait: Gait = 'idle', clock = 0, turning: Facing = 'left'
  let velocity = still
  let animation: Generator<RoomStep,void>|undefined
  let step: RoomStep|undefined
  let stepTime = 0

  function setGait(next:Gait) {gait=next;clock=0}

  function nextStep() {
    const next = animation?.next()
    if (next && !next.done) {
      step=next.value
      stepTime=0
      step.draw(0)
    } else {
      step=undefined
      animation=undefined
      actor.height=0
      activity=activity==='settling' ? 'sleeping' : 'idle'
      setGait('idle')
    }
  }

  function action(intent:'jump'|'rest',direction:GroundPoint,camera:RoomCamera) {
    if (step) return
    const sleeping = activity==='sleeping'
    if (intent==='jump') {
      if (sleeping || sprites.get(catJumpAction)?.layout.frames!==jumpFrameCount) return
      actor.facing=facingToward(camera.screenDirection(direction),actor.facing)
      activity='jumping'
      animation=jumpMotion(actor,sprites,direction)
    } else {
      if (!restActions.every(clip=>sprites.has(clip))) return
      activity=sleeping ? 'waking' : 'settling'
      animation=restMotion(actor,sprites,sleeping)
    }
    velocity=still
    nextStep()
  }

  function walk(ms:number,input:GroundPoint,camera:RoomCamera,reduced:boolean) {
    const {x,z} = actor.point
    const ahead = clampRoomPoint({x:x+input.x,z:z+input.z})
    const direction = {x:ahead.x-x,z:ahead.z-z}
    const effort = Math.hypot(direction.x,direction.z)
    const moving = effort>.02
    if (gait==='turn' && clock>=gaitDuration.turn) {
      actor.facing=turning
      setGait(moving?'start':'idle')
    }
    if (gait!=='turn') {
      const facing = facingToward(camera.screenDirection(direction),actor.facing)
      if (moving && facing!==actor.facing) {turning=facing;setGait('turn')}
      else if (moving && (gait==='idle' || gait==='stop')) setGait('start')
      else if (!moving && (gait==='start' || gait==='walk')) setGait('stop')
    }
    if (gait==='start' && clock>=gaitDuration.start) setGait('walk')
    if (gait==='stop' && clock>=gaitDuration.stop) setGait('idle')
    clock+=ms

    const speed = gait==='turn' ? 0 : 4.5
    const weight = 1-Math.exp(-ms/75)
    velocity={x:lerp(velocity.x,direction.x*speed,weight),z:lerp(velocity.z,direction.z*speed,weight)}
    if (Math.hypot(velocity.x,velocity.z)>.02) {
      actor.point=clampRoomPoint({x:x+velocity.x*ms/1000,z:z+velocity.z*ms/1000})
    }
    activity=gait==='idle' ? 'idle' : 'walking'
    switch (gait) {
      case 'idle': loopFrame(actor,sprites,catDefaultAction,reduced?0:clock,actor.facing==='right'); break
      case 'walk': loopFrame(actor,sprites,`walk_${actor.facing}`,clock*(.74+.37*effort)); break
      default: {
        const clip = sprites.get(gait==='turn' ? `turn_${turning}` : `${gait}_${actor.facing}`)
        if (clip) playFrame(actor,clip,clock/gaitDuration[gait])
      }
    }
  }

  return {actor,action,
    update(ms:number,direction:GroundPoint,camera:RoomCamera,reduced:boolean):RoomActivity {
      if (step) {
        stepTime+=ms
        step.draw(Math.min(1,stepTime/step.duration))
        if (stepTime>=step.duration) nextStep()
      } else if (activity==='sleeping') {
        if (Math.hypot(direction.x,direction.z)>.08) action('rest',direction,camera)
        else {clock+=ms;loopFrame(actor,sprites,catSleepAction,reduced?0:clock,actor.facing==='right')}
      } else {
        walk(ms,direction,camera,reduced)
      }
      return activity
    },
  }
}
