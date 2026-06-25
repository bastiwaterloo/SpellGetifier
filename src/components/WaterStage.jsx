import {useRef, useEffect} from 'react';
import * as THREE from 'three';
import {animate} from 'animejs';
import {MAX_PARTICLES} from '../config/elementPresets.js';
import './ElementStage.css';

const rand = (min, max) => min + Math.random() * (max - min);

// Billboard each instanced quad, then stretch it along the particle's
// screen-space velocity (round when slow, streak when fast). Foam/mist (kind>0)
// stay round. Built-in ShaderMaterial uniforms/attributes (position, uv,
// modelViewMatrix, projectionMatrix) are injected automatically.
const DROPLET_VERT = `
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

    float stretch = clamp(speed * 0.35, 0.0, 1.6);
    if (iKind > 0.5) stretch = 0.0;

    float lenScale = iSize * (1.0 + stretch);
    float widScale = iSize * (1.0 - 0.25 * stretch / 1.6);

    vec2 offset = perp * (position.x * widScale) + along * (position.y * lenScale);
    mvCenter.xy += offset;
    gl_Position = projectionMatrix * mvCenter;
  }
`;

// Soft round body + offset specular highlight. Alpha fades with life (thins
// out, never blackens). Color depends on kind: 0 jet, 1 foam, 2 mist.
const DROPLET_FRAG = `
  precision mediump float;
  uniform float uIntensity;

  varying vec2 vUv;
  varying float vLife;
  varying float vSeed;
  varying float vKind;

  void main() {
    float r = length(vUv - 0.5) * 2.0;
    float body = smoothstep(1.0, 0.2, r);

    float lifeAlpha = 1.0 - vLife;
    lifeAlpha *= lifeAlpha;

    vec3 jetCol = mix(vec3(0.55, 0.80, 1.00), vec3(0.15, 0.45, 0.85), vLife);
    vec3 foamCol = vec3(0.90, 0.96, 1.00);
    vec3 mistCol = vec3(0.70, 0.85, 1.00);

    vec3 col = jetCol;
    if (vKind > 1.5) col = mistCol;
    else if (vKind > 0.5) col = foamCol;

    float hi = smoothstep(0.30, 0.0, length(vUv - vec2(0.38, 0.32)));
    col += hi * 0.6 * body;

    float alpha = body * lifeAlpha * uIntensity;
    if (vKind > 1.5) alpha *= 0.5;

    if (alpha < 0.01) discard;
    gl_FragColor = vec4(col, alpha);
  }
`;

// Map the world-unit particle size from the pixel-ish particleSize slider.
const sizeWorld = (particleSize) => particleSize * 0.011;

// Spawn a jet droplet at the nozzle: outward + strong upward velocity.
function spawnJet(p, baseY) {
  const angle = Math.random() * Math.PI * 2;
  const out = Math.random() * 0.5 * p.spread;
  return {
    x: Math.cos(angle) * out * 0.3,
    y: baseY,
    z: Math.sin(angle) * out * 0.3,
    vx: Math.cos(angle) * out,
    vy: rand(1.8, 2.6),
    vz: Math.sin(angle) * out,
    age: 0,
    life: p.flameHeight * rand(0.85, 1.15),
    seed: Math.random(),
    size: sizeWorld(p.particleSize) * rand(0.7, 1.2),
    kind: 0
  };
}

function WaterStage({preset, params, igniteKey}) {
  const mountRef = useRef(null);
  const paramsRef = useRef(params);
  const dynRef = useRef({ignite: 0});

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
    const baseY = preset.water?.baseY ?? -0.9;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 100);
    camera.position.set(0, ty, 5);
    camera.lookAt(tx, ty, tz);

    const renderer = new THREE.WebGLRenderer({antialias: true, alpha: true});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    // Per-instance buffers + JS particle state.
    const offsets = new Float32Array(MAX_PARTICLES * 3);
    const velocities = new Float32Array(MAX_PARTICLES * 3);
    const lifes = new Float32Array(MAX_PARTICLES);
    const sizes = new Float32Array(MAX_PARTICLES);
    const seeds = new Float32Array(MAX_PARTICLES);
    const kinds = new Float32Array(MAX_PARTICLES);
    const particles = new Array(MAX_PARTICLES);

    const respawn = (i, p, staggered) => {
      const s = spawnJet(p, baseY);
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
      vertexShader: DROPLET_VERT,
      fragmentShader: DROPLET_FRAG,
      uniforms: {uIntensity: {value: 1}},
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending
    });

    const points = new THREE.Mesh(geometry, material);
    points.frustumCulled = false;
    scene.add(points);

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

      material.uniforms.uIntensity.value = p.intensity * dyn.ignite;

      for (let i = 0; i < count; i++) {
        let part = particles[i];
        part.age += dt;
        if (part.age >= part.life) {
          respawn(i, p, false);
          part = particles[i];
        }

        part.vx += Math.sin(time * 3 + part.seed * 10) * p.turbulence * dt;
        part.vz += Math.cos(time * 2.3 + part.seed * 7) * p.turbulence * dt;
        part.vx += gx * dt;
        part.vy += gy * dt;
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

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
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

export default WaterStage;
