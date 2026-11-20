export const catPoses = {
  stand_left: { label: '左向站立', pose: '猫朝画面左侧，四爪平稳着地，自然站立，睁眼，头保持水平。' },
  crouch_left: { label: '左向蹲伏', pose: '猫朝画面左侧，四爪保持原地，屈腿压低身体，胸腹尚未贴地，头仍抬着，睁眼。' },
  lie_left: { label: '清醒趴卧', pose: '猫朝画面左侧，胸腹着地，前爪平放并略向前，后腿收在身体旁，头略抬，眼睛睁开。' },
  sleep_left: { label: '闭眼趴睡', pose: '猫朝画面左侧，胸腹着地，保持趴卧的四肢位置，头放在前爪上，眼睛闭合。' },
  step_left: { label: '左走接地帧', pose: '猫侧身朝画面左侧，处于自然行走的一步中，靠镜头侧前爪向前落地，另一侧后爪支撑，身体平稳。' },
  stand_right: { label: '右向站立', pose: '猫朝画面右侧，四爪平稳着地，自然站立，睁眼，头保持水平。' },
  step_right: { label: '右走接地帧', pose: '猫侧身朝画面右侧，处于自然行走的一步中，靠镜头侧前爪向前落地，另一侧后爪支撑，身体平稳。' },
  sit_left: { label: '左向蹲坐', pose: '猫面向画面左侧，后腿自然收在身体下方，臀部着地，两只前爪平放在身前支撑身体。头抬起、眼睛睁开，尾巴自然落在身侧。' },
  sit_front: { label: '正面坐姿', view:'front', pose: '猫面朝镜头端坐，臀部在地，两只前爪并立在身体正前方，两耳、双眼、胸腹正面清楚可见，尾巴自然绕向一侧并入镜。' },
  sleep_front: { label: '正面趴睡', view:'front', pose: '猫的脸和胸口正对镜头，平稳趴卧闭眼，头轻靠在前爪上，两侧肩膀放松贴近地面，体型和花纹自然，尾巴沿身体一侧放松。' },
}

export const catJumpAction = 'jump'
export const catFollowAction = 'follow_cursor'
export const catStopFollowAction = 'stop_follow_cursor'

const baseClips = {
  stand_idle: { label: '站立待机', from: 'stand_left', to: 'stand_left', loop: true, duration: 2, motion: '四爪站稳，只有极轻的呼吸，回到同一呼吸相位。' },
  lower_to_crouch: { label: '站立到蹲伏', from: 'stand_left', to: 'crouch_left', duration: 2, motion: '缓缓屈腿压低重心，四爪沿地面保持在原有位置，头稍向前。' },
  crouch_to_lie: { label: '蹲伏到趴卧', from: 'crouch_left', to: 'lie_left', duration: 2, motion: '前爪向前伸，先降低胸部，再让腹部自然落地，头保持抬起。' },
  lie_to_sleep: { label: '趴卧到入睡', from: 'lie_left', to: 'sleep_left', duration: 2, motion: '四肢和身体姿势稳定，头慢慢靠到前爪，眼睛缓缓闭合。' },
  sleep_breathe: { label: '趴睡呼吸', from: 'sleep_left', to: 'sleep_left', loop: true, duration: 3, motion: '全程闭眼趴卧，头、尾巴和爪子静止，只表现一次自然轻缓的胸腹起伏。结尾与开头是同一呼吸相位。' },
  wake_up: { label: '醒来抬头', from: 'sleep_left', to: 'lie_left', duration: 2, motion: '逐渐睁眼，轻轻抬起头，胸腹和四肢仍留在趴卧位置。' },
  lie_to_stand: { label: '趴卧起身', from: 'lie_left', to: 'stand_left', duration: 2, motion: '前爪撑起胸口，随后以自然重心变化抬起后半身，恢复四爪站立。' },
  start_left: { label: '向左起步', from: 'stand_left', to: 'step_left', duration: 2, travel: -1, pace: 'start', motion: '重心前移，向左自然迈出第一步，结束在目标前爪接地的相位。' },
  walk_left: { label: '向左走', from: 'step_left', to: 'step_left', loop: true, duration: 2, travel: -1, motion: '保持朝左，原地演示一个完整的自然步态周期，前后腿交替支撑，回到同一前爪接地相位。' },
  stop_left: { label: '向左收步', from: 'step_left', to: 'stand_left', duration: 2, travel: -1, pace: 'stop', motion: '从前爪接地开始减速，另一只爪收齐，四爪站稳后保持朝左。' },
  turn_right: { label: '从左转向右', from: 'stand_left', to: 'stand_right', duration: 2, motion: '原地用小步改变身体方向，先转头和肩，再跟随臀部，最终四爪站稳朝右。固定镜头。' },
  start_right: { label: '向右起步', from: 'stand_right', to: 'step_right', duration: 2, travel: 1, pace: 'start', motion: '重心前移，向右自然迈出第一步，结束在目标前爪接地的相位。' },
  walk_right: { label: '向右走', from: 'step_right', to: 'step_right', loop: true, duration: 2, travel: 1, motion: '保持朝右，原地演示一个完整的自然步态周期，前后腿交替支撑，回到同一前爪接地相位。' },
  stop_right: { label: '向右收步', from: 'step_right', to: 'stand_right', duration: 2, travel: 1, pace: 'stop', motion: '从前爪接地开始减速，另一只爪收齐，四爪站稳后保持朝右。' },
  turn_left: { label: '转回左侧', from: 'stand_right', to: 'stand_left', duration: 2, motion: '从朝右站立开始，用小步原地转身，最后四爪站稳朝左。固定镜头。' },
  stand_tail_gentle: { label: '站立 · 轻摆尾', from: 'stand_left', to: 'stand_left', loop: true, duration: 3, motion: '四爪全程站稳，胸腹随一次自然呼吸轻微起伏，尾尖慢慢向一侧摆出并回到原位。头部、躯干和爪子的位置稳定。最终回到相同的尾巴位置和呼吸相位。' },
  tail_fast: { label: '快速摆尾', from: 'stand_left', to: 'stand_left', gesture: true, duration: 2, motion: '从自然站立开始，尾尖短促左右摆动两次，随后放缓并回到首帧位置。四爪站稳，躯干不随尾巴摇晃。' },
  look_up: { label: '抬头', from: 'stand_left', to: 'stand_left', gesture: true, duration: 2, motion: '保持站立，视线向上，头轻轻抬高，短暂停留，再回到首帧高度。四爪和躯干固定。' },
  look_down: { label: '低头', from: 'stand_left', to: 'stand_left', gesture: true, duration: 2, motion: '保持站立，头自然低一点，视线落到前爪前方，短暂停留，再抬回首帧角度。四爪和躯干固定。' },
  look_left: { label: '左看', from: 'stand_left', to: 'stand_left', gesture: true, duration: 2, motion: '站在原地，头和视线轻轻偏向画面左侧，短暂停留，再转回首帧。只动头和颈部，其余姿势稳定。' },
  look_right: { label: '右看', from: 'stand_left', to: 'stand_left', gesture: true, duration: 2, motion: '站在原地，头与视线向画面右侧侧瞥，幅度自然，短暂停留，再转回首帧。身体保持朝向，四爪不移位。' },
  stand_to_sit: { label: '站立到蹲坐', from: 'stand_left', to: 'sit_left', duration: 2, motion: '面向左侧，前爪在原地支撑，屈后腿慢慢落下臀部，进入放松蹲坐，头自然抬起。' },
  groom_fur: { label: '舔毛', from: 'sit_left', to: 'sit_left', gesture: true, duration: 3, motion: '全程自然蹲坐，低头舔自己的胸口或肩侧毛发两下，随后抬头回到首帧。前爪支撑，臀部保持着地，不转身。' },
  lick_paw: { label: '舔前爪', from: 'sit_left', to: 'sit_left', gesture: true, duration: 3, motion: '自然蹲坐时把靠近镜头的一只前爪提到嘴边，轻舔两下，放回地面并抬头回到首帧。只舔自己的前爪。' },
  sit_to_stand: { label: '蹲坐到站立', from: 'sit_left', to: 'stand_left', duration: 2, motion: '保持向左，重心移到前爪，由后腿撑起臀部，缓缓回到四爪平稳着地的站姿。' },
  sleep_breathe_clear: { label: '趴睡呼吸', from: 'sleep_left', to: 'sleep_left', loop: true, duration: 3, motion: '始终闭眼趴睡，头靠前爪。胸腹和侧腹毛绒在一次缓慢吸气时轻而清晰地撑起，在呼气时自然回落。头、脚爪和尾巴保持稳定，腹部运动连续，末帧回到首帧的呼气相位。' },
  [catJumpAction]: { label: '跳跃', from: 'stand_left', to: 'stand_left', gesture: true, duration: 2, motion: '后腿蓄力蹬地，前爪先抬、先落地。' },
}

const seatedMoves = {
  scratch_head:{label:'挠头',motion:'抬起一只后爪，轻挠耳后两次，后爪落回原位置，两只前爪始终撑地，头略向挠处偏，最后恢复首帧坐姿。'},
  tail_wag:{label:'摇尾巴',loop:true,motion:'尾尖在地面附近轻轻从身体一侧扫出去一次再回来，呼吸自然，臀部与前爪固定，结尾和开头的尾尖位置一致。'},
  look_up:{label:'抬头',motion:'抬下巴并把目光移到上方，短暂停留后回到首帧角度。只动头和颈部。'},
  look_down:{label:'低头',motion:'低下下巴看身前的地面，再抬回首帧，臀部、肩部和前爪留在原地。'},
  look_left:{label:'左看',motion:'只转动头和眼睛，朝画面左侧看一眼，再转回首帧视线，躯干朝向与四爪不动。'},
  look_right:{label:'右看',motion:'只转动头和眼睛，朝画面右侧看一眼，再转回首帧视线，躯干朝向与四爪不动。'},
}

function seatedClips(view,pose,moves) {
  const prompt = view==='front' ? '身体始终保持面朝镜头的坐姿，固定正视镜头。' : '身体始终保持朝画面左侧的坐姿，固定侧视镜头。'
  return Object.fromEntries(Object.entries(moves).map(([key,move])=>[`${view}_${key}`,{
    ...move,from:pose,to:pose,duration:move.loop ? 3 : 2,gesture:!move.loop,motion:prompt+move.motion,
  }]))
}

const frontMoves = seatedClips('front','sit_front',{
  groom_fur:{label:'舔毛',motion:'低头轻舔胸前毛发两下，再抬头回到首帧，前爪留在原地，臀部一直着地。'},
  lick_paw:{label:'舔前爪',motion:'将一只前爪抬到口边轻舔两下，再放回地面。眼睛最后回到首帧视线，臀部保持着地。'},
  ...seatedMoves,
})
const sideMoves = seatedClips('side','sit_left',seatedMoves)
const seatedTransitions = {
  side_sit_to_front: {label:'侧坐转正面',from:'sit_left',to:'sit_front',duration:2,motion:'臀部保持坐地，前爪小步换位，头肩自然带动身体从左向侧坐转为面朝镜头端坐。'},
  front_sit_to_side: {label:'正面转侧坐',from:'sit_front',to:'sit_left',duration:2,motion:'臀部保持坐地，前爪小步换位，头肩带动躯干从面朝镜头转成朝左侧坐。'},
  front_sit_to_sleep: {label:'正面坐下趴睡',from:'sit_front',to:'sleep_front',duration:2,motion:'猫保持面朝镜头，前爪微伸，胸腹先贴地，再慢慢把头放到前爪上闭眼入睡，臀部和尾巴自然落下。'},
  front_sleep_to_sit: {label:'正面醒来坐起',from:'sleep_front',to:'sit_front',duration:2,motion:'正面趴睡的猫睁眼抬头，前爪撑起胸部，后腿收拢，坐稳并面朝镜头。'},
}

export const catReversedClips = {stand_to_sit:'sit_to_stand',front_sit_to_side:'side_sit_to_front',front_sleep_to_sit:'front_sit_to_sleep'}

export const catClips = {
  ...baseClips,...frontMoves,...sideMoves,...seatedTransitions,
  front_sleep:{label:'趴着睡觉',from:'sleep_front',to:'sleep_front',loop:true,sleep:true,duration:3,motion:'全程面朝镜头闭眼趴睡，头靠前爪且四肢保持休息姿势，只让胸腹随缓慢呼吸自然起伏，结尾回到开头的呼吸相位。'},
}

export const catFlows = {
  rest: { label: '入睡与醒来', clips: ['stand_idle', 'lower_to_crouch', 'crouch_to_lie', 'lie_to_sleep', 'sleep_breathe', 'wake_up', 'lie_to_stand'] },
  walk: { label: '左走转右走', clips: ['stand_idle', 'start_left', 'walk_left', 'stop_left', 'turn_right', 'start_right', 'walk_right', 'stop_right', 'turn_left'] },
}

export const catDefaultAction = 'stand_tail_gentle'
export const catSleepAction = 'sleep_breathe_clear'
export const catIdleGroups = [
  {id:'front',label:'正面坐着',base:'front_tail_wag',actions:['front_groom_fur','front_lick_paw','front_scratch_head','front_sleep','front_tail_wag','front_look_up','front_look_down','front_look_left','front_look_right']},
  {id:'side',label:'侧面坐着',base:'side_tail_wag',actions:['groom_fur','lick_paw','side_scratch_head',catSleepAction,'side_tail_wag','side_look_up','side_look_down','side_look_left','side_look_right']},
]
const archivedStandingMoves = ['tail_fast','look_up','look_down','look_left','look_right']
export const catInteractiveActions = ['walk_left','walk_right',catJumpAction]
export const catKeyActions = [...new Set([catDefaultAction,...archivedStandingMoves,...catIdleGroups.flatMap(group=>group.actions),...catInteractiveActions])]
const legacyClips = { [catDefaultAction]:'stand_idle', [catSleepAction]:'sleep_breathe' }
const currentClips = { stand_idle:catDefaultAction, sleep_breathe:catSleepAction }
export const legacyPetGenerationClips = [catDefaultAction, ...Object.keys(baseClips).filter(key=>key!==catDefaultAction && key!==catJumpAction && !Object.hasOwn(currentClips,key))]
export const catGenerationClips = [catDefaultAction,...Object.keys(catClips).filter(key=>key!==catDefaultAction && key!==catJumpAction && !Object.hasOwn(currentClips,key) && !Object.hasOwn(catReversedClips,key) && !archivedStandingMoves.includes(key))]

export function isCatSleep(action) { return action===catSleepAction || action==='front_sleep' }

export function canonicalCatAction(action) {
  return Object.hasOwn(currentClips,action) ? currentClips[action] : catKeyActions.includes(action) ? action : null
}

function matchesAnchors(asset, key, manifest, background) {
  const { from, to } = catClips[key]
  return asset.action === key && (background === undefined || Boolean(asset.backgroundRemoved) === background) &&
    Boolean(manifest.poses[from]) && Boolean(manifest.poses[to]) &&
    asset.motionFromAssetId === manifest.poses[from] && asset.motionToAssetId === manifest.poses[to]
}

export function matchingCatClip(key, manifest, background) {
  return manifest.assets.find(asset => Boolean(asset.motionJoinable) && matchesAnchors(asset,key,manifest,background))
}

export function availableCatClip(key, manifest, background) {
  return matchingCatClip(key,manifest,background) ?? manifest.assets.find(asset=>matchesAnchors(asset,key,manifest,background))
}

export function resolveCatAction(from, target, manifest, {allowLegacyStand = true} = {}) {
  if (!Object.hasOwn(catPoses,from) || !catKeyActions.includes(target)) return null
  const candidate = key => availableCatClip(key,manifest,true)
  const legacy = target===catDefaultAction && !allowLegacyStand ? undefined : legacyClips[target]
  const asset = matchingCatClip(target,manifest,true) ?? (legacy && candidate(legacy)) ?? candidate(target)
  if (!asset) return null
  const goal = catClips[target].from
  const edges = Object.entries(catClips).filter(([,clip])=>clip.from!==clip.to)
  const seen = new Set([from])
  const queue = [{pose:from,transitions:[]}]
  for (const {pose,transitions} of queue) {
    if (pose === goal) return {transitions,clip:{id:target,asset}}
    for (const [id,clip] of edges) {
      if (clip.from !== pose || seen.has(clip.to)) continue
      const asset = candidate(id)
      if (!asset) continue
      seen.add(clip.to)
      queue.push({pose:clip.to,transitions:[...transitions,{id,asset}]})
    }
  }
  return null
}

export function resolveCatIdleBase(from,manifest,preferred) {
  const groups = preferred ? [preferred,...catIdleGroups.filter(group=>group!==preferred)] : catIdleGroups
  for (const group of groups) if (resolveCatAction(from,group.base,manifest)) return group.base
  return resolveCatAction(from,catDefaultAction,manifest) ? catDefaultAction : null
}

export function canFollowCursor(manifest) {
  return Boolean(resolveCatAction('stand_left','walk_left',manifest) && resolveCatAction('stand_left','walk_right',manifest) &&
    resolveCatAction('step_left','walk_right',manifest) && resolveCatAction('step_right','walk_left',manifest) &&
    resolveCatAction('step_left',catDefaultAction,manifest) && resolveCatAction('step_right',catDefaultAction,manifest))
}

const idleWeights = {tail_fast:1,groom_fur:2,lick_paw:2,front_groom_fur:2,front_lick_paw:2,front_scratch_head:2,side_scratch_head:2}

export function pickCatIdleAction(manifest, idleMs, previous, random = Math.random, from = 'stand_left') {
  const seated = catIdleGroups.flatMap(group=>group.actions.filter(key=>key!==group.base))
  const isReady = key=>{
    if (isCatSleep(key) && idleMs<45_000) return false
    const route = resolveCatAction(from,key,manifest)
    const clip = catClips[key]
    return route && (!clip.loop || route.clip.asset.motionJoinable) && resolveCatIdleBase(clip.to,manifest,catIdleGroups.find(group=>group.actions.includes(key)))
  }
  let ready = seated.filter(isReady)
  if (!ready.length) ready = archivedStandingMoves.filter(isReady)
  const choices = ready.length>1 ? ready.filter(key=>key!==previous) : ready
  const weights = choices.map(key=>isCatSleep(key) ? 1 : idleWeights[key] ?? 4)
  let position = random()*weights.reduce((sum,weight)=>sum+weight,0)
  for (const [index,weight] of weights.entries()) {
    position -= weight
    if (position<0) return choices[index]
  }
  return choices.at(-1) ?? null
}

export function resolveCatFlow(key, manifest, requireTransparent = false) {
  const flow = Object.hasOwn(catFlows, key) ? catFlows[key] : undefined
  if (!flow) return null
  const backgrounds = requireTransparent ? [true] : [true, false]
  for (const background of backgrounds) {
    const entries = flow.clips.map(id => ({ id, asset: matchingCatClip(id, manifest, background) ??
      (currentClips[id] && matchingCatClip(currentClips[id],manifest,background)) }))
    if (entries.every(entry => entry.asset)) return entries
  }
  return null
}

function travelAt(entry, progress) {
  const clip = catClips[entry.id]
  const speedIntegral = clip.pace === 'start' ? progress ** 2 / 2 : clip.pace === 'stop' ? progress - progress ** 2 / 2 : progress
  return (clip.travel ?? 0) * entry.cycleMs / 1000 * speedIntegral
}

// The terminal anchor of one cell is the first frame of the next. Skip the
// duplicate anchor at that cut and at loop wraps, but retain it on the final draw.
export function catTimeline(items, connected = false) {
  let duration = 0
  let travel = 0
  const entries = items.map(({ id, asset }) => {
    const count = Math.max(1, asset.frames - (connected || (catClips[id].loop && asset.motionJoinable) ? 1 : 0))
    const frameMs = 1000 / asset.fps
    const cycleMs = count * frameMs
    const repeats = connected && id === 'sleep_breathe' ? 2 : 1
    const entry = { id, asset, count, frameMs, cycleMs, repeats, start: duration, travel }
    duration += cycleMs * repeats
    travel += travelAt(entry, 1) * repeats
    return entry
  })
  return { entries, duration, travel }
}

export function catFrameAt(timeline, elapsed) {
  const { entries, duration, travel } = timeline
  if (!entries.length) return null
  if (elapsed >= duration) {
    const entry = entries.at(-1)
    return { entry, frame: entry.asset.frames - 1, travel, ended: true }
  }
  const entry = entries.find(item => elapsed < item.start + item.cycleMs * item.repeats)
  if (!entry) return null
  const relative = Math.max(0, elapsed - entry.start)
  const cycle = Math.floor(relative / entry.cycleMs)
  const within = relative - cycle * entry.cycleMs
  return {
    entry, frame: Math.min(entry.count - 1, Math.floor(within / entry.frameMs + 1e-7)),
    travel: entry.travel + travelAt(entry, 1) * cycle + travelAt(entry, within / entry.cycleMs), ended: false,
  }
}
