class AudioManager {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.backingNode = null;
        this.backingGain = this.ctx.createGain();
        this.micGain = this.ctx.createGain();

        // Destination for "Live Monitoring" if we want it (usually mute mic to avoid feedback)
        this.backingGain.connect(this.ctx.destination);

        this.micStream = null;
        this.micSource = null;
    }

    setupAudioElement(audioElement) {
        this.audioElement = audioElement; // Keep ref
        // For processing, we need MediaElementSource
        if (!this.backingNode) {
            this.backingNode = this.ctx.createMediaElementSource(audioElement);
            this.backingNode.connect(this.backingGain);
        }
    }

    async getMicStream() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            this.micStream = stream;
            return stream;
        } catch (err) {
            console.error('Mic permission denied', err);
            throw err;
        }
    }

    // Returns ONLY the Mic stream for the Recorder (we don't mix music in anymore during record)
    getMicStreamForRecord() {
        return this.micStream;
    }

    resume() {
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    // --- Rendering Logic ---

    // We need to "Mix" the recorded video audio (Mic) + The original backing track
    // This function creates a destination stream that combines both with offsets/gains
    startRenderingMix(videoElement, backingElement, options) {
        // options: { micVol, musicVol, syncOffsetMs }

        const renderDest = this.ctx.createMediaStreamDestination();

        // 1. Mic/Video Source (The recorded blob playing in videoElement)
        const videoSource = this.ctx.createMediaElementSource(videoElement);
        const videoGain = this.ctx.createGain();
        videoGain.gain.value = options.micVol;

        // Apply Delay if Sync Offset > 0 (Vocals need delay)
        // Ideally we use a DelayNode. 
        // Sync means shifting relative time. 
        // If slider is +100ms, vocals are LATE, so we delay Music? 
        // Usually "Sync" adjusts Vocal track position.
        // If Vocals are late (behind beat), we need to play them EARLIER (negative delay? impossible effectively without shifting start time).
        // If we implement simple delay:
        // delayNode for VideoSource (Vocals). 
        const delayNode = this.ctx.createDelay(1.0); // Max 1s
        // If syncOffsetMs is positive -> Delay Vocals. 
        // If negative -> We'd need to delay Music.
        // Let's implement dual delays or just simple logic:

        // For MVP Rendering: just separate gains for now. Sync is hard to "Re-record" in real-time without seeking.
        // Actually, we can just use `currentTime` manipulation during playback for preview,
        // but for EXPORT, we need to capture the stream.

        // Simplified Render:
        // We will play both elements from start.
        // We apply Gain.
        // Stream goes to `renderDest`.

        videoSource.connect(videoGain);
        videoGain.connect(renderDest);

        // 2. Backing Source (The original music)
        // We need a NEW source because the original `backingNode` is attached to `audioElement` which is for playback.
        // Actually we can reuse `backingElement` if we are "playing" it for the render.
        const musicSource = this.ctx.createMediaElementSource(backingElement);
        const musicGain = this.ctx.createGain();
        musicGain.gain.value = options.musicVol;

        musicSource.connect(musicGain);
        musicGain.connect(renderDest);

        return {
            stream: renderDest.stream,
            cleanup: () => {
                // Disconnect everything to avoid leaks/double connections on next run
                videoSource.disconnect();
                videoGain.disconnect();
                musicSource.disconnect();
                musicGain.disconnect();
            }
        };
    }

    // Helper to Create Audio Buffers for true Offline Rendering (Advanced)
    // For now, we stick to real-time play-through capture (simpler) logic in App.js
}

export default new AudioManager();
