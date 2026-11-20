import { floorHalfSize, type GroundPoint, type RoomCamera, type RoomVector } from './pet-room-layout'
import type { RoomActor } from './pet-room-motion'

type Marker = {point:GroundPoint;elapsed:number}

const vertexSource = `
  attribute vec2 aCorner;
  uniform mat4 uCamera;
  uniform vec3 uOrigin, uAcross, uAlong;
  varying vec2 vCorner;
  varying vec3 vWorld;
  void main() {
    vCorner = aCorner;
    vWorld = uOrigin + aCorner.x * uAcross + aCorner.y * uAlong;
    gl_Position = uCamera * vec4(vWorld, 1.0);
  }
`

function fragmentSource(derivatives:boolean) {
  return `
    ${derivatives ? '#extension GL_OES_standard_derivatives : enable' : ''}
    precision mediump float;
    varying vec2 vCorner;
    varying vec3 vWorld;
    uniform int uMaterial;
    uniform vec4 uColor, uAtlas;
    uniform vec3 uEye;
    uniform sampler2D uSprite;

    float grid(vec2 p,float spacing) {
      vec2 distanceToLine = abs(p-spacing*floor(p/spacing+0.5));
      vec2 pixel = ${derivatives ? 'max(fwidth(p), vec2(0.018))' : 'vec2(0.046)'};
      vec2 strokes = 1.0-smoothstep(vec2(0.006),pixel+0.014,distanceToLine);
      return max(strokes.x,strokes.y);
    }

    void main() {
      if (uMaterial == 1) {
        vec2 p = vWorld.xz;
        float distanceToEye = length(vWorld-uEye);
        float light = 0.48+0.20*cos(p.x*0.114-p.y*0.075);
        float tile = fract(dot(floor(p),vec2(0.19,0.47)))*0.011;
        vec3 ground = mix(vec3(0.929,0.878,0.784),vec3(0.995,0.961,0.884),light)-tile;
        float lines = max(grid(p,1.0)*0.24,grid(p,4.0)*0.34);
        ground = mix(ground,vec3(0.68,0.56,0.40),lines);
        float edge = max(abs(p.x),abs(p.y));
        ground = mix(ground,vec3(0.79,0.69,0.54),smoothstep(${floorHalfSize-.12},${floorHalfSize.toFixed(1)},edge)*0.64);
        float visibility = 1.0-smoothstep(17.0,48.0,distanceToEye);
        gl_FragColor = vec4(ground*visibility,visibility);
      } else if (uMaterial == 2) {
        vec2 uv = uAtlas.xy + vec2(vCorner.x,1.0-vCorner.y)*uAtlas.zw;
        vec4 cat = texture2D(uSprite,uv);
        if (cat.a < 0.015) discard;
        gl_FragColor = cat;
      } else {
        float radius = length(vCorner*2.0-1.0);
        float coverage = 1.0-smoothstep(0.14,1.0,radius);
        if (uMaterial == 4) {
          coverage = max(smoothstep(0.70,0.78,radius)*(1.0-smoothstep(0.86,0.97,radius)),
            1.0-smoothstep(0.12,0.19,radius));
        }
        float alpha = coverage*uColor.a;
        gl_FragColor = vec4(uColor.rgb*alpha,alpha);
      }
    }
  `
}

function compile(gl:WebGLRenderingContext,type:number,source:string) {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('无法分配着色器')
  gl.shaderSource(shader,source)
  gl.compileShader(shader)
  if (gl.getShaderParameter(shader,gl.COMPILE_STATUS)) return shader
  const detail = gl.getShaderInfoLog(shader)
  gl.deleteShader(shader)
  throw new Error(detail||'着色器编译失败')
}

function createProgram(gl:WebGLRenderingContext) {
  const program = gl.createProgram()
  if (!program) throw new Error('无法创建渲染程序')
  const shaders: WebGLShader[] = []
  try {
    shaders.push(compile(gl,gl.VERTEX_SHADER,vertexSource))
    shaders.push(compile(gl,gl.FRAGMENT_SHADER,fragmentSource(Boolean(gl.getExtension('OES_standard_derivatives')))))
    for (const shader of shaders) gl.attachShader(program,shader)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program)||'渲染程序链接失败')
    return program
  } catch (error) {
    gl.deleteProgram(program)
    throw error
  } finally {
    for (const shader of shaders) gl.deleteShader(shader)
  }
}

export function createRoomRenderer(canvas:HTMLCanvasElement) {
  const context = canvas.getContext('webgl',{alpha:true,antialias:true,powerPreference:'low-power'})
  if (!context) throw new Error('浏览器无法使用 WebGL')
  const gl: WebGLRenderingContext = context
  const program = createProgram(gl)
  const buffer = gl.createBuffer()
  if (!buffer) {
    gl.deleteProgram(program)
    throw new Error('无法创建几何缓冲区')
  }
  gl.useProgram(program)
  gl.bindBuffer(gl.ARRAY_BUFFER,buffer)
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([0,0,1,0,0,1,1,1]),gl.STATIC_DRAW)
  const corner = gl.getAttribLocation(program,'aCorner')
  gl.enableVertexAttribArray(corner)
  gl.vertexAttribPointer(corner,2,gl.FLOAT,false,0,0)
  const uniform = (name:string) => gl.getUniformLocation(program,name)
  const cameraUniform = uniform('uCamera'), eyeUniform = uniform('uEye')
  const material = uniform('uMaterial'), color = uniform('uColor'), atlas = uniform('uAtlas')
  const originUniform = uniform('uOrigin'), acrossUniform = uniform('uAcross'), alongUniform = uniform('uAlong')
  gl.uniform1i(uniform('uSprite'),0)
  gl.enable(gl.DEPTH_TEST)
  gl.depthFunc(gl.LEQUAL)
  gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA)
  gl.clearColor(0,0,0,0)
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true)

  const textures = new Map<HTMLImageElement,WebGLTexture>()
  function texture(image:HTMLImageElement) {
    const cached = textures.get(image)
    if (cached) return cached
    const created = gl.createTexture()
    if (!created) return null
    gl.bindTexture(gl.TEXTURE_2D,created)
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR)
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image)
    textures.set(image,created)
    return created
  }

  function quad(origin:RoomVector,across:RoomVector,along:RoomVector) {
    gl.uniform3fv(originUniform,origin)
    gl.uniform3fv(acrossUniform,across)
    gl.uniform3fv(alongUniform,along)
    gl.drawArrays(gl.TRIANGLE_STRIP,0,4)
  }

  const edge = floorHalfSize, span = edge*2
  const xAxis:RoomVector = [span,0,0], zAxis:RoomVector = [0,0,span]

  function drawFloor() {
    gl.uniform1i(material,1)
    quad([-edge,0,-edge],xAxis,zAxis)
  }

  function drawActor(actor:RoomActor,camera:RoomCamera) {
    if (!actor.sprite) return
    const {image,layout} = actor.sprite
    const spriteTexture = texture(image)
    if (!spriteTexture) return
    const [rx,,rz] = camera.right
    const {x,z} = actor.point
    const shade = 1+actor.height*.18
    gl.uniform1i(material,3)
    gl.uniform4f(color,.30,.23,.16,.30/(1+actor.height*.75))
    quad([x+(-rx*.99+rz*.42)*shade,.008,z+(-rz*.99-rx*.42)*shade],
      [rx*1.98*shade,0,rz*1.98*shade],[-rz*.84*shade,0,rx*.84*shade])

    const {columns,frameWidth,frameHeight,imageWidth,imageHeight} = layout
    const flip = actor.flip
    const tileX = (actor.frame%columns)*frameWidth, tileY = Math.floor(actor.frame/columns)*frameHeight
    const width = 3.14, height = width*frameHeight/frameWidth
    gl.bindTexture(gl.TEXTURE_2D,spriteTexture)
    gl.uniform1i(material,2)
    gl.uniform4f(atlas,(tileX+(flip?frameWidth-.5:.5))/imageWidth,(tileY+.5)/imageHeight,
      (frameWidth-1)/imageWidth*(flip?-1:1),(frameHeight-1)/imageHeight)
    // The quad stays upright while its horizontal axis follows the camera.
    quad([x-rx*width/2,actor.height+(actor.foot-1)*height+.02,z-rz*width/2],[rx*width,0,rz*width],[0,height,0])
  }

  return {
    draw(camera:RoomCamera,actor:RoomActor,marker?:Marker) {
      if (gl.isContextLost()) return
      gl.viewport(0,0,canvas.width,canvas.height)
      gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT)
      gl.uniformMatrix4fv(cameraUniform,false,camera.projection)
      gl.uniform3fv(eyeUniform,camera.eye)
      gl.disable(gl.BLEND)
      drawFloor()
      gl.enable(gl.BLEND)
      gl.depthMask(false)
      if (marker) {
        const progress = marker.elapsed/900, radius = .20+.32*progress
        const {x,z} = marker.point
        gl.uniform1i(material,4)
        gl.uniform4f(color,.58,.36,.07,1-progress)
        quad([x-radius,.014,z-radius],[radius*2,0,0],[0,0,radius*2])
      }
      drawActor(actor,camera)
      gl.depthMask(true)
    },
    dispose() {
      for (const item of textures.values()) gl.deleteTexture(item)
      textures.clear()
      gl.deleteBuffer(buffer)
      gl.deleteProgram(program)
    },
  }
}
