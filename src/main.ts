import * as THREE from "three";
import { Player } from "./player";

const GAME_KEY_CODES = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ShiftLeft",
  "ShiftRight",
]);

const keys: Record<string, boolean> = {};

function clearKeys(): void {
  for (const code of Object.keys(keys)) {
    keys[code] = false;
  }
}

function onKeyDown(event: KeyboardEvent): void {
  if (GAME_KEY_CODES.has(event.code)) {
    event.preventDefault();
  }
  keys[event.code] = true;
}

function onKeyUp(event: KeyboardEvent): void {
  if (GAME_KEY_CODES.has(event.code)) {
    event.preventDefault();
  }
  keys[event.code] = false;
}

window.addEventListener("keydown", onKeyDown);
window.addEventListener("keyup", onKeyUp);
window.addEventListener("blur", clearKeys);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    clearKeys();
  }
});

const WORLD_SIZE = 40;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 30, 70);

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  200,
);
camera.position.set(0, 6, 10);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.domElement.tabIndex = 0;
renderer.domElement.style.outline = "none";
document.body.appendChild(renderer.domElement);

function focusGame(): void {
  renderer.domElement.focus();
}

renderer.domElement.addEventListener("pointerdown", focusGame);
window.addEventListener("load", focusGame);
focusGame();

const ambientLight = new THREE.AmbientLight(0xffffff, 0.55);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xffffff, 1.1);
sunLight.position.set(12, 18, 8);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.left = -25;
sunLight.shadow.camera.right = 25;
sunLight.shadow.camera.top = 25;
sunLight.shadow.camera.bottom = -25;
scene.add(sunLight);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE),
  new THREE.MeshStandardMaterial({ color: 0x6bbf59 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(WORLD_SIZE, WORLD_SIZE, 0x3d8b40, 0x4fa052);
grid.position.y = 0.01;
scene.add(grid);

const propMaterial = new THREE.MeshStandardMaterial({ color: 0x8d6e63 });
for (let i = 0; i < 12; i++) {
  const size = 0.8 + Math.random() * 1.4;
  const prop = new THREE.Mesh(
    new THREE.BoxGeometry(size, size * 1.5, size),
    propMaterial,
  );
  prop.position.set(
    THREE.MathUtils.randFloatSpread(WORLD_SIZE * 0.7),
    (size * 1.5) / 2,
    THREE.MathUtils.randFloatSpread(WORLD_SIZE * 0.7),
  );
  prop.castShadow = true;
  prop.receiveShadow = true;
  scene.add(prop);
}

const player = new Player();
scene.add(player.mesh);

const CAMERA_HEIGHT = 10;
const CAMERA_DISTANCE = 8;
const vCameraOffset = new THREE.Vector3(0, CAMERA_HEIGHT, CAMERA_DISTANCE);
const fCameraYaw = Math.atan2(vCameraOffset.x, vCameraOffset.z);

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const clock = new THREE.Clock();

function animate(): void {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 0.05);
  player.update(dt, keys, fCameraYaw);

  camera.position.copy(player.position).add(vCameraOffset);
  camera.lookAt(
    player.position.x,
    player.position.y,
    player.position.z,
  );

  renderer.render(scene, camera);
}

animate();
