import * as THREE from "three";

const TEXTURE_SIZE = 64;

export function createSnowCircleTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = TEXTURE_SIZE;
  canvas.height = TEXTURE_SIZE;
  const ctx = canvas.getContext("2d")!;
  const fCenter = TEXTURE_SIZE * 0.5;
  const fRadius = TEXTURE_SIZE * 0.5;
  const oGradient = ctx.createRadialGradient(
    fCenter,
    fCenter,
    0,
    fCenter,
    fCenter,
    fRadius,
  );
  oGradient.addColorStop(0, "rgba(255, 255, 255, 1)");
  oGradient.addColorStop(0.45, "rgba(255, 255, 255, 0.85)");
  oGradient.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = oGradient;
  ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);

  const oTexture = new THREE.CanvasTexture(canvas);
  oTexture.colorSpace = THREE.SRGBColorSpace;
  return oTexture;
}
