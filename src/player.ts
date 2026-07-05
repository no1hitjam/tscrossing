import * as THREE from "three";

const MOVE_SPEED = 6;
const SPRINT_MULTIPLIER = 1.75;
const PLAYER_HEIGHT = 1.6;
const PLAYER_RADIUS = 0.35;
const CAPSULE_LENGTH = 0.8;
const fBodyCenterY = CAPSULE_LENGTH * 0.5 + PLAYER_RADIUS;

export class Player {
  readonly mesh: THREE.Group;
  private readonly vVelocity = new THREE.Vector3();
  private readonly fnSampleHeight: (fX: number, fZ: number) => number | null;
  private readonly fnIsBlocked: (fX: number, fZ: number) => boolean;
  private fYaw = 0;

  constructor(
    fnSampleHeight: (fX: number, fZ: number) => number | null,
    fnIsBlocked: (fX: number, fZ: number) => boolean,
  ) {
    this.fnSampleHeight = fnSampleHeight;
    this.fnIsBlocked = fnIsBlocked;
    this.mesh = new THREE.Group();
    this.applyTerrainHeight(0, 0);

    const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x4caf50 });
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(PLAYER_RADIUS, CAPSULE_LENGTH, 8, 16),
      bodyMaterial,
    );
    body.castShadow = true;
    body.position.y = fBodyCenterY;
    this.mesh.add(body);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 16, 16),
      new THREE.MeshStandardMaterial({ color: 0xffcc80 }),
    );
    head.castShadow = true;
    head.position.y = PLAYER_HEIGHT - 0.15;
    this.mesh.add(head);
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
}
