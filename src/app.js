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

});

// Audio Graph Volume Control via AudioManager
const updateVolumes = () => {
    const mv = parseFloat(volMic.value);
    const bv = parseFloat(volMusic.value);
    audioManager.setResultVolumes(mv, bv);
};

volMic.addEventListener('input', updateVolumes);
volMusic.addEventListener('input', updateVolumes);

// Initial set
updateVolumes();

// Save Mix Button
downloadBtn.onclick = () => renderAndDownload();
downloadBtn.innerText = "SAVE MIX";

// Setup Audio Manager for Preview (High Quality Gain control)
audioManager.setupResultPreview(playbackVideo);
}

async function renderAndDownload() {
    const status = document.getElementById('render-status');
    status.innerText = "Rendering... Please wait for playback capture.";

    const playbackVideo = DOM.video.playback;
    const backingAudio = DOM.audio;

    // Validate inputs
    const micVol = parseFloat(document.getElementById('vol-mic').value);
    const musicVol = parseFloat(document.getElementById('vol-music').value);
    const syncMs = parseInt(document.getElementById('sync-slider').value);
    const syncSec = syncMs / 1000;

    // Reset to start for recording
    playbackVideo.currentTime = 0;
    // Apply sync offset: if voice is late (positive delay needed for voice), we might play music EARLIER or video LATER.
    // Standard interpretation: "Sync" usually delays the track relative to the other.
    // If sync slider is "Delay Vocals" (positive), we want video to start slightly LATER than audio? 
    // Or normally "Delay" means shift positive. 
    // Logic in preview: backingAudio.currentTime = playbackVideo.currentTime + offset.
    // If offset is +1s: When video is at 0, audio is at 1. Audio is AHEAD. 
    // This creates "Vocals (Video)" appearing DELAYED relative to music. Correct.
    backingAudio.currentTime = 0 + syncSec;

    // Setup Realtime Capture
    let stream;
    try {
        if (playbackVideo.captureStream) {
            stream = playbackVideo.captureStream();
        } else if (playbackVideo.mozCaptureStream) {
            stream = playbackVideo.mozCaptureStream();
        } else {
            throw new Error("captureStream not supported");
        }
    } catch (e) {
        console.error(e);
        status.innerText = "Error: Browser does not support captureStream for video.";
        return;
    }

    const ctx = new AudioContext();
    const dest = ctx.createMediaStreamDestination();

    // Sources
    const micSrc = ctx.createMediaElementSource(playbackVideo);
    const musicSrc = ctx.createMediaElementSource(backingAudio);

    // Gains
    const micGain = ctx.createGain();
    micGain.gain.value = micVol;

    const musicGain = ctx.createGain();
    musicGain.gain.value = musicVol;

    micSrc.connect(micGain).connect(dest);
    musicSrc.connect(musicGain).connect(dest);

    // Mix Audio Track + Original Video Track
    const mixedAudioTrack = dest.stream.getAudioTracks()[0];
    const videoTrack = stream.getVideoTracks()[0];
    const finalStream = new MediaStream([videoTrack, mixedAudioTrack]);

    // Format Support Check
    let mimeType = 'video/webm';
    let fileExt = 'webm';

    if (MediaRecorder.isTypeSupported('video/mp4;codecs=avc1,mp4a.40.2')) {
        mimeType = 'video/mp4;codecs=avc1,mp4a.40.2';
        fileExt = 'mp4';
    } else if (MediaRecorder.isTypeSupported('video/mp4')) {
        mimeType = 'video/mp4';
        fileExt = 'mp4';
    } else if (MediaRecorder.isTypeSupported('video/webm;codecs=h264')) {
        mimeType = 'video/webm;codecs=h264';
        fileExt = 'webm'; // Can be renamed to mp4 sometimes but safe to keep webm
    }

    console.log(`Exporting as ${mimeType}`);

    const recorder = new MediaRecorder(finalStream, { mimeType });
    const chunks = [];

    recorder.ondataavailable = e => {
        if (e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = () => {
        const b = new Blob(chunks, { type: mimeType });
        const u = URL.createObjectURL(b);
        const a = document.createElement('a');
        a.href = u;
        a.download = `neon-karaoke-mixed.${fileExt}`;
        a.click();
        status.innerText = `Done! Saved as neon-karaoke-mixed.${fileExt}`;

        // Cleanup
        micSrc.disconnect();
        musicSrc.disconnect();
        ctx.close();

        // Loop back for user to play again if they want
        playbackVideo.currentTime = 0;
        playbackVideo.onended = null;
    };

    // Play and Record
    try {
        recorder.start();

        // Handle playback end
        playbackVideo.onended = () => {
            if (recorder.state !== 'inactive') recorder.stop();
        };

        // Start playback
        await playbackVideo.play();
        await backingAudio.play();

    } catch (e) {
        console.error("Render Error:", e);
        status.innerText = "Error during rendering. See console.";
        if (recorder.state !== 'inactive') recorder.stop();
        micSrc.disconnect();
        musicSrc.disconnect();
        ctx.close();
    }
}

// Run
init();
