import type { BackgroundTransitionShader } from '@quajs/render-core'

/** Renderer-local GPU resources; no clock or game state lives here. */
export class BackgroundShaderCanvas {
  readonly canvas: HTMLCanvasElement
  readonly ready: Promise<void>
  private gl: WebGL2RenderingContext
  private program: WebGLProgram
  private textures: WebGLTexture[] = []
  private initialized = false
  private disposed = false

  constructor(document: Document, definition: BackgroundTransitionShader, width: number, height: number) {
    this.canvas = document.createElement('canvas')
    this.canvas.width = width
    this.canvas.height = height
    this.canvas.className = 'qua-background qua-background--shader'
    this.canvas.setAttribute('aria-hidden', 'true')
    Object.assign(this.canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%' })
    const gl = this.canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true })
    if (!gl)
      throw new Error('Custom background shaders require WebGL 2')
    this.gl = gl
    const parallel = gl.getExtension('KHR_parallel_shader_compile')
    const program = gl.createProgram()!
    this.program = program
    try {
      for (const [type, source] of [
        [gl.VERTEX_SHADER, '#version 300 es\nvoid main(){ vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2)); gl_Position=vec4(p*2.0-1.0,0.0,1.0); }'],
        [gl.FRAGMENT_SHADER, `#version 300 es
precision highp float;
uniform sampler2D fromTexture;
uniform sampler2D toTexture;
uniform float progress;
uniform vec4 params;
uniform vec2 resolution;
out vec4 outputColor;
vec4 sampleFrom(vec2 uv) { return texture(fromTexture, uv); }
vec4 sampleTo(vec2 uv) { return texture(toTexture, uv); }
${definition.glsl}
void main(){ vec2 uv=vec2(gl_FragCoord.x/resolution.x,1.0-gl_FragCoord.y/resolution.y); outputColor=transition(uv); }`],
      ] as const) {
        const shader = gl.createShader(type)!
        gl.shaderSource(shader, source)
        gl.compileShader(shader)
        gl.attachShader(program, shader)
        gl.deleteShader(shader)
      }
      gl.linkProgram(program)
      this.ready = this.initialize(definition, parallel)
    }
    catch (error) {
      this.dispose()
      throw error
    }
  }

  private async initialize(definition: BackgroundTransitionShader, parallel: KHR_parallel_shader_compile | null): Promise<void> {
    const gl = this.gl
    const program = this.program
    try {
      // LINK_STATUS blocks while a driver compiles; poll completion first when
      // available so authored shaders do not stall the browser frame thread.
      if (parallel) {
        while (!gl.getProgramParameter(program, parallel.COMPLETION_STATUS_KHR)) {
          if (this.disposed || gl.isContextLost())
            throw new Error('Background shader preparation cancelled')
          await new Promise(resolve => setTimeout(resolve, 8))
        }
      }
      if (this.disposed || gl.isContextLost())
        throw new Error('Background shader preparation cancelled')
      if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        throw new Error(`Background shader compilation failed: ${gl.getProgramInfoLog(program)}`)
      gl.useProgram(program)
      gl.uniform2f(gl.getUniformLocation(program, 'resolution'), this.canvas.width, this.canvas.height)
      gl.uniform4fv(gl.getUniformLocation(program, 'params'), definition.params ?? [0, 0, 0, 0])
      for (let index = 0; index < 2; index++) {
        const texture = gl.createTexture()!
        this.textures.push(texture)
        gl.activeTexture(gl.TEXTURE0 + index)
        gl.bindTexture(gl.TEXTURE_2D, texture)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
        gl.uniform1i(gl.getUniformLocation(program, index ? 'toTexture' : 'fromTexture'), index)
      }
      this.initialized = true
    }
    catch (error) {
      this.dispose()
      throw error
    }
  }

  upload(from: HTMLCanvasElement, to: HTMLCanvasElement): void {
    const gl = this.gl
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
    for (const [index, source] of [from, to].entries()) {
      gl.activeTexture(gl.TEXTURE0 + index)
      gl.bindTexture(gl.TEXTURE_2D, this.textures[index]!)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
    }
  }

  draw(progress: number): void {
    if (!this.initialized || this.disposed)
      return
    const gl = this.gl
    gl.useProgram(this.program)
    gl.uniform1f(gl.getUniformLocation(this.program, 'progress'), Math.max(0, Math.min(1, progress)))
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  dispose(): void {
    if (this.disposed)
      return
    this.disposed = true
    for (const texture of this.textures) this.gl.deleteTexture(texture)
    this.gl.deleteProgram(this.program)
    this.gl.getExtension('WEBGL_lose_context')?.loseContext()
    this.canvas.remove()
  }
}
