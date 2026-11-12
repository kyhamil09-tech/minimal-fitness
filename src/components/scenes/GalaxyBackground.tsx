import React, { useEffect, useRef, useState } from 'react';

/**
 * The Sagittarius theme's background: the Milky Way seen toward its core, drawn live on the phone's graphics chip. A diagonal band of
 * starlight with a warm glowing center, dark dust lanes cutting through it, pink and blue nebulae, three layers of stars that drift at
 * different speeds, a slow twinkle, and an occasional shooting star. Nothing is downloaded: it is a few dozen lines of shader code.
 *
 * Kept gentle on the battery: it draws at about 30 frames a second at a reduced resolution, stops while the app is hidden, and with
 * Reduce motion on it draws one still picture. Without WebGL a plain gradient is shown instead.
 */
const VERTEX = `attribute vec2 aPos; void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`;

export const GALAXY_FRAGMENT = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uRes;
uniform float uTime;

float hash21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec2 hash22(vec2 p){ float n = hash21(p); return vec2(n, hash21(p + n + 19.19)); }
float vnoise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i); float b = hash21(i + vec2(1.0, 0.0)); float c = hash21(i + vec2(0.0, 1.0)); float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p){
  float v = 0.0; float a = 0.5; mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 5; i++){ v += a * vnoise(p); p = m * p; a *= 0.5; }
  return v;
}
float ridged(vec2 p){
  float v = 0.0; float a = 0.5; mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 4; i++){ float n = 1.0 - abs(vnoise(p) * 2.0 - 1.0); v += a * n * n; p = m * p; a *= 0.5; }
  return v;
}
mat2 rot(float a){ float c = cos(a); float s = sin(a); return mat2(c, -s, s, c); }

// One layer of stars: a star in some cells, each with its own size, color (blue-white to orange) and twinkle.
vec3 starLayer(vec2 uv, float scale, float seed, float density, float t){
  vec2 g = uv * scale;
  vec2 base = floor(g);
  vec2 f = fract(g);
  vec3 sum = vec3(0.0);
  for (int j = -1; j <= 1; j++){
    for (int i = -1; i <= 1; i++){
      vec2 cell = vec2(float(i), float(j));
      vec2 id = base + cell;
      float present = step(1.0 - density, hash21(id * 1.31 + seed));
      vec2 pos = cell + 0.5 + (hash22(id + seed * 1.7) - 0.5) * 0.7;
      float d = length(f - pos);
      float b = hash21(id * 2.17 + seed + 7.7);
      float mag = pow(b, 7.0);
      float size = mix(0.028, 0.085, mag);
      float core = exp(-d * d / (size * size));
      float halo = exp(-d * d / (size * size * 14.0)) * 0.22 * (0.15 + mag);
      float tw = 0.8 + 0.2 * sin(t * (0.8 + b * 3.5) + b * 60.0);
      float temp = hash21(id * 3.7 + seed);
      vec3 tint = mix(vec3(0.6, 0.72, 1.0), vec3(1.0, 0.78, 0.55), smoothstep(0.25, 0.95, temp));
      tint = mix(vec3(1.0), tint, 0.7);
      sum += present * tint * (core * (0.3 + 1.7 * mag) * tw + halo);
    }
  }
  return sum;
}

float shootingStar(vec2 uv, float t){
  float period = 11.0;
  float id = floor(t / period);
  float lt = fract(t / period) * period;
  float on = step(0.5, hash21(vec2(id, 3.7)));
  vec2 start = (vec2(hash21(vec2(id, 1.3)), hash21(vec2(id, 2.9))) - 0.5) * vec2(0.5, 0.9);
  vec2 dir = normalize(vec2(0.85, -0.5));
  float dur = 0.95;
  float p = clamp(lt / dur, 0.0, 1.0);
  vec2 head = start + dir * p * 0.75;
  vec2 tail = head - dir * 0.16 * sin(p * 3.14159);
  vec2 pa = uv - tail; vec2 ba = head - tail;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-5), 0.0, 1.0);
  float d = length(pa - ba * h);
  return on * step(lt, dur) * (1.0 - smoothstep(0.0, 0.004, d)) * h * sin(p * 3.14159);
}

void main(){
  vec2 frag = gl_FragCoord.xy;
  vec2 uv = (frag - 0.5 * uRes) / uRes.y;           // height is -0.5 to 0.5, width follows the screen shape
  float t = uTime;

  // The whole sky turns very slowly, and the galactic plane runs on a diagonal.
  vec2 sky = rot(0.0035 * t) * uv;
  vec2 p = rot(0.95) * sky;                          // p.x runs along the Milky Way, p.y across it
  float across = p.y;
  float along = p.x;

  // The band: broad faint haze, a brighter body, and a ragged edge.
  float edge = fbm(vec2(along * 2.4 + 3.0, across * 2.0) + t * 0.004);
  float width = 0.13 + 0.07 * edge;
  float body = exp(-across * across / (width * width));
  float haze = exp(-across * across / 0.3) * 0.22;

  // Dust lanes (the Great Rift): ridged noise darkens the middle of the band.
  float dust = ridged(vec2(along * 3.1 + 5.0, across * 6.5) + vec2(t * 0.003, 0.0));
  float fine = ridged(vec2(along * 9.0 + 1.0, across * 15.0) - vec2(t * 0.004, 0.0));
  float rift = smoothstep(0.3, 0.8, dust * 0.75 + fine * 0.4) * exp(-across * across / (width * width * 2.2));
  float lanes = 1.0 - 0.9 * rift;

  // The glowing core toward Sagittarius, off-center along the plane.
  vec2 core = vec2(0.17, 0.0);
  vec2 q = p - core;
  float bulge = exp(-(q.x * q.x * 1.5 + q.y * q.y * 6.5) / 0.06);
  float nucleus = exp(-dot(q, q) / 0.0035);

  // Fine structure inside the band, like the clouds of unresolved stars.
  float clouds = 0.3 + 1.0 * fbm(vec2(along * 8.0, across * 11.0) + vec2(11.0, 4.0));

  vec3 coolBand = vec3(0.34, 0.38, 0.72);
  vec3 warmBand = vec3(1.0, 0.74, 0.46);
  vec3 col = vec3(0.004, 0.006, 0.018) + vec3(0.012, 0.014, 0.034) * fbm(sky * 1.4 + 2.0);
  col += coolBand * haze * (0.8 + 0.4 * edge);
  col += mix(coolBand, warmBand, clamp(bulge * 1.4, 0.0, 1.0)) * body * clouds * lanes * (0.38 + 1.1 * bulge);
  col += warmBand * nucleus * 0.7 * lanes;
  // reddish rims where dust meets starlight
  col += vec3(0.5, 0.16, 0.08) * smoothstep(0.25, 0.6, dust * 0.75 + fine * 0.4) * (1.0 - rift) * body * 0.35;

  // Nebulae: a pink emission cloud near the core and a blue reflection one farther out along the plane.
  float n1 = smoothstep(0.42, 0.9, fbm(sky * 3.2 + vec2(7.0, 2.0) + t * 0.006));
  col += vec3(0.95, 0.28, 0.5) * n1 * exp(-length(sky - vec2(-0.05, -0.22)) * 4.2) * 0.9;
  float n2 = smoothstep(0.45, 0.9, fbm(sky * 2.6 + vec2(2.0, 9.0) - t * 0.005));
  col += vec3(0.25, 0.42, 1.0) * n2 * exp(-length(sky - vec2(0.12, 0.3)) * 3.2) * 0.8;

  // Stars: three layers that drift past each other, thicker inside the band and hidden by the dust.
  float inBand = clamp(body * 1.2 + haze, 0.0, 1.0);
  vec3 stars = vec3(0.0);
  stars += starLayer(sky + vec2(t * 0.0006, 0.0), 14.0, 1.0, 0.16 + 0.12 * inBand, t);
  stars += starLayer(rot(0.3) * sky + vec2(0.0, t * 0.0012), 30.0, 5.0, 0.2 + 0.22 * inBand, t);
  stars += starLayer(rot(-0.2) * sky + vec2(-t * 0.0021, 0.0), 70.0, 9.0, 0.26 + 0.35 * inBand, t);
  col += stars * mix(1.0, lanes, 0.8);

  col += vec3(0.85, 0.92, 1.0) * shootingStar(uv, t);

  // Film-like finish: soft highlights, a gentle vignette, and a touch of grain so the dark never bands.
  col = 1.0 - exp(-col * 1.05);
  col = pow(col, vec3(1.05));
  float v = 1.0 - smoothstep(0.15, 1.15, length(uv * vec2(0.9, 0.62)) * 1.6);
  col *= mix(0.55, 1.0, v);
  col *= 0.95;                                        // a little dimmer so text on top stays easy to read
  col += (hash21(frag + fract(t)) - 0.5) / 120.0;
  gl_FragColor = vec4(col, 1.0);
}
`;

const compile = (gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null => {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn('Galaxy shader did not compile:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
};

interface GalaxyBackgroundProps {
  /** Draw one still picture instead of animating (Reduce motion). */
  still?: boolean;
}

export const GalaxyBackground: React.FC<GalaxyBackgroundProps> = ({ still = false }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const [fallback, setFallback] = useState(false);

  // Marks the page so the cards can show a little of the galaxy through them (see index.css).
  useEffect(() => {
    document.documentElement.dataset.scene = 'galaxy';
    return () => {
      delete document.documentElement.dataset.scene;
    };
  }, []);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let gl: WebGLRenderingContext | null = null;
    try {
      gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' }) as WebGLRenderingContext | null;
    } catch {
      gl = null;
    }
    if (!gl) {
      setFallback(true);
      return;
    }
    const vs = compile(gl, gl.VERTEX_SHADER, VERTEX);
    const fs = compile(gl, gl.FRAGMENT_SHADER, GALAXY_FRAGMENT);
    const program = gl.createProgram();
    if (!vs || !fs || !program) {
      setFallback(true);
      return;
    }
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      setFallback(true);
      return;
    }
    gl.useProgram(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(program, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const uRes = gl.getUniformLocation(program, 'uRes');
    const uTime = gl.getUniformLocation(program, 'uTime');

    let raf = 0;
    let last = 0;
    const startedAt = performance.now();
    // Reduced resolution: the sky is soft anyway, and it keeps the cost small.
    const resize = () => {
      const scale = Math.min(window.devicePixelRatio || 1, 2) * 0.6;
      canvas.width = Math.max(2, Math.round(window.innerWidth * scale));
      canvas.height = Math.max(2, Math.round(window.innerHeight * scale));
      gl!.viewport(0, 0, canvas.width, canvas.height);
      gl!.uniform2f(uRes, canvas.width, canvas.height);
    };
    const draw = (seconds: number) => {
      gl!.uniform1f(uTime, seconds);
      gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);
    };
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (now - last < 33) return;
      last = now;
      draw(40 + (now - startedAt) / 1000);
    };
    const start = () => {
      cancelAnimationFrame(raf);
      if (still) {
        draw(40);
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    const onVisible = () => {
      if (document.hidden) cancelAnimationFrame(raf);
      else start();
    };
    const onResize = () => {
      resize();
      if (still) draw(40);
    };
    const onLost = (e: Event) => {
      e.preventDefault();
      cancelAnimationFrame(raf);
      setFallback(true);
    };

    resize();
    start();
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisible);
    canvas.addEventListener('webglcontextlost', onLost);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisible);
      canvas.removeEventListener('webglcontextlost', onLost);
      gl!.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, [still]);

  return fallback ? <div className="galaxy-fallback" aria-hidden="true" /> : <canvas ref={ref} className="galaxy-canvas" aria-hidden="true" />;
};
