export type GroundPoint = {x:number;z:number}
export type ScreenPoint = {x:number;y:number}
export type RoomVector = [number,number,number]
export type RoomView = {azimuth:number;elevation:number;zoom:number}

export const floorHalfSize = 42
export const startPoint: GroundPoint = {x:0,z:0}
export const defaultRoomView: RoomView = {azimuth:.62,elevation:.48,zoom:1}
export const roomDistance = (a:GroundPoint,b:GroundPoint) => Math.hypot(a.x-b.x,a.z-b.z)
export const interpolatePoint = (a:GroundPoint,b:GroundPoint,t:number):GroundPoint => ({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t})
const clamp = (value:number,min:number,max:number) => Math.max(min,Math.min(max,value))
const dot = (a:RoomVector,b:RoomVector) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2]
const walkLimit = floorHalfSize-1.2

export function clampRoomPoint(point:GroundPoint):GroundPoint {
  return {x:clamp(point.x,-walkLimit,walkLimit),z:clamp(point.z,-walkLimit,walkLimit)}
}

export function landscapeOffset(x:number,y:number,rotated:boolean):ScreenPoint {
  return rotated ? {x:y,y:-x} : {x,y}
}

export function orbitRoom(view:RoomView,dx:number,dy:number) {
  view.azimuth=(view.azimuth-dx)%(2*Math.PI)
  view.elevation=clamp(view.elevation+dy,.22,1.24)
}

export function zoomRoom(view:RoomView,factor:number) {
  view.zoom=clamp(view.zoom*factor,.72,1.5)
}

// Camera coordinates are shared by WebGL and by picking the point on the floor.
export function roomCamera(view:RoomView,aspect:number,focus:GroundPoint=startPoint) {
  const {azimuth,elevation,zoom} = view
  const cosAzimuth = Math.cos(azimuth), sinAzimuth = Math.sin(azimuth)
  const cosElevation = Math.cos(elevation), sinElevation = Math.sin(elevation)
  const forward: RoomVector = [-sinAzimuth*cosElevation,-sinElevation,-cosAzimuth*cosElevation]
  const right: RoomVector = [cosAzimuth,0,-sinAzimuth]
  const up: RoomVector = [-sinAzimuth*sinElevation,cosElevation,-cosAzimuth*sinElevation]
  const distance = 12.8*Math.max(1,1.2/aspect)*zoom
  const eye: RoomVector = [focus.x-forward[0]*distance,1.05-forward[1]*distance,focus.z-forward[2]*distance]
  const tangent = Math.tan(.32), horizontal = tangent*aspect
  const near=.5, far=100
  const depthScale = (far+near)/(far-near), depthOffset = 2*far*near/(far-near)
  const cameraDepth = -dot(forward,eye)
  const projection = new Float32Array([
    right[0]/horizontal,up[0]/tangent,forward[0]*depthScale,forward[0],
    right[1]/horizontal,up[1]/tangent,forward[1]*depthScale,forward[1],
    right[2]/horizontal,up[2]/tangent,forward[2]*depthScale,forward[2],
    -dot(right,eye)/horizontal,-dot(up,eye)/tangent,cameraDepth*depthScale-depthOffset,cameraDepth,
  ])
  return {projection,right,eye,
    groundAt(x:number,y:number):GroundPoint|null {
      const ray: RoomVector = [
        forward[0]+x*horizontal*right[0]+y*tangent*up[0],
        forward[1]+y*tangent*up[1],
        forward[2]+x*horizontal*right[2]+y*tangent*up[2],
      ]
      if (ray[1]>=-1e-6) return null
      const depth = -eye[1]/ray[1]
      const ground = {x:eye[0]+depth*ray[0],z:eye[2]+depth*ray[2]}
      if (Math.max(Math.abs(ground.x),Math.abs(ground.z))>floorHalfSize) return null
      return clampRoomPoint(ground)
    },
    screenDirection(direction:GroundPoint) {
      return (direction.x*right[0]+direction.z*right[2])/Math.max(Math.hypot(direction.x,direction.z),.01)
    },
    groundDirection(direction:ScreenPoint):GroundPoint {
      return {x:right[0]*direction.x-right[2]*direction.y,z:right[2]*direction.x+right[0]*direction.y}
    },
  }
}

export type RoomCamera = ReturnType<typeof roomCamera>
