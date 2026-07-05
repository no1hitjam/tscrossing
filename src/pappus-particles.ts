import * as THREE from "three";
import {
  INSTANCE_AGE_VERTEX_INIT,
  INSTANCE_AGE_VERTEX_PARS,
  INSTANCE_AGE_VERTEX_TRANSFORM,
  LIFECYCLE_OPACITY,
  PAPPUS_CHROMA_KEY,
} from "./particle-shaders";

const MAX_PARTICLES = 96;
const SPAWN_RATE = 3.5;
const MIN_LIFETIME = 9;
const MAX_LIFETIME = 16;
const FADE_IN = 1.8;
const FADE_OUT = 3;
const SPAWN_RADIUS = 28;
const SPAWN_HEIGHT_MIN = 1.5;
const SPAWN_HEIGHT_MAX = 5;
const MIN_SIZE = 0.08;
const MAX_SIZE = 0.18;
const WIND_SPEED = 1.1;
const WIND = new THREE.Vector3(0.85, 0.08, 0.35).normalize();

type PappusParticle = {
  bActive: boolean;
  fAge: number;
  fLifetime: number;
  fRotation: number;
  fRotationSpeed: number;
  fScale: number;
  vPosition: THREE.Vector3;
  vVelocity: THREE.Vector3;
};

export class PappusParticles {
  readonly root = new THREE.Group();

  private readonly oMesh: THREE.InstancedMesh<
    THREE.PlaneGeometry,
    THREE.ShaderMaterial
  >;
  private readonly aParticles: PappusParticle[];
  private readonly aInstanceAge: THREE.InstancedBufferAttribute;
  private readonly aInstanceLifetime: THREE.InstancedBufferAttribute;
  private readonly oDummy = new THREE.Object3D();
  private readonly vSpawnOffset = new THREE.Vector3();
  private readonly vSampleHeight: (fX: number, fZ: number) => number | null;
  private fSpawnAccumulator = 0;

  constructor(fnSampleHeight: (fX: number, fZ: number) => number | null) {
    this.vSampleHeight = fnSampleHeight;

    const oTexture = new THREE.TextureLoader().load("/DandelionPappus.png");
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

  private spawnParticle(vCenter: THREE.Vector3): void {
    const oParticle = this.aParticles.find((oCandidate) => !oCandidate.bActive);
    if (!oParticle) {
      return;
    }

    const fAngle = Math.random() * Math.PI * 2;
    const fRadius = Math.sqrt(Math.random()) * SPAWN_RADIUS;
    this.vSpawnOffset
      .copy(WIND)
      .multiplyScalar(-SPAWN_RADIUS * 0.85)
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
    oParticle.vPosition.y = Math.max(oParticle.vPosition.y, fGround + 0.6);

    oParticle.vVelocity
      .copy(WIND)
      .multiplyScalar(
        WIND_SPEED * THREE.MathUtils.lerp(0.75, 1.25, Math.random()),
      )
      .add(
        new THREE.Vector3(
          (Math.random() - 0.5) * 0.25,
          (Math.random() - 0.5) * 0.08,
          (Math.random() - 0.5) * 0.25,
        ),
      );

    oParticle.fAge = 0;
    oParticle.fLifetime = THREE.MathUtils.lerp(
      MIN_LIFETIME,
      MAX_LIFETIME,
      Math.random(),
    );
    oParticle.fRotation = Math.random() * Math.PI * 2;
    oParticle.fRotationSpeed = THREE.MathUtils.lerp(-0.4, 0.4, Math.random());
    oParticle.fScale = THREE.MathUtils.lerp(MIN_SIZE, MAX_SIZE, Math.random());
    oParticle.bActive = true;
  }
}
