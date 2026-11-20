import test from 'node:test'
import assert from 'node:assert/strict'
import { catJumpLandmarks, deformJumpPoint, jumpPoseAt } from '../jump-motion.mjs'

const rig = {front:45,rear:150,floor:176,hip:110,scale:168}
const paws = (stage,p) => {
  const pose = jumpPoseAt(stage,p)
  return {
    front:deformJumpPoint(rig,rig.front,rig.floor,pose),
    rear:deformJumpPoint(rig,rig.rear,rig.floor,pose),
  }
}

test('the front feet lift while the back feet push off, then reach the ground first',()=>{
  const charge = jumpPoseAt('charge',1)
  assert.ok(deformJumpPoint(rig,rig.rear,rig.hip,charge).y>rig.hip+20)
  assert.deepEqual(paws('charge',1),paws('charge',0))
  assert.ok(paws('push',0.5).front.y<rig.floor-22)
  assert.equal(paws('push',0.5).rear.y,rig.floor)
  assert.equal(paws('push',1).rear.y,rig.floor)
  assert.ok(paws('air',0.33).rear.y<rig.floor-35)
  assert.ok(paws('air',0.73).front.x<rig.front-20)
  assert.equal(paws('air',1).front.y,rig.floor)
  assert.ok(paws('air',1).rear.y<rig.floor-20)
  assert.deepEqual(paws('land',0.27).front,{x:rig.front,y:rig.floor})
  assert.equal(paws('land',0.64).rear.y,rig.floor)
})

test('all jump stages share exact boundary poses and finish at the normal standing pose',()=>{
  const order = ['charge','push','air','land']
  for (let i=0;i<order.length;i++) {
    assert.deepEqual(jumpPoseAt(order[i],1),jumpPoseAt(order[(i+1)%order.length],0))
  }
})

test('limb landmarks follow separated paws and avoid guessing on a fully opaque image',()=>{
  const width=192,height=192,data=new Uint8ClampedArray(width*height*4)
  const fill = (left,top,right,bottom)=>{
    for (let y=top;y<bottom;y++) for (let x=left;x<right;x++) data[(y*width+x)*4+3]=255
  }
  fill(24,42,166,125)
  fill(30,120,61,177)
  fill(136,120,164,177)
  const fitted = catJumpLandmarks(data,width,height)
  assert.equal(fitted.front,45)
  assert.equal(fitted.rear,149.5)
  assert.equal(fitted.floor,176)
  assert.ok(fitted.hip<fitted.floor)
  fill(0,0,width,height)
  assert.equal(catJumpLandmarks(data,width,height),null)
})
