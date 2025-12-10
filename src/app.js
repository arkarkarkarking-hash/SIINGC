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
        upload: document.getElementById('upload-btn') // [NEW]
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
    mixedStream: null,
    videoStream: null,
    lyricsInterval: null,
    recordedBlob: null,
    isCustomTrack: false // [NEW]
};

// --- Initialization ---

async function init() {
    setupEventListeners();

    // Setup Audio Manager with the DOM Element
    audioManager.setupAudioElement(DOM.audio);
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

    DOM.btns.download.addEventListener('click', downloadVideo);

    // [NEW] Upload Logic
    if (DOM.btns.upload) {
        DOM.btns.upload.addEventListener('click', () => DOM.inputs.mrUpload.click());
    }
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
    if (DOM.btns.upload) DOM.btns.upload.innerText = "Change Track";
}

// --- View Navigation ---

async function enterStudioMode() {
    try {
        // Ensure Audio Context is running (user interaction req)
        audioManager.resume();

        switchView('studio');

        // 1. Get Camera
        const videoStream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: "user"
            },
            audio: false // We handle audio separately
        });

        state.videoStream = videoStream;
        DOM.video.preview.srcObject = videoStream;

        // 2. Get Mic & Setup Audio Mixing
        const micStream = await audioManager.getMicStream();
        audioManager.connectMic(micStream);

        // 3. Prepare Mixed Stream for Recording
        // We need: Camera Video Track + Mixed Audio Track
        const mixedAudioStream = audioManager.getMixedStream();
        const combinedStream = new MediaStream([
            ...videoStream.getVideoTracks(),
            ...mixedAudioStream.getAudioTracks()
        ]);

        state.mixedStream = combinedStream;

    } catch (err) {
        alert("Could not access camera/microphone. Please allow permissions.");
        console.error(err);
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

    // Reset Lyrics
    DOM.audio.currentTime = 0;
    DOM.audio.play();

    if (!state.isCustomTrack) {
        startLyricsSync();
    } else {
        DOM.lyrics.current.innerText = "Recording Custom Track...";
        DOM.lyrics.next.innerText = "";
    }

    // Start Recorder
    try {
        // Prefer h264 for compatibility, fallback to webm
        const options = MediaRecorder.isTypeSupported('video/webm;codecs=h264')
            ? { mimeType: 'video/webm;codecs=h264' }
            : { mimeType: 'video/webm' };

        state.mediaRecorder = new MediaRecorder(state.mixedStream, options);

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

function downloadVideo() {
    if (!state.recordedBlob) return;

    const url = URL.createObjectURL(state.recordedBlob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = 'neon-karaoke-performance.webm';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }, 100);
}

// Run
init();
