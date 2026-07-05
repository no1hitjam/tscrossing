import * as THREE from "three";
import { SimplexNoise } from "three/addons/math/SimplexNoise.js";

const TERRAIN_SEGMENTS = 64;
const TEXTURE_TILE_UV_SIZE = 0.25;
const HEIGHT_SCALE = 3;
const NOISE_SCALE = 0.08;
const OCTAVES = 4;
const PERSISTENCE = 0.5;
const LACUNARITY = 2;

const RAYCAST_ORIGIN_Y = 100;
const DIRT_TILE_CHANCE = 0.1;
const QUADS_UPDATED_PER_FRAME = 2;

export class Terrain {
  readonly mesh: THREE.Mesh;
  readonly fWorldSize: number;
  private readonly geometry: THREE.BufferGeometry;
  private readonly nQuadCount: number;
  private readonly fTileUvSize: number;
  private readonly oNoise = new SimplexNoise();
  private readonly oRaycaster = new THREE.Raycaster();
  private readonly vRayOrigin = new THREE.Vector3();
  private readonly vRayDirection = new THREE.Vector3(0, -1, 0);

  constructor(fWorldSize: number) {
    this.fWorldSize = fWorldSize;

    const geometry = new THREE.PlaneGeometry(
      fWorldSize,
      fWorldSize,
      TERRAIN_SEGMENTS,
      TERRAIN_SEGMENTS,
    );
    const positions = geometry.attributes.position;

    for (let i = 0; i < positions.count; i++) {
      const fX = positions.getX(i);
      const fY = positions.getY(i);
      positions.setZ(i, this.sampleHeight(fX, -fY));
    }

    positions.needsUpdate = true;

    const geometryNonIndexed = geometry.toNonIndexed();
    this.geometry = geometryNonIndexed;
    this.nQuadCount = TERRAIN_SEGMENTS * TERRAIN_SEGMENTS;
    this.fTileUvSize = TEXTURE_TILE_UV_SIZE;
    applyTileQuads(geometryNonIndexed, TERRAIN_SEGMENTS, this.fTileUvSize);
    geometryNonIndexed.computeVertexNormals();

    const oGrassTexture = new THREE.TextureLoader().load("/grass.png");
    oGrassTexture.wrapS = THREE.RepeatWrapping;
    oGrassTexture.wrapT = THREE.RepeatWrapping;
    oGrassTexture.colorSpace = THREE.SRGBColorSpace;

    const oDirtTexture = new THREE.TextureLoader().load("/dirt.png");
    oDirtTexture.wrapS = THREE.RepeatWrapping;
    oDirtTexture.wrapT = THREE.RepeatWrapping;
    oDirtTexture.colorSpace = THREE.SRGBColorSpace;

    this.mesh = new THREE.Mesh(geometryNonIndexed, [
      new THREE.MeshStandardMaterial({
        map: oGrassTexture,
        flatShading: true,
      }),
      new THREE.MeshStandardMaterial({
        map: oDirtTexture,
        flatShading: true,
      }),
    ]);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.receiveShadow = true;
  }

  update(): void {
    const uvs = this.geometry.attributes.uv as THREE.BufferAttribute;

    for (let i = 0; i < QUADS_UPDATED_PER_FRAME; i++) {
      const nQuadIndex = Math.floor(Math.random() * this.nQuadCount);
      setQuadTileUv(uvs, nQuadIndex * 6, this.fTileUvSize);
    }

    uvs.needsUpdate = true;
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

  sampleHeightAt(fX: number, fZ: number): number | null {
    this.vRayOrigin.set(fX, RAYCAST_ORIGIN_Y, fZ);
    this.oRaycaster.set(this.vRayOrigin, this.vRayDirection);

    const aHits = this.oRaycaster.intersectObject(this.mesh);
    if (aHits.length === 0) {
      return null;
    }

    return aHits[0].point.y;
  }
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
