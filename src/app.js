import audioManager from './audio-manager.js';

const DOM = {
    views: {
        home: document.getElementById('home-view'),
        studio: document.getElementById('studio-view'),
        result: document.getElementById('result-view')
    },
    btns: {
        start: document.getElementById('start-btn'),
        backHome: document.getElementById('back-home-btn'),
        recordToggle: document.getElementById('record-toggle-btn'),
        download: document.getElementById('download-btn'),
        retake: document.getElementById('retake-btn'),
        retake: document.getElementById('retake-btn'),
        uploadLabel: document.getElementById('upload-label') // [Refactored to Label]
    },
    inputs: {
        mrUpload: document.getElementById('mr-upload') // [NEW]
    },
    video: {
        preview: document.getElementById('preview-video'),
        playback: document.getElementById('playback-video')
    },
    audio: document.getElementById('backing-track'),
    lyrics: {
        current: document.getElementById('current-lyric'),
        next: document.getElementById('next-lyric')
    },
    info: {
        title: document.getElementById('song-title'),
        artist: document.getElementById('song-artist')
    }
};

// Demo Lyrics with timestamps (seconds)
const SONG_LYRICS = [
    { time: 0, text: "Get Ready..." },
    { time: 4, text: "Wait for the beat..." },
    { time: 8.5, text: "Neon lights are calling you" },
    { time: 12.0, text: "In the cyber city night" },
    { time: 16.0, text: "Sing it loud, sing it true" },
    { time: 20.0, text: "Everything will be alright" },
    { time: 24.0, text: "INSTRUMENTAL BREAK" },
    { time: 30.0, text: "End of Demo" }
];

let state = {
    isRecording: false,
    mediaRecorder: null,
    recordedChunks: [],

    videoStream: null,
    lyricsInterval: null,
    recordedBlob: null,
    isCustomTrack: false // [NEW]
};

// --- Initialization ---

async function init() {
    setupEventListeners();

    // Setup Audio Manager with the DOM Element
    // Only setup if src exists or wait for upload?
    // AudioManager handles empty handling gracefully for context creation
    audioManager.setupAudioElement(DOM.audio);

    // Warn if demo mode active but no src
    if (!DOM.audio.src || DOM.audio.src === "") {
        DOM.info.title.innerText = "No Demo Track Loaded";
        DOM.info.artist.innerText = "Please Upload MP3";
    }
}

function setupEventListeners() {
    DOM.btns.start.addEventListener('click', enterStudioMode);
    DOM.btns.backHome.addEventListener('click', () => switchView('home'));

    DOM.btns.recordToggle.addEventListener('click', toggleRecording);

    DOM.btns.retake.addEventListener('click', () => {
        // Clean up last recording
        URL.revokeObjectURL(DOM.video.playback.src);
        switchView('studio');
    });

    // Download button logic is handled in setupResultView once recording is done

    // [NEW] Upload Logic
    // No click listener needed for Label-based input

    if (DOM.inputs.mrUpload) {
        DOM.inputs.mrUpload.addEventListener('change', handleFileUpload);
    }
}

function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    // Create URL for the file
    const objectUrl = URL.createObjectURL(file);
    DOM.audio.src = objectUrl;

    // Update State
    state.isCustomTrack = true;

    // Update UI
    if (DOM.info.title) DOM.info.title.innerText = file.name;
    if (DOM.info.artist) DOM.info.artist.innerText = "Custom Track";
    if (DOM.btns.uploadLabel) DOM.btns.uploadLabel.innerText = "Change Track";
}

// --- View Navigation ---

async function enterStudioMode() {
    try {
        // Ensure Audio Context is running (user interaction req)
        audioManager.resume();

        switchView('studio');

        // 1. Get Camera AND Mic in one request to prevent permission conflicts
        let combinedUserMedia;
        try {
            // Try ideal constraints
            combinedUserMedia = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
                audio: true
            });
        } catch (e) {
            console.warn("Ideal constraints failed, trying basic constraints", e);
            // Fallback for some devices (like the subagent or older phones)
            combinedUserMedia = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });
        }

        // Split them for our architecture
        const videoStream = new MediaStream(combinedUserMedia.getVideoTracks());
        const audioStream = new MediaStream(combinedUserMedia.getAudioTracks());

        state.videoStream = videoStream;
        DOM.video.preview.srcObject = videoStream;

        // 2. Pass Audio to Manager
        audioManager.setMicStream(audioStream);
        audioManager.connectMic(audioStream);



    } catch (err) {
        alert(`Could not access camera/microphone. Error: ${err.message}. Please check permissions.`);
        console.error("Media Access Error:", err);
        switchView('home');
    }
}

function switchView(viewName) {
    Object.values(DOM.views).forEach(el => {
        el.classList.remove('active');
        el.classList.add('hidden');
    });

    const target = DOM.views[viewName];
    target.classList.remove('hidden');
    // small delay to allow display:block to apply before opacity transition
    setTimeout(() => target.classList.add('active'), 10);

    // Cleanup if leaving studio
    if (viewName === 'home' && state.videoStream) {
        state.videoStream.getTracks().forEach(t => t.stop());
    }
}

// --- Recording Logic ---

function toggleRecording() {
    if (state.isRecording) {
        stopRecording();
    } else {
        startRecording();
    }
}

function startRecording() {
    state.isRecording = true;
    state.recordedChunks = [];
    DOM.btns.recordToggle.classList.add('recording');
    document.querySelector('.status-indicator').classList.add('recording');

    // Reset - Start Music
    DOM.audio.currentTime = 0;
    DOM.audio.play();

    // Lyrics
    if (!state.isCustomTrack) {
        startLyricsSync();
    } else {
        DOM.lyrics.current.innerText = "Recording Custom Track...";
        DOM.lyrics.next.innerText = "";
    }

    // Start Recorder - RECORD ONLY MIC + CAMERA (No Music)
    // Music will be mixed later during playback/render
    try {
        const micStream = audioManager.getMicStreamForRecord();
        const videoStream = state.videoStream;

        // Combine Camera Video + Mic Audio only for recording
        const combinedStream = new MediaStream([
            ...videoStream.getVideoTracks(),
            ...micStream.getAudioTracks()
        ]);

        // Prefer h264 for compatibility, fallback to webm
        const options = MediaRecorder.isTypeSupported('video/webm;codecs=h264')
            ? { mimeType: 'video/webm;codecs=h264' }
            : { mimeType: 'video/webm' };

        state.mediaRecorder = new MediaRecorder(combinedStream, options);

        state.mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) state.recordedChunks.push(e.data);
        };

        state.mediaRecorder.onstop = finishRecording;

        state.mediaRecorder.start();

    } catch (e) {
        console.error("Recorder error:", e);
        alert("Recording failed to start not supported");
    }
}

function stopRecording() {
    state.isRecording = false;
    DOM.btns.recordToggle.classList.remove('recording');
    document.querySelector('.status-indicator').classList.remove('recording');

    DOM.audio.pause();
    stopLyricsSync();

    if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
        state.mediaRecorder.stop();
    }
}

function finishRecording() {
    // Determine type
    const blob = new Blob(state.recordedChunks, { type: 'video/webm' });
    state.recordedBlob = blob;

    const videoURL = URL.createObjectURL(blob);
    DOM.video.playback.src = videoURL;

    // Setup Result View for Sync/Mix
    setupResultView();

    switchView('result');
}

// --- Lyrics Logic ---

function startLyricsSync() {
    // Simple Interval check
    state.lyricsInterval = setInterval(() => {
        const t = DOM.audio.currentTime;
        updateLyrics(t);
    }, 200);
}

function stopLyricsSync() {
    clearInterval(state.lyricsInterval);
}

function updateLyrics(time) {
    // Find current line
    const currentIndex = SONG_LYRICS.findIndex(l => l.time > time) - 1;
    // If time < first lyric, index is -1. Use 0 or specialized "intro" text logic.

    const actualIndex = currentIndex === -2 ? 0 : currentIndex; // -2 if findIndex returns -1 (not found -> end)??
    // Actually findIndex returns -1 if NO item matches condition (> time). 
    // If time is 0, first item (time 0) > 0 is FALSE. 
    // If time is 5, item index 2 (8.5) > 5 is True. Return 2. current is 1. Correct.

    if (actualIndex >= 0 && actualIndex < SONG_LYRICS.length) {
        const currentLine = SONG_LYRICS[actualIndex];
        const nextLine = SONG_LYRICS[actualIndex + 1];

        if (DOM.lyrics.current.innerText !== currentLine.text) {
            DOM.lyrics.current.innerText = currentLine.text;
            DOM.lyrics.current.classList.add('active');

            if (nextLine) {
                DOM.lyrics.next.innerText = nextLine.text;
            } else {
                DOM.lyrics.next.innerText = "";
            }
        }
    }
}

// --- Utilities ---

// --- Result & Mixing Logic ---

function setupResultView() {
    // Controls Elements
    const volMic = document.getElementById('vol-mic');
    const volMusic = document.getElementById('vol-music');
    const syncSlider = document.getElementById('sync-slider');
    const syncVal = document.getElementById('sync-val');
    const downloadBtn = document.getElementById('download-btn');
    const playbackVideo = DOM.video.playback;
    const backingAudio = DOM.audio;

    // Reset Defaults
    volMic.value = 1;
    volMusic.value = 0.8;
    syncSlider.value = 0;
    syncVal.innerText = "0ms";

    // Sync Playback Logic
    playbackVideo.onplay = () => {
        backingAudio.currentTime = playbackVideo.currentTime + (parseInt(syncSlider.value) / 1000);
        backingAudio.play();
    };
    playbackVideo.onpause = () => backingAudio.pause();
    playbackVideo.onseeking = () => {
        backingAudio.currentTime = playbackVideo.currentTime + (parseInt(syncSlider.value) / 1000);
    };
    playbackVideo.onvolumechange = (e) => {
        // Just keeping in sync if needed
    };

    // Volume Logic (Preview)
    // HTML Media Element .volume is 0.0-1.0
    volMic.addEventListener('input', (e) => playbackVideo.volume = Math.min(1, e.target.value));
    volMusic.addEventListener('input', (e) => backingAudio.volume = Math.min(1, e.target.value));

    syncSlider.addEventListener('input', (e) => {
        syncVal.innerText = `${e.target.value}ms`;
        if (!playbackVideo.paused) {
            backingAudio.currentTime = playbackVideo.currentTime + (parseInt(e.target.value) / 1000);
        }
    });

    // Save Mix Button
    downloadBtn.onclick = () => renderAndDownload();
    downloadBtn.innerText = "SAVE MIX";
}

async function renderAndDownload() {
    const status = document.getElementById('render-status');
    status.innerText = "Rendering... Please wait for playback capture.";

    const playbackVideo = DOM.video.playback;
    const backingAudio = DOM.audio;

    // Reset to start
    playbackVideo.currentTime = 0;
    backingAudio.currentTime = 0 + (parseInt(document.getElementById('sync-slider').value) / 1000);

    // Setup Realtime Capture
    const stream = playbackVideo.captureStream();
    // CaptureStream gets what is painted/played.
    // However, it captures VIDEO element audio. We need to MIX it with Backing Audio.

    const ctx = new AudioContext(); // New Context for mixing
    const dest = ctx.createMediaStreamDestination();

    // Sources
    const micSrc = ctx.createMediaElementSource(playbackVideo);
    const musicSrc = ctx.createMediaElementSource(backingAudio);

    // Gains
    const micGain = ctx.createGain();
    micGain.gain.value = parseFloat(document.getElementById('vol-mic').value);

    const musicGain = ctx.createGain();
    musicGain.gain.value = parseFloat(document.getElementById('vol-music').value);

    micSrc.connect(micGain).connect(dest);
    musicSrc.connect(musicGain).connect(dest);

    // Connect to destination (speakers) too so user hears what is happening?
    // micGain.connect(ctx.destination); // Optional

    // Create Recorder for the MIXED result
    const mixedAudioTrack = dest.stream.getAudioTracks()[0];
    const videoTrack = stream.getVideoTracks()[0];

    const finalStream = new MediaStream([videoTrack, mixedAudioTrack]);
    const recorder = new MediaRecorder(finalStream, { mimeType: 'video/webm' });
    const chunks = [];

    recorder.ondataavailable = e => chunks.push(e.data);
    recorder.onstop = () => {
        const b = new Blob(chunks, { type: 'video/webm' });
        const u = URL.createObjectURL(b);
        const a = document.createElement('a');
        a.href = u;
        a.download = 'neon-karaoke-mixed.webm';
        a.click();
        status.innerText = "Done! Saved as neon-karaoke-mixed.webm";

        // Clean up connections
        micSrc.disconnect();
        musicSrc.disconnect();
        ctx.close();

        // Restore sources to original graph if needed, but we are done.
    };

    // Play and Record
    try {
        await playbackVideo.play();
        await backingAudio.play();
        recorder.start();

        playbackVideo.onended = () => {
            recorder.stop();
            playbackVideo.onended = null;
        };
    } catch (e) {
        console.error("Render Error:", e);
        status.innerText = "Error during rendering.";
    }
}

// Run
init();
