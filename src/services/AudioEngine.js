export class AudioEngine {
    constructor() {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.backingBuffer = null;
        this.backingSource = null;
        this.mediaRecorder = null;
        this.recordingChunks = [];
        this.recordedBlob = null;
        this.stream = null;
    }

    async loadBackingTrack(file) {
        const arrayBuffer = await file.arrayBuffer();
        this.backingBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
        return this.backingBuffer.duration;
    }

    async requestStream() {
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: false,
                    autoGainControl: false,
                    noiseSuppression: false
                },
                video: true
            });
            return this.stream;
        } catch (err) {
            console.error("Error accessing media devices:", err);
            throw err;
        }
    }

    startRecording(onEnded) {
        if (!this.backingBuffer || !this.stream) return;

        // Play Backing Track
        this.backingSource = this.audioContext.createBufferSource();
        this.backingSource.buffer = this.backingBuffer;
        this.backingSource.connect(this.audioContext.destination);
        this.backingSource.onended = () => {
            if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
                this.stopRecording();
                if (onEnded) onEnded();
            }
        };

        // Start Recording
        this.recordingChunks = [];
        this.mediaRecorder = new MediaRecorder(this.stream);
        this.mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) this.recordingChunks.push(e.data);
        };

        this.mediaRecorder.start();
        this.backingSource.start(0);
    }

    stopRecording() {
        if (this.backingSource) {
            try { this.backingSource.stop(); } catch (e) { }
            this.backingSource = null;
        }

        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
            return new Promise(resolve => {
                this.mediaRecorder.onstop = () => {
                    this.recordedBlob = new Blob(this.recordingChunks, { type: 'audio/webm' });
                    const audioURL = URL.createObjectURL(this.recordedBlob);
                    resolve(audioURL);
                };
            });
        }
        return Promise.resolve(null);
    }

    async mixAndDownload(backingVolume = 1.0, vocalVolume = 1.0) {
        if (!this.backingBuffer || !this.recordedBlob) return null;

        // Decode the recorded vocal
        const vocalArrayBuffer = await this.recordedBlob.arrayBuffer();
        const vocalBuffer = await this.audioContext.decodeAudioData(vocalArrayBuffer);

        // Create Offline Context for rendering
        const duration = Math.max(this.backingBuffer.duration, vocalBuffer.duration);
        const offlineCtx = new OfflineAudioContext(2, duration * 44100, 44100);

        // Backing Track Node
        const backingNode = offlineCtx.createBufferSource();
        backingNode.buffer = this.backingBuffer;
        const backingGain = offlineCtx.createGain();
        backingGain.gain.value = backingVolume;
        backingNode.connect(backingGain);
        backingGain.connect(offlineCtx.destination);

        // Vocal Track Node
        const vocalNode = offlineCtx.createBufferSource();
        vocalNode.buffer = vocalBuffer;
        const vocalGain = offlineCtx.createGain();
        vocalGain.gain.value = vocalVolume;
        vocalNode.connect(vocalGain);
        vocalGain.connect(offlineCtx.destination);

        // Start both
        backingNode.start(0);
        vocalNode.start(0);

        // Render
        const renderedBuffer = await offlineCtx.startRendering();
        return this.bufferToWave(renderedBuffer, duration * 44100);
    }

    // Helper: Convert AudioBuffer to WAV Blob
    bufferToWave(abuffer, len) {
        let numOfChan = abuffer.numberOfChannels,
            length = len * numOfChan * 2 + 44,
            buffer = new ArrayBuffer(length),
            view = new DataView(buffer),
            channels = [], i, sample,
            offset = 0,
            pos = 0;

        // write WAVE header
        setUint32(0x46464952);                         // "RIFF"
        setUint32(length - 8);                         // file length - 8
        setUint32(0x45564157);                         // "WAVE"

        setUint32(0x20746d66);                         // "fmt " chunk
        setUint32(16);                                 // length = 16
        setUint16(1);                                  // PCM (uncompressed)
        setUint16(numOfChan);
        setUint32(abuffer.sampleRate);
        setUint32(abuffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
        setUint16(numOfChan * 2);                      // block-align
        setUint16(16);                                 // 16-bit (hardcoded in this example)

        setUint32(0x61746164);                         // "data" - chunk
        setUint32(length - pos - 4);                   // chunk length

        // write interleaved data
        for (i = 0; i < abuffer.numberOfChannels; i++)
            channels.push(abuffer.getChannelData(i));

        while (pos < len) {
            for (i = 0; i < numOfChan; i++) {             // interleave channels
                sample = Math.max(-1, Math.min(1, channels[i][pos])); // clamp
                sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0; // scale to 16-bit signed int
                view.setInt16(44 + offset, sample, true);          // write 16-bit sample
                offset += 2;
            }
            pos++;
        }

        return new Blob([buffer], { type: "audio/wav" });

        function setUint16(data) {
            view.setUint16(pos, data, true);
            pos += 2;
        }

        function setUint32(data) {
            view.setUint32(pos, data, true);
            pos += 4;
        }
    }
}
