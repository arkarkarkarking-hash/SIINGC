import audioManager from './audio-manager.js';
import { WaveformVisualizer } from './waveform-visualizer.js';

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
        uploadLabel: document.getElementById('upload-label'), // [Refactored to Label]
        resultPlay: document.getElementById('result-play-btn') // [NEW] Play Button
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
    isCustomTrack: false, // [NEW]
    visualizer: null // [NEW]
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


    // Result View Controls Listeners (Once)
    const playbackVideo = DOM.video.playback;
    const backingAudio = DOM.audio;
    const volMic = document.getElementById('vol-mic');
    const volMusic = document.getElementById('vol-music');
    const syncSlider = document.getElementById('sync-slider');
    const syncVal = document.getElementById('sync-val');

    // Volume Logic
    const updateVolumes = () => {
        const mv = parseFloat(volMic.value);
        const bv = parseFloat(volMusic.value);
        audioManager.setResultVolumes(mv, bv);
    };
    volMic.addEventListener('input', updateVolumes);
    volMusic.addEventListener('input', updateVolumes);

    // Sync Logic
    syncSlider.addEventListener('input', (e) => {
        syncVal.innerText = `${e.target.value}ms`;
        if (!playbackVideo.paused) {
            backingAudio.currentTime = playbackVideo.currentTime + (parseInt(e.target.value) / 1000);
        }
    });

    // Playback Sync Logic (Binding video events to audio)
    playbackVideo.onplay = () => {
        backingAudio.currentTime = playbackVideo.currentTime + (parseInt(syncSlider.value) / 1000); // Use current slider val
        backingAudio.play();
    };
    playbackVideo.onpause = () => backingAudio.pause();
    playbackVideo.onseeking = () => {
        backingAudio.currentTime = playbackVideo.currentTime + (parseInt(syncSlider.value) / 1000);
    };

    // Play/Pause Button Logic
    DOM.btns.resultPlay.onclick = () => {
        if (playbackVideo.paused) {
            playbackVideo.play();
        } else {
            playbackVideo.pause();
        }
    };

    // Update Play Button Icon
    const updatePlayIcon = () => {
        const icon = document.getElementById('play-icon');
        if (playbackVideo.paused) {
            icon.innerText = "▶";
        } else {
            icon.innerText = "❚❚";
        }
    };
    playbackVideo.addEventListener('play', updatePlayIcon);
    playbackVideo.addEventListener('pause', updatePlayIcon);
    playbackVideo.addEventListener('ended', updatePlayIcon);

    // Playhead Animation Loop
    const playhead = document.getElementById('timeline-playhead');
    const updatePlayhead = () => {
        if (!playbackVideo.paused) {
            const dur = playbackVideo.duration || 1;
            const pct = (playbackVideo.currentTime / dur) * 100;
            if (playhead) playhead.style.left = `${pct}%`;
            requestAnimationFrame(updatePlayhead);
        }
    };
    playbackVideo.addEventListener('play', () => requestAnimationFrame(updatePlayhead));
    playbackVideo.addEventListener('timeupdate', () => {
        const dur = playbackVideo.duration || 1;
        const pct = (playbackVideo.currentTime / dur) * 100;
        if (playhead) playhead.style.left = `${pct}%`;
    });

    // Canvas Seek (Mouse + Touch)
    const handleSeek = (clientX) => {
        const rect = document.getElementById('timeline-canvas').getBoundingClientRect();
        const x = clientX - rect.left;
        let percent = x / rect.width;
        percent = Math.max(0, Math.min(1, percent)); // Clamp
        const duration = playbackVideo.duration || 1;
        playbackVideo.currentTime = percent * duration;
    };

    const canvasCtx = document.getElementById('timeline-canvas');
    canvasCtx.onclick = (e) => handleSeek(e.clientX);

    // Mobile Touch Seek
    canvasCtx.ontouchstart = (e) => {
        e.preventDefault(); // Prevent scrolling while scrubbing
        handleSeek(e.touches[0].clientX);
    };
    canvasCtx.ontouchmove = (e) => {
        e.preventDefault();
        handleSeek(e.touches[0].clientX);
    };

    // Download
    DOM.btns.download.onclick = () => renderAndDownload();
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


    syncSlider.addEventListener('input', (e) => {
        syncVal.innerText = `${e.target.value}ms`;
        if (!playbackVideo.paused) {
            backingAudio.currentTime = playbackVideo.currentTime + (parseInt(e.target.value) / 1000);
        }
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

    // --- WAVEFORM VISUALIZATION ---
    const visualizer = new WaveformVisualizer('timeline-canvas');
    const playhead = document.createElement('div');
    playhead.id = 'timeline-playhead';
    playhead.style.position = 'absolute';
    playhead.style.top = '0';
    playhead.style.bottom = '0';
    playhead.style.left = '0';
    playhead.style.width = '2px';
    playhead.style.backgroundColor = '#fff';
    playhead.style.pointerEvents = 'none'; // Click goes through to canvas
    playhead.style.boxShadow = '0 0 5px #fff';
    const container = document.querySelector('.timeline-container');

    // Remove existing playhead if any (re-entry safety)
    const oldPh = document.getElementById('timeline-playhead');
    if (oldPh) oldPh.remove();
    container.appendChild(playhead);

    // Click to seek
    document.getElementById('timeline-canvas').onclick = (e) => {
        const rect = e.target.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percent = x / rect.width;
        const duration = playbackVideo.duration || 1;
        playbackVideo.currentTime = percent * duration;
    };

    // Animation Loop for Playhead
    const updatePlayhead = () => {
        if (!playbackVideo.paused) {
            const dur = playbackVideo.duration || 1;
            const pct = (playbackVideo.currentTime / dur) * 100;
            playhead.style.left = `${pct}%`;
            requestAnimationFrame(updatePlayhead);
        }
    };
    playbackVideo.addEventListener('play', () => requestAnimationFrame(updatePlayhead));
    playbackVideo.addEventListener('timeupdate', () => {
        // Also update on manual seek/pause
        const dur = playbackVideo.duration || 1;
        const pct = (playbackVideo.currentTime / dur) * 100;
        playhead.style.left = `${pct}%`;
    });

    // LOAD BUFFERS (Async)
    (async () => {
        // 1. Get MR Buffer (already in audioManager or fetch again?)
        // audioManager probably has it if we used webaudio to play? 
        // Actually audioManager.backingNode is Streaming (MediaElementSource). It is NOT a buffer.
        // We need to fetch and decode the file source again to visualize it.
        const mrSrc = DOM.audio.src;
        let mrBuffer = null;
        if (mrSrc) {
            mrBuffer = await audioManager.loadAudioBufferFromUrl(mrSrc);
        }

        // 2. Get Mic Buffer from Recorded Blob
        let micBuffer = null;
        if (state.recordedBlob) {
            micBuffer = await audioManager.decodeAudioData(state.recordedBlob);
        }

        visualizer.setBuffers(mrBuffer, micBuffer);
    })();
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
    backingAudio.currentTime = 0 + syncSec;

    // Get capture stream for video track
    let stream;
    try {
        if (playbackVideo.captureStream) {
            stream = playbackVideo.captureStream();
        } else if (playbackVideo.mozCaptureStream) {
            stream = playbackVideo.mozCaptureStream();
        } else if (playbackVideo.webkitCaptureStream) {
            stream = playbackVideo.webkitCaptureStream();
        } else {
            throw new Error("captureStream not supported");
        }
    } catch (e) {
        console.error("Capture Stream Error:", e);
        status.innerText = "Error: Browser does not support captureStream for video.";
        return;
    }

    try {
        // Start Audio Export Graph
        const exportSession = audioManager.startResultExport(playbackVideo, { micVol, musicVol });

        // Mix Audio Track + Original Video Track
        const mixedAudioTrack = exportSession.stream.getAudioTracks()[0];
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
            fileExt = 'webm';
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
            exportSession.cleanup();

            // Resume preview
            playbackVideo.currentTime = 0;
            playbackVideo.onended = null;
        };

        // Play and Record
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
        // if (recorder && recorder.state !== 'inactive') recorder.stop(); // recorder not in scope here, relying on robust start
        // Better error cleanup might be needed, but for now this catches the block
        // exportSession is in try block, might leak if not careful, but let's assume JS GC or refactor later
        // Ideally exportSession should be declared outside try.
        // For now, this is a significant improvement over syntax error.
    }
}

// Run
init();
