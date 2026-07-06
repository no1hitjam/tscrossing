import * as THREE from "three";
import { HelicopterSeedParticles } from "./helicopter-seed-particles";
import {
  loadInventoryFromCookie,
  saveInventoryToCookie,
} from "./inventory-cookie";
import { GrassParticles } from "./grass-particles";
import { PappusParticles } from "./pappus-particles";
import { SnowParticles } from "./snow-particles";
import { Player } from "./player";
import { Terrain } from "./terrain";
import { CubeDeerActors } from "./cube-deer";
import { DynamicMusic } from "./dynamic-music";
import { loadNoteText, renderNoteHtml } from "./tree-notes";

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
  "Space",
]);

const keys: Record<string, boolean> = {};

function isPlayerMoving(): boolean {
  return !!(
    keys["KeyW"] ||
    keys["KeyA"] ||
    keys["KeyS"] ||
    keys["KeyD"] ||
    keys["ArrowUp"] ||
    keys["ArrowDown"] ||
    keys["ArrowLeft"] ||
    keys["ArrowRight"]
  );
}

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
  void startMusic();
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
    void oDynamicMusic.suspend();
  } else {
    void oDynamicMusic.resume();
  }
});

const SHADOW_HALF_EXTENT = 40;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x3a4555, 90, 240);

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  800,
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

const oDynamicMusic = new DynamicMusic();
let bMusicStarted = false;

async function startMusic(): Promise<void> {
  if (bMusicStarted) {
    return;
  }

  bMusicStarted = true;
  try {
    await oDynamicMusic.start();
  } catch {
    bMusicStarted = false;
  }
}

function focusGame(): void {
  renderer.domElement.focus();
}

renderer.domElement.addEventListener("pointerdown", () => {
  focusGame();
  void startMusic();
});
window.addEventListener("load", focusGame);
focusGame();

const ambientLight = new THREE.AmbientLight(0xffffff, 0.55);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xffffff, 1.1);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.left = -SHADOW_HALF_EXTENT;
sunLight.shadow.camera.right = SHADOW_HALF_EXTENT;
sunLight.shadow.camera.top = SHADOW_HALF_EXTENT;
sunLight.shadow.camera.bottom = -SHADOW_HALF_EXTENT;
scene.add(sunLight);
scene.add(sunLight.target);

const terrain = new Terrain();
scene.add(terrain.root);

const player = new Player(
  terrain.sampleHeightAt.bind(terrain),
  terrain.isBlockedAt.bind(terrain),
);
scene.add(player.mesh);

const pappusParticles = new PappusParticles(
  terrain.sampleHeightAt.bind(terrain),
);
scene.add(pappusParticles.root);

const helicopterSeedParticles = new HelicopterSeedParticles(
  terrain.sampleHeightAt.bind(terrain),
);
scene.add(helicopterSeedParticles.root);

const snowParticles = new SnowParticles(
  terrain.sampleHeightAt.bind(terrain),
);
scene.add(snowParticles.root);

const grassParticles = new GrassParticles(
  terrain.sampleHeightAt.bind(terrain),
);
scene.add(grassParticles.root);

const cubeDeerActors = new CubeDeerActors(
  terrain.sampleHeightAt.bind(terrain),
  terrain.isBlockedAt.bind(terrain),
);
scene.add(cubeDeerActors.root);

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
let bSpaceWasDown = false;
let bEscapeWasDown = false;
let bNotePanelOpen = false;

const elInventoryRocks = document.getElementById("inventory-rocks")!;
const elInventoryWood = document.getElementById("inventory-wood")!;
const elInventoryMushrooms = document.getElementById("inventory-mushrooms")!;
const elNoteBackdrop = document.getElementById("note-backdrop")!;
const elNotePanel = document.getElementById("note-panel")!;
const elNoteText = document.getElementById("note-text")!;

function updateInventoryHud(): void {
  elInventoryRocks.textContent = String(player.rocks);
  elInventoryWood.textContent = String(player.wood);
  elInventoryMushrooms.textContent = String(player.mushrooms);
}

function persistInventory(): void {
  saveInventoryToCookie({
    rocks: player.rocks,
    wood: player.wood,
    mushrooms: player.mushrooms,
    collectedTreeNotes: terrain.getCollectedTreeNotes(),
  });
}

const oSavedInventory = loadInventoryFromCookie();
if (oSavedInventory !== null) {
  player.setInventory(
    oSavedInventory.rocks,
    oSavedInventory.wood,
    oSavedInventory.mushrooms,
  );
  terrain.setCollectedTreeNotes(oSavedInventory.collectedTreeNotes);
}
updateInventoryHud();

function showNotePanel(sMarkdown: string): void {
  elNoteText.innerHTML = renderNoteHtml(sMarkdown);
  elNoteBackdrop.hidden = false;
  elNotePanel.hidden = false;
  bNotePanelOpen = true;
}

function showNotePanelMessage(sMessage: string): void {
  elNoteText.textContent = sMessage;
  elNoteBackdrop.hidden = false;
  elNotePanel.hidden = false;
  bNotePanelOpen = true;
}

function hideNotePanel(): void {
  elNoteBackdrop.hidden = true;
  elNotePanel.hidden = true;
  bNotePanelOpen = false;
}

elNoteBackdrop.addEventListener("click", hideNotePanel);

async function openNote(sFileName: string): Promise<void> {
  void oDynamicMusic.playPaperRustle();
  try {
    const sMarkdown = await loadNoteText(sFileName);
    showNotePanel(sMarkdown);
  } catch {
    showNotePanelMessage("This note is missing.");
  }
}

async function collectHighlightedTreeNote(): Promise<void> {
  const sNoteFile = terrain.collectHighlightedTreeNote();
  if (sNoteFile === null) {
    return;
  }

  persistInventory();
  await openNote(sNoteFile);
}

function updateShadowLight(): void {
  sunLight.position.set(
    player.position.x + 12,
    18,
    player.position.z + 8,
  );
  sunLight.target.position.copy(player.position);
  sunLight.target.updateMatrixWorld();
}

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

  terrain.update(camera, dt);
  terrain.setFogPlayerPosition(player.position.x, player.position.z);
  terrain.updateTargetHighlight(player.vTarget.x, player.vTarget.z);

  const bSpaceDown = keys["Space"] ?? false;
  if (bSpaceDown && !bSpaceWasDown) {
    if (bNotePanelOpen) {
      hideNotePanel();
    } else if (terrain.getHighlightedTreeNoteFile() !== null) {
      void collectHighlightedTreeNote();
    } else {
      const oDamage = terrain.damageHighlightedFeature();
      if (oDamage !== null) {
        if (oDamage.eFeature === "tree") {
          void oDynamicMusic.playChopWood();
        } else if (oDamage.eFeature === "rock") {
          void oDynamicMusic.playPickAxe();
        } else if (oDamage.eFeature === "mushroom") {
          void oDynamicMusic.playChopWood();
        }
        if (oDamage.bDestroyed) {
          if (oDamage.eFeature === "tree") {
            void oDynamicMusic.playTreeFall();
          } else if (oDamage.eFeature === "rock") {
            void oDynamicMusic.playRocksFall();
          }
          if (
            oDamage.eFeature === "rock" ||
            oDamage.eFeature === "tree" ||
            oDamage.eFeature === "mushroom"
          ) {
            player.collectResource(oDamage.eFeature);
            updateInventoryHud();
            persistInventory();
          }
        }
      }
    }
  }
  bSpaceWasDown = bSpaceDown;

  const bEscapeDown = keys["Escape"] ?? false;
  if (bEscapeDown && !bEscapeWasDown && bNotePanelOpen) {
    hideNotePanel();
  }
  bEscapeWasDown = bEscapeDown;

  updateShadowLight();
  pappusParticles.update(dt, camera, player.position);
  helicopterSeedParticles.update(dt, player.position);
  snowParticles.update(dt, camera, player.position);
  grassParticles.update(dt, camera, player.position);
  cubeDeerActors.update(dt, player.position);

  oDynamicMusic.setPlayerMoving(isPlayerMoving());
  oDynamicMusic.updateFootsteps(
    dt,
    player.bMoving,
    terrain.isDirtAt(player.position.x, player.position.z),
    !!(keys["ShiftLeft"] || keys["ShiftRight"]),
  );
  oDynamicMusic.update();

  renderer.render(scene, camera);
}

animate();
