export type CatPoseId = 'stand_left' | 'crouch_left' | 'lie_left' | 'sleep_left' | 'step_left' | 'stand_right' | 'step_right' | 'sit_left' | 'sit_front' | 'sleep_front'
export type CatClipId = CatKeyAction | 'stand_idle' | 'lower_to_crouch' | 'crouch_to_lie' | 'lie_to_sleep' | 'sleep_breathe' | 'wake_up' | 'lie_to_stand' | 'start_left' | 'stop_left' | 'turn_right' | 'start_right' | 'stop_right' | 'turn_left' | 'stand_to_sit' | 'sit_to_stand'
  | 'side_sit_to_front' | 'front_sit_to_side' | 'front_sit_to_sleep' | 'front_sleep_to_sit'
export type CatFlowId = 'rest' | 'walk'
type SeatedMove = 'scratch_head'|'tail_wag'|'look_up'|'look_down'|'look_left'|'look_right'
export type CatKeyAction = 'stand_tail_gentle' | 'tail_fast' | 'look_up' | 'look_down' | 'look_left' | 'look_right' | 'groom_fur' | 'lick_paw' | 'sleep_breathe_clear' | 'walk_left' | 'walk_right' | 'jump'
  | `front_${SeatedMove|'groom_fur'|'lick_paw'|'sleep'}` | `side_${SeatedMove}`
export type FollowAction = 'follow_cursor'|'stop_follow_cursor'
export interface CatIdleGroup { id:'front'|'side';label:string;base:'front_tail_wag'|'side_tail_wag';actions:readonly CatKeyAction[] }
export interface CatClip { label: string; from: CatPoseId; to: CatPoseId; loop?: boolean; gesture?: boolean; sleep?: boolean; duration: 2 | 3; motion: string; travel?: -1 | 1; pace?: 'start' | 'stop' }
export interface CatFrameAsset {
  id: string; action: string | null; frames: number; fps: number; backgroundRemoved?: boolean | number;
  motionJoinable?: boolean | number | null; motionFromAssetId?: string | null; motionToAssetId?: string | null;
}
export interface CatManifest<T extends CatFrameAsset> { poses: Partial<Record<CatPoseId, string>>; assets: T[] }
export interface CatSequenceItem<T extends CatFrameAsset> { id: CatClipId; asset: T }
export interface CatTimelineEntry<T extends CatFrameAsset> extends CatSequenceItem<T> { count: number; frameMs: number; cycleMs: number; repeats: number; start: number; travel: number }
export interface CatTimeline<T extends CatFrameAsset> { entries: CatTimelineEntry<T>[]; duration: number; travel: number }
export const catPoses: Record<CatPoseId, {label: string; pose: string; view?: 'front'}>
export const catClips: Record<CatClipId, CatClip>
export const catFlows: Record<CatFlowId, {label: string; clips: CatClipId[]}>
export const catDefaultAction: 'stand_tail_gentle'
export const catSleepAction: 'sleep_breathe_clear'
export const catJumpAction: 'jump'
export const catFollowAction: 'follow_cursor'
export const catStopFollowAction: 'stop_follow_cursor'
export const catIdleGroups: readonly CatIdleGroup[]
export const catInteractiveActions: readonly ['walk_left','walk_right','jump']
export const catKeyActions: readonly CatKeyAction[]
export const catGenerationClips: readonly CatClipId[]
export const catReversedClips: Readonly<Partial<Record<CatClipId,CatClipId>>>
export const legacyPetGenerationClips: readonly CatClipId[]
export function canonicalCatAction(action: unknown): CatKeyAction | null
export function matchingCatClip<T extends CatFrameAsset>(key: CatClipId, manifest: CatManifest<T>, background?: boolean): T | undefined
export function availableCatClip<T extends CatFrameAsset>(key: CatClipId, manifest: CatManifest<T>, background?: boolean): T | undefined
export function resolveCatAction<T extends CatFrameAsset>(from: CatPoseId, target: CatKeyAction, manifest: CatManifest<T>, options?: {allowLegacyStand?: boolean}): {transitions: CatSequenceItem<T>[]; clip: CatSequenceItem<T>} | null
export function isCatSleep(action:unknown):boolean
export function canFollowCursor<T extends CatFrameAsset>(manifest:CatManifest<T>):boolean
export function resolveCatIdleBase<T extends CatFrameAsset>(from:CatPoseId,manifest:CatManifest<T>,preferred?:CatIdleGroup):CatKeyAction|null
export function pickCatIdleAction<T extends CatFrameAsset>(manifest:CatManifest<T>,idleMs:number,previous:CatKeyAction|null,random?:()=>number,from?:CatPoseId):CatKeyAction|null
export function resolveCatFlow<T extends CatFrameAsset>(key: CatFlowId, manifest: CatManifest<T>, requireTransparent?: boolean): CatSequenceItem<T>[] | null
export function catTimeline<T extends CatFrameAsset>(items: CatSequenceItem<T>[], connected?: boolean): CatTimeline<T>
export function catFrameAt<T extends CatFrameAsset>(timeline: CatTimeline<T>, elapsed: number): {entry: CatTimelineEntry<T>; frame: number; travel: number; ended: boolean} | null
