import * as THREE from "three";
import {
  INSTANCE_AGE_VERTEX_INIT,
  INSTANCE_AGE_VERTEX_PARS,
  INSTANCE_AGE_VERTEX_TRANSFORM,
  LIFECYCLE_OPACITY,
} from "./particle-shaders";
import { createSnowCircleTexture } from "./snow-circle-texture";

const MAX_PARTICLES = 240;
const SPAWN_RATE = 18;
const MIN_LIFETIME = 8;
const MAX_LIFETIME = 16;
const FADE_IN = 0.4;
const FADE_OUT = 1.2;
const SPAWN_RADIUS = 24;
const SPAWN_HEIGHT_MIN = 14;
const SPAWN_HEIGHT_MAX = 22;
const MIN_SIZE = 0.04;
const MAX_SIZE = 0.06;
const FALL_SPEED = 2.2;
const WIND = new THREE.Vector3(0.35, 0, 0.18).normalize();

type SnowParticle = {
  bActive: boolean;
  fAge: number;
  fLifetime: number;
  fRotation: number;
  fRotationSpeed: number;
  fScale: number;
  vPosition: THREE.Vector3;
  vVelocity: THREE.Vector3;
};

export class SnowParticles {
  readonly root = new THREE.Group();

  private readonly oMesh: THREE.InstancedMesh<
    THREE.PlaneGeometry,
    THREE.ShaderMaterial
  >;
  private readonly aParticles: SnowParticle[];
  private readonly aInstanceAge: THREE.InstancedBufferAttribute;
  private readonly aInstanceLifetime: THREE.InstancedBufferAttribute;
  private readonly oDummy = new THREE.Object3D();
  private readonly vSpawnOffset = new THREE.Vector3();
  private readonly vSampleHeight: (fX: number, fZ: number) => number | null;
  private fSpawnAccumulator = 0;

  constructor(fnSampleHeight: (fX: number, fZ: number) => number | null) {
    this.vSampleHeight = fnSampleHeight;

    const oTexture = createSnowCircleTexture();

    const oMaterial = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: oTexture },
        fadeIn: { value: FADE_IN },
        fadeOut: { value: FADE_OUT },
        uAmbientLight: { value: new THREE.Color(0.55, 0.55, 0.55) },
        uDirectionalLight: { value: new THREE.Color(1.1, 1.1, 1.1) },
      },
      vertexShader: `
        ${INSTANCE_AGE_VERTEX_PARS}

        varying vec2 vUv;

        void main() {
          vUv = uv;
          ${INSTANCE_AGE_VERTEX_INIT}
          ${INSTANCE_AGE_VERTEX_TRANSFORM}
        }
      `,
      fragmentShader: `
        uniform sampler2D map;
        uniform float fadeIn;
        uniform float fadeOut;
        uniform vec3 uAmbientLight;
        uniform vec3 uDirectionalLight;

        varying vec2 vUv;
        varying float vAge;
        varying float vLifetime;

        void main() {
          vec4 tex = texture2D(map, vUv);
          ${LIFECYCLE_OPACITY}
          float alpha = tex.a * fadeInAlpha * fadeOutAlpha;

          if (alpha < 0.02) {
            discard;
          }

          vec3 vLit = uAmbientLight + uDirectionalLight;
          gl_FragColor = vec4(tex.rgb * vLit, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const oGeometry = new THREE.PlaneGeometry(1, 1);
    const aAge = new Float32Array(MAX_PARTICLES);
    const aLifetime = new Float32Array(MAX_PARTICLES);
    this.aInstanceAge = new THREE.InstancedBufferAttribute(aAge, 1);
    this.aInstanceLifetime = new THREE.InstancedBufferAttribute(aLifetime, 1);
    oGeometry.setAttribute("instanceAge", this.aInstanceAge);
    oGeometry.setAttribute("instanceLifetime", this.aInstanceLifetime);

    this.oMesh = new THREE.InstancedMesh(oGeometry, oMaterial, MAX_PARTICLES);
    this.oMesh.frustumCulled = false;
    this.root.add(this.oMesh);

    this.aParticles = [];
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.aParticles.push({
        bActive: false,
        fAge: 0,
        fLifetime: 1,
        fRotation: 0,
        fRotationSpeed: 0,
        fScale: 1,
        vPosition: new THREE.Vector3(),
        vVelocity: new THREE.Vector3(),
      });
      aAge[i] = 1;
      aLifetime[i] = 1;
      this.oDummy.scale.setScalar(0);
      this.oDummy.updateMatrix();
      this.oMesh.setMatrixAt(i, this.oDummy.matrix);
    }

    this.oMesh.instanceMatrix.needsUpdate = true;
    this.aInstanceAge.needsUpdate = true;
    this.aInstanceLifetime.needsUpdate = true;
  }

  setDayNightLighting(
    oAmbientLight: THREE.Color,
    oDirectionalLight: THREE.Color,
  ): void {
    const oUniforms = this.oMesh.material.uniforms;
    oUniforms.uAmbientLight.value.copy(oAmbientLight);
    oUniforms.uDirectionalLight.value.copy(oDirectionalLight);
  }

  update(fDt: number, oCamera: THREE.Camera, vCenter: THREE.Vector3): void {
    this.fSpawnAccumulator += fDt * SPAWN_RATE;
    while (this.fSpawnAccumulator >= 1) {
      this.fSpawnAccumulator -= 1;
      this.spawnParticle(vCenter);
    }

    let bMatrixDirty = false;
    let bAgeDirty = false;

    for (let i = 0; i < MAX_PARTICLES; i++) {
      const oParticle = this.aParticles[i];
      if (!oParticle.bActive) {
        continue;
      }

      oParticle.fAge += fDt;
      if (oParticle.fAge >= oParticle.fLifetime) {
        this.deactivateParticle(i, oParticle);
        bMatrixDirty = true;
        continue;
      }

      oParticle.vPosition.addScaledVector(oParticle.vVelocity, fDt);
      oParticle.fRotation += oParticle.fRotationSpeed * fDt;

      const fGround =
        this.vSampleHeight(oParticle.vPosition.x, oParticle.vPosition.z) ??
        vCenter.y;
      if (oParticle.vPosition.y <= fGround + 0.15) {
        this.deactivateParticle(i, oParticle);
        bMatrixDirty = true;
        continue;
      }

      this.oDummy.position.copy(oParticle.vPosition);
      this.oDummy.lookAt(oCamera.position);
      this.oDummy.rotateZ(oParticle.fRotation);
      this.oDummy.scale.setScalar(oParticle.fScale);
      this.oDummy.updateMatrix();
      this.oMesh.setMatrixAt(i, this.oDummy.matrix);

      this.aInstanceAge.array[i] = oParticle.fAge;
      this.aInstanceLifetime.array[i] = oParticle.fLifetime;
      bMatrixDirty = true;
      bAgeDirty = true;
    }

    if (bMatrixDirty) {
      this.oMesh.instanceMatrix.needsUpdate = true;
    }
    if (bAgeDirty) {
      this.aInstanceAge.needsUpdate = true;
      this.aInstanceLifetime.needsUpdate = true;
    }
  }

  dispose(): void {
    this.oMesh.geometry.dispose();
    this.oMesh.material.dispose();
    this.oMesh.material.uniforms.map.value?.dispose();
  }

  private deactivateParticle(nIndex: number, oParticle: SnowParticle): void {
    oParticle.bActive = false;
    this.oDummy.scale.setScalar(0);
    this.oDummy.updateMatrix();
    this.oMesh.setMatrixAt(nIndex, this.oDummy.matrix);
  }

  private spawnParticle(vCenter: THREE.Vector3): void {
    const oParticle = this.aParticles.find((oCandidate) => !oCandidate.bActive);
    if (!oParticle) {
      return;
    }

    const fAngle = Math.random() * Math.PI * 2;
    const fRadius = Math.sqrt(Math.random()) * SPAWN_RADIUS;
    this.vSpawnOffset.set(
      Math.cos(fAngle) * fRadius,
      THREE.MathUtils.lerp(SPAWN_HEIGHT_MIN, SPAWN_HEIGHT_MAX, Math.random()),
      Math.sin(fAngle) * fRadius,
    );

    oParticle.vPosition.copy(vCenter).add(this.vSpawnOffset);

    const fGround =
      this.vSampleHeight(oParticle.vPosition.x, oParticle.vPosition.z) ?? vCenter.y;
    oParticle.vPosition.y = Math.max(oParticle.vPosition.y, fGround + SPAWN_HEIGHT_MIN);

    oParticle.vVelocity
      .copy(WIND)
      .multiplyScalar(
        THREE.MathUtils.lerp(0.35, 0.75, Math.random()),
      )
      .add(
        new THREE.Vector3(
          (Math.random() - 0.5) * 0.2,
          -FALL_SPEED * THREE.MathUtils.lerp(0.75, 1.25, Math.random()),
          (Math.random() - 0.5) * 0.2,
        ),
      );

    oParticle.fAge = 0;
    oParticle.fLifetime = THREE.MathUtils.lerp(
      MIN_LIFETIME,
      MAX_LIFETIME,
      Math.random(),
    );
    oParticle.fRotation = Math.random() * Math.PI * 2;
    oParticle.fRotationSpeed = THREE.MathUtils.lerp(-0.6, 0.6, Math.random());
    oParticle.fScale = THREE.MathUtils.lerp(MIN_SIZE, MAX_SIZE, Math.random());
    oParticle.bActive = true;
  }
}
