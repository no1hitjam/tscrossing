import * as THREE from "three";
import { SimplexNoise } from "three/addons/math/SimplexNoise.js";

const CHUNK_SIZE = 32;
const CHUNK_SEGMENTS = 16;
const TEXTURE_TILE_UV_SIZE = 0.25;
const HEIGHT_SCALE = 3;
const NOISE_SCALE = 0.08;
const OCTAVES = 4;
const PERSISTENCE = 0.5;
const LACUNARITY = 2;

const DIRT_TILE_CHANCE = 0.1;
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

function chunkKey(nChunkX: number, nChunkZ: number): string {
  return `${nChunkX},${nChunkZ}`;
}

function worldToChunkIndex(fWorld: number): number {
  return Math.floor((fWorld + CHUNK_SIZE * 0.5) / CHUNK_SIZE);
}

class TerrainChunk {
  readonly mesh: THREE.Mesh;
  readonly nQuadCount: number;
  private readonly geometry: THREE.BufferGeometry;
  private readonly fTileUvSize: number;

  constructor(
    nChunkX: number,
    nChunkZ: number,
    aMaterials: THREE.Material[],
    fnSampleHeight: SampleHeightFn,
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
    this.mesh.position.set(fCenterX, 0, fCenterZ);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.receiveShadow = true;
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
  }
}

export class Terrain {
  readonly root = new THREE.Group();
  private readonly mChunks = new Map<string, TerrainChunk>();
  private readonly aMaterials: THREE.Material[];
  private readonly oNoise = new SimplexNoise();
  private readonly oFrustum = new THREE.Frustum();
  private readonly mProjScreenMatrix = new THREE.Matrix4();
  private readonly oChunkBounds = new THREE.Box3();
  private readonly vChunkCenter = new THREE.Vector3();

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
        this.sampleHeight.bind(this),
      );
      this.mChunks.set(sKey, oChunk);
      this.root.add(oChunk.mesh);
    }

    for (const [sKey, oChunk] of this.mChunks) {
      if (sDesiredSet.has(sKey)) {
        continue;
      }

      this.root.remove(oChunk.mesh);
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
    let fAmplitude = 1;
    let fFrequency = NOISE_SCALE;
    let fHeight = 0;
    let fMaxAmplitude = 0;

    for (let octave = 0; octave < OCTAVES; octave++) {
      fHeight +=
        this.oNoise.noise(fX * fFrequency, fZ * fFrequency) * fAmplitude;
      fMaxAmplitude += fAmplitude;
      fAmplitude *= PERSISTENCE;
      fFrequency *= LACUNARITY;
    }

    return (fHeight / fMaxAmplitude) * HEIGHT_SCALE;
  }

  sampleHeightAt(fX: number, fZ: number): number {
    return this.sampleHeight(fX, fZ);
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
          -HEIGHT_SCALE,
          nChunkZ * CHUNK_SIZE - CHUNK_SIZE * 0.5,
        );
        this.oChunkBounds.max.set(
          nChunkX * CHUNK_SIZE + CHUNK_SIZE * 0.5,
          HEIGHT_SCALE,
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
