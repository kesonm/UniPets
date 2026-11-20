export type JumpStage = 'charge'|'push'|'air'|'land'
type Point = {x:number;y:number}
type Limb = {root:number[];paw:number[];bend:number}
type JumpPose = {front:Limb;rear:Limb}
type JumpMesh = {front:number;rear:number;floor:number;hip:number;scale:number;xs:number[];ys:number[];width:number;height:number}
export const jumpStageFrames: Record<JumpStage,number>
export const jumpFps: number
export const jumpFrameCount: number
export function jumpFrameIndex(stage:JumpStage,progress:number): number
export function jumpPoseAt(stage:JumpStage,progress:number): JumpPose
export function buildJumpMesh(data:Uint8Array|Uint8ClampedArray,width:number,height:number): JumpMesh|null
export function jumpTriangles(rig:JumpMesh,pose:JumpPose,rect:{dx:number;dy:number;dw:number;dh:number}): IterableIterator<{points:Point[];matrix:number[]}>
