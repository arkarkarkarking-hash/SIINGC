class AudioManager {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.backingNode = null;
        this.micNode = null;
        this.backingGain = this.ctx.createGain();
        this.micGain = this.ctx.createGain();
        this.dest = this.ctx.createMediaStreamDestination();

        // Volume presets
        this.backingGain.gain.value = 0.8;
        this.micGain.gain.value = 1.0;

        // Connect backing -> Speakers (so user can hear music)
        // We will ALSO connect backing -> dest (for recording) later
        this.backingGain.connect(this.ctx.destination);
        this.backingGain.connect(this.dest);
    }

    async loadMetadata(url) {
        // Just pre-fetching if needed, or we just rely on HTMLAudioElement for simplicity?
        // Actually, for precise timing and mixing, decoding audio data is better, 
        // BUT HTMLAudioElement is easier for "seeking" and progressive loading.
        // For a karaoke app MVP, let's use the MediaElementSource from the <audio> tag in DOM.
        // It's much safer for large files.
    }

    setupAudioElement(audioElement) {
        this.audioElement = audioElement;
        // Create source from the HTML Audio Element
        this.backingNode = this.ctx.createMediaElementSource(audioElement);

        // Connect: Source -> Gain -> Destination(s)
        this.backingNode.connect(this.backingGain);
    }

    async getMicStream() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            return stream;
        } catch (err) {
            console.error('Mic permission denied', err);
            throw err;
        }
    }

    connectMic(stream) {
        this.micNode = this.ctx.createMediaStreamSource(stream);
        this.micNode.connect(this.micGain);

        // Connect Mic -> Dest (Recording only, NOT speakers to avoid feedback)
        this.micGain.connect(this.dest);
    }

    getMixedStream() {
        return this.dest.stream;
    }

    resume() {
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }
}

export default new AudioManager();
