const TONE_SAMPLE_URL = "/sounds/tone_c_0.mp3";
const CHOP_WOOD_URL = "/sounds/chop_wood.mp3";
const PICK_AXE_URL = "/sounds/pick_axe.mp3";
const TREE_FALL_URL = "/sounds/tree_fall.mp3";
const ROCKS_FALL_URL = "/sounds/rocks_fall.mp3";
const PAPER_RUSTLE_URL = "/sounds/paper_rustle.mp3";
const FOOTSTEP_GRASS_URL = "/sounds/footstep_grass.wav";
const FOOTSTEP_DIRT_URL = "/sounds/footstep_dirt.wav";
const LOOK_AHEAD_SECONDS = 0.15;
const MASTER_GAIN = 0.35;
const NOTE_GAIN = 0.55;
const CHOP_WOOD_GAIN = 1.85;
const PICK_AXE_GAIN = 2.85;
const TREE_FALL_GAIN = 2.2;
const ROCKS_FALL_GAIN = 2.2;
const PAPER_RUSTLE_GAIN = 1.8;
const FOOTSTEP_GAIN = 0.4;
const FOOTSTEP_INTERVAL_SECONDS = 0.52;
const FOOTSTEP_SPRINT_INTERVAL_SCALE = 0.65;

const SEMITONE_RATIO = 2 ** (1 / 12);

const A_IDLE_PATTERN = [0, 4, 7, 4, 2, 0, -3, 2] as const;
const A_MOVING_PATTERN = [0, 7, 12, 7, 4, 7, 12, 9] as const;
const A_IDLE_MINIMAL_PATTERN = [0, -12, -7, -12, 0, -7] as const;
const A_MOVING_MINIMAL_PATTERN = [0, -12, -7, -12, -8, -12] as const;

const F_IDLE_STEP_SECONDS = 0.62;
const F_MOVING_STEP_SECONDS = 0.38;
const F_OSCILLATION_PERIOD = 10;
const F_MINIMAL_STEP_MULTIPLIER = 1.55;

function semitonesToPlaybackRate(nSemitones: number): number {
  return SEMITONE_RATIO ** nSemitones;
}

function getOscillationBlend(fTime: number): number {
  return (Math.sin((2 * Math.PI * fTime) / F_OSCILLATION_PERIOD) + 1) / 2;
}

export class DynamicMusic {
  private oAudioContext: AudioContext | null = null;
  private oMasterGain: GainNode | null = null;
  private oToneBuffer: AudioBuffer | null = null;
  private oChopWoodBuffer: AudioBuffer | null = null;
  private oPickAxeBuffer: AudioBuffer | null = null;
  private oTreeFallBuffer: AudioBuffer | null = null;
  private oRocksFallBuffer: AudioBuffer | null = null;
  private oPaperRustleBuffer: AudioBuffer | null = null;
  private oFootstepGrassBuffer: AudioBuffer | null = null;
  private oFootstepDirtBuffer: AudioBuffer | null = null;
  private fNextNoteTime = 0;
  private fFootstepTimer = 0;
  private nPatternIndex = 0;
  private bRunning = false;
  private bPlayerMoving = false;

  async init(): Promise<void> {
    if (this.oAudioContext !== null) {
      return;
    }

    const oAudioContext = new AudioContext();
    const oMasterGain = oAudioContext.createGain();
    oMasterGain.gain.value = MASTER_GAIN;
    oMasterGain.connect(oAudioContext.destination);

    const [
      oToneBuffer,
      oChopWoodBuffer,
      oPickAxeBuffer,
      oTreeFallBuffer,
      oRocksFallBuffer,
      oPaperRustleBuffer,
      oFootstepGrassBuffer,
      oFootstepDirtBuffer,
    ] = await Promise.all([
      this.loadBuffer(oAudioContext, TONE_SAMPLE_URL),
      this.loadBuffer(oAudioContext, CHOP_WOOD_URL),
      this.loadBuffer(oAudioContext, PICK_AXE_URL),
      this.loadBuffer(oAudioContext, TREE_FALL_URL),
      this.loadBuffer(oAudioContext, ROCKS_FALL_URL),
      this.loadBuffer(oAudioContext, PAPER_RUSTLE_URL),
      this.loadBuffer(oAudioContext, FOOTSTEP_GRASS_URL),
      this.loadBuffer(oAudioContext, FOOTSTEP_DIRT_URL),
    ]);

    this.oAudioContext = oAudioContext;
    this.oMasterGain = oMasterGain;
    this.oToneBuffer = oToneBuffer;
    this.oChopWoodBuffer = oChopWoodBuffer;
    this.oPickAxeBuffer = oPickAxeBuffer;
    this.oTreeFallBuffer = oTreeFallBuffer;
    this.oRocksFallBuffer = oRocksFallBuffer;
    this.oPaperRustleBuffer = oPaperRustleBuffer;
    this.oFootstepGrassBuffer = oFootstepGrassBuffer;
    this.oFootstepDirtBuffer = oFootstepDirtBuffer;
  }

  async playChopWood(): Promise<void> {
    await this.playOneShot(() => this.oChopWoodBuffer, CHOP_WOOD_GAIN);
  }

  async playPickAxe(): Promise<void> {
    await this.playOneShot(() => this.oPickAxeBuffer, PICK_AXE_GAIN);
  }

  async playTreeFall(): Promise<void> {
    await this.playOneShot(() => this.oTreeFallBuffer, TREE_FALL_GAIN);
  }

  async playRocksFall(): Promise<void> {
    await this.playOneShot(() => this.oRocksFallBuffer, ROCKS_FALL_GAIN);
  }

  async playPaperRustle(): Promise<void> {
    await this.playOneShot(() => this.oPaperRustleBuffer, PAPER_RUSTLE_GAIN);
  }

  private async playOneShot(
    fnGetBuffer: () => AudioBuffer | null,
    fGain: number,
  ): Promise<void> {
    if (this.oAudioContext === null || fnGetBuffer() === null) {
      try {
        await this.init();
      } catch {
        return;
      }
    }

    const oBuffer = fnGetBuffer();
    if (
      this.oAudioContext === null ||
      oBuffer === null ||
      this.oMasterGain === null
    ) {
      return;
    }

    await this.oAudioContext.resume();

    const oSource = this.oAudioContext.createBufferSource();
    oSource.buffer = oBuffer;

    const oGain = this.oAudioContext.createGain();
    oGain.gain.value = fGain;
    oSource.connect(oGain);
    oGain.connect(this.oMasterGain);

    oSource.start();
  }

  async start(): Promise<void> {
    if (this.oAudioContext === null || this.oToneBuffer === null) {
      await this.init();
    }

    if (this.oAudioContext === null) {
      return;
    }

    await this.oAudioContext.resume();
    this.fNextNoteTime = this.oAudioContext.currentTime + 0.05;
    this.nPatternIndex = 0;
    this.bRunning = true;
  }

  stop(): void {
    this.bRunning = false;
  }

  async suspend(): Promise<void> {
    if (this.oAudioContext === null) {
      return;
    }

    this.bRunning = false;
    await this.oAudioContext.suspend();
  }

  async resume(): Promise<void> {
    if (this.oAudioContext === null || this.oToneBuffer === null) {
      return;
    }

    await this.oAudioContext.resume();
    this.fNextNoteTime = this.oAudioContext.currentTime + 0.05;
    this.nPatternIndex = 0;
    this.bRunning = true;
  }

  setPlayerMoving(bMoving: boolean): void {
    this.bPlayerMoving = bMoving;
  }

  updateFootsteps(
    fDt: number,
    bMoving: boolean,
    bOnDirt: boolean,
    bSprinting: boolean,
  ): void {
    if (!bMoving) {
      this.fFootstepTimer = 0;
      return;
    }

    const fInterval =
      FOOTSTEP_INTERVAL_SECONDS *
      (bSprinting ? FOOTSTEP_SPRINT_INTERVAL_SCALE : 1);
    this.fFootstepTimer += fDt;

    while (this.fFootstepTimer >= fInterval) {
      this.fFootstepTimer -= fInterval;
      void this.playFootstep(bOnDirt);
    }
  }

  private async playFootstep(bOnDirt: boolean): Promise<void> {
    await this.playOneShot(
      () => (bOnDirt ? this.oFootstepDirtBuffer : this.oFootstepGrassBuffer),
      FOOTSTEP_GAIN,
    );
  }

  update(): void {
    if (
      !this.bRunning ||
      this.oAudioContext === null ||
      this.oToneBuffer === null ||
      this.oMasterGain === null
    ) {
      return;
    }

    const aFullPattern = this.bPlayerMoving ? A_MOVING_PATTERN : A_IDLE_PATTERN;
    const aMinimalPattern = this.bPlayerMoving
      ? A_MOVING_MINIMAL_PATTERN
      : A_IDLE_MINIMAL_PATTERN;
    const fFullStepSeconds = this.bPlayerMoving
      ? F_MOVING_STEP_SECONDS
      : F_IDLE_STEP_SECONDS;
    const fMinimalStepSeconds = fFullStepSeconds * F_MINIMAL_STEP_MULTIPLIER;
    const fScheduleUntil =
      this.oAudioContext.currentTime + LOOK_AHEAD_SECONDS;

    while (this.fNextNoteTime < fScheduleUntil) {
      const fBlend = getOscillationBlend(this.fNextNoteTime);
      const nPatternIndex = this.nPatternIndex % aFullPattern.length;
      const nFullSemitones = aFullPattern[nPatternIndex];
      const nMinimalSemitones =
        aMinimalPattern[nPatternIndex % aMinimalPattern.length];
      const nSemitones = fBlend >= 0.5 ? nFullSemitones : nMinimalSemitones;
      const fStepSeconds =
        fFullStepSeconds * fBlend + fMinimalStepSeconds * (1 - fBlend);
      const fNoteGain = NOTE_GAIN * (0.82 + 0.18 * fBlend);

      this.scheduleTone(nSemitones, this.fNextNoteTime, fNoteGain);
      this.nPatternIndex += 1;
      this.fNextNoteTime += fStepSeconds;
    }
  }

  private scheduleTone(
    nSemitones: number,
    fWhen: number,
    fGain: number = NOTE_GAIN,
  ): void {
    if (
      this.oAudioContext === null ||
      this.oToneBuffer === null ||
      this.oMasterGain === null
    ) {
      return;
    }

    const oSource = this.oAudioContext.createBufferSource();
    oSource.buffer = this.oToneBuffer;
    oSource.playbackRate.value = semitonesToPlaybackRate(nSemitones);

    const oNoteGain = this.oAudioContext.createGain();
    oNoteGain.gain.value = fGain;
    oSource.connect(oNoteGain);
    oNoteGain.connect(this.oMasterGain);

    oSource.start(fWhen);
  }

  private async loadBuffer(
    oAudioContext: AudioContext,
    sUrl: string,
  ): Promise<AudioBuffer> {
    const oResponse = await fetch(sUrl);
    if (!oResponse.ok) {
      throw new Error(`Failed to load sound: ${sUrl}`);
    }

    const oArrayBuffer = await oResponse.arrayBuffer();
    return oAudioContext.decodeAudioData(oArrayBuffer);
  }
}
