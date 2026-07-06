import * as THREE from "three";

const TEXTURE_SIZE = 96;
const SEED_COUNT = 56;

function seedOffset(nSeed: number, fScale: number): number {
  const fValue = Math.sin(nSeed * 12.9898 + fScale * 78.233) * 43758.5453;
  return fValue - Math.floor(fValue);
}

export function createPappusTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = TEXTURE_SIZE;
  canvas.height = TEXTURE_SIZE;
  const ctx = canvas.getContext("2d")!;

  ctx.clearRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);

  const fCenterX = TEXTURE_SIZE * 0.5;
  const fCenterY = TEXTURE_SIZE * 0.5;
  const fSphereRadius = TEXTURE_SIZE * 0.44;

  const oCore = ctx.createRadialGradient(
    fCenterX,
    fCenterY,
    0,
    fCenterX,
    fCenterY,
    fSphereRadius * 0.24,
  );
  oCore.addColorStop(0, "rgba(168, 148, 118, 1)");
  oCore.addColorStop(0.55, "rgba(228, 222, 210, 0.95)");
  oCore.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = oCore;
  ctx.beginPath();
  ctx.arc(fCenterX, fCenterY, fSphereRadius * 0.24, 0, Math.PI * 2);
  ctx.fill();

  for (let nSeed = 0; nSeed < SEED_COUNT; nSeed++) {
    const fAngle =
      (nSeed / SEED_COUNT) * Math.PI * 2 + seedOffset(nSeed, 1.4) * 0.55;
    const fDist = fSphereRadius * (0.1 + seedOffset(nSeed, 2.1) * 0.82);
    const fSeedX = fCenterX + Math.cos(fAngle) * fDist;
    const fSeedY = fCenterY + Math.sin(fAngle) * fDist;
    const nFilaments = 12 + Math.floor(seedOffset(nSeed, 3.7) * 7);

    ctx.fillStyle = "rgba(196, 184, 164, 1)";
    ctx.beginPath();
    ctx.arc(fSeedX, fSeedY, 1.1, 0, Math.PI * 2);
    ctx.fill();

    for (let nFilament = 0; nFilament < nFilaments; nFilament++) {
      const fFilamentAngle =
        (nFilament / nFilaments) * Math.PI * 2 +
        fAngle * 0.35 +
        seedOffset(nSeed + nFilament, 4.2) * 0.4;
      const fLength = 4 + seedOffset(nFilament, nSeed * 0.3) * 7;
      const fAlpha = 0.65 + seedOffset(nFilament, nSeed * 0.5) * 0.35;

      ctx.strokeStyle = `rgba(255, 255, 255, ${fAlpha})`;
      ctx.lineWidth = 0.9 + seedOffset(nFilament, nSeed) * 0.6;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(fSeedX, fSeedY);
      ctx.lineTo(
        fSeedX + Math.cos(fFilamentAngle) * fLength,
        fSeedY + Math.sin(fFilamentAngle) * fLength,
      );
      ctx.stroke();
    }
  }

  const oHalo = ctx.createRadialGradient(
    fCenterX,
    fCenterY,
    fSphereRadius * 0.08,
    fCenterX,
    fCenterY,
    fSphereRadius,
  );
  oHalo.addColorStop(0, "rgba(255, 255, 255, 0.35)");
  oHalo.addColorStop(0.65, "rgba(255, 255, 255, 0.12)");
  oHalo.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = oHalo;
  ctx.beginPath();
  ctx.arc(fCenterX, fCenterY, fSphereRadius, 0, Math.PI * 2);
  ctx.fill();

  const oTexture = new THREE.CanvasTexture(canvas);
  oTexture.colorSpace = THREE.SRGBColorSpace;
  return oTexture;
}
