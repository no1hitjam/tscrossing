import * as THREE from "three";

const TEXTURE_WIDTH = 28;
const TEXTURE_HEIGHT = 48;

function fillArcBand(
  ctx: CanvasRenderingContext2D,
  fCenterX: number,
  fCenterY: number,
  fInnerRadius: number,
  fOuterRadius: number,
  fStartAngle: number,
  fEndAngle: number,
): void {
  ctx.beginPath();
  ctx.arc(fCenterX, fCenterY, fOuterRadius, fStartAngle, fEndAngle, false);
  ctx.arc(fCenterX, fCenterY, fInnerRadius, fEndAngle, fStartAngle, true);
  ctx.closePath();
}

export function createGrassBladeTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = TEXTURE_WIDTH;
  canvas.height = TEXTURE_HEIGHT;
  const ctx = canvas.getContext("2d")!;

  ctx.clearRect(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT);

  const fCenterX = TEXTURE_WIDTH * 0.34;
  const fCenterY = TEXTURE_HEIGHT * 0.5;
  const fMidRadius = TEXTURE_HEIGHT * 0.38;
  const fBandHalfWidth = 0.8;
  const fOuterRadius = fMidRadius + fBandHalfWidth;
  const fInnerRadius = fMidRadius - fBandHalfWidth;
  const fArcSpan = 0.75;

  fillArcBand(
    ctx,
    fCenterX,
    fCenterY,
    fInnerRadius,
    fOuterRadius,
    -Math.PI / 2 - fArcSpan,
    -Math.PI / 2 + fArcSpan,
  );

  const oGradient = ctx.createLinearGradient(0, TEXTURE_HEIGHT, 0, 0);
  oGradient.addColorStop(0, "rgba(24, 52, 18, 1)");
  oGradient.addColorStop(0.45, "rgba(32, 68, 24, 1)");
  oGradient.addColorStop(1, "rgba(42, 82, 30, 1)");
  ctx.fillStyle = oGradient;
  ctx.fill();

  const oTexture = new THREE.CanvasTexture(canvas);
  oTexture.colorSpace = THREE.SRGBColorSpace;
  return oTexture;
}
