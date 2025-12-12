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
    // --- Result View Helpers ---

    setupResultPreview(videoElement) {
        // Handle Video (Mic Recording)
        // Check if we already have a source for this element?
        // Note: Creating a source for the same element twice in same context is harmless? 
        // MDN says: safely calls createMediaElementSource again? NO. It will throw if called again on same element?
        // Actually, for a given element, you can only call it once? 
        // "A MediaElementAudioSourceNode is created ... Only one ... can be created for a given HTMLMediaElement."
        // So we need to store it.

        if (!this.resultVideoNode) {
            try {
                this.resultVideoNode = this.ctx.createMediaElementSource(videoElement);
                this.resultVideoGain = this.ctx.createGain();
                this.resultVideoNode.connect(this.resultVideoGain);
                this.resultVideoGain.connect(this.ctx.destination);
            } catch (e) {
                console.warn("Could not create video source (maybe already exists):", e);
            }
        }

        // Backing Track is already connected to destination via this.backingNode -> this.backingGain in constructor/setup.
    }

    setResultVolumes(micVol, musicVol) {
        if (this.resultVideoGain) {
            this.resultVideoGain.gain.value = micVol;
        }
        if (this.backingGain) {
            this.backingGain.gain.value = musicVol;
        }
    }

    startResultExport(videoElement, options) {
        // options: { micVol, musicVol }
        const dest = this.ctx.createMediaStreamDestination();

        // 1. Mic/Video Source
        // We reuse the existing source node if possible, or create branches.
        // We really need separate GAIN for export vs preview? 
        // Yes, because checking preview while exporting might be annoying if they are linked?
        // Actually rendering happens during playback. We want to hear it too?
        // Let's use creating separate gains feeding the DESTINATION.

        const exportMicGain = this.ctx.createGain();
        exportMicGain.gain.value = options.micVol;
        if (this.resultVideoNode) {
            this.resultVideoNode.connect(exportMicGain);
        }
        exportMicGain.connect(dest);

        const exportMusicGain = this.ctx.createGain();
        exportMusicGain.gain.value = options.musicVol;
        if (this.backingNode) {
            this.backingNode.connect(exportMusicGain);
        }
        exportMusicGain.connect(dest);

        return {
            stream: dest.stream,
            cleanup: () => {
                exportMicGain.disconnect();
                exportMusicGain.disconnect();
                // We do NOT disconnect backingNode or resultVideoNode as they are persistent
            }
        };
    }
}

export default new AudioManager();
