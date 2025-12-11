class AudioManager {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.backingNode = null;
        this.backingGain = this.ctx.createGain();
        this.micGain = this.ctx.createGain();

        // Destination for "Live Monitoring"
        this.backingGain.connect(this.ctx.destination);

        this.micStream = null;
        this.micSource = null;
    }

    setupAudioElement(audioElement) {
        this.audioElement = audioElement;
        if (!this.backingNode) {
            this.backingNode = this.ctx.createMediaElementSource(audioElement);
            this.backingNode.connect(this.backingGain);
        }
    }

    async getMicStream() {
        if (this.micStream) return this.micStream; // Return existing if set
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            this.micStream = stream;
            return stream;
        } catch (err) {
            console.error('Mic permission denied', err);
            throw err;
        }
    }

    setMicStream(stream) {
        this.micStream = stream;
        // Optionally connect it immediately if needed, but getMicStream handles return
        return stream;
    }

    getMicStreamForRecord() {
        return this.micStream;
    }

    connectMic(stream) {
        if (this.micSource) {
            this.micSource.disconnect();
        }
        this.micSource = this.ctx.createMediaStreamSource(stream);
        this.micSource.connect(this.micGain);
    }

    resume() {
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    // --- Visualization Helpers ---

    async decodeAudioData(blobOrArrayBuffer) {
        try {
            let arrayBuffer;
            if (blobOrArrayBuffer instanceof Blob) {
                arrayBuffer = await blobOrArrayBuffer.arrayBuffer();
            } else {
                arrayBuffer = blobOrArrayBuffer;
            }
            // Decode
            const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
            return audioBuffer;
        } catch (e) {
            console.error("Audio Decode Error:", e);
            return null;
        }
    }

    // Fetch and decode from URL (e.g. Backing Track)
    async loadAudioBufferFromUrl(url) {
        try {
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            return await this.decodeAudioData(arrayBuffer);
        } catch (e) {
            console.error("Failed to load/decode backing track from URL:", e);
            return null;
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

        // Simplified Render:
        videoSource.connect(videoGain);
        videoGain.connect(renderDest);

        // 2. Backing Source (The original music)
        // We need a NEW source because the original `backingNode` is attached to `audioElement` which is for playback.
        const musicSource = this.ctx.createMediaElementSource(backingElement);
        const musicGain = this.ctx.createGain();
        musicGain.gain.value = options.musicVol;

        musicSource.connect(musicGain);
        musicGain.connect(renderDest);

        return {
            stream: renderDest.stream,
            cleanup: () => {
                videoSource.disconnect();
                videoGain.disconnect();
                musicSource.disconnect();
                musicGain.disconnect();
            }
        };
    }
}

export default new AudioManager();
