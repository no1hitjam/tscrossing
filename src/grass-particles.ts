import * as THREE from "three";
import {
  INSTANCE_AGE_VERTEX_INIT,
  INSTANCE_AGE_VERTEX_PARS,
  INSTANCE_AGE_VERTEX_TRANSFORM,
  LIFECYCLE_OPACITY,
} from "./particle-shaders";
import { createGrassBladeTexture } from "./grass-blade-texture";

const MAX_PARTICLES = 720;
const SPAWN_RATE = 28;
const MIN_LIFETIME = 7;
const MAX_LIFETIME = 13;
const FADE_IN = 0.25;
const FADE_OUT = 1.5;
const SPAWN_RADIUS = 22;
const SPAWN_HEIGHT_MIN = 0.6;
const SPAWN_HEIGHT_MAX = 1.8;
const MIN_SIZE = 0.18;
const MAX_SIZE = 0.34;
const BLADE_WIDTH_SCALE = 0.6;
const BLADE_HEIGHT_SCALE = 1.2;
const WIND_SPEED = 0.95;
const WIND = new THREE.Vector3(0.85, 0.05, 0.35).normalize();
const GROUND_CLEARANCE = 0.45;

type GrassParticle = {
  bActive: boolean;
  fAge: number;
  fLifetime: number;
  fRotation: number;
  fRotationSpeed: number;
  fScale: number;
  vPosition: THREE.Vector3;
  vVelocity: THREE.Vector3;
};

export class GrassParticles {
  readonly root = new THREE.Group();

  private readonly oMesh: THREE.InstancedMesh<
    THREE.PlaneGeometry,
    THREE.ShaderMaterial
  >;
  private readonly aParticles: GrassParticle[];
  private readonly aInstanceAge: THREE.InstancedBufferAttribute;
  private readonly aInstanceLifetime: THREE.InstancedBufferAttribute;
  private readonly oDummy = new THREE.Object3D();
  private readonly vSpawnOffset = new THREE.Vector3();
  private readonly vSampleHeight: (fX: number, fZ: number) => number | null;
  private fSpawnAccumulator = 0;

  constructor(fnSampleHeight: (fX: number, fZ: number) => number | null) {
    this.vSampleHeight = fnSampleHeight;

    const oTexture = createGrassBladeTexture();

    const oMaterial = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: oTexture },
        fadeIn: { value: FADE_IN },
        fadeOut: { value: FADE_OUT },
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

          gl_FragColor = vec4(tex.rgb, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
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
    this.oMesh.renderOrder = 2;
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
        oParticle.bActive = false;
        this.oDummy.scale.setScalar(0);
        this.oDummy.updateMatrix();
        this.oMesh.setMatrixAt(i, this.oDummy.matrix);
        bMatrixDirty = true;
        continue;
      }

      oParticle.vPosition.addScaledVector(oParticle.vVelocity, fDt);
      oParticle.fRotation += oParticle.fRotationSpeed * fDt;

      const fGround =
        this.vSampleHeight(oParticle.vPosition.x, oParticle.vPosition.z) ??
        vCenter.y;
      oParticle.vPosition.y = Math.max(
        oParticle.vPosition.y,
        fGround + GROUND_CLEARANCE,
      );

      this.oDummy.position.copy(oParticle.vPosition);
      this.oDummy.lookAt(oCamera.position);
      this.oDummy.rotateZ(oParticle.fRotation);
      this.oDummy.scale.set(
        oParticle.fScale * BLADE_WIDTH_SCALE,
        oParticle.fScale * BLADE_HEIGHT_SCALE,
        oParticle.fScale,
      );
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

  private spawnParticle(vCenter: THREE.Vector3): void {
    const nIndex = this.aParticles.findIndex((oCandidate) => !oCandidate.bActive);
    if (nIndex < 0) {
      return;
    }

    const oParticle = this.aParticles[nIndex];
    const fAngle = Math.random() * Math.PI * 2;
    const fRadius = Math.sqrt(Math.random()) * SPAWN_RADIUS;
    this.vSpawnOffset.set(
      Math.cos(fAngle) * fRadius,
      THREE.MathUtils.lerp(SPAWN_HEIGHT_MIN, SPAWN_HEIGHT_MAX, Math.random()),
      Math.sin(fAngle) * fRadius,
    );

    oParticle.vPosition.copy(vCenter).add(this.vSpawnOffset);

    const fGround =
      this.vSampleHeight(oParticle.vPosition.x, oParticle.vPosition.z) ??
      vCenter.y;
    oParticle.vPosition.y = fGround + THREE.MathUtils.lerp(
      SPAWN_HEIGHT_MIN,
      SPAWN_HEIGHT_MAX,
      Math.random(),
    );

    oParticle.vVelocity
      .copy(WIND)
      .multiplyScalar(
        WIND_SPEED * THREE.MathUtils.lerp(0.7, 1.2, Math.random()),
      )
      .add(
        new THREE.Vector3(
          (Math.random() - 0.5) * 0.18,
          (Math.random() - 0.5) * 0.04,
          (Math.random() - 0.5) * 0.18,
        ),
      );

    oParticle.fAge = 0;
    oParticle.fLifetime = THREE.MathUtils.lerp(
      MIN_LIFETIME,
      MAX_LIFETIME,
      Math.random(),
    );
    oParticle.fRotation = Math.random() * Math.PI * 2;
    oParticle.fRotationSpeed = THREE.MathUtils.lerp(-0.5, 0.5, Math.random());
    oParticle.fScale = THREE.MathUtils.lerp(MIN_SIZE, MAX_SIZE, Math.random());
    oParticle.bActive = true;

    this.aInstanceAge.array[nIndex] = 0;
    this.aInstanceLifetime.array[nIndex] = oParticle.fLifetime;
    this.aInstanceAge.needsUpdate = true;
    this.aInstanceLifetime.needsUpdate = true;
  }
}
