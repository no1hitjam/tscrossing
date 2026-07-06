import * as THREE from "three";
import {
  INSTANCE_AGE_VERTEX_INIT,
  INSTANCE_AGE_VERTEX_PARS,
  INSTANCE_AGE_VERTEX_TRANSFORM,
  LIFECYCLE_OPACITY,
  PAPPUS_CHROMA_KEY,
} from "./particle-shaders";

const MAX_PARTICLES = 126;
const SPAWN_RATE = 1.2;
const MIN_LIFETIME = 64;
const MAX_LIFETIME = 124;
const FADE_IN = 2;
const FADE_OUT = 3.5;
const SPAWN_RADIUS = 32;
const SPAWN_HEIGHT_MIN = 1;
const SPAWN_HEIGHT_MAX = 6;
const MIN_SIZE = 0.14;
const MAX_SIZE = 0.28;
const DRIFT_SPEED = 0.42;
const MIN_SPIN = 3.5;
const MAX_SPIN = 7;
const WIND = new THREE.Vector3(0.85, -0.04, 0.35).normalize();

type HelicopterSeedParticle = {
  bActive: boolean;
  fAge: number;
  fLifetime: number;
  fScale: number;
  fSpin: number;
  fSpinSpeed: number;
  fTiltX: number;
  fTiltZ: number;
  vPosition: THREE.Vector3;
  vVelocity: THREE.Vector3;
};

export class HelicopterSeedParticles {
  readonly root = new THREE.Group();

  private readonly oMesh: THREE.InstancedMesh<
    THREE.PlaneGeometry,
    THREE.ShaderMaterial
  >;
  private readonly aParticles: HelicopterSeedParticle[];
  private readonly aInstanceAge: THREE.InstancedBufferAttribute;
  private readonly aInstanceLifetime: THREE.InstancedBufferAttribute;
  private readonly oDummy = new THREE.Object3D();
  private readonly vSpawnOffset = new THREE.Vector3();
  private readonly vSampleHeight: (fX: number, fZ: number) => number | null;
  private fSpawnAccumulator = 0;

  constructor(fnSampleHeight: (fX: number, fZ: number) => number | null) {
    this.vSampleHeight = fnSampleHeight;

    const oTexture = new THREE.TextureLoader().load(
      `${import.meta.env.BASE_URL}MapleSeed.png`,
    );
    oTexture.colorSpace = THREE.SRGBColorSpace;

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
          vec3 color = tex.rgb;
          ${PAPPUS_CHROMA_KEY}

          ${LIFECYCLE_OPACITY}
          float alpha = tex.a * (1.0 - keyAmount) * fadeInAlpha * fadeOutAlpha;

          if (alpha < 0.02) {
            discard;
          }

          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const oGeometry = new THREE.PlaneGeometry(1, 1);
    oGeometry.rotateX(-Math.PI * 0.5);

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
        fScale: 1,
        fSpin: 0,
        fSpinSpeed: 0,
        fTiltX: 0,
        fTiltZ: 0,
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

  update(fDt: number, vCenter: THREE.Vector3): void {
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
      oParticle.fSpin += oParticle.fSpinSpeed * fDt;

      this.oDummy.position.copy(oParticle.vPosition);
      this.oDummy.rotation.set(oParticle.fTiltX, oParticle.fSpin, oParticle.fTiltZ);
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

  private spawnParticle(vCenter: THREE.Vector3): void {
    const oParticle = this.aParticles.find((oCandidate) => !oCandidate.bActive);
    if (!oParticle) {
      return;
    }

    const fAngle = Math.random() * Math.PI * 2;
    const fRadius = Math.sqrt(Math.random()) * SPAWN_RADIUS;
    this.vSpawnOffset
      .copy(WIND)
      .multiplyScalar(-SPAWN_RADIUS * 0.9)
      .add(
        new THREE.Vector3(
          Math.cos(fAngle) * fRadius,
          THREE.MathUtils.lerp(SPAWN_HEIGHT_MIN, SPAWN_HEIGHT_MAX, Math.random()),
          Math.sin(fAngle) * fRadius,
        ),
      );

    oParticle.vPosition.copy(vCenter).add(this.vSpawnOffset);

    const fGround =
      this.vSampleHeight(oParticle.vPosition.x, oParticle.vPosition.z) ?? vCenter.y;
    oParticle.vPosition.y = Math.max(oParticle.vPosition.y, fGround + 1.2);

    oParticle.vVelocity
      .copy(WIND)
      .multiplyScalar(
        DRIFT_SPEED * THREE.MathUtils.lerp(0.8, 1.15, Math.random()),
      )
      .add(
        new THREE.Vector3(
          (Math.random() - 0.5) * 0.08,
          (Math.random() - 0.5) * 0.04,
          (Math.random() - 0.5) * 0.08,
        ),
      );

    oParticle.fAge = 0;
    oParticle.fLifetime = THREE.MathUtils.lerp(
      MIN_LIFETIME,
      MAX_LIFETIME,
      Math.random(),
    );
    oParticle.fScale = THREE.MathUtils.lerp(MIN_SIZE, MAX_SIZE, Math.random());
    oParticle.fSpin = Math.random() * Math.PI * 2;
    oParticle.fSpinSpeed =
      THREE.MathUtils.lerp(MIN_SPIN, MAX_SPIN, Math.random()) *
      (Math.random() < 0.5 ? -1 : 1);
    oParticle.fTiltX = THREE.MathUtils.lerp(-0.25, 0.25, Math.random());
    oParticle.fTiltZ = THREE.MathUtils.lerp(-0.25, 0.25, Math.random());
    oParticle.bActive = true;
  }
}
