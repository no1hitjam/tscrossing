import * as THREE from "three";
import { SimplexNoise } from "three/addons/math/SimplexNoise.js";
import { getNoteFileByIndex, getNoteFileCount } from "./tree-notes";

const CHUNK_SIZE = 32;
const CHUNK_SEGMENTS = 16;
const TEXTURE_TILE_UV_SIZE = 0.25;
const HEIGHT_SCALE = 2;
const NOISE_SCALE = 0.08;
const OCTAVES = 4;
const PERSISTENCE = 0.5;
const LACUNARITY = 2;
const MACRO_NOISE_SCALE = 0.012;
const MACRO_HEIGHT_SCALE = 5;
const MACRO_NOISE_OFFSET = 500;
const TERRAIN_HEIGHT_RANGE = MACRO_HEIGHT_SCALE + HEIGHT_SCALE;

const DIRT_TILE_CHANCE = 0.1;
const ROCK_TILE_CHANCE = 0.06;
const TREE_TILE_CHANCE = 0.05;
const TREE_NOTE_CHANCE = 0.2;
const ROCK_FACE_UV_SIZE = 0.12;
const TREE_FACE_UV_SIZE = 0.15;
const ROCK_TOP_SCALE = 0.72;
const TILE_SIZE = CHUNK_SIZE / CHUNK_SEGMENTS;
const ROCK_EMBED_DEPTH = TILE_SIZE * 0.35;
const TREE_HEIGHT = TILE_SIZE * 3.5;
const TREE_BASE_SIZE = TILE_SIZE * 0.55;
const TREE_TRUNK_WIDTH_SCALE = 0.32;
const TREE_TRUNK_TOP_SCALE = 0.5;
const TREE_BRANCH_COUNT = 6;
const TREE_BRANCH_LENGTH = TILE_SIZE * 0.48;
const TREE_BRANCH_WIDTH = TILE_SIZE * 0.2;
const TREE_BRANCH_TOP_SCALE = 0.3;
const TREE_BRANCH_TILT = 0.35;
const TREE_BRANCH_HEIGHT_MIN = 0.3;
const TREE_BRANCH_HEIGHT_RANGE = 0.58;
const TREE_EMBED_DEPTH = TILE_SIZE * 0.15;
const TREE_NOTE_MARKER_SIZE = TILE_SIZE * 0.14;
const TREE_NOTE_MARKER_HEIGHT_FRACTION = 0.25;
const TREE_NOTE_MARKER_Z_OFFSET = 0.02;
const HIGHLIGHT_EMISSIVE = 0x999999;
const HIGHLIGHT_EMISSIVE_INTENSITY = 0.1;
const FEATURE_MAX_HEALTH = 4;
const CHUNK_PADDING = 2;
const MAX_ACTIVE_CHUNKS = 50;
const QUADS_UPDATED_PER_FRAME = 4;
const FOG_LAYER_OFFSET = 0.42;
const FOG_UV_SCALE = 0.01;
const FOG_OPACITY = 0.25;
const FOG_COLOR = 0xf0e8f8;
const FOG_UV_SCROLL_X = 0.015;
const FOG_UV_SCROLL_Z = 0.008;

const A_NDC_CORNERS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
];

type SampleHeightFn = (fX: number, fZ: number) => number;
export type TileFeature = "rock" | "tree";
type RegisterFeatureMeshFn = (
  nTileX: number,
  nTileZ: number,
  eFeature: TileFeature,
  oMesh: THREE.Mesh,
) => string;
type IsFeatureActiveFn = (
  nTileX: number,
  nTileZ: number,
  eFeature: TileFeature,
) => boolean;
type AddTreeNoteMarkerFn = (
  nTileX: number,
  nTileZ: number,
  oTree: THREE.Mesh,
) => void;

function chunkKey(nChunkX: number, nChunkZ: number): string {
  return `${nChunkX},${nChunkZ}`;
}

function featureTileKey(nTileX: number, nTileZ: number): string {
  return `${nTileX},${nTileZ}`;
}

function worldToChunkIndex(fWorld: number): number {
  return Math.floor((fWorld + CHUNK_SIZE * 0.5) / CHUNK_SIZE);
}

class TerrainChunk {
  readonly root = new THREE.Group();
  readonly mesh: THREE.Mesh;
  readonly nQuadCount: number;
  private readonly geometry: THREE.BufferGeometry;
  private readonly oFogGeometry: THREE.BufferGeometry;
  private readonly oRockTemplateGeometry: THREE.BufferGeometry;
  private readonly oTreeTrunkTemplateGeometry: THREE.BufferGeometry;
  private readonly oTreeBranchTemplateGeometry: THREE.BufferGeometry;
  private readonly fTileUvSize: number;
  private readonly aRegisteredTileKeys: string[] = [];

  constructor(
    nChunkX: number,
    nChunkZ: number,
    aMaterials: THREE.Material[],
    oFogMaterial: THREE.Material,
    oRockMaterial: THREE.Material,
    oTreeMaterial: THREE.Material,
    fnSampleHeight: SampleHeightFn,
    fnRegisterFeatureMesh: RegisterFeatureMeshFn,
    fnIsFeatureActive: IsFeatureActiveFn,
    fnAddTreeNoteMarker: AddTreeNoteMarkerFn,
  ) {
    const fTileUvSize = TEXTURE_TILE_UV_SIZE;
    const fCenterX = nChunkX * CHUNK_SIZE;
    const fCenterZ = nChunkZ * CHUNK_SIZE;

    const geometry = createSampledPlaneGeometry(
      fCenterX,
      fCenterZ,
      fnSampleHeight,
      0,
    );

    const geometryNonIndexed = geometry.toNonIndexed();
    applyTileQuads(geometryNonIndexed, CHUNK_SEGMENTS, fTileUvSize);
    geometryNonIndexed.computeVertexNormals();
    geometry.dispose();

    this.geometry = geometryNonIndexed;
    this.nQuadCount = CHUNK_SEGMENTS * CHUNK_SEGMENTS;
    this.fTileUvSize = fTileUvSize;

    this.mesh = new THREE.Mesh(geometryNonIndexed, aMaterials);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.receiveShadow = true;
    this.root.position.set(fCenterX, 0, fCenterZ);
    this.root.add(this.mesh);

    this.oFogGeometry = createSampledPlaneGeometry(
      fCenterX,
      fCenterZ,
      fnSampleHeight,
      FOG_LAYER_OFFSET,
    );
    applyFogLayerUvs(this.oFogGeometry, fCenterX, fCenterZ);
    this.oFogGeometry.computeVertexNormals();

    const oFogMesh = new THREE.Mesh(this.oFogGeometry, oFogMaterial);
    oFogMesh.rotation.x = -Math.PI / 2;
    oFogMesh.renderOrder = 1;
    this.root.add(oFogMesh);

    this.oRockTemplateGeometry = createTruncatedPyramidGeometry(
      TILE_SIZE,
      TILE_SIZE,
      ROCK_TOP_SCALE,
    );
    this.oTreeTrunkTemplateGeometry = createTruncatedPyramidGeometry(
      TREE_BASE_SIZE * TREE_TRUNK_WIDTH_SCALE,
      TREE_HEIGHT,
      TREE_TRUNK_TOP_SCALE,
    );
    this.oTreeBranchTemplateGeometry = createTruncatedPyramidGeometry(
      TREE_BRANCH_WIDTH,
      TREE_BRANCH_LENGTH,
      TREE_BRANCH_TOP_SCALE,
    );
    this.buildRocks(
      nChunkX,
      nChunkZ,
      oRockMaterial,
      fnSampleHeight,
      fnRegisterFeatureMesh,
      fnIsFeatureActive,
    );
    this.buildTrees(
      nChunkX,
      nChunkZ,
      oTreeMaterial,
      fnSampleHeight,
      fnRegisterFeatureMesh,
      fnIsFeatureActive,
      fnAddTreeNoteMarker,
    );
  }

  get registeredTileKeys(): readonly string[] {
    return this.aRegisteredTileKeys;
  }

  private buildRocks(
    nChunkX: number,
    nChunkZ: number,
    oRockMaterial: THREE.Material,
    fnSampleHeight: SampleHeightFn,
    fnRegisterFeatureMesh: RegisterFeatureMeshFn,
    fnIsFeatureActive: IsFeatureActiveFn,
  ): void {
    const fHalfChunk = CHUNK_SIZE * 0.5;
    const fRockCenterY = TILE_SIZE * 0.5 - ROCK_EMBED_DEPTH;

    for (let iy = 0; iy < CHUNK_SEGMENTS; iy++) {
      for (let ix = 0; ix < CHUNK_SEGMENTS; ix++) {
        const nTileX = nChunkX * CHUNK_SEGMENTS + ix;
        const nTileZ = nChunkZ * CHUNK_SEGMENTS + iy;
        if (!fnIsFeatureActive(nTileX, nTileZ, "rock")) {
          continue;
        }

        const fLocalX = -fHalfChunk + (ix + 0.5) * TILE_SIZE;
        const fLocalZ = fHalfChunk - (iy + 0.5) * TILE_SIZE;
        const fWorldX = this.root.position.x + fLocalX;
        const fWorldZ = this.root.position.z + fLocalZ;
        const fHeight = fnSampleHeight(fWorldX, fWorldZ);

        const oRockGeometry = this.oRockTemplateGeometry.clone();
        applyRockFaceUvs(oRockGeometry, ROCK_FACE_UV_SIZE);

        const oRock = new THREE.Mesh(oRockGeometry, oRockMaterial);
        oRock.position.set(fLocalX, fHeight + fRockCenterY, fLocalZ);
        oRock.castShadow = true;
        oRock.receiveShadow = true;
        this.root.add(oRock);
        this.aRegisteredTileKeys.push(
          fnRegisterFeatureMesh(nTileX, nTileZ, "rock", oRock),
        );
      }
    }
  }

  private buildTrees(
    nChunkX: number,
    nChunkZ: number,
    oTreeMaterial: THREE.Material,
    fnSampleHeight: SampleHeightFn,
    fnRegisterFeatureMesh: RegisterFeatureMeshFn,
    fnIsFeatureActive: IsFeatureActiveFn,
    fnAddTreeNoteMarker: AddTreeNoteMarkerFn,
  ): void {
    const fHalfChunk = CHUNK_SIZE * 0.5;
    const fTreeCenterY = TREE_HEIGHT * 0.5 - TREE_EMBED_DEPTH;

    for (let iy = 0; iy < CHUNK_SEGMENTS; iy++) {
      for (let ix = 0; ix < CHUNK_SEGMENTS; ix++) {
        const nTileX = nChunkX * CHUNK_SEGMENTS + ix;
        const nTileZ = nChunkZ * CHUNK_SEGMENTS + iy;
        if (!fnIsFeatureActive(nTileX, nTileZ, "tree")) {
          continue;
        }

        const fLocalX = -fHalfChunk + (ix + 0.5) * TILE_SIZE;
        const fLocalZ = fHalfChunk - (iy + 0.5) * TILE_SIZE;
        const fWorldX = this.root.position.x + fLocalX;
        const fWorldZ = this.root.position.z + fLocalZ;
        const fHeight = fnSampleHeight(fWorldX, fWorldZ);

        const oTrunkGeometry = this.oTreeTrunkTemplateGeometry.clone();
        const fTrunkWidth = TREE_BASE_SIZE * TREE_TRUNK_WIDTH_SCALE;
        applyTreeFaceUvs(
          oTrunkGeometry,
          TREE_FACE_UV_SIZE,
          fTrunkWidth,
          TREE_HEIGHT,
        );

        const oTree = new THREE.Mesh(oTrunkGeometry, oTreeMaterial);
        oTree.position.set(fLocalX, fHeight + fTreeCenterY, fLocalZ);
        oTree.castShadow = true;
        oTree.receiveShadow = true;
        addTreeBranches(
          oTree,
          this.oTreeBranchTemplateGeometry,
          oTreeMaterial,
          nTileX,
          nTileZ,
        );
        fnAddTreeNoteMarker(nTileX, nTileZ, oTree);
        this.root.add(oTree);
        this.aRegisteredTileKeys.push(
          fnRegisterFeatureMesh(nTileX, nTileZ, "tree", oTree),
        );
      }
    }
  }

  updateUvs(nCount: number): void {
    const uvs = this.geometry.attributes.uv as THREE.BufferAttribute;

    for (let i = 0; i < nCount; i++) {
      const nQuadIndex = Math.floor(Math.random() * this.nQuadCount);
      setQuadTileUv(uvs, nQuadIndex * 6, this.fTileUvSize);
    }

    uvs.needsUpdate = true;
  }

  dispose(): void {
    this.geometry.dispose();
    this.oFogGeometry.dispose();
    this.oRockTemplateGeometry.dispose();
    this.oTreeTrunkTemplateGeometry.dispose();
    this.oTreeBranchTemplateGeometry.dispose();
    this.root.traverse((oChild) => {
      if (oChild === this.mesh) {
        return;
      }

      if (oChild instanceof THREE.Mesh) {
        if (oChild.userData.bSharedGeometry) {
          return;
        }

        oChild.geometry.dispose();
      }
    });
  }
}

export class Terrain {
  readonly root = new THREE.Group();
  private readonly mChunks = new Map<string, TerrainChunk>();
  private readonly aMaterials: THREE.Material[];
  private readonly oFogTexture: THREE.CanvasTexture;
  private readonly oFogMaterial: THREE.Material;
  private readonly oRockMaterial: THREE.Material;
  private readonly oTreeMaterial: THREE.Material;
  private readonly oNoise = new SimplexNoise();
  private readonly oFrustum = new THREE.Frustum();
  private readonly mProjScreenMatrix = new THREE.Matrix4();
  private readonly oChunkBounds = new THREE.Box3();
  private readonly vChunkCenter = new THREE.Vector3();
  private readonly mFeatureMeshes = new Map<string, THREE.Mesh>();
  private readonly mFeatureHealth = new Map<string, number>();
  private readonly mDestroyedFeatures = new Set<string>();
  private readonly mCollectedTreeNotes = new Set<string>();
  private readonly oRockHighlightMaterial: THREE.MeshStandardMaterial;
  private readonly oTreeHighlightMaterial: THREE.MeshStandardMaterial;
  private readonly oNoteMarkerGeometry: THREE.PlaneGeometry;
  private readonly oNoteMarkerMaterial: THREE.MeshBasicMaterial;
  private oHighlightedMesh: THREE.Mesh | null = null;
  private sHighlightedTileKey: string | null = null;

  constructor() {
    const oGrassTexture = new THREE.TextureLoader().load("/grass.png");
    oGrassTexture.wrapS = THREE.RepeatWrapping;
    oGrassTexture.wrapT = THREE.RepeatWrapping;
    oGrassTexture.colorSpace = THREE.SRGBColorSpace;

    const oDirtTexture = new THREE.TextureLoader().load("/dirt.png");
    oDirtTexture.wrapS = THREE.RepeatWrapping;
    oDirtTexture.wrapT = THREE.RepeatWrapping;
    oDirtTexture.colorSpace = THREE.SRGBColorSpace;

    this.aMaterials = [
      new THREE.MeshStandardMaterial({
        map: oGrassTexture,
        flatShading: true,
      }),
      new THREE.MeshStandardMaterial({
        map: oDirtTexture,
        flatShading: true,
      }),
    ];

    this.oFogTexture = createFogNoiseTexture();
    this.oFogMaterial = new THREE.MeshBasicMaterial({
      map: this.oFogTexture,
      color: FOG_COLOR,
      transparent: true,
      opacity: FOG_OPACITY,
      depthWrite: false,
    });

    const oRockTexture = new THREE.TextureLoader().load("/rock.png");
    oRockTexture.wrapS = THREE.RepeatWrapping;
    oRockTexture.wrapT = THREE.RepeatWrapping;
    oRockTexture.colorSpace = THREE.SRGBColorSpace;

    this.oRockMaterial = new THREE.MeshStandardMaterial({
      map: oRockTexture,
      flatShading: true,
    });

    const oTreeBarkTexture = new THREE.TextureLoader().load("/TreeBark.png");
    oTreeBarkTexture.wrapS = THREE.RepeatWrapping;
    oTreeBarkTexture.wrapT = THREE.RepeatWrapping;
    oTreeBarkTexture.colorSpace = THREE.SRGBColorSpace;

    this.oTreeMaterial = new THREE.MeshStandardMaterial({
      map: oTreeBarkTexture,
      flatShading: true,
    });

    this.oRockHighlightMaterial = this.oRockMaterial.clone() as THREE.MeshStandardMaterial;
    this.oRockHighlightMaterial.emissive.setHex(HIGHLIGHT_EMISSIVE);
    this.oRockHighlightMaterial.emissiveIntensity = HIGHLIGHT_EMISSIVE_INTENSITY;

    this.oTreeHighlightMaterial = this.oTreeMaterial.clone() as THREE.MeshStandardMaterial;
    this.oTreeHighlightMaterial.emissive.setHex(HIGHLIGHT_EMISSIVE);
    this.oTreeHighlightMaterial.emissiveIntensity = HIGHLIGHT_EMISSIVE_INTENSITY;

    this.oNoteMarkerGeometry = new THREE.PlaneGeometry(
      TREE_NOTE_MARKER_SIZE,
      TREE_NOTE_MARKER_SIZE,
    );
    this.oNoteMarkerMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
  }

  update(oCamera: THREE.Camera, fDt = 0): void {
    this.oFogTexture.offset.x += FOG_UV_SCROLL_X * fDt;
    this.oFogTexture.offset.y += FOG_UV_SCROLL_Z * fDt;

    const aDesiredKeys = this.getDesiredChunkKeys(oCamera);
    const sDesiredSet = new Set(aDesiredKeys);

    for (const sKey of aDesiredKeys) {
      if (this.mChunks.has(sKey)) {
        continue;
      }

      const [nChunkX, nChunkZ] = sKey.split(",").map(Number);
      const oChunk = new TerrainChunk(
        nChunkX,
        nChunkZ,
        this.aMaterials,
        this.oFogMaterial,
        this.oRockMaterial,
        this.oTreeMaterial,
        this.sampleHeight.bind(this),
        this.registerFeatureMesh.bind(this),
        this.isFeatureActive.bind(this),
        this.addTreeNoteMarker.bind(this),
      );
      this.mChunks.set(sKey, oChunk);
      this.root.add(oChunk.root);
    }

    for (const [sKey, oChunk] of this.mChunks) {
      if (sDesiredSet.has(sKey)) {
        continue;
      }

      this.root.remove(oChunk.root);
      this.unregisterFeatureMeshes(oChunk.registeredTileKeys);
      oChunk.dispose();
      this.mChunks.delete(sKey);
    }

    if (this.mChunks.size === 0) {
      return;
    }

    const aLoadedChunks = [...this.mChunks.values()];
    for (let i = 0; i < QUADS_UPDATED_PER_FRAME; i++) {
      const oChunk =
        aLoadedChunks[Math.floor(Math.random() * aLoadedChunks.length)];
      oChunk.updateUvs(1);
    }
  }

  sampleHeight(fX: number, fZ: number): number {
    const fMacro =
      this.oNoise.noise(
        fX * MACRO_NOISE_SCALE + MACRO_NOISE_OFFSET,
        fZ * MACRO_NOISE_SCALE + MACRO_NOISE_OFFSET,
      ) * MACRO_HEIGHT_SCALE;

    let fAmplitude = 1;
    let fFrequency = NOISE_SCALE;
    let fDetail = 0;
    let fMaxAmplitude = 0;

    for (let octave = 0; octave < OCTAVES; octave++) {
      fDetail +=
        this.oNoise.noise(fX * fFrequency, fZ * fFrequency) * fAmplitude;
      fMaxAmplitude += fAmplitude;
      fAmplitude *= PERSISTENCE;
      fFrequency *= LACUNARITY;
    }

    return fMacro + (fDetail / fMaxAmplitude) * HEIGHT_SCALE;
  }

  sampleHeightAt(fX: number, fZ: number): number {
    return this.sampleHeight(fX, fZ);
  }

  hasRockAt(fWorldX: number, fWorldZ: number): boolean {
    const { nTileX, nTileZ } = worldToTileCoords(fWorldX, fWorldZ);
    return this.isFeatureActive(nTileX, nTileZ, "rock");
  }

  hasTreeAt(fWorldX: number, fWorldZ: number): boolean {
    const { nTileX, nTileZ } = worldToTileCoords(fWorldX, fWorldZ);
    return this.isFeatureActive(nTileX, nTileZ, "tree");
  }

  isBlockedAt(fWorldX: number, fWorldZ: number): boolean {
    return this.hasRockAt(fWorldX, fWorldZ) || this.hasTreeAt(fWorldX, fWorldZ);
  }

  getFeatureAt(fWorldX: number, fWorldZ: number): TileFeature | null {
    if (this.hasRockAt(fWorldX, fWorldZ)) {
      return "rock";
    }

    if (this.hasTreeAt(fWorldX, fWorldZ)) {
      return "tree";
    }

    return null;
  }

  updateTargetHighlight(fWorldX: number, fWorldZ: number): void {
    const { nTileX, nTileZ } = worldToTileCoords(fWorldX, fWorldZ);
    const sTileKey = featureTileKey(nTileX, nTileZ);
    const oMesh = this.mFeatureMeshes.get(sTileKey) ?? null;

    if (oMesh === this.oHighlightedMesh) {
      return;
    }

    this.clearTargetHighlight();

    if (oMesh === null) {
      return;
    }

    const eFeature = oMesh.userData.eFeature as TileFeature;
    if (eFeature === "rock") {
      oMesh.material = this.oRockHighlightMaterial;
    } else {
      setTreeMeshMaterial(oMesh, this.oTreeHighlightMaterial);
    }
    this.oHighlightedMesh = oMesh;
    this.sHighlightedTileKey = sTileKey;
  }

  setCollectedTreeNotes(aTileKeys: readonly string[]): void {
    this.mCollectedTreeNotes.clear();
    for (const sTileKey of aTileKeys) {
      this.mCollectedTreeNotes.add(sTileKey);
    }
  }

  getCollectedTreeNotes(): string[] {
    return [...this.mCollectedTreeNotes];
  }

  getHighlightedTreeNoteFile(): string | null {
    if (
      this.oHighlightedMesh === null ||
      this.sHighlightedTileKey === null ||
      this.mCollectedTreeNotes.has(this.sHighlightedTileKey)
    ) {
      return null;
    }

    const eFeature = this.oHighlightedMesh.userData.eFeature as TileFeature;
    if (eFeature !== "tree") {
      return null;
    }

    return (this.oHighlightedMesh.userData.sNoteFile as string | undefined) ?? null;
  }

  collectHighlightedTreeNote(): string | null {
    const sNoteFile = this.getHighlightedTreeNoteFile();
    if (
      sNoteFile === null ||
      this.sHighlightedTileKey === null ||
      this.oHighlightedMesh === null
    ) {
      return null;
    }

    this.mCollectedTreeNotes.add(this.sHighlightedTileKey);
    delete this.oHighlightedMesh.userData.sNoteFile;

    const oTree = this.oHighlightedMesh;
    for (let i = oTree.children.length - 1; i >= 0; i--) {
      const oChild = oTree.children[i];
      if (oChild.userData.bNoteMarker) {
        oTree.remove(oChild);
      }
    }

    return sNoteFile;
  }

  damageHighlightedFeature(): TileFeature | null {
    if (this.sHighlightedTileKey === null || this.oHighlightedMesh === null) {
      return null;
    }

    const sTileKey = this.sHighlightedTileKey;
    const eFeature = this.oHighlightedMesh.userData.eFeature as TileFeature;
    const nHealth =
      (this.mFeatureHealth.get(sTileKey) ?? FEATURE_MAX_HEALTH) - 1;

    if (nHealth <= 0) {
      this.destroyFeature(sTileKey);
      return eFeature;
    }

    this.mFeatureHealth.set(sTileKey, nHealth);
    return null;
  }

  private addTreeNoteMarker(
    nTileX: number,
    nTileZ: number,
    oTree: THREE.Mesh,
  ): void {
    const sTileKey = featureTileKey(nTileX, nTileZ);
    if (!tileHasTreeNote(nTileX, nTileZ) || this.mCollectedTreeNotes.has(sTileKey)) {
      return;
    }

    const fHalfHeight = TREE_HEIGHT * 0.5;
    const fHalfBottom = TREE_BASE_SIZE * TREE_TRUNK_WIDTH_SCALE * 0.5;
    const fHalfTop = fHalfBottom * TREE_TRUNK_TOP_SCALE;
    const fMarkerY =
      -fHalfHeight + TREE_HEIGHT * TREE_NOTE_MARKER_HEIGHT_FRACTION;
    const fFaceZ =
      fHalfBottom +
      ((fMarkerY + fHalfHeight) / (2 * fHalfHeight)) * (fHalfTop - fHalfBottom);

    const oNoteMarker = new THREE.Mesh(
      this.oNoteMarkerGeometry,
      this.oNoteMarkerMaterial,
    );
    oNoteMarker.position.set(0, fMarkerY, fFaceZ + TREE_NOTE_MARKER_Z_OFFSET);
    oNoteMarker.userData.bSharedGeometry = true;
    oNoteMarker.userData.bNoteMarker = true;
    oTree.add(oNoteMarker);
  }

  private isFeatureActive(
    nTileX: number,
    nTileZ: number,
    eFeature: TileFeature,
  ): boolean {
    const sTileKey = featureTileKey(nTileX, nTileZ);
    if (this.mDestroyedFeatures.has(sTileKey)) {
      return false;
    }

    return eFeature === "rock"
      ? tileHasRock(nTileX, nTileZ)
      : tileHasTree(nTileX, nTileZ);
  }

  private destroyFeature(sTileKey: string): void {
    this.mDestroyedFeatures.add(sTileKey);
    this.mFeatureHealth.delete(sTileKey);

    const oMesh = this.mFeatureMeshes.get(sTileKey);
    if (oMesh === undefined) {
      if (this.sHighlightedTileKey === sTileKey) {
        this.oHighlightedMesh = null;
        this.sHighlightedTileKey = null;
      }

      return;
    }

    if (oMesh === this.oHighlightedMesh) {
      this.oHighlightedMesh = null;
      this.sHighlightedTileKey = null;
    }

    disposeTreeBranchMeshes(oMesh);
    oMesh.geometry.dispose();
    oMesh.parent?.remove(oMesh);
    this.mFeatureMeshes.delete(sTileKey);
  }

  private registerFeatureMesh(
    nTileX: number,
    nTileZ: number,
    eFeature: TileFeature,
    oMesh: THREE.Mesh,
  ): string {
    oMesh.userData.eFeature = eFeature;
    const sTileKey = featureTileKey(nTileX, nTileZ);
    if (
      eFeature === "tree" &&
      tileHasTreeNote(nTileX, nTileZ) &&
      !this.mCollectedTreeNotes.has(sTileKey)
    ) {
      oMesh.userData.sNoteFile = getNoteFileByIndex(
        getTreeNoteFileIndex(nTileX, nTileZ),
      );
    }
    if (!this.mFeatureHealth.has(sTileKey)) {
      this.mFeatureHealth.set(sTileKey, FEATURE_MAX_HEALTH);
    }

    this.mFeatureMeshes.set(sTileKey, oMesh);
    return sTileKey;
  }

  private unregisterFeatureMeshes(aTileKeys: readonly string[]): void {
    for (const sTileKey of aTileKeys) {
      const oMesh = this.mFeatureMeshes.get(sTileKey);
      if (oMesh === this.oHighlightedMesh) {
        this.clearTargetHighlight();
      }

      this.mFeatureMeshes.delete(sTileKey);
    }
  }

  private clearTargetHighlight(): void {
    if (this.oHighlightedMesh === null) {
      return;
    }

    const eFeature = this.oHighlightedMesh.userData.eFeature as TileFeature;
    if (eFeature === "rock") {
      this.oHighlightedMesh.material = this.oRockMaterial;
    } else {
      setTreeMeshMaterial(this.oHighlightedMesh, this.oTreeMaterial);
    }
    this.oHighlightedMesh = null;
    this.sHighlightedTileKey = null;
  }

  private getDesiredChunkKeys(oCamera: THREE.Camera): string[] {
    oCamera.updateMatrixWorld();

    this.mProjScreenMatrix.multiplyMatrices(
      oCamera.projectionMatrix,
      oCamera.matrixWorldInverse,
    );
    this.oFrustum.setFromProjectionMatrix(this.mProjScreenMatrix);

    const oGroundBounds = getGroundFrustumBounds(oCamera);
    const fPadding = CHUNK_PADDING * CHUNK_SIZE;
    const fMinX = oGroundBounds.minX - fPadding;
    const fMaxX = oGroundBounds.maxX + fPadding;
    const fMinZ = oGroundBounds.minZ - fPadding;
    const fMaxZ = oGroundBounds.maxZ + fPadding;

    const nMinChunkX = worldToChunkIndex(fMinX);
    const nMaxChunkX = worldToChunkIndex(fMaxX);
    const nMinChunkZ = worldToChunkIndex(fMinZ);
    const nMaxChunkZ = worldToChunkIndex(fMaxZ);

    const aCandidates: Array<{ sKey: string; fDistSq: number }> = [];

    for (let nChunkZ = nMinChunkZ; nChunkZ <= nMaxChunkZ; nChunkZ++) {
      for (let nChunkX = nMinChunkX; nChunkX <= nMaxChunkX; nChunkX++) {
        this.oChunkBounds.min.set(
          nChunkX * CHUNK_SIZE - CHUNK_SIZE * 0.5,
          -TERRAIN_HEIGHT_RANGE,
          nChunkZ * CHUNK_SIZE - CHUNK_SIZE * 0.5,
        );
        this.oChunkBounds.max.set(
          nChunkX * CHUNK_SIZE + CHUNK_SIZE * 0.5,
          TERRAIN_HEIGHT_RANGE,
          nChunkZ * CHUNK_SIZE + CHUNK_SIZE * 0.5,
        );

        if (!this.oFrustum.intersectsBox(this.oChunkBounds)) {
          continue;
        }

        this.vChunkCenter.set(
          nChunkX * CHUNK_SIZE,
          0,
          nChunkZ * CHUNK_SIZE,
        );
        const fDistSq = this.vChunkCenter.distanceToSquared(oCamera.position);
        aCandidates.push({ sKey: chunkKey(nChunkX, nChunkZ), fDistSq });
      }
    }

    aCandidates.sort((a, b) => a.fDistSq - b.fDistSq);

    const nLimit = Math.min(aCandidates.length, MAX_ACTIVE_CHUNKS);
    const aKeys: string[] = [];
    for (let i = 0; i < nLimit; i++) {
      aKeys.push(aCandidates[i].sKey);
    }

    return aKeys;
  }
}

function createSampledPlaneGeometry(
  fCenterX: number,
  fCenterZ: number,
  fnSampleHeight: SampleHeightFn,
  fHeightOffset: number,
): THREE.PlaneGeometry {
  const geometry = new THREE.PlaneGeometry(
    CHUNK_SIZE,
    CHUNK_SIZE,
    CHUNK_SEGMENTS,
    CHUNK_SEGMENTS,
  );
  const positions = geometry.attributes.position;

  for (let i = 0; i < positions.count; i++) {
    const fLocalX = positions.getX(i);
    const fLocalY = positions.getY(i);
    const fWorldX = fCenterX + fLocalX;
    const fWorldZ = fCenterZ - fLocalY;
    positions.setZ(i, fnSampleHeight(fWorldX, fWorldZ) + fHeightOffset);
  }

  positions.needsUpdate = true;
  return geometry;
}

function applyFogLayerUvs(
  geometry: THREE.BufferGeometry,
  fCenterX: number,
  fCenterZ: number,
): void {
  const positions = geometry.attributes.position as THREE.BufferAttribute;
  const uvs = geometry.attributes.uv as THREE.BufferAttribute;

  for (let i = 0; i < positions.count; i++) {
    const fLocalX = positions.getX(i);
    const fLocalY = positions.getY(i);
    const fWorldX = fCenterX + fLocalX;
    const fWorldZ = fCenterZ - fLocalY;
    uvs.setXY(i, fWorldX * FOG_UV_SCALE, fWorldZ * FOG_UV_SCALE);
  }

  uvs.needsUpdate = true;
}

function createFogNoiseTexture(): THREE.CanvasTexture {
  const nSize = 256;
  const canvas = document.createElement("canvas");
  canvas.width = nSize;
  canvas.height = nSize;
  const ctx = canvas.getContext("2d")!;
  const imageData = ctx.createImageData(nSize, nSize);
  const oNoise = new SimplexNoise();

  for (let iy = 0; iy < nSize; iy++) {
    for (let ix = 0; ix < nSize; ix++) {
      const fNoise =
        (oNoise.noise(ix * 0.06, iy * 0.06) +
          oNoise.noise(ix * 0.12 + 100, iy * 0.12 + 100) * 0.5) /
        1.5;
      const fAlpha = (fNoise + 1) * 0.5;
      const nIndex = (iy * nSize + ix) * 4;
      imageData.data[nIndex] = 255;
      imageData.data[nIndex + 1] = 255;
      imageData.data[nIndex + 2] = 255;
      imageData.data[nIndex + 3] = Math.floor(fAlpha * 255);
    }
  }

  ctx.putImageData(imageData, 0, 0);

  const oTexture = new THREE.CanvasTexture(canvas);
  oTexture.wrapS = THREE.RepeatWrapping;
  oTexture.wrapT = THREE.RepeatWrapping;
  return oTexture;
}

function getGroundFrustumBounds(oCamera: THREE.Camera): {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
} {
  let fMinX = oCamera.position.x;
  let fMaxX = oCamera.position.x;
  let fMinZ = oCamera.position.z;
  let fMaxZ = oCamera.position.z;

  const vNdcCorner = new THREE.Vector3();
  const vRayDirection = new THREE.Vector3();

  for (const [fNdcX, fNdcY] of A_NDC_CORNERS) {
    vNdcCorner.set(fNdcX, fNdcY, 1);
    vNdcCorner.unproject(oCamera);

    vRayDirection.subVectors(vNdcCorner, oCamera.position);
    if (Math.abs(vRayDirection.y) < 1e-6) {
      continue;
    }

    const fT = -oCamera.position.y / vRayDirection.y;
    if (fT < 0) {
      continue;
    }

    const fHitX = oCamera.position.x + vRayDirection.x * fT;
    const fHitZ = oCamera.position.z + vRayDirection.z * fT;
    fMinX = Math.min(fMinX, fHitX);
    fMaxX = Math.max(fMaxX, fHitX);
    fMinZ = Math.min(fMinZ, fHitZ);
    fMaxZ = Math.max(fMaxZ, fHitZ);
  }

  return { minX: fMinX, maxX: fMaxX, minZ: fMinZ, maxZ: fMaxZ };
}

function worldToTileCoords(
  fWorldX: number,
  fWorldZ: number,
): { nTileX: number; nTileZ: number } {
  const nChunkX = worldToChunkIndex(fWorldX);
  const nChunkZ = worldToChunkIndex(fWorldZ);
  const fCenterX = nChunkX * CHUNK_SIZE;
  const fCenterZ = nChunkZ * CHUNK_SIZE;
  const fHalfChunk = CHUNK_SIZE * 0.5;
  const nTileX =
    nChunkX * CHUNK_SEGMENTS +
    Math.floor((fWorldX - fCenterX + fHalfChunk) / TILE_SIZE);
  const nTileZ =
    nChunkZ * CHUNK_SEGMENTS +
    Math.floor((fCenterZ + fHalfChunk - fWorldZ) / TILE_SIZE);

  return { nTileX, nTileZ };
}

function hashTile(nTileX: number, nTileZ: number): number {
  let nHash = nTileX * 374761393 + nTileZ * 668265263;
  nHash = (nHash ^ (nHash >>> 13)) >>> 0;
  nHash = (nHash * 1274126177) >>> 0;
  return (nHash & 0xffffff) / 0x1000000;
}

function hashTileSeed(nTileX: number, nTileZ: number, nSeed: number): number {
  let nHash = nTileX * 374761393 + nTileZ * 668265263 + nSeed * 982451653;
  nHash = (nHash ^ (nHash >>> 13)) >>> 0;
  nHash = (nHash * 1274126177) >>> 0;
  return (nHash & 0xffffff) / 0x1000000;
}

function tileHasTreeNote(nTileX: number, nTileZ: number): boolean {
  if (!tileHasTree(nTileX, nTileZ)) {
    return false;
  }

  return hashTileSeed(nTileX, nTileZ, 1) < TREE_NOTE_CHANCE;
}

function getTreeNoteFileIndex(nTileX: number, nTileZ: number): number {
  return Math.floor(hashTileSeed(nTileX, nTileZ, 2) * getNoteFileCount());
}

function tileHasRock(nTileX: number, nTileZ: number): boolean {
  return hashTile(nTileX, nTileZ) < ROCK_TILE_CHANCE;
}

function tileHasTree(nTileX: number, nTileZ: number): boolean {
  const fHash = hashTile(nTileX, nTileZ);
  return fHash >= ROCK_TILE_CHANCE && fHash < ROCK_TILE_CHANCE + TREE_TILE_CHANCE;
}

function setTreeMeshMaterial(
  oTree: THREE.Mesh,
  oMaterial: THREE.Material,
): void {
  oTree.material = oMaterial;
  for (const oChild of oTree.children) {
    if (oChild instanceof THREE.Mesh && oChild.userData.bTreeBranch) {
      oChild.material = oMaterial;
    }
  }
}

function disposeTreeBranchMeshes(oTree: THREE.Mesh): void {
  for (let i = oTree.children.length - 1; i >= 0; i--) {
    const oChild = oTree.children[i];
    if (!(oChild instanceof THREE.Mesh) || !oChild.userData.bTreeBranch) {
      continue;
    }

    oChild.geometry.dispose();
    oTree.remove(oChild);
  }
}

function addTreeBranches(
  oTrunk: THREE.Mesh,
  oBranchTemplateGeometry: THREE.BufferGeometry,
  oTreeMaterial: THREE.Material,
  nTileX: number,
  nTileZ: number,
): void {
  const fHalfHeight = TREE_HEIGHT * 0.5;
  const fHalfBottom = TREE_BASE_SIZE * TREE_TRUNK_WIDTH_SCALE * 0.5;
  const fHalfTop = fHalfBottom * TREE_TRUNK_TOP_SCALE;
  const fBranchHalfLength = TREE_BRANCH_LENGTH * 0.5;

  for (let i = 0; i < TREE_BRANCH_COUNT; i++) {
    const fHeightT =
      TREE_BRANCH_HEIGHT_MIN + hashTileSeed(nTileX, nTileZ, i) * TREE_BRANCH_HEIGHT_RANGE;
    const fAngle = hashTileSeed(nTileX, nTileZ, i + TREE_BRANCH_COUNT) * Math.PI * 2;
    const fY = -fHalfHeight + fHeightT * TREE_HEIGHT;
    const fRadius = fHalfBottom + fHeightT * (fHalfTop - fHalfBottom);
    const fOutX = Math.cos(fAngle);
    const fOutZ = Math.sin(fAngle);

    const oBranchGeometry = oBranchTemplateGeometry.clone();
    applyTreeFaceUvs(
      oBranchGeometry,
      TREE_FACE_UV_SIZE,
      TREE_BRANCH_WIDTH,
      TREE_BRANCH_LENGTH,
    );

    const fCosTilt = Math.cos(TREE_BRANCH_TILT);
    const fSinTilt = Math.sin(TREE_BRANCH_TILT);
    const fDirX = fOutX * fCosTilt;
    const fDirY = fSinTilt;
    const fDirZ = fOutZ * fCosTilt;

    const oBranch = new THREE.Mesh(oBranchGeometry, oTreeMaterial);
    oBranch.position.set(
      fOutX * fRadius + fDirX * fBranchHalfLength,
      fY + fDirY * fBranchHalfLength,
      fOutZ * fRadius + fDirZ * fBranchHalfLength,
    );
    oBranch.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(fDirX, fDirY, fDirZ),
    );
    oBranch.castShadow = true;
    oBranch.receiveShadow = true;
    oBranch.userData.bTreeBranch = true;
    oTrunk.add(oBranch);
  }
}

function createTruncatedPyramidGeometry(
  fWidth: number,
  fHeight: number,
  fTopScale: number,
): THREE.BufferGeometry {
  const fHalfHeight = fHeight * 0.5;
  const fHalfBottom = fWidth * 0.5;
  const fHalfTop = fHalfBottom * fTopScale;
  const aPositions: number[] = [];
  const aUvs: number[] = [];
  const aIndices: number[] = [];

  const addQuad = (
    ax0: number,
    ay0: number,
    az0: number,
    ax1: number,
    ay1: number,
    az1: number,
    ax2: number,
    ay2: number,
    az2: number,
    ax3: number,
    ay3: number,
    az3: number,
  ): void => {
    const nBase = aPositions.length / 3;
    aPositions.push(ax0, ay0, az0, ax1, ay1, az1, ax2, ay2, az2, ax3, ay3, az3);
    aUvs.push(0, 0, 1, 0, 1, 1, 0, 1);
    aIndices.push(nBase, nBase + 1, nBase + 2, nBase, nBase + 2, nBase + 3);
  };

  addQuad(
    -fHalfTop,
    fHalfHeight,
    -fHalfTop,
    -fHalfTop,
    fHalfHeight,
    fHalfTop,
    fHalfTop,
    fHalfHeight,
    fHalfTop,
    fHalfTop,
    fHalfHeight,
    -fHalfTop,
  );
  addQuad(
    -fHalfBottom,
    -fHalfHeight,
    fHalfBottom,
    fHalfBottom,
    -fHalfHeight,
    fHalfBottom,
    fHalfBottom,
    -fHalfHeight,
    -fHalfBottom,
    -fHalfBottom,
    -fHalfHeight,
    -fHalfBottom,
  );
  addQuad(
    -fHalfBottom,
    -fHalfHeight,
    fHalfBottom,
    fHalfBottom,
    -fHalfHeight,
    fHalfBottom,
    fHalfTop,
    fHalfHeight,
    fHalfTop,
    -fHalfTop,
    fHalfHeight,
    fHalfTop,
  );
  addQuad(
    fHalfBottom,
    -fHalfHeight,
    -fHalfBottom,
    -fHalfBottom,
    -fHalfHeight,
    -fHalfBottom,
    -fHalfTop,
    fHalfHeight,
    -fHalfTop,
    fHalfTop,
    fHalfHeight,
    -fHalfTop,
  );
  addQuad(
    fHalfBottom,
    -fHalfHeight,
    fHalfBottom,
    fHalfBottom,
    -fHalfHeight,
    -fHalfBottom,
    fHalfTop,
    fHalfHeight,
    -fHalfTop,
    fHalfTop,
    fHalfHeight,
    fHalfTop,
  );
  addQuad(
    -fHalfBottom,
    -fHalfHeight,
    -fHalfBottom,
    -fHalfBottom,
    -fHalfHeight,
    fHalfBottom,
    -fHalfTop,
    fHalfHeight,
    fHalfTop,
    -fHalfTop,
    fHalfHeight,
    -fHalfTop,
  );

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(aPositions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(aUvs, 2));
  geometry.setIndex(aIndices);
  geometry.computeVertexNormals();
  return geometry;
}

function applyRockFaceUvs(
  geometry: THREE.BufferGeometry,
  fFaceUvSize: number,
): void {
  const uvs = geometry.attributes.uv as THREE.BufferAttribute;
  const fOffsetU = Math.random();
  const fOffsetV = Math.random();

  for (let i = 0; i < uvs.count; i++) {
    uvs.setXY(
      i,
      fOffsetU + uvs.getX(i) * fFaceUvSize,
      fOffsetV + uvs.getY(i) * fFaceUvSize,
    );
  }

  uvs.needsUpdate = true;
}

function applyTreeFaceUvs(
  geometry: THREE.BufferGeometry,
  fFaceUvSize: number,
  fWidth: number,
  fHeight: number,
): void {
  const uvs = geometry.attributes.uv as THREE.BufferAttribute;
  const fOffsetU = Math.random();
  const fOffsetV = Math.random();
  const fSideVScale = fFaceUvSize * (fHeight / fWidth);

  for (let i = 0; i < uvs.count; i++) {
    const nFace = Math.floor(i / 4);
    const fUvSizeV = nFace <= 1 ? fFaceUvSize : fSideVScale;

    uvs.setXY(
      i,
      fOffsetU + uvs.getX(i) * fFaceUvSize,
      fOffsetV + uvs.getY(i) * fUvSizeV,
    );
  }

  uvs.needsUpdate = true;
}

function setQuadTileUv(
  uvs: THREE.BufferAttribute,
  nBase: number,
  fTileUvSize: number,
): void {
  const fOffsetU = Math.random();
  const fOffsetV = Math.random();

  uvs.setXY(nBase + 0, fOffsetU, fOffsetV);
  uvs.setXY(nBase + 1, fOffsetU, fOffsetV + fTileUvSize);
  uvs.setXY(nBase + 2, fOffsetU + fTileUvSize, fOffsetV);
  uvs.setXY(nBase + 3, fOffsetU, fOffsetV + fTileUvSize);
  uvs.setXY(nBase + 4, fOffsetU + fTileUvSize, fOffsetV + fTileUvSize);
  uvs.setXY(nBase + 5, fOffsetU + fTileUvSize, fOffsetV);
}

function applyTileQuads(
  geometry: THREE.BufferGeometry,
  nSegments: number,
  fTileUvSize: number,
): void {
  const uvs = geometry.attributes.uv as THREE.BufferAttribute;

  for (let iy = 0; iy < nSegments; iy++) {
    for (let ix = 0; ix < nSegments; ix++) {
      const nBase = (iy * nSegments + ix) * 6;
      const nMaterialIndex = Math.random() < DIRT_TILE_CHANCE ? 1 : 0;

      setQuadTileUv(uvs, nBase, fTileUvSize);
      geometry.addGroup(nBase, 6, nMaterialIndex);
    }
  }

  uvs.needsUpdate = true;
}
