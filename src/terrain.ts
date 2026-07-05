import * as THREE from "three";
import { SimplexNoise } from "three/addons/math/SimplexNoise.js";

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
const ROCK_FACE_UV_SIZE = 0.12;
const TREE_FACE_UV_SIZE = 0.15;
const ROCK_TOP_SCALE = 0.72;
const TREE_TOP_SCALE = 0.35;
const TILE_SIZE = CHUNK_SIZE / CHUNK_SEGMENTS;
const ROCK_EMBED_DEPTH = TILE_SIZE * 0.35;
const TREE_HEIGHT = TILE_SIZE * 3.5;
const TREE_BASE_SIZE = TILE_SIZE * 0.55;
const TREE_EMBED_DEPTH = TILE_SIZE * 0.15;
const HIGHLIGHT_EMISSIVE = 0x999999;
const HIGHLIGHT_EMISSIVE_INTENSITY = 0.15;
const CHUNK_PADDING = 2;
const MAX_ACTIVE_CHUNKS = 50;
const QUADS_UPDATED_PER_FRAME = 4;

const A_NDC_CORNERS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
];

type SampleHeightFn = (fX: number, fZ: number) => number;
type TileFeature = "rock" | "tree";
type RegisterFeatureMeshFn = (
  nTileX: number,
  nTileZ: number,
  eFeature: TileFeature,
  oMesh: THREE.Mesh,
) => string;

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
  private readonly oRockTemplateGeometry: THREE.BufferGeometry;
  private readonly oTreeTemplateGeometry: THREE.BufferGeometry;
  private readonly fTileUvSize: number;
  private readonly aRegisteredTileKeys: string[] = [];

  constructor(
    nChunkX: number,
    nChunkZ: number,
    aMaterials: THREE.Material[],
    oRockMaterial: THREE.Material,
    oTreeMaterial: THREE.Material,
    fnSampleHeight: SampleHeightFn,
    fnRegisterFeatureMesh: RegisterFeatureMeshFn,
  ) {
    const fTileUvSize = TEXTURE_TILE_UV_SIZE;
    const fCenterX = nChunkX * CHUNK_SIZE;
    const fCenterZ = nChunkZ * CHUNK_SIZE;

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
      positions.setZ(i, fnSampleHeight(fWorldX, fWorldZ));
    }

    positions.needsUpdate = true;

    const geometryNonIndexed = geometry.toNonIndexed();
    applyTileQuads(geometryNonIndexed, CHUNK_SEGMENTS, fTileUvSize);
    geometryNonIndexed.computeVertexNormals();

    this.geometry = geometryNonIndexed;
    this.nQuadCount = CHUNK_SEGMENTS * CHUNK_SEGMENTS;
    this.fTileUvSize = fTileUvSize;

    this.mesh = new THREE.Mesh(geometryNonIndexed, aMaterials);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.receiveShadow = true;
    this.root.position.set(fCenterX, 0, fCenterZ);
    this.root.add(this.mesh);

    this.oRockTemplateGeometry = createTruncatedPyramidGeometry(
      TILE_SIZE,
      TILE_SIZE,
      ROCK_TOP_SCALE,
    );
    this.oTreeTemplateGeometry = createTruncatedPyramidGeometry(
      TREE_BASE_SIZE,
      TREE_HEIGHT,
      TREE_TOP_SCALE,
    );
    this.buildRocks(
      nChunkX,
      nChunkZ,
      oRockMaterial,
      fnSampleHeight,
      fnRegisterFeatureMesh,
    );
    this.buildTrees(
      nChunkX,
      nChunkZ,
      oTreeMaterial,
      fnSampleHeight,
      fnRegisterFeatureMesh,
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
  ): void {
    const fHalfChunk = CHUNK_SIZE * 0.5;
    const fRockCenterY = TILE_SIZE * 0.5 - ROCK_EMBED_DEPTH;

    for (let iy = 0; iy < CHUNK_SEGMENTS; iy++) {
      for (let ix = 0; ix < CHUNK_SEGMENTS; ix++) {
        const nTileX = nChunkX * CHUNK_SEGMENTS + ix;
        const nTileZ = nChunkZ * CHUNK_SEGMENTS + iy;
        if (!tileHasRock(nTileX, nTileZ)) {
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
  ): void {
    const fHalfChunk = CHUNK_SIZE * 0.5;
    const fTreeCenterY = TREE_HEIGHT * 0.5 - TREE_EMBED_DEPTH;

    for (let iy = 0; iy < CHUNK_SEGMENTS; iy++) {
      for (let ix = 0; ix < CHUNK_SEGMENTS; ix++) {
        const nTileX = nChunkX * CHUNK_SEGMENTS + ix;
        const nTileZ = nChunkZ * CHUNK_SEGMENTS + iy;
        if (!tileHasTree(nTileX, nTileZ)) {
          continue;
        }

        const fLocalX = -fHalfChunk + (ix + 0.5) * TILE_SIZE;
        const fLocalZ = fHalfChunk - (iy + 0.5) * TILE_SIZE;
        const fWorldX = this.root.position.x + fLocalX;
        const fWorldZ = this.root.position.z + fLocalZ;
        const fHeight = fnSampleHeight(fWorldX, fWorldZ);

        const oTreeGeometry = this.oTreeTemplateGeometry.clone();
        applyTreeFaceUvs(
          oTreeGeometry,
          TREE_FACE_UV_SIZE,
          TREE_BASE_SIZE,
          TREE_HEIGHT,
        );

        const oTree = new THREE.Mesh(oTreeGeometry, oTreeMaterial);
        oTree.position.set(fLocalX, fHeight + fTreeCenterY, fLocalZ);
        oTree.castShadow = true;
        oTree.receiveShadow = true;
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
    this.oRockTemplateGeometry.dispose();
    this.oTreeTemplateGeometry.dispose();
    this.root.traverse((oChild) => {
      if (oChild === this.mesh) {
        return;
      }

      if (oChild instanceof THREE.Mesh) {
        oChild.geometry.dispose();
      }
    });
  }
}

export class Terrain {
  readonly root = new THREE.Group();
  private readonly mChunks = new Map<string, TerrainChunk>();
  private readonly aMaterials: THREE.Material[];
  private readonly oRockMaterial: THREE.Material;
  private readonly oTreeMaterial: THREE.Material;
  private readonly oNoise = new SimplexNoise();
  private readonly oFrustum = new THREE.Frustum();
  private readonly mProjScreenMatrix = new THREE.Matrix4();
  private readonly oChunkBounds = new THREE.Box3();
  private readonly vChunkCenter = new THREE.Vector3();
  private readonly mFeatureMeshes = new Map<string, THREE.Mesh>();
  private readonly oRockHighlightMaterial: THREE.MeshStandardMaterial;
  private readonly oTreeHighlightMaterial: THREE.MeshStandardMaterial;
  private oHighlightedMesh: THREE.Mesh | null = null;

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
  }

  update(oCamera: THREE.Camera): void {
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
        this.oRockMaterial,
        this.oTreeMaterial,
        this.sampleHeight.bind(this),
        this.registerFeatureMesh.bind(this),
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
    return tileHasRock(nTileX, nTileZ);
  }

  hasTreeAt(fWorldX: number, fWorldZ: number): boolean {
    const { nTileX, nTileZ } = worldToTileCoords(fWorldX, fWorldZ);
    return tileHasTree(nTileX, nTileZ);
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
    const oMesh =
      this.mFeatureMeshes.get(featureTileKey(nTileX, nTileZ)) ?? null;

    if (oMesh === this.oHighlightedMesh) {
      return;
    }

    this.clearTargetHighlight();

    if (oMesh === null) {
      return;
    }

    const eFeature = oMesh.userData.eFeature as TileFeature;
    oMesh.material =
      eFeature === "rock"
        ? this.oRockHighlightMaterial
        : this.oTreeHighlightMaterial;
    this.oHighlightedMesh = oMesh;
  }

  private registerFeatureMesh(
    nTileX: number,
    nTileZ: number,
    eFeature: TileFeature,
    oMesh: THREE.Mesh,
  ): string {
    oMesh.userData.eFeature = eFeature;
    const sTileKey = featureTileKey(nTileX, nTileZ);
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
    this.oHighlightedMesh.material =
      eFeature === "rock" ? this.oRockMaterial : this.oTreeMaterial;
    this.oHighlightedMesh = null;
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

function tileHasRock(nTileX: number, nTileZ: number): boolean {
  return hashTile(nTileX, nTileZ) < ROCK_TILE_CHANCE;
}

function tileHasTree(nTileX: number, nTileZ: number): boolean {
  const fHash = hashTile(nTileX, nTileZ);
  return fHash >= ROCK_TILE_CHANCE && fHash < ROCK_TILE_CHANCE + TREE_TILE_CHANCE;
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
