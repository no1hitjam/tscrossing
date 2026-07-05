import * as THREE from "three";
import { SimplexNoise } from "three/addons/math/SimplexNoise.js";

const TERRAIN_SEGMENTS = 16;
const TEXTURE_TILE_UV_SIZE = 0.25;
const HEIGHT_SCALE = 3;
const NOISE_SCALE = 0.08;
const OCTAVES = 4;
const PERSISTENCE = 0.5;
const LACUNARITY = 2;

export class Terrain {
  readonly mesh: THREE.Mesh;
  readonly fWorldSize: number;
  private readonly oNoise = new SimplexNoise();

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
    applyRandomQuadUvs(geometryNonIndexed, TERRAIN_SEGMENTS, TEXTURE_TILE_UV_SIZE);
    geometryNonIndexed.computeVertexNormals();

    const oGrassTexture = new THREE.TextureLoader().load("/grass.png");
    oGrassTexture.wrapS = THREE.RepeatWrapping;
    oGrassTexture.wrapT = THREE.RepeatWrapping;
    oGrassTexture.colorSpace = THREE.SRGBColorSpace;

    this.mesh = new THREE.Mesh(
      geometryNonIndexed,
      new THREE.MeshStandardMaterial({
        map: oGrassTexture,
        flatShading: true,
      }),
    );
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.receiveShadow = true;
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
}

function applyRandomQuadUvs(
  geometry: THREE.BufferGeometry,
  nSegments: number,
  fTileUvSize: number,
): void {
  const uvs = geometry.attributes.uv;

  for (let iy = 0; iy < nSegments; iy++) {
    for (let ix = 0; ix < nSegments; ix++) {
      const fOffsetU = Math.random();
      const fOffsetV = Math.random();
      const nBase = (iy * nSegments + ix) * 6;

      uvs.setXY(nBase + 0, fOffsetU, fOffsetV);
      uvs.setXY(nBase + 1, fOffsetU, fOffsetV + fTileUvSize);
      uvs.setXY(nBase + 2, fOffsetU + fTileUvSize, fOffsetV);
      uvs.setXY(nBase + 3, fOffsetU, fOffsetV + fTileUvSize);
      uvs.setXY(nBase + 4, fOffsetU + fTileUvSize, fOffsetV + fTileUvSize);
      uvs.setXY(nBase + 5, fOffsetU + fTileUvSize, fOffsetV);
    }
  }

  uvs.needsUpdate = true;
}
