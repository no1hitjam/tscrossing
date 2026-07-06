import * as THREE from "three";

const MAX_DEER = 20;
const SPAWN_RATE = 0.14;
const SPAWN_MIN_DISTANCE = 22;
const SPAWN_MAX_DISTANCE = 48;
const DESPAWN_DISTANCE = 65;
const MIN_LIFETIME = 40;
const MAX_LIFETIME = 100;
const WANDER_SPEED = 1.4;
const FLEE_SPEED = 5.5;
const FLEE_DISTANCE = 10;
const FLEE_DISTANCE_SQ = FLEE_DISTANCE * FLEE_DISTANCE;
const TURN_SPEED = 4;
const WANDER_TURN_INTERVAL_MIN = 2;
const WANDER_TURN_INTERVAL_MAX = 6;
const IDLE_CHANCE = 0.35;
const LEG_BOB_SPEED = 9;
const LEG_BOB_AMOUNT = 0.04;

const DEER_FUR_UV_SIZE = 0.15;
const DEER_ANTLER_COLOR = 0xd8cfc0;

const LEG_HEIGHT = 0.6;
const LEG_WIDTH = 0.09;
const LEG_REST_Y = LEG_HEIGHT * 0.5;
const BODY_CENTER_Y = LEG_HEIGHT + 0.18;
const BODY_HEIGHT = 0.42;
const BELLY_Y = BODY_CENTER_Y - 0.14;
const NECK_Y = BODY_CENTER_Y + 0.24;
const HEAD_Y = BODY_CENTER_Y + 0.36;
const SNOUT_Y = BODY_CENTER_Y + 0.3;
const ANTLER_Y = BODY_CENTER_Y + 0.52;
const ANTLER_BRANCH_Y = BODY_CENTER_Y + 0.58;

type DeerState = "idle" | "wander" | "flee";

type DeerInstance = {
  bActive: boolean;
  oMesh: THREE.Group;
  oLegs: THREE.Mesh[];
  fYaw: number;
  fTargetYaw: number;
  fWanderTimer: number;
  fAge: number;
  fLifetime: number;
  eState: DeerState;
  vVelocity: THREE.Vector3;
};

function applyFurFaceUvs(
  geometry: THREE.BufferGeometry,
  fFaceUvSize: number,
  fOffsetU: number,
  fOffsetV: number,
): void {
  const uvs = geometry.attributes.uv as THREE.BufferAttribute;

  for (let i = 0; i < uvs.count; i++) {
    uvs.setXY(
      i,
      fOffsetU + uvs.getX(i) * fFaceUvSize,
      fOffsetV + uvs.getY(i) * fFaceUvSize,
    );
  }

  uvs.needsUpdate = true;
}

function createFurBox(
  fWidth: number,
  fHeight: number,
  fDepth: number,
  oFurMaterial: THREE.MeshStandardMaterial,
  fOffsetU: number,
  fOffsetV: number,
): THREE.Mesh {
  const oGeometry = new THREE.BoxGeometry(fWidth, fHeight, fDepth);
  applyFurFaceUvs(oGeometry, DEER_FUR_UV_SIZE, fOffsetU, fOffsetV);
  const oMesh = new THREE.Mesh(oGeometry, oFurMaterial);
  oMesh.castShadow = true;
  return oMesh;
}

function createCubeDeerMesh(oFurMaterial: THREE.MeshStandardMaterial): THREE.Group {
  const oGroup = new THREE.Group();
  const fOffsetU = Math.random();
  const fOffsetV = Math.random();

  const oAntlerMaterial = new THREE.MeshStandardMaterial({
    color: DEER_ANTLER_COLOR,
    flatShading: true,
  });

  const oBody = createFurBox(0.52, BODY_HEIGHT, 0.88, oFurMaterial, fOffsetU, fOffsetV);
  oBody.position.y = BODY_CENTER_Y;
  oGroup.add(oBody);

  const oBelly = createFurBox(0.38, 0.22, 0.62, oFurMaterial, fOffsetU, fOffsetV);
  oBelly.position.set(0, BELLY_Y, 0.04);
  oGroup.add(oBelly);

  const oNeck = createFurBox(0.22, 0.34, 0.22, oFurMaterial, fOffsetU, fOffsetV);
  oNeck.position.set(0, NECK_Y, 0.38);
  oGroup.add(oNeck);

  const oHead = createFurBox(0.24, 0.22, 0.34, oFurMaterial, fOffsetU, fOffsetV);
  oHead.position.set(0, HEAD_Y, 0.58);
  oGroup.add(oHead);

  const oSnout = createFurBox(0.16, 0.12, 0.14, oFurMaterial, fOffsetU, fOffsetV);
  oSnout.position.set(0, SNOUT_Y, 0.78);
  oGroup.add(oSnout);

  const aLegOffsets: ReadonlyArray<readonly [number, number]> = [
    [-0.16, 0.28],
    [0.16, 0.28],
    [-0.16, -0.28],
    [0.16, -0.28],
  ];
  const aLegs: THREE.Mesh[] = [];
  for (const [fLegX, fLegZ] of aLegOffsets) {
    const oLeg = createFurBox(LEG_WIDTH, LEG_HEIGHT, LEG_WIDTH, oFurMaterial, fOffsetU, fOffsetV);
    oLeg.position.set(fLegX, LEG_REST_Y, fLegZ);
    oGroup.add(oLeg);
    aLegs.push(oLeg);
  }
  oGroup.userData.aLegs = aLegs;

  const oAntlerLeft = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.26, 0.06), oAntlerMaterial);
  oAntlerLeft.position.set(-0.1, ANTLER_Y, 0.54);
  oAntlerLeft.rotation.z = 0.28;
  oAntlerLeft.castShadow = true;
  oGroup.add(oAntlerLeft);

  const oAntlerRight = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.26, 0.06), oAntlerMaterial);
  oAntlerRight.position.set(0.1, ANTLER_Y, 0.54);
  oAntlerRight.rotation.z = -0.28;
  oAntlerRight.castShadow = true;
  oGroup.add(oAntlerRight);

  const oAntlerBranchLeft = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.05), oAntlerMaterial);
  oAntlerBranchLeft.position.set(-0.14, ANTLER_BRANCH_Y, 0.5);
  oAntlerBranchLeft.rotation.z = 0.6;
  oAntlerBranchLeft.castShadow = true;
  oGroup.add(oAntlerBranchLeft);

  const oAntlerBranchRight = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.05), oAntlerMaterial);
  oAntlerBranchRight.position.set(0.14, ANTLER_BRANCH_Y, 0.5);
  oAntlerBranchRight.rotation.z = -0.6;
  oAntlerBranchRight.castShadow = true;
  oGroup.add(oAntlerBranchRight);

  return oGroup;
}

export class CubeDeerActors {
  readonly root = new THREE.Group();

  private readonly fnSampleHeight: (fX: number, fZ: number) => number | null;
  private readonly fnIsBlocked: (fX: number, fZ: number) => boolean;
  private readonly aDeer: DeerInstance[] = [];
  private readonly vSpawnOffset = new THREE.Vector3();
  private readonly vFleeDir = new THREE.Vector3();
  private readonly oFurMaterial: THREE.MeshStandardMaterial;
  private fSpawnAccumulator = 0;
  private fLegBobPhase = 0;

  constructor(
    fnSampleHeight: (fX: number, fZ: number) => number | null,
    fnIsBlocked: (fX: number, fZ: number) => boolean,
  ) {
    this.fnSampleHeight = fnSampleHeight;
    this.fnIsBlocked = fnIsBlocked;

    const oFurTexture = new THREE.TextureLoader().load("/deer_fur.png");
    oFurTexture.wrapS = THREE.RepeatWrapping;
    oFurTexture.wrapT = THREE.RepeatWrapping;
    oFurTexture.colorSpace = THREE.SRGBColorSpace;

    this.oFurMaterial = new THREE.MeshStandardMaterial({
      map: oFurTexture,
      flatShading: true,
    });

    for (let i = 0; i < MAX_DEER; i++) {
      const oMesh = createCubeDeerMesh(this.oFurMaterial);
      oMesh.visible = false;
      this.root.add(oMesh);

      this.aDeer.push({
        bActive: false,
        oMesh,
        oLegs: oMesh.userData.aLegs as THREE.Mesh[],
        fYaw: 0,
        fTargetYaw: 0,
        fWanderTimer: 0,
        fAge: 0,
        fLifetime: 0,
        eState: "idle",
        vVelocity: new THREE.Vector3(),
      });
    }
  }

  update(fDt: number, vPlayerPosition: THREE.Vector3): void {
    this.fSpawnAccumulator += fDt * SPAWN_RATE;
    while (this.fSpawnAccumulator >= 1) {
      this.fSpawnAccumulator -= 1;
      this.trySpawn(vPlayerPosition);
    }

    let bMoving = false;

    for (const oDeer of this.aDeer) {
      if (!oDeer.bActive) {
        continue;
      }

      oDeer.fAge += fDt;
      const fDistSq = oDeer.oMesh.position.distanceToSquared(vPlayerPosition);
      if (oDeer.fAge >= oDeer.fLifetime || fDistSq > DESPAWN_DISTANCE * DESPAWN_DISTANCE) {
        this.despawnDeer(oDeer);
        continue;
      }

      if (fDistSq < FLEE_DISTANCE_SQ) {
        oDeer.eState = "flee";
        this.vFleeDir
          .subVectors(oDeer.oMesh.position, vPlayerPosition)
          .setY(0);
        if (this.vFleeDir.lengthSq() > 0.001) {
          this.vFleeDir.normalize();
          oDeer.fTargetYaw = Math.atan2(this.vFleeDir.x, this.vFleeDir.z);
          oDeer.vVelocity.copy(this.vFleeDir).multiplyScalar(FLEE_SPEED);
        }
      } else if (oDeer.eState === "flee") {
        oDeer.eState = "wander";
        oDeer.fWanderTimer = 0;
      }

      if (oDeer.eState !== "flee") {
        oDeer.fWanderTimer -= fDt;
        if (oDeer.fWanderTimer <= 0) {
          this.pickWanderBehavior(oDeer);
        }
      }

      const fSpeed = oDeer.vVelocity.length();
      if (fSpeed > 0.01) {
        const fNewX = oDeer.oMesh.position.x + oDeer.vVelocity.x * fDt;
        const fNewZ = oDeer.oMesh.position.z + oDeer.vVelocity.z * fDt;
        if (!this.fnIsBlocked(fNewX, oDeer.oMesh.position.z)) {
          oDeer.oMesh.position.x = fNewX;
        } else {
          oDeer.fTargetYaw += Math.PI * 0.5;
        }
        if (!this.fnIsBlocked(oDeer.oMesh.position.x, fNewZ)) {
          oDeer.oMesh.position.z = fNewZ;
        } else {
          oDeer.fTargetYaw += Math.PI * 0.5;
        }
        bMoving = true;
      }

      const fHeight =
        this.fnSampleHeight(oDeer.oMesh.position.x, oDeer.oMesh.position.z) ??
        oDeer.oMesh.position.y;
      oDeer.oMesh.position.y = fHeight;

      oDeer.fYaw = this.lerpAngle(oDeer.fYaw, oDeer.fTargetYaw, Math.min(1, TURN_SPEED * fDt));
      oDeer.oMesh.rotation.y = oDeer.fYaw;
    }

    if (bMoving) {
      this.fLegBobPhase += fDt * LEG_BOB_SPEED;
      const fBob = Math.sin(this.fLegBobPhase) * LEG_BOB_AMOUNT;
      for (const oDeer of this.aDeer) {
        if (!oDeer.bActive || oDeer.vVelocity.lengthSq() < 0.01) {
          continue;
        }
        for (let i = 0; i < oDeer.oLegs.length; i++) {
          const fLegBob = i < 2 ? fBob : -fBob;
          oDeer.oLegs[i].position.y = LEG_REST_Y + fLegBob;
        }
      }
    }
  }

  private trySpawn(vPlayerPosition: THREE.Vector3): void {
    const oDeer = this.aDeer.find((oCandidate) => !oCandidate.bActive);
    if (!oDeer) {
      return;
    }

    for (let iAttempt = 0; iAttempt < 6; iAttempt++) {
      const fAngle = Math.random() * Math.PI * 2;
      const fRadius = THREE.MathUtils.lerp(
        SPAWN_MIN_DISTANCE,
        SPAWN_MAX_DISTANCE,
        Math.random(),
      );
      this.vSpawnOffset.set(
        Math.cos(fAngle) * fRadius,
        0,
        Math.sin(fAngle) * fRadius,
      );
      const fSpawnX = vPlayerPosition.x + this.vSpawnOffset.x;
      const fSpawnZ = vPlayerPosition.z + this.vSpawnOffset.z;

      if (this.fnIsBlocked(fSpawnX, fSpawnZ)) {
        continue;
      }

      const fHeight = this.fnSampleHeight(fSpawnX, fSpawnZ);
      if (fHeight === null) {
        continue;
      }

      oDeer.bActive = true;
      oDeer.oMesh.visible = true;
      oDeer.oMesh.position.set(fSpawnX, fHeight, fSpawnZ);
      oDeer.fYaw = Math.random() * Math.PI * 2;
      oDeer.fTargetYaw = oDeer.fYaw;
      oDeer.oMesh.rotation.y = oDeer.fYaw;
      oDeer.fWanderTimer = THREE.MathUtils.lerp(
        WANDER_TURN_INTERVAL_MIN,
        WANDER_TURN_INTERVAL_MAX,
        Math.random(),
      );
      oDeer.fAge = 0;
      oDeer.fLifetime = THREE.MathUtils.lerp(
        MIN_LIFETIME,
        MAX_LIFETIME,
        Math.random(),
      );
      oDeer.eState = Math.random() < IDLE_CHANCE ? "idle" : "wander";
      oDeer.vVelocity.set(0, 0, 0);
      return;
    }
  }

  private pickWanderBehavior(oDeer: DeerInstance): void {
    if (Math.random() < IDLE_CHANCE) {
      oDeer.eState = "idle";
      oDeer.vVelocity.set(0, 0, 0);
    } else {
      oDeer.eState = "wander";
      oDeer.fTargetYaw = Math.random() * Math.PI * 2;
      const fDirX = Math.sin(oDeer.fTargetYaw);
      const fDirZ = Math.cos(oDeer.fTargetYaw);
      oDeer.vVelocity.set(fDirX, 0, fDirZ).multiplyScalar(WANDER_SPEED);
    }

    oDeer.fWanderTimer = THREE.MathUtils.lerp(
      WANDER_TURN_INTERVAL_MIN,
      WANDER_TURN_INTERVAL_MAX,
      Math.random(),
    );
  }

  private despawnDeer(oDeer: DeerInstance): void {
    oDeer.bActive = false;
    oDeer.oMesh.visible = false;
    oDeer.vVelocity.set(0, 0, 0);
    for (const oLeg of oDeer.oLegs) {
      oLeg.position.y = LEG_REST_Y;
    }
  }

  private lerpAngle(fFrom: number, fTo: number, fT: number): number {
    let fDelta = fTo - fFrom;
    while (fDelta > Math.PI) {
      fDelta -= Math.PI * 2;
    }
    while (fDelta < -Math.PI) {
      fDelta += Math.PI * 2;
    }
    return fFrom + fDelta * fT;
  }
}
