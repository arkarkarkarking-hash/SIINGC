import { AudioEffects } from '../types';

export class AudioEngine {
  private audioContext: AudioContext;
  private backingBuffer: AudioBuffer | null = null;
  private vocalBuffer: AudioBuffer | null = null;
  
  // Nodes for Mix
  private backingSource: AudioBufferSourceNode | null = null;
  private vocalSource: AudioBufferSourceNode | null = null;
  private masterGain: GainNode;
  
  // Vocal Chain
  private vocalGain: GainNode;
  private lowEq: BiquadFilterNode;
  private midEq: BiquadFilterNode;
  private highEq: BiquadFilterNode;
  private reverbNode: ConvolverNode;
  private reverbDryGain: GainNode;
  private reverbWetGain: GainNode;

  // Analysis
  private analyser: AnalyserNode;

  constructor() {
    // Initialize AudioContext
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Master Output
    this.masterGain = this.audioContext.createGain();
    this.masterGain.connect(this.audioContext.destination);

    // Vocal Chain Setup
    this.vocalGain = this.audioContext.createGain();
    
    // EQ (3-Band)
    this.lowEq = this.audioContext.createBiquadFilter();
    this.lowEq.type = 'lowshelf';
    this.lowEq.frequency.value = 320;

    this.midEq = this.audioContext.createBiquadFilter();
    this.midEq.type = 'peaking';
    this.midEq.Q.value = 0.5;
    this.midEq.frequency.value = 1000;

    this.highEq = this.audioContext.createBiquadFilter();
    this.highEq.type = 'highshelf';
    this.highEq.frequency.value = 3200;

    // Reverb
    this.reverbNode = this.audioContext.createConvolver();
    this.createReverbImpulse(); // Generate a synthetic impulse
    this.reverbDryGain = this.audioContext.createGain();
    this.reverbWetGain = this.audioContext.createGain();

    // Analyser for Visuals
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 256;
    this.masterGain.connect(this.analyser);

    // Chain Connections: Vocal -> Gain -> Low -> Mid -> High -> Split(Dry/Wet)
    this.vocalGain.connect(this.lowEq);
    this.lowEq.connect(this.midEq);
    this.midEq.connect(this.highEq);

    // Dry Path
    this.highEq.connect(this.reverbDryGain);
    this.reverbDryGain.connect(this.masterGain);

    // Wet Path (Reverb)
    this.highEq.connect(this.reverbNode);
    this.reverbNode.connect(this.reverbWetGain);
    this.reverbWetGain.connect(this.masterGain);
  }

  async resumeContext() {
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  getOutputNode(): AudioNode {
    return this.masterGain;
  }

  getAnalyser(): AnalyserNode {
    return this.analyser;
  }

  getContext(): AudioContext {
    return this.audioContext;
  }

  // --- Asset Loading ---

  async loadBackingTrack(arrayBuffer: ArrayBuffer) {
    this.backingBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
    return this.backingBuffer.duration;
  }

  async loadVocalTrack(blob: Blob) {
    const arrayBuffer = await blob.arrayBuffer();
    this.vocalBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
  }

  // --- Playback Control ---

  play(startTimeOffset: number = 0, effects: AudioEffects) {
    this.stop(); // Stop any current playback
    this.applyEffects(effects);

    const startTime = this.audioContext.currentTime;

    // Backing Track
    if (this.backingBuffer) {
      this.backingSource = this.audioContext.createBufferSource();
      this.backingSource.buffer = this.backingBuffer;
      this.backingSource.connect(this.masterGain);
      this.backingSource.start(startTime, startTimeOffset);
    }

    // Vocal Track
    if (this.vocalBuffer) {
      this.vocalSource = this.audioContext.createBufferSource();
      this.vocalSource.buffer = this.vocalBuffer;
      this.vocalSource.connect(this.vocalGain); // Connect to effects chain
      this.vocalSource.start(startTime, startTimeOffset);
    }
  }

  stop() {
    if (this.backingSource) {
      try { this.backingSource.stop(); } catch(e) {}
      this.backingSource.disconnect();
      this.backingSource = null;
    }
    if (this.vocalSource) {
      try { this.vocalSource.stop(); } catch(e) {}
      this.vocalSource.disconnect();
      this.vocalSource = null;
    }
  }

  // --- Effects Processing ---

  applyEffects(effects: AudioEffects) {
    // EQ
    this.lowEq.gain.setTargetAtTime(effects.lowGain, this.audioContext.currentTime, 0.1);
    this.midEq.gain.setTargetAtTime(effects.midGain, this.audioContext.currentTime, 0.1);
    this.highEq.gain.setTargetAtTime(effects.highGain, this.audioContext.currentTime, 0.1);

    // Reverb Mix
    // Simple equal-power crossfade or linear mix
    const wet = effects.reverbMix;
    const dry = 1 - (wet * 0.6); // Keep dry signal slightly stronger
    this.reverbDryGain.gain.setTargetAtTime(dry, this.audioContext.currentTime, 0.1);
    this.reverbWetGain.gain.setTargetAtTime(wet * 2, this.audioContext.currentTime, 0.1); // Boost wet slightly

    // Vocal Volume
    this.vocalGain.gain.setTargetAtTime(effects.volume, this.audioContext.currentTime, 0.1);
  }

  // --- Helpers ---

  // Simple noise impulse for Reverb
  private createReverbImpulse() {
    const rate = this.audioContext.sampleRate;
    const length = rate * 2.5; // 2.5 seconds tail
    const decay = 2.0;
    const impulse = this.audioContext.createBuffer(2, length, rate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    for (let i = 0; i < length; i++) {
      const n = i; // reversed exponential decay
      const e = Math.pow(1 - n / length, decay);
      left[i] = (Math.random() * 2 - 1) * e;
      right[i] = (Math.random() * 2 - 1) * e;
    }
    this.reverbNode.buffer = impulse;
  }

  // Connects a media stream (Mic) to the master for monitoring or analysis, if desired
  // But usually, we record raw stream separately.
}
