import type { Particle } from './particle';

const STRIDE = 12;
const VERTEX = `#version 300 es
precision highp float;
in vec2 a_corner;
in vec4 a_motion;
in vec4 a_color;
in vec4 a_shape;
uniform vec2 u_resolution;
out vec2 v_local;
flat out float v_length;
flat out float v_core;
flat out float v_heat;
flat out vec4 v_color;
void main() {
  vec2 delta = a_motion.xy - a_motion.zw;
  float speed = length(delta);
  vec2 direction = speed > 0.01 ? delta / speed : vec2(0.0, -1.0);
  float streak = min(speed * a_shape.w, 42.0);
  float core = max(0.35, a_shape.x * 0.36);
  float radius = core * 5.5 + 0.5;
  vec2 local = vec2(mix(-radius, streak + radius, a_corner.x), a_corner.y * radius);
  vec2 world = a_motion.xy - direction * streak + direction * local.x + vec2(-direction.y, direction.x) * local.y;
  gl_Position = vec4(world.x / u_resolution.x * 2.0 - 1.0, 1.0 - world.y / u_resolution.y * 2.0, 0.0, 1.0);
  v_local = local;
  v_length = streak;
  v_core = core;
  v_heat = a_shape.y;
  v_color = a_color;
}`;

const FRAGMENT = `#version 300 es
precision highp float;
in vec2 v_local;
flat in float v_length;
flat in float v_core;
flat in float v_heat;
flat in vec4 v_color;
out vec4 outColor;
void main() {
  float outside = min(v_local.x, 0.0) + max(v_local.x - v_length, 0.0);
  float distance2 = outside * outside + v_local.y * v_local.y;
  float along = clamp(v_local.x / max(v_length, 0.001), 0.0, 1.0);
  float taper = v_length < 0.05 ? 1.0 : mix(0.18, 1.0, along);
  float pixelWidth = max(fwidth(v_local.x), fwidth(v_local.y));
  float width2 = v_core * v_core + pixelWidth * pixelWidth * 0.2;
  float halo = exp(-distance2 / (width2 * 7.0)) * 0.16;
  float ember = exp(-distance2 / (width2 * 1.35 * taper)) * 0.7;
  float hot = exp(-distance2 / (width2 * 0.24 * taper)) * 0.95;
  float exposure = v_color.a * 1.4 * (v_length < 0.05 ? 1.0 : mix(0.25, 1.0, along));
  vec3 coreColor = mix(v_color.rgb, vec3(1.0, 0.94, 0.79), v_heat);
  vec3 light = (v_color.rgb * (halo + ember) + coreColor * hot) * exposure;
  float alpha = clamp((halo + ember + hot) * exposure, 0.0, 1.0);
  if (alpha < 0.002) discard;
  outColor = vec4(light, alpha);
}`;

/** Analytic, resolution-independent sparks: one instanced draw, no bitmap heads. */
export class GpuSparkRenderer {
  public visibleCount = 0;
  private canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private instances: WebGLBuffer;
  private vao: WebGLVertexArrayObject;
  private resolution: WebGLUniformLocation;
  private data = new Float32Array(7500 * STRIDE);

  constructor() {
    this.canvas = document.createElement('canvas');
    const gl = this.canvas.getContext('webgl2', { alpha: true, antialias: false, premultipliedAlpha: true, preserveDrawingBuffer: false, depth: false, stencil: false });
    if (!gl || typeof gl.createShader !== 'function') throw new Error('WebGL2 unavailable');
    this.gl = gl;
    const compile = (type: number, source: string): WebGLShader => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const message = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(`Spark shader: ${message}`);
      }
      return shader;
    };
    const vertex = compile(gl.VERTEX_SHADER, VERTEX);
    const fragment = compile(gl.FRAGMENT_SHADER, FRAGMENT);
    this.program = gl.createProgram()!;
    gl.attachShader(this.program, vertex);
    gl.attachShader(this.program, fragment);
    gl.linkProgram(this.program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw new Error('Spark shader link failed');
    this.resolution = gl.getUniformLocation(this.program, 'u_resolution')!;
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    const quad = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0,-1, 0,1, 1,-1, 1,-1, 0,1, 1,1]), gl.STATIC_DRAW);
    const corner = gl.getAttribLocation(this.program, 'a_corner');
    gl.enableVertexAttribArray(corner);
    gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0);
    this.instances = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instances);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
    for (const [name, offset] of [['a_motion',0],['a_color',4],['a_shape',8]] as const) {
      const location = gl.getAttribLocation(this.program, name);
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, 4, gl.FLOAT, false, STRIDE * 4, offset * 4);
      gl.vertexAttribDivisor(location, 1);
    }
    gl.bindVertexArray(null);
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    this.canvas.addEventListener('webglcontextlost', event => event.preventDefault());
  }

  public render(ctx: CanvasRenderingContext2D, particles: Particle[], width: number, height: number): boolean {
    const gl = this.gl;
    if (gl.isContextLost()) return false;
    if (this.canvas.width !== ctx.canvas.width || this.canvas.height !== ctx.canvas.height) {
      this.canvas.width = ctx.canvas.width;
      this.canvas.height = ctx.canvas.height;
    }
    let count = 0;
    for (const p of particles) {
      if (!p.active || p.kind === 'smoke' || p.alpha <= 0.006) continue;
      const margin = p.size * 6 + 45;
      if (Math.max(p.x, p.prevX) + margin < 0 || Math.min(p.x, p.prevX) - margin > width
        || Math.max(p.y, p.prevY) + margin < 0 || Math.min(p.y, p.prevY) - margin > height) continue;
      const t = 1 - p.life / p.maxLife;
      const cooling = Math.max(0, (t - 0.55) / 0.45);
      const cool = cooling * cooling * (3 - 2 * cooling);
      const heat = Math.max(0, 1 - t * 2.5) * p.heat;
      const offset = count++ * STRIDE;
      const data = this.data;
      data[offset] = p.x; data[offset+1] = p.y;
      data[offset+2] = p.prevX; data[offset+3] = p.prevY;
      data[offset+4] = (p.color.r + (p.fadeColor.r - p.color.r) * cool) / 255;
      data[offset+5] = (p.color.g + (p.fadeColor.g - p.color.g) * cool) / 255;
      data[offset+6] = (p.color.b + (p.fadeColor.b - p.color.b) * cool) / 255;
      data[offset+7] = p.alpha;
      data[offset+8] = p.size * (0.6 + 0.4 * Math.sqrt(p.life / p.maxLife));
      data[offset+9] = heat; data[offset+10] = 0;
      data[offset+11] = p.trail ? p.shutter : 0;
    }
    this.visibleCount = count;
    if (!count) return true;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.uniform2f(this.resolution, width, height);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instances);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data.subarray(0, count * STRIDE));
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, count);
    gl.bindVertexArray(null);
    ctx.globalAlpha = 1;
    ctx.drawImage(this.canvas, 0, 0, width, height);
    return true;
  }
}
