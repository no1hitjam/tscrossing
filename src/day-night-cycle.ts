import * as THREE from "three";
import type { Terrain } from "./terrain";

const CYCLE_SECONDS = 300;
const LIGHT_INTENSITY_SCALE = 3.3;
const SUN_ORBIT_DISTANCE = 42;
const SUN_MIN_HEIGHT = 2;
const SUN_MAX_HEIGHT = 38;

const SKY_COLOR_STOPS: ReadonlyArray<{ fPhase: number; nColor: number }> = [
  { fPhase: 0.0, nColor: 0x080c18 },
  { fPhase: 0.2, nColor: 0x1a1838 },
  { fPhase: 0.24, nColor: 0xff8866 },
  { fPhase: 0.28, nColor: 0x9ec8e8 },
  { fPhase: 0.5, nColor: 0x6eb5ff },
  { fPhase: 0.72, nColor: 0x9ec8e8 },
  { fPhase: 0.76, nColor: 0xff7755 },
  { fPhase: 0.8, nColor: 0x2a1e38 },
  { fPhase: 1.0, nColor: 0x080c18 },
];

const FOG_COLOR_STOPS: ReadonlyArray<{ fPhase: number; nColor: number }> = [
  { fPhase: 0.0, nColor: 0x0c1838 },
  { fPhase: 0.24, nColor: 0x4a3848 },
  { fPhase: 0.5, nColor: 0x3a4555 },
  { fPhase: 0.76, nColor: 0x4a3840 },
  { fPhase: 1.0, nColor: 0x0c1838 },
];

const FOG_LAYER_COLOR_STOPS: ReadonlyArray<{ fPhase: number; nColor: number }> =
  [
    { fPhase: 0.0, nColor: 0x4a6898 },
    { fPhase: 0.24, nColor: 0xf0c8b0 },
    { fPhase: 0.5, nColor: 0xf0e8f8 },
    { fPhase: 0.76, nColor: 0xf0c0a8 },
    { fPhase: 1.0, nColor: 0x4a6898 },
  ];

const FOG_LAYER_DARK_COLOR_STOPS: ReadonlyArray<{
  fPhase: number;
  nColor: number;
}> = [
  { fPhase: 0.0, nColor: 0x081028 },
  { fPhase: 0.24, nColor: 0x201820 },
  { fPhase: 0.5, nColor: 0x141820 },
  { fPhase: 0.76, nColor: 0x201818 },
  { fPhase: 1.0, nColor: 0x081028 },
];

const FOG_SUN_COLOR_STOPS: ReadonlyArray<{ fPhase: number; nColor: number }> =
  [
    { fPhase: 0.0, nColor: 0x5068a0 },
    { fPhase: 0.24, nColor: 0xffd8a0 },
    { fPhase: 0.5, nColor: 0xfff4dc },
    { fPhase: 0.76, nColor: 0xffc090 },
    { fPhase: 1.0, nColor: 0x5068a0 },
  ];

const AMBIENT_COLOR_STOPS: ReadonlyArray<{ fPhase: number; nColor: number }> =
  [
    { fPhase: 0.0, nColor: 0x506080 },
    { fPhase: 0.24, nColor: 0xffd0b0 },
    { fPhase: 0.5, nColor: 0xffffff },
    { fPhase: 0.76, nColor: 0xffc8a0 },
    { fPhase: 1.0, nColor: 0x506080 },
  ];

const SUN_COLOR_STOPS: ReadonlyArray<{ fPhase: number; nColor: number }> = [
  { fPhase: 0.0, nColor: 0x7088b0 },
  { fPhase: 0.24, nColor: 0xffc890 },
  { fPhase: 0.5, nColor: 0xffffff },
  { fPhase: 0.76, nColor: 0xffb080 },
  { fPhase: 1.0, nColor: 0x7088b0 },
];

export type DayNightTargets = {
  oScene: THREE.Scene;
  oAmbientLight: THREE.AmbientLight;
  oSunLight: THREE.DirectionalLight;
  oTerrain: Terrain;
};

function sampleColorStops(
  fPhase: number,
  aStops: ReadonlyArray<{ fPhase: number; nColor: number }>,
  oOut: THREE.Color,
): void {
  const fWrappedPhase = ((fPhase % 1) + 1) % 1;
  let iStop = 0;
  while (
    iStop < aStops.length - 1 &&
    aStops[iStop + 1].fPhase < fWrappedPhase
  ) {
    iStop++;
  }

  const oStart = aStops[iStop];
  const oEnd = aStops[(iStop + 1) % aStops.length];
  const fSpan = oEnd.fPhase - oStart.fPhase;
  const fLocalT =
    fSpan > 0
      ? (fWrappedPhase - oStart.fPhase) / fSpan
      : fWrappedPhase >= oStart.fPhase
        ? 0
        : 1;

  oOut.setHex(oStart.nColor).lerp(new THREE.Color(oEnd.nColor), fLocalT);
}

function sampleScalarStops(
  fPhase: number,
  aStops: ReadonlyArray<{ fPhase: number; fValue: number }>,
): number {
  const fWrappedPhase = ((fPhase % 1) + 1) % 1;
  let iStop = 0;
  while (
    iStop < aStops.length - 1 &&
    aStops[iStop + 1].fPhase < fWrappedPhase
  ) {
    iStop++;
  }

  const oStart = aStops[iStop];
  const oEnd = aStops[(iStop + 1) % aStops.length];
  const fSpan = oEnd.fPhase - oStart.fPhase;
  const fLocalT =
    fSpan > 0
      ? (fWrappedPhase - oStart.fPhase) / fSpan
      : fWrappedPhase >= oStart.fPhase
        ? 0
        : 1;

  return THREE.MathUtils.lerp(oStart.fValue, oEnd.fValue, fLocalT);
}

export class DayNightCycle {
  private fElapsedSeconds = CYCLE_SECONDS * 0.35;
  private readonly oSkyColor = new THREE.Color();
  private readonly oFogColor = new THREE.Color();
  private readonly oFogLayerColor = new THREE.Color();
  private readonly oFogLayerDarkColor = new THREE.Color();
  private readonly oFogSunColor = new THREE.Color();
  private readonly oAmbientColor = new THREE.Color();
  private readonly oSunColor = new THREE.Color();
  private readonly vSunOffset = new THREE.Vector3();
  readonly oSnowAmbientLight = new THREE.Color();
  readonly oSnowDirectionalLight = new THREE.Color();
  fMusicVolume = 1;

  constructor(private readonly oTargets: DayNightTargets) {}

  get fPhase(): number {
    return (this.fElapsedSeconds % CYCLE_SECONDS) / CYCLE_SECONDS;
  }

  update(fDt: number, vPlayerPosition: THREE.Vector3): void {
    this.fElapsedSeconds += fDt;
    const fPhase = this.fPhase;
    const fOrbitAngle = (fPhase - 0.25) * Math.PI;
    const bSunAboveHorizon =
      fOrbitAngle >= 0 && fOrbitAngle <= Math.PI;
    const fDayAmount = bSunAboveHorizon ? Math.sin(fOrbitAngle) : 0;

    sampleColorStops(fPhase, SKY_COLOR_STOPS, this.oSkyColor);
    sampleColorStops(fPhase, FOG_COLOR_STOPS, this.oFogColor);
    sampleColorStops(fPhase, FOG_LAYER_COLOR_STOPS, this.oFogLayerColor);
    sampleColorStops(fPhase, FOG_LAYER_DARK_COLOR_STOPS, this.oFogLayerDarkColor);
    sampleColorStops(fPhase, FOG_SUN_COLOR_STOPS, this.oFogSunColor);
    sampleColorStops(fPhase, AMBIENT_COLOR_STOPS, this.oAmbientColor);
    sampleColorStops(fPhase, SUN_COLOR_STOPS, this.oSunColor);

    const fAmbientIntensity =
      sampleScalarStops(fPhase, [
        { fPhase: 0.0, fValue: 0.22 },
        { fPhase: 0.24, fValue: 0.42 },
        { fPhase: 0.5, fValue: 0.55 },
        { fPhase: 0.76, fValue: 0.42 },
        { fPhase: 1.0, fValue: 0.22 },
      ]) * LIGHT_INTENSITY_SCALE;

    const fSunIntensity =
      sampleScalarStops(fPhase, [
        { fPhase: 0.0, fValue: 0.08 },
        { fPhase: 0.24, fValue: 0.55 },
        { fPhase: 0.5, fValue: 1.1 },
        { fPhase: 0.76, fValue: 0.55 },
        { fPhase: 1.0, fValue: 0.08 },
      ]) * LIGHT_INTENSITY_SCALE;

    const fFogSunBlend = sampleScalarStops(fPhase, [
      { fPhase: 0.0, fValue: 0.1 },
      { fPhase: 0.24, fValue: 0.3 },
      { fPhase: 0.5, fValue: 0.38 },
      { fPhase: 0.76, fValue: 0.3 },
      { fPhase: 1.0, fValue: 0.1 },
    ]);

    const { oScene, oAmbientLight, oSunLight, oTerrain } = this.oTargets;

    if (oScene.background instanceof THREE.Color) {
      oScene.background.copy(this.oSkyColor);
    } else {
      oScene.background = this.oSkyColor.clone();
    }

    if (oScene.fog instanceof THREE.Fog) {
      oScene.fog.color.copy(this.oFogColor);
    }

    oAmbientLight.color.copy(this.oAmbientColor);
    oAmbientLight.intensity = fAmbientIntensity;

    oSunLight.color.copy(this.oSunColor);
    oSunLight.intensity = fSunIntensity;
    oSunLight.castShadow = fDayAmount > 0.08;

    const fSunHeight =
      SUN_MIN_HEIGHT + fDayAmount * (SUN_MAX_HEIGHT - SUN_MIN_HEIGHT);
    if (bSunAboveHorizon) {
      this.vSunOffset.set(
        Math.cos(fOrbitAngle) * SUN_ORBIT_DISTANCE,
        fSunHeight,
        Math.sin(fOrbitAngle) * SUN_ORBIT_DISTANCE * 0.35 + 8,
      );
    } else {
      const fNightAngle =
        fOrbitAngle < 0 ? fOrbitAngle + Math.PI : fOrbitAngle - Math.PI;
      this.vSunOffset.set(
        Math.cos(fNightAngle) * SUN_ORBIT_DISTANCE,
        SUN_MIN_HEIGHT,
        Math.sin(fNightAngle) * SUN_ORBIT_DISTANCE * 0.35 + 8,
      );
    }

    oSunLight.position.copy(vPlayerPosition).add(this.vSunOffset);
    oSunLight.target.position.copy(vPlayerPosition);
    oSunLight.target.updateMatrixWorld();

    oTerrain.setDayNightFog(
      this.oFogLayerColor,
      this.oFogLayerDarkColor,
      this.oFogSunColor,
      fFogSunBlend,
    );

    this.oSnowAmbientLight
      .copy(this.oAmbientColor)
      .multiplyScalar(fAmbientIntensity);
    this.oSnowDirectionalLight
      .copy(this.oSunColor)
      .multiplyScalar(fSunIntensity);

    this.fMusicVolume = sampleScalarStops(fPhase, [
      { fPhase: 0.0, fValue: 0.02 },
      { fPhase: 0.22, fValue: 0.02 },
      { fPhase: 0.28, fValue: 0.85 },
      { fPhase: 0.5, fValue: 1.0 },
      { fPhase: 0.72, fValue: 0.85 },
      { fPhase: 0.78, fValue: 0.02 },
      { fPhase: 1.0, fValue: 0.02 },
    ]);
  }
}
