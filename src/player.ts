import * as THREE from "three";

const MOVE_SPEED = 6;
const SPRINT_MULTIPLIER = 1.75;
const PLAYER_HEIGHT = 1.6;
const PLAYER_BASE_RADIUS = 0.45;
const PLAYER_TOP_RADIUS = 0.18;
const TARGET_DISTANCE = 0.5;
const RESOURCE_YIELD = 3;

export class Player {
  readonly mesh: THREE.Group;
  readonly vTarget = new THREE.Vector3();
  private readonly vVelocity = new THREE.Vector3();
  private readonly fnSampleHeight: (fX: number, fZ: number) => number | null;
  private readonly fnIsBlocked: (fX: number, fZ: number) => boolean;
  private fYaw = 0;
  private nRocks = 0;
  private nWood = 0;
  private nMushrooms = 0;

  constructor(
    fnSampleHeight: (fX: number, fZ: number) => number | null,
    fnIsBlocked: (fX: number, fZ: number) => boolean,
  ) {
    this.fnSampleHeight = fnSampleHeight;
    this.fnIsBlocked = fnIsBlocked;
    this.mesh = new THREE.Group();
    this.applyTerrainHeight(0, 0);

    const oPlayerTexture = new THREE.TextureLoader().load("/Player.png");
    oPlayerTexture.wrapS = THREE.RepeatWrapping;
    oPlayerTexture.wrapT = THREE.RepeatWrapping;
    oPlayerTexture.colorSpace = THREE.SRGBColorSpace;

    const bodyMaterial = new THREE.MeshStandardMaterial({
      map: oPlayerTexture,
      flatShading: true,
    });
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(
        PLAYER_TOP_RADIUS,
        PLAYER_BASE_RADIUS,
        PLAYER_HEIGHT,
        4,
      ),
      bodyMaterial,
    );
    body.castShadow = true;
    body.position.y = PLAYER_HEIGHT * 0.5;
    this.mesh.add(body);

    this.updateTargetPosition(0, 0);
  }

  update(
    dt: number,
    keys: Readonly<Record<string, boolean>>,
    cameraYaw: number,
  ): void {
    const moveInput = new THREE.Vector2(
      Number(keys["KeyD"] || keys["ArrowRight"]) -
        Number(keys["KeyA"] || keys["ArrowLeft"]),
      Number(keys["KeyW"] || keys["ArrowUp"]) -
        Number(keys["KeyS"] || keys["ArrowDown"]),
    );

    if (moveInput.lengthSq() > 0) {
      moveInput.normalize();
      const forward = new THREE.Vector3(
        -Math.sin(cameraYaw),
        0,
        -Math.cos(cameraYaw),
      );
      const right = new THREE.Vector3().crossVectors(
        forward,
        new THREE.Vector3(0, 1, 0),
      );
      const moveDir = new THREE.Vector3()
        .addScaledVector(forward, moveInput.y)
        .addScaledVector(right, moveInput.x)
        .normalize();

      const speed =
        MOVE_SPEED * (keys["ShiftLeft"] || keys["ShiftRight"] ? SPRINT_MULTIPLIER : 1);
      this.vVelocity.x = moveDir.x * speed;
      this.vVelocity.z = moveDir.z * speed;

      this.fYaw = Math.atan2(moveDir.x, moveDir.z);
      this.mesh.rotation.y = this.fYaw;
    } else {
      this.vVelocity.x = 0;
      this.vVelocity.z = 0;
    }

    const fNewX = this.mesh.position.x + this.vVelocity.x * dt;
    const fNewZ = this.mesh.position.z + this.vVelocity.z * dt;

    if (!this.fnIsBlocked(fNewX, this.mesh.position.z)) {
      this.mesh.position.x = fNewX;
    }

    if (!this.fnIsBlocked(this.mesh.position.x, fNewZ)) {
      this.mesh.position.z = fNewZ;
    }

    this.applyTerrainHeight(this.mesh.position.x, this.mesh.position.z);
    this.updateTargetPosition(this.mesh.position.x, this.mesh.position.z);
  }

  private updateTargetPosition(fPlayerX: number, fPlayerZ: number): void {
    const fForwardX = Math.sin(this.fYaw);
    const fForwardZ = Math.cos(this.fYaw);
    this.vTarget.set(
      fPlayerX + fForwardX * TARGET_DISTANCE,
      0,
      fPlayerZ + fForwardZ * TARGET_DISTANCE,
    );
  }

  private applyTerrainHeight(fX: number, fZ: number): void {
    const fHeight = this.fnSampleHeight(fX, fZ);
    if (fHeight === null) {
      return;
    }

    this.mesh.position.set(fX, fHeight, fZ);
  }

  get position(): THREE.Vector3 {
    return this.mesh.position;
  }

  get bMoving(): boolean {
    return this.vVelocity.lengthSq() > 0.01;
  }

  get rocks(): number {
    return this.nRocks;
  }

  get wood(): number {
    return this.nWood;
  }

  get mushrooms(): number {
    return this.nMushrooms;
  }

  setInventory(nRocks: number, nWood: number, nMushrooms: number): void {
    this.nRocks = nRocks;
    this.nWood = nWood;
    this.nMushrooms = nMushrooms;
  }

  collectResource(eResource: "rock" | "tree" | "mushroom"): void {
    if (eResource === "rock") {
      this.nRocks += RESOURCE_YIELD;
    } else if (eResource === "tree") {
      this.nWood += RESOURCE_YIELD;
    } else {
      this.nMushrooms += 1;
    }
  }
}
