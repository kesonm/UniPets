export interface SpriteLayout { frames: number; columns: number; rows: number; frameWidth: number; frameHeight: number; imageWidth: number; imageHeight: number; cropTop: number; cropHeight: number; background: 'opaque' | 'transparent'; trimmed: boolean; loopFrames?: number[] }
interface SpriteGridOptions { columns?: number; rows?: number; avoidClippedFrames?: boolean }
export function analyzeSpritePixels(image: { data: Uint8ClampedArray | Uint8Array; width: number; height: number }, frames?: number, grid?: SpriteGridOptions): SpriteLayout
export function createSpriteLayout(image: HTMLImageElement, frames?: number, grid?: SpriteGridOptions): SpriteLayout
export function fixedSpriteLayout(image: HTMLImageElement, frames: number, grid: { columns: number; rows: number }): SpriteLayout
export function frameGeometry(layout: SpriteLayout, index: number, width: number, height: number, padding?: number): { sx: number; sy: number; sw: number; sh: number; dx: number; dy: number; dw: number; dh: number }
export function drawSpriteFrame(context: CanvasRenderingContext2D, image: HTMLImageElement, layout: SpriteLayout, index: number, width: number, height: number, padding?: number): ReturnType<typeof frameGeometry>

export function frameIndexAt(elapsedMs: number, frames: number, fps?: number): number
