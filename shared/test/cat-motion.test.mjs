import test from 'node:test'
import assert from 'node:assert/strict'
import { canFollowCursor, canonicalCatAction, catClips, catDefaultAction, catFlows, catFrameAt, catGenerationClips, catIdleGroups, catJumpAction, catKeyActions, catPoses, catSleepAction, catTimeline, pickCatIdleAction, resolveCatAction, resolveCatFlow, resolveCatIdleBase } from '../cat-motion.mjs'

const poses = Object.fromEntries(Object.keys(catPoses).map(key=>[key,`pose-${key}`]))
const assets = Object.entries(catClips).map(([action,clip])=>({
  id:action, action, fps:12, frames:clip.duration*12, motionJoinable:1, backgroundRemoved:1,
  motionFromAssetId:poses[clip.from], motionToAssetId:poses[clip.to],
}))

test('switches from the current pose using only the necessary transition clips',()=>{
  const manifest={poses,assets}
  const route=(from,target)=>resolveCatAction(from,target,manifest).transitions.map(step=>step.id)
  assert.deepEqual(route('step_left','walk_right'),['stop_left','turn_right','start_right'])
  assert.deepEqual(route('sleep_left','walk_left'),['wake_up','lie_to_stand','start_left'])
  assert.deepEqual(route('stand_left',catSleepAction),['lower_to_crouch','crouch_to_lie','lie_to_sleep'])
  assert.deepEqual(route('sleep_left',catSleepAction),[])
  assert.deepEqual(route('stand_left','lick_paw'),['stand_to_sit'])
  assert.deepEqual(route('sit_left',catDefaultAction),['sit_to_stand'])
  for (const key of catKeyActions) assert.equal(resolveCatAction('stand_left',key,manifest).clip.id,key)

  const candidate={...assets.find(a=>a.action==='wake_up'),id:'candidate',motionJoinable:0}
  assert.equal(resolveCatAction('sleep_left',catDefaultAction,{poses,assets:[candidate,...assets]}).transitions[0].asset.id,'wake_up')
  const fallback=[candidate,...assets.filter(a=>a.action!=='wake_up')]
  assert.equal(resolveCatAction('sleep_left',catDefaultAction,{poses,assets:fallback}).transitions[0].asset.id,'candidate')
  assert.equal(resolveCatAction('sleep_left',catDefaultAction,{poses,assets:fallback.slice(1)}),null)
  const opaque={...candidate,backgroundRemoved:0}
  assert.equal(resolveCatAction('sleep_left',catDefaultAction,{poses,assets:[opaque,...fallback.slice(1)]}),null)
})

test('old stand and sleep assets are valid fallbacks without appearing in new batches',()=>{
  assert.equal(canonicalCatAction('stand_idle'),catDefaultAction)
  assert.equal(canonicalCatAction('sleep_breathe'),catSleepAction)
  assert.equal(canonicalCatAction('stand_to_sit'),null)
  for (const key of ['stand_idle','sleep_breathe']) {
    assert.ok(!catKeyActions.includes(key) && !catGenerationClips.includes(key))
    const target = canonicalCatAction(key)
    const previous = assets.filter(asset=>asset.action!==target)
    assert.equal(resolveCatAction('stand_left',target,{poses,assets:previous}).clip.asset.id,key)
    const reviewed = {...assets.find(asset=>asset.action===target),motionJoinable:0}
    assert.equal(resolveCatAction('stand_left',target,{poses,assets:[reviewed,...previous]}).clip.asset.id,key)
  }
})

test('manual selection of gentle tail uses its own transparent clip, while standing can use the old asset',()=>{
  const legacy = assets.filter(asset=>asset.action!==catDefaultAction)
  const manual = {allowLegacyStand:false}
  assert.equal(resolveCatAction('stand_left',catDefaultAction,{poses,assets:legacy},manual),null)
  assert.equal(resolveCatAction('stand_left',catDefaultAction,{poses,assets:legacy}).clip.asset.action,'stand_idle')
  const gentle = {...assets.find(asset=>asset.action===catDefaultAction),motionJoinable:0}
  const manifest = {poses,assets:[gentle,...legacy]}
  assert.equal(resolveCatAction('stand_left',catDefaultAction,manifest,manual).clip.asset.action,catDefaultAction)
  assert.equal(resolveCatAction('stand_left',catDefaultAction,manifest).clip.asset.action,'stand_idle')
  assert.equal(resolveCatAction('stand_left',catDefaultAction,{poses,assets:[{...gentle,backgroundRemoved:0},...legacy]},manual),null)
})

test('idle selection uses connected assets, gives small moves more weight and defers sleep',()=>{
  const select = (keys,idleMs,previous,value) => pickCatIdleAction({poses,assets:assets.filter(asset=>keys.includes(asset.action))},idleMs,previous,()=>value)
  const headAndTail = [catDefaultAction,'look_up','tail_fast']
  assert.ok(catKeyActions.includes(catJumpAction) && !catGenerationClips.includes(catJumpAction))
  assert.equal(select([catDefaultAction,catJumpAction],50_000,null,0),null)
  assert.equal(select(headAndTail,20_000,null,0.18),'tail_fast')
  assert.equal(select(headAndTail,20_000,null,0.21),'look_up')
  assert.equal(select(headAndTail,20_000,'look_up',0.99),'tail_fast')
  assert.equal(select([catDefaultAction,'lick_paw','stand_to_sit'],50_000,null,0),null,'grooming needs a return route')
  assert.equal(select([catDefaultAction,'lick_paw','stand_to_sit','sit_to_stand'],50_000,null,0),'lick_paw')
  assert.equal(select(catFlows.rest.clips,44_999,null,0),null)
  assert.equal(select(catFlows.rest.clips,45_000,null,0),catSleepAction)
  const rough = assets.filter(asset=>catFlows.walk.clips.includes(asset.action)).map(asset=>asset.action==='walk_right'?{...asset,motionJoinable:0}:asset)
  assert.equal(pickCatIdleAction({poses,assets:rough},20_000,null,()=>0.99),null)
  assert.ok(canFollowCursor({poses,assets:rough}))
  assert.equal(canFollowCursor({poses,assets:rough.filter(a=>a.action!=='stop_right')}),false)
})

test('front and side idle choices use independent seated actions and compatible sleep transitions',()=>{
  const manifest = {poses,assets}
  const [front,side] = catIdleGroups
  const keys = [...front.actions,...side.actions]
  assert.equal(front.actions.length,9)
  assert.equal(side.actions.length,9)
  assert.equal(new Set(keys).size,18)
  assert.equal(resolveCatIdleBase('stand_left',manifest),front.base)
  assert.equal(resolveCatIdleBase('sleep_left',manifest,side),side.base)
  assert.deepEqual(resolveCatAction('sit_front','front_sleep',manifest).transitions.map(step=>step.id),['front_sit_to_sleep'])
  assert.deepEqual(resolveCatAction('sleep_front','walk_left',manifest).transitions.map(step=>step.id),['front_sleep_to_sit','front_sit_to_side','sit_to_stand','start_left'])
  const sideOnly = {...manifest,assets:assets.filter(asset=>!asset.action.startsWith('front_') && asset.action!=='side_sit_to_front')}
  assert.equal(resolveCatIdleBase('stand_left',sideOnly),side.base)
  assert.equal(resolveCatAction('sit_left','front_scratch_head',sideOnly),null)
})

test('both flows follow the current pose anchors through every intermediate phase',()=>{
  for (const key of Object.keys(catFlows)) {
    const items = resolveCatFlow(key,{poses,assets},true)
    assert.deepEqual(items.map(item=>item.id),catFlows[key].clips)
    for (let index=1;index<items.length;index++) assert.equal(items[index-1].asset.motionToAssetId,items[index].asset.motionFromAssetId)
    assert.equal(items[0].asset.motionFromAssetId,items.at(-1).asset.motionToAssetId)
  }
  assert.equal(resolveCatFlow('rest',{poses:{...poses,sleep_left:'new-photo'},assets}),null)
  const mixed = assets.map(asset=>asset.action==='stop_left'?{...asset,backgroundRemoved:0}:asset)
  assert.equal(resolveCatFlow('walk',{poses,assets:mixed}),null)
})

test('playback cuts on the shared pose while preserving breathing repeats and a continuous walk trajectory',()=>{
  const rest = catTimeline(resolveCatFlow('rest',{poses,assets}),true)
  const sleep = rest.entries.find(entry=>entry.id==='sleep_breathe')
  const wake = rest.entries.find(entry=>entry.id==='wake_up')
  assert.equal(wake.start,sleep.start+sleep.cycleMs*2)
  const wrap = catFrameAt(rest,sleep.start+sleep.cycleMs+0.01)
  assert.equal(wrap.entry.id,'sleep_breathe')
  assert.equal(wrap.frame,0)
  const after = catFrameAt(rest,wake.start)
  assert.equal(after.entry.id,'wake_up')
  assert.equal(after.frame,0)
  assert.equal(catFrameAt(rest,rest.duration).ended,true)

  const walk = catTimeline(resolveCatFlow('walk',{poses,assets}),true)
  const turn = walk.entries.find(entry=>entry.id==='turn_right')
  const outgoing = catFrameAt(walk,turn.start-0.01)
  const incoming = catFrameAt(walk,turn.start)
  assert.equal(outgoing.entry.id,'stop_left')
  assert.equal(outgoing.frame,outgoing.entry.asset.frames-2)
  assert.equal(incoming.entry.id,'turn_right')
  assert.ok(Math.abs(outgoing.travel-incoming.travel)<1e-6)
  assert.equal(catFrameAt(walk,turn.start+turn.cycleMs/2).travel,incoming.travel)
  assert.ok(incoming.travel<0)
  assert.ok(Math.abs(catFrameAt(walk,walk.duration).travel)<1e-6)
})
