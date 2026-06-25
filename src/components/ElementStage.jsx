import {useRef, useEffect} from 'react';
import * as THREE from 'three';
import {animate} from 'animejs';
import {MAX_PARTICLES} from '../config/elementPresets.js';
import './ElementStage.css';

// Radialer Farbverlauf als Partikel-Sprite (heißer/heller Kern -> transparent).
function makeParticleTexture() {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(
        size / 2, size / 2, 0,
        size / 2, size / 2, size / 2
    );
    gradient.addColorStop(0.0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.4, 'rgba(255,255,255,0.65)');
    gradient.addColorStop(1.0, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(canvas);
}

// Generische 3D-Partikel-Stage. Element-Spezifika (Farbe, Spawn, Schwerkraft,
// Kamera) kommen aus dem preset; die Slider-Werte aus params (live via ref).
function ElementStage({preset, params, igniteKey}) {
    const mountRef = useRef(null);
    const paramsRef = useRef(params);
    // Von anime.js getriebene Dynamik: Zünd-Rampe + Flacker-Loop.
    const dynRef = useRef({ignite: 0, flicker: 1});

    // Immer die neuesten Slider-Werte für die Render-Schleife bereitstellen.
    useEffect(() => {
        paramsRef.current = params;
    }, [params]);

    // Zündung (anime.js) bei Mount und jedem igniteKey-Wechsel.
    useEffect(() => {
        dynRef.current.ignite = 0;
        animate(dynRef.current, {
            ignite: 1,
            duration: 650,
            ease: 'outQuad'
        });
    }, [igniteKey]);

    // Three.js-Setup; baut bei Preset-Wechsel neu auf (Farbe/Spawn/Kamera).
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

        // Buffer einmalig auf MAX allokieren; gezeichnet wird nur ein Teilbereich
        // (Slider "Partikel") via setDrawRange.
        const positions = new Float32Array(MAX_PARTICLES * 3);
        const colors = new Float32Array(MAX_PARTICLES * 3);
        const particles = new Array(MAX_PARTICLES);

        const respawn = (i, p, staggered) => {
            const s = preset.spawn(p);
            s.seed = Math.random();
            // Beim ersten Befüllen gestaffelter Start, sonst frisch (age 0).
            s.age = staggered ? Math.random() * s.life : 0;
            particles[i] = s;
        };
        for (let i = 0; i < MAX_PARTICLES; i++) respawn(i, paramsRef.current, true);

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        // Additiv = leuchtend (Feuer/Licht); normal = deckend-transparent (Wasser).
        const blending =
            preset.blending === 'normal'
                ? THREE.NormalBlending
                : THREE.AdditiveBlending;

        const texture = makeParticleTexture();
        const material = new THREE.PointsMaterial({
            size: paramsRef.current.particleSize,
            map: texture,
            vertexColors: true,
            transparent: true,
            opacity: preset.opacity ?? 1,
            depthWrite: false,
            blending,
            sizeAttenuation: true
        });

        const points = new THREE.Points(geometry, material);
        scene.add(points);

        const clock = new THREE.Clock();
        const color = new THREE.Color();
        let rafId = 0;

        const renderLoop = () => {
            rafId = requestAnimationFrame(renderLoop);
            const p = paramsRef.current;
            const dyn = dynRef.current;
            const dt = Math.min(clock.getDelta(), 0.05);
            const time = clock.elapsedTime;
            const speed = p.riseSpeed;
            const count = Math.min(Math.round(p.particleCount), MAX_PARTICLES);
            const brightness = p.intensity * dyn.ignite * dyn.flicker;

            for (let i = 0; i < count; i++) {
                let part = particles[i];
                part.age += dt;
                if (part.age >= part.life) {
                    respawn(i, p, false);
                    part = particles[i];
                }

                // Turbulenz (Wirbeln) + Schwerkraft.
                part.vx += Math.sin(time * 3 + part.seed * 10) * p.turbulence * dt;
                part.vz += Math.cos(time * 2.3 + part.seed * 7) * p.turbulence * dt;
                part.vx += gx * dt;
                part.vy += gy * dt;
                part.vz += gz * dt;

                part.x += part.vx * speed * dt;
                part.y += part.vy * speed * dt;
                part.z += part.vz * speed * dt;

                const t = Math.min(part.age / part.life, 1);
                const fade = (1 - t) * (1 - t);
                preset.color(t, color);

                const o = i * 3;
                positions[o] = part.x;
                positions[o + 1] = part.y;
                positions[o + 2] = part.z;
                colors[o] = color.r * fade * brightness;
                colors[o + 1] = color.g * fade * brightness;
                colors[o + 2] = color.b * fade * brightness;
            }

            geometry.setDrawRange(0, count);
            geometry.attributes.position.needsUpdate = true;
            geometry.attributes.color.needsUpdate = true;
            material.size = p.particleSize;
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

        // Flacker-Loop (anime.js) treibt dyn.flicker auf und ab.
        const flicker = animate(dynRef.current, {
            flicker: [0.82, 1.15],
            duration: 900,
            ease: 'inOutSine',
            loop: true,
            alternate: true
        });

        return () => {
            cancelAnimationFrame(rafId);
            resizeObserver.disconnect();
            if (flicker && flicker.pause) flicker.pause();
            geometry.dispose();
            material.dispose();
            texture.dispose();
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

export default ElementStage;
