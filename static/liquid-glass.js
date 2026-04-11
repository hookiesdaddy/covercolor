'use strict';
/* Liquid Glass — WebGL raymarching background
   Morphing iridescent blob matching the Spline reference design.          */
(function () {
  const canvas = document.getElementById('liquid-glass-bg');
  if (!canvas) return;

  const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'high-performance' });
  if (!gl) { canvas.style.display = 'none'; return; }

  // Render at 50 % resolution; CSS upscales smoothly
  const SCALE = 0.5;

  function resize() {
    canvas.width  = Math.round(window.innerWidth  * SCALE * devicePixelRatio);
    canvas.height = Math.round(window.innerHeight * SCALE * devicePixelRatio);
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
  window.addEventListener('resize', resize);
  resize();

  // ── Fullscreen quad ───────────────────────────────────────────────
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);

  function mkShader(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error('Shader error:', gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }

  // ── Vertex shader ─────────────────────────────────────────────────
  const vert = mkShader(gl.VERTEX_SHADER, `
    attribute vec2 a_pos;
    void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
  `);

  // ── Fragment shader ───────────────────────────────────────────────
  const frag = mkShader(gl.FRAGMENT_SHADER, `
    precision mediump float;
    uniform float u_time;
    uniform vec2  u_res;

    /* ── Value noise ─────────────────────────────────────────────── */
    float hash(vec3 p) {
      p = fract(p * vec3(127.1, 311.7, 74.7));
      p += dot(p, p.yxz + 19.19);
      return fract((p.x + p.y) * p.z);
    }
    float vnoise(vec3 p) {
      vec3 i = floor(p), f = fract(p);
      f = f*f*(3.0 - 2.0*f);
      return mix(
        mix(mix(hash(i),           hash(i+vec3(1,0,0)), f.x),
            mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)), f.x), f.y),
        mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)), f.x),
            mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)), f.x), f.y), f.z);
    }
    float fbm(vec3 p) {
      return vnoise(p)*0.500 + vnoise(p*2.0)*0.250 + vnoise(p*4.0)*0.125;
    }

    /* ── Morphing blob SDF ───────────────────────────────────────── */
    float sdf(vec3 p) {
      float t = u_time;
      // Two layers of domain warping give the organic morphing shape
      vec3 q = p + (fbm(p * 1.1 + vec3(t*0.12, t*0.09, t*0.14)) - 0.5) * 0.60;
      q      += (fbm(q * 1.7 + vec3(t*0.07, t*0.11, t*0.06)) - 0.5) * 0.22;
      return length(q) - 1.05;
    }

    /* ── Sphere-trace ────────────────────────────────────────────── */
    float march(vec3 ro, vec3 rd) {
      float t = 0.4;
      for (int i = 0; i < 64; i++) {
        float d = sdf(ro + rd * t);
        if (d < 0.004) return t;
        if (t > 4.5)   return -1.0;
        t += d * 0.65;
      }
      return -1.0;
    }

    /* ── Surface normal ──────────────────────────────────────────── */
    vec3 calcNormal(vec3 p) {
      const float e = 0.004;
      return normalize(vec3(
        sdf(p+vec3(e,0,0)) - sdf(p-vec3(e,0,0)),
        sdf(p+vec3(0,e,0)) - sdf(p-vec3(0,e,0)),
        sdf(p+vec3(0,0,e)) - sdf(p-vec3(0,0,e))
      ));
    }

    /* ── Iridescent palette ──────────────────────────────────────── */
    /* Sweeps: deep purple → electric blue → cyan → warm orange → pink */
    vec3 palette(float t) {
      vec3 a = vec3(0.50, 0.50, 0.50);
      vec3 b = vec3(0.55, 0.50, 0.45);
      vec3 c = vec3(1.00, 1.00, 0.80);
      vec3 d = vec3(0.00, 0.18, 0.58);
      return clamp(a + b * cos(6.2832 * (c * t + d)), 0.0, 1.0);
    }

    void main() {
      vec2 uv = (gl_FragCoord.xy * 2.0 - u_res) / min(u_res.x, u_res.y);

      /* Camera */
      vec3 ro = vec3(0.0, 0.15, 3.2);
      vec3 rd = normalize(vec3(uv.x, uv.y, -2.0));

      /* Dark purple-black background with subtle glow */
      float bgD = length(uv);
      vec3 col  = mix(vec3(0.05, 0.01, 0.10), vec3(0.01, 0.0, 0.04), bgD * 0.8);
      col      += vec3(0.10, 0.03, 0.22) * exp(-bgD * 1.5);   /* centre glow */

      float t = march(ro, rd);

      if (t > 0.0) {
        vec3 p = ro + rd * t;
        vec3 n = calcNormal(p);
        vec3 v = -rd;
        vec3 r = reflect(rd, n);

        /* Fresnel */
        float fr = pow(1.0 - max(dot(n, v), 0.0), 2.5);

        /* Hue: normal-dependent + surface noise + slow time drift */
        float hue = dot(n, vec3(0.55, 0.80, 0.30))
                  + vnoise(p * 2.2 + u_time * 0.07) * 0.45;
        hue = fract(hue * 0.65 + u_time * 0.045);

        vec3 surf = palette(hue) * 2.0;

        /* Three specular lights for the multi-coloured highlights */
        float s1 = pow(max(dot(r, normalize(vec3( 1.6, 2.2, 1.3))), 0.0), 90.0); /* sharp white */
        float s2 = pow(max(dot(r, normalize(vec3(-1.3,-0.9, 1.0))), 0.0), 42.0); /* blue        */
        float s3 = pow(max(dot(r, normalize(vec3( 0.4,-1.9, 0.9))), 0.0), 32.0); /* orange      */

        /* Purple-blue rim */
        float rim = pow(1.0 - max(dot(n, v), 0.0), 4.5);

        col  = surf * mix(0.65, 1.15, fr);
        col += vec3(1.00, 0.97, 0.93) * s1 * 3.2;
        col += vec3(0.25, 0.50, 1.00) * s2 * 1.1;
        col += vec3(1.00, 0.42, 0.08) * s3 * 0.9;
        col += vec3(0.45, 0.10, 0.95) * rim * 0.8;
      }

      /* Vignette + gamma */
      col *= 1.0 - 0.35 * dot(uv*0.55, uv*0.55);
      col  = pow(max(col, 0.0), vec3(0.4545));

      gl_FragColor = vec4(col, 1.0);
    }
  `);

  if (!vert || !frag) return;

  const prog = gl.createProgram();
  gl.attachShader(prog, vert);
  gl.attachShader(prog, frag);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error('Program link error:', gl.getProgramInfoLog(prog));
    canvas.style.display = 'none';
    return;
  }
  gl.useProgram(prog);

  const aPos  = gl.getAttribLocation(prog, 'a_pos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const uTime = gl.getUniformLocation(prog, 'u_time');
  const uRes  = gl.getUniformLocation(prog, 'u_res');

  let startMs = performance.now();
  let rafId   = null;

  function draw() {
    gl.uniform1f(uTime, (performance.now() - startMs) / 1000);
    gl.uniform2f(uRes,  canvas.width, canvas.height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    rafId = requestAnimationFrame(draw);
  }

  // Pause when off-screen (e.g. other tab)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { cancelAnimationFrame(rafId); rafId = null; }
    else { startMs = performance.now() - startMs; draw(); }
  });

  // Fade in once first frame renders
  requestAnimationFrame(() => {
    draw();
    canvas.style.transition = 'opacity 1.4s ease';
    canvas.style.opacity    = '1';
    // Fade out CSS orbs
    const orbs = document.querySelector('.bg-orbs');
    if (orbs) orbs.classList.add('spline-ready');
  });
})();
