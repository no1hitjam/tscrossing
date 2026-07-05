const TONE_SAMPLE_URL = "/music/tone_c_0.mp3";
const LOOK_AHEAD_SECONDS = 0.15;
const MASTER_GAIN = 0.35;
const NOTE_GAIN = 0.55;

const SEMITONE_RATIO = 2 ** (1 / 12);

const A_IDLE_PATTERN = [0, 4, 7, 4, 2, 0, -3, 2] as const;
const A_MOVING_PATTERN = [0, 7, 12, 7, 4, 7, 12, 9] as const;

const F_IDLE_STEP_SECONDS = 0.62;
const F_MOVING_STEP_SECONDS = 0.38;

function semitonesToPlaybackRate(nSemitones: number): number {
  return SEMITONE_RATIO ** nSemitones;
}

export class DynamicMusic {
  private oAudioContext: AudioContext | null = null;
  private oMasterGain: GainNode | null = null;
  private oToneBuffer: AudioBuffer | null = null;
  private fNextNoteTime = 0;
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

    const oResponse = await fetch(TONE_SAMPLE_URL);
    if (!oResponse.ok) {
      throw new Error(`Failed to load tone sample: ${TONE_SAMPLE_URL}`);
    }

    const oArrayBuffer = await oResponse.arrayBuffer();
    const oToneBuffer = await oAudioContext.decodeAudioData(oArrayBuffer);

    this.oAudioContext = oAudioContext;
    this.oMasterGain = oMasterGain;
    this.oToneBuffer = oToneBuffer;
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

  update(): void {
    if (
      !this.bRunning ||
      this.oAudioContext === null ||
      this.oToneBuffer === null ||
      this.oMasterGain === null
    ) {
      return;
    }

    const aPattern = this.bPlayerMoving ? A_MOVING_PATTERN : A_IDLE_PATTERN;
    const fStepSeconds = this.bPlayerMoving
      ? F_MOVING_STEP_SECONDS
      : F_IDLE_STEP_SECONDS;
    const fScheduleUntil =
      this.oAudioContext.currentTime + LOOK_AHEAD_SECONDS;

    while (this.fNextNoteTime < fScheduleUntil) {
      const nSemitones = aPattern[this.nPatternIndex % aPattern.length];
      this.scheduleTone(nSemitones, this.fNextNoteTime);
      this.nPatternIndex += 1;
      this.fNextNoteTime += fStepSeconds;
    }
  }

  private scheduleTone(nSemitones: number, fWhen: number): void {
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
    oNoteGain.gain.value = NOTE_GAIN;
    oSource.connect(oNoteGain);
    oNoteGain.connect(this.oMasterGain);

    oSource.start(fWhen);
  }
}
