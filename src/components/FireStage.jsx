import {useRef, useEffect} from 'react';
import * as THREE from 'three';
import {animate} from 'animejs';
import {MAX_PARTICLES} from '../config/elementPresets.js';
import './ElementStage.css';

const rand = (min, max) => min + Math.random() * (max - min);

// Flame base plane (matches the original fireSpawn origin).
const BASE_Y = -1.0;
// Number of low pool slots reserved for the warm glow bloom.
const GLOW_COUNT = 18;

// Billboard each instanced quad, then stretch it along the particle's
// screen-space velocity (flames rise, so they elongate vertically). Sparks and
// glow (kind > 0.5) stay round. Built-in ShaderMaterial attributes/uniforms
// (position, uv, modelViewMatrix, projectionMatrix) are injected automatically.
const FLAME_VERT = `
  attribute vec3 iOffset;
  attribute vec3 iVelocity;
  attribute float iLife;
  attribute float iSize;
  attribute float iSeed;
  attribute float iKind;

  varying vec2 vUv;
  varying float vLife;
  varying float vSeed;
  varying float vKind;

  void main() {
    vUv = uv;
    vLife = iLife;
    vSeed = iSeed;
    vKind = iKind;

    vec4 mvCenter = modelViewMatrix * vec4(iOffset, 1.0);
    vec3 mvVel = (modelViewMatrix * vec4(iVelocity, 0.0)).xyz;

    vec2 vdir = mvVel.xy;
    float speed = length(vdir);
    vec2 along = speed > 0.0001 ? normalize(vdir) : vec2(0.0, 1.0);
    vec2 perp = vec2(-along.y, along.x);

    float stretch = clamp(speed * 0.5, 0.0, 2.2);
    if (iKind > 0.5) stretch = 0.0;

    float lenScale = iSize * (1.0 + stretch);
    float widScale = iSize * (1.0 - 0.30 * stretch / 2.2);

    vec2 offset = perp * (position.x * widScale) + along * (position.y * lenScale);
    mvCenter.xy += offset;
    gl_Position = projectionMatrix * mvCenter;
  }
`;

// Additive fire. Body falloff * life fade. Color ramps hot->orange->red.
// Sparks twinkle; glow is a broad soft low-brightness bloom. Output vec4(col, a)
// so AdditiveBlending (SrcAlpha, One) adds col*a to the framebuffer.
const FLAME_FRAG = `
  precision mediump float;
  uniform float uIntensity;
  uniform float uTime;

  varying vec2 vUv;
  varying float vLife;
  varying float vSeed;
  varying float vKind;

  void main() {
    float r = length(vUv - 0.5) * 2.0;
    float body = smoothstep(1.0, 0.05, r);
    float fade = 1.0 - vLife;

    vec3 hot = vec3(1.0, 0.95, 0.75);
    vec3 mid = vec3(1.0, 0.45, 0.10);
    vec3 cool = vec3(0.6, 0.08, 0.02);
    vec3 col = vLife < 0.5
      ? mix(hot, mid, vLife / 0.5)
      : mix(mid, cool, (vLife - 0.5) / 0.5);

    float bright = body * fade * 0.6;

    if (vKind > 0.5 && vKind < 1.5) {
      // sparks: hotter, twinkling
      col = mix(vec3(1.0, 0.85, 0.5), vec3(1.0, 0.5, 0.15), vLife);
      float tw = 0.6 + 0.4 * sin(uTime * 20.0 + vSeed * 30.0);
      bright = body * fade * tw;
    } else if (vKind > 1.5) {
      // glow bloom: broad, soft, dim
      col = vec3(1.0, 0.5, 0.2);
      bright = smoothstep(1.0, 0.0, r) * 0.30 * fade;
    }

    float a = bright * uIntensity;
    if (a < 0.004) discard;
    gl_FragColor = vec4(col, a);
  }
`;

// Map the world-unit particle size from the pixel-ish particleSize slider.
const sizeWorld = (particleSize) => particleSize * 0.011;

// Flame tongue: rises from the base in a cone, strong upward velocity.
function spawnFlame(p) {
  const angle = Math.random() * Math.PI * 2;
  const radius = Math.random() * p.spread * 0.4;
  return {
    x: Math.cos(angle) * radius,
    y: BASE_Y,
    z: Math.sin(angle) * radius,
    vx: rand(-0.5, 0.5) * p.spread,
    vy: rand(1.2, 2.0),
    vz: rand(-0.5, 0.5) * p.spread,
    age: 0,
    life: p.flameHeight * rand(0.5, 1.1),
    seed: Math.random(),
    size: sizeWorld(p.particleSize) * rand(0.8, 1.3),
    kind: 0
  };
}

// Spark/ember: tiny, fast, long-lived, drifty, twinkling.
function spawnSpark(p) {
  const angle = Math.random() * Math.PI * 2;
  const radius = Math.random() * p.spread * 0.5;
  return {
    x: Math.cos(angle) * radius,
    y: BASE_Y + rand(0.0, 0.4),
    z: Math.sin(angle) * radius,
    vx: rand(-0.3, 0.3),
    vy: rand(1.6, 2.8),
    vz: rand(-0.3, 0.3),
    age: 0,
    life: p.flameHeight * rand(1.2, 2.0),
    seed: Math.random(),
    size: sizeWorld(p.particleSize) * rand(0.18, 0.34),
    kind: 1
  };
}

// Glow bloom: large, soft, slow, near the base.
function spawnGlow(p) {
  const angle = Math.random() * Math.PI * 2;
  const radius = Math.random() * p.spread * 0.3;
  return {
    x: Math.cos(angle) * radius,
    y: BASE_Y + rand(0.1, 0.6),
    z: Math.sin(angle) * radius,
    vx: rand(-0.1, 0.1),
    vy: rand(0.1, 0.4),
    vz: rand(-0.1, 0.1),
    age: 0,
    life: p.flameHeight * rand(1.0, 1.6),
    seed: Math.random(),
    size: sizeWorld(p.particleSize) * rand(3.0, 4.5),
    kind: 2
  };
}

function spawnFor(i, p) {
  if (i < GLOW_COUNT) return spawnGlow(p);
  if (i % 5 === 0) return spawnSpark(p);
  return spawnFlame(p);
}

function FireStage({preset, params, igniteKey}) {
  const mountRef = useRef(null);
  const paramsRef = useRef(params);
  const dynRef = useRef({ignite: 0, flicker: 1});

  useEffect(() => {
    paramsRef.current = params;
  }, [params]);

  useEffect(() => {
    dynRef.current.ignite = 0;
    animate(dynRef.current, {ignite: 1, duration: 650, ease: 'outQuad'});
  }, [igniteKey]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    const width = mount.clientWidth || 360;
    const height = mount.clientHeight || 360;
    const [gx, gy, gz] = preset.gravity;
    const [tx, ty, tz] = preset.cameraTarget;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 100);
    camera.position.set(0, ty, 5);
    camera.lookAt(tx, ty, tz);

    const renderer = new THREE.WebGLRenderer({antialias: true, alpha: true});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    const offsets = new Float32Array(MAX_PARTICLES * 3);
    const velocities = new Float32Array(MAX_PARTICLES * 3);
    const lifes = new Float32Array(MAX_PARTICLES);
    const sizes = new Float32Array(MAX_PARTICLES);
    const seeds = new Float32Array(MAX_PARTICLES);
    const kinds = new Float32Array(MAX_PARTICLES);
    const particles = new Array(MAX_PARTICLES);

    const respawn = (i, p, staggered) => {
      const s = spawnFor(i, p);
      if (staggered) s.age = Math.random() * s.life;
      particles[i] = s;
    };
    for (let i = 0; i < MAX_PARTICLES; i++) respawn(i, paramsRef.current, true);

    const base = new THREE.PlaneGeometry(1, 1);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.index = base.index;
    geometry.setAttribute('position', base.attributes.position);
    geometry.setAttribute('uv', base.attributes.uv);
    geometry.setAttribute('iOffset', new THREE.InstancedBufferAttribute(offsets, 3));
    geometry.setAttribute('iVelocity', new THREE.InstancedBufferAttribute(velocities, 3));
    geometry.setAttribute('iLife', new THREE.InstancedBufferAttribute(lifes, 1));
    geometry.setAttribute('iSize', new THREE.InstancedBufferAttribute(sizes, 1));
    geometry.setAttribute('iSeed', new THREE.InstancedBufferAttribute(seeds, 1));
    geometry.setAttribute('iKind', new THREE.InstancedBufferAttribute(kinds, 1));

    const material = new THREE.ShaderMaterial({
      vertexShader: FLAME_VERT,
      fragmentShader: FLAME_FRAG,
      uniforms: {uIntensity: {value: 1}, uTime: {value: 0}},
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending
    });

    const flames = new THREE.Mesh(geometry, material);
    flames.frustumCulled = false;
    scene.add(flames);

    const clock = new THREE.Clock();
    let rafId = 0;

    const renderLoop = () => {
      rafId = requestAnimationFrame(renderLoop);
      const p = paramsRef.current;
      const dyn = dynRef.current;
      const dt = Math.min(clock.getDelta(), 0.05);
      const time = clock.elapsedTime;
      const speed = p.riseSpeed;
      const count = Math.min(Math.round(p.particleCount), MAX_PARTICLES);

      material.uniforms.uIntensity.value = p.intensity * dyn.ignite * dyn.flicker;
      material.uniforms.uTime.value = time;

      for (let i = 0; i < count; i++) {
        let part = particles[i];
        part.age += dt;
        if (part.age >= part.life) {
          respawn(i, p, false);
          part = particles[i];
        }

        // Licking turbulence + slight upward buoyancy on flame tongues.
        part.vx += Math.sin(time * 3.5 + part.seed * 12) * p.turbulence * dt;
        part.vz += Math.cos(time * 2.7 + part.seed * 9) * p.turbulence * dt;
        const buoyancy = part.kind === 0 ? 1.2 : 0.0;
        part.vx += gx * dt;
        part.vy += (gy + buoyancy) * dt;
        part.vz += gz * dt;

        part.x += part.vx * speed * dt;
        part.y += part.vy * speed * dt;
        part.z += part.vz * speed * dt;

        const o = i * 3;
        offsets[o] = part.x;
        offsets[o + 1] = part.y;
        offsets[o + 2] = part.z;
        velocities[o] = part.vx * speed;
        velocities[o + 1] = part.vy * speed;
        velocities[o + 2] = part.vz * speed;
        lifes[i] = Math.min(part.age / part.life, 1);
        sizes[i] = part.size;
        seeds[i] = part.seed;
        kinds[i] = part.kind;
      }

      geometry.instanceCount = count;
      geometry.attributes.iOffset.needsUpdate = true;
      geometry.attributes.iVelocity.needsUpdate = true;
      geometry.attributes.iLife.needsUpdate = true;
      geometry.attributes.iSize.needsUpdate = true;
      geometry.attributes.iSeed.needsUpdate = true;
      geometry.attributes.iKind.needsUpdate = true;
      renderer.render(scene, camera);
    };
    renderLoop();

    const handleResize = () => {
      const w = mount.clientWidth || width;
      const h = mount.clientHeight || height;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(mount);

    // Flicker loop (anime.js) drives dyn.flicker up and down — roaring fire.
    const flicker = animate(dynRef.current, {
      flicker: [0.82, 1.18],
      duration: 700,
      ease: 'inOutSine',
      loop: true,
      alternate: true
    });

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      if (flicker && flicker.pause) flicker.pause();
      base.dispose();
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [preset]);

  return (
    <div
      ref={mountRef}
      className={`element-stage element-stage--${preset.id}`}
      aria-label={`${preset.label}-Animation`}
    />
  );
}

export default FireStage;
