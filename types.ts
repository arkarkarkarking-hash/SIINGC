export enum AppState {
  IDLE = 'IDLE',
  READY_TO_RECORD = 'READY_TO_RECORD',
  RECORDING = 'RECORDING',
  REVIEW = 'REVIEW',
  EXPORTING = 'EXPORTING',
}

export interface AudioEffects {
  volume: number;      // 0.0 to 1.0
  lowGain: number;     // -20 to 20 dB (Bass)
  midGain: number;     // -20 to 20 dB (Mids)
  highGain: number;    // -20 to 20 dB (Treble)
  reverbMix: number;   // 0.0 (Dry) to 1.0 (Wet)
}

export interface ProcessingState {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
}