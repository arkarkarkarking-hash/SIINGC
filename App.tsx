import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, Mic, Square, Play, Pause, Download, Music, RotateCcw, Save } from 'lucide-react';
import { AppState, AudioEffects } from './types';
import { AudioEngine } from './services/AudioEngine';
import { Visualizer } from './components/Visualizer';
import { Slider, Knob } from './components/Controls';

// Initialize engine outside component to persist across re-renders
const engine = new AudioEngine();

const DEFAULT_EFFECTS: AudioEffects = {
  volume: 1.0,
  lowGain: 0,
  midGain: 0,
  highGain: 0,
  reverbMix: 0.1
};

export default function App() {
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [effects, setEffects] = useState<AudioEffects>(DEFAULT_EFFECTS);
  
  // Track Info
  const [fileName, setFileName] = useState<string>('');
  const [duration, setDuration] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  // References
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>();
  const startTimeRef = useRef<number>(0); // When playback started

  // Visualizer
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  // --- Setup ---
  useEffect(() => {
    setAnalyser(engine.getAnalyser());
    
    // Animation loop for timeline
    const loop = () => {
      if (isPlaying) {
        const now = engine.getContext().currentTime;
        const elapsed = now - startTimeRef.current;
        if (elapsed >= duration) {
          setIsPlaying(false);
          setCurrentTime(duration);
          engine.stop();
        } else {
          setCurrentTime(elapsed);
          rafRef.current = requestAnimationFrame(loop);
        }
      }
    };
    
    if (isPlaying) {
      rafRef.current = requestAnimationFrame(loop);
    }

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying, duration]);

  useEffect(() => {
    // Apply effects whenever they change
    engine.applyEffects(effects);
  }, [effects]);


  // --- Handlers ---

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset
    engine.stop();
    setAppState(AppState.IDLE);
    setFileName(file.name);
    
    try {
      const arrayBuffer = await file.arrayBuffer();
      const dur = await engine.loadBackingTrack(arrayBuffer);
      setDuration(dur);
      setAppState(AppState.READY_TO_RECORD);
    } catch (err) {
      alert("Error loading audio file. Please use MP3/WAV.");
      console.error(err);
    }
  };

  const startRecording = async () => {
    try {
      await engine.resumeContext();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await engine.loadVocalTrack(audioBlob);
        setAppState(AppState.REVIEW);
      };

      // Start Backing Track
      engine.play(0, effects); 
      startTimeRef.current = engine.getContext().currentTime;
      
      // Start Recorder
      mediaRecorder.start();
      
      setAppState(AppState.RECORDING);
      setIsPlaying(true);

    } catch (err) {
      console.error("Microphone access denied or error", err);
      alert("Microphone permission is required to record.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    engine.stop();
    setIsPlaying(false);
  };

  const togglePlayback = () => {
    if (isPlaying) {
      engine.stop();
      setIsPlaying(false);
    } else {
      engine.resumeContext();
      engine.play(currentTime, effects);
      // Adjust start time ref to account for seeking
      startTimeRef.current = engine.getContext().currentTime - currentTime;
      setIsPlaying(true);
    }
  };

  const handleSeek = (time: number) => {
    setCurrentTime(time);
    if (isPlaying) {
      engine.play(time, effects);
      startTimeRef.current = engine.getContext().currentTime - time;
    }
  };

  const handleReset = () => {
    engine.stop();
    setIsPlaying(false);
    setCurrentTime(0);
    setAppState(AppState.READY_TO_RECORD);
  };

  // --- Export Logic (Video/Canvas Recorder) ---
  const handleDownload = async () => {
    setAppState(AppState.EXPORTING);
    engine.stop(); // Ensure stop
    
    // We need to play the song from start to finish and capture the canvas + audio
    const canvas = document.querySelector('canvas');
    if (!canvas) return;

    const streamDestination = engine.getContext().createMediaStreamDestination();
    // Re-route master to this destination temporarily
    engine.getOutputNode().connect(streamDestination);
    
    // Create combined stream (Canvas Video + Web Audio Mix)
    const canvasStream = canvas.captureStream(30); // 30 FPS
    const combinedStream = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...streamDestination.stream.getAudioTracks()
    ]);

    const recorder = new MediaRecorder(combinedStream, {
      mimeType: 'video/webm;codecs=vp9'
    });
    
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = () => {
      // Restore connection
      engine.getOutputNode().disconnect(streamDestination);
      
      const blob = new Blob(chunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `studiomix_export_${Date.now()}.webm`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      setAppState(AppState.REVIEW);
    };

    // START RENDER PLAYBACK
    recorder.start();
    engine.play(0, effects);
    startTimeRef.current = engine.getContext().currentTime;
    setIsPlaying(true);

    // Stop automatically when finished
    setTimeout(() => {
      recorder.stop();
      engine.stop();
      setIsPlaying(false);
    }, duration * 1000 + 500); // Add 500ms buffer
  };

  // --- Format Time ---
  const formatTime = (t: number) => {
    const mins = Math.floor(t / 60);
    const secs = Math.floor(t % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white p-4 flex flex-col items-center">
      
      {/* Header */}
      <header className="w-full max-w-4xl flex justify-between items-center mb-8 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-2">
          <div className="bg-blue-600 p-2 rounded-lg">
            <Music className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
            StudioMix
          </h1>
        </div>
        <div className="text-sm text-slate-400">
          {appState === AppState.IDLE ? 'Waiting for track...' : appState}
        </div>
      </header>

      <main className="w-full max-w-4xl flex flex-col gap-6">
        
        {/* Main Display Area (Visualizer + Status) */}
        <div className="relative w-full h-64 bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden shadow-2xl">
          {/* Visualizer Canvas */}
          <Visualizer 
            analyser={analyser} 
            className="w-full h-full object-cover opacity-80" 
          />
          
          {/* Overlay Content */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
             {appState === AppState.IDLE && (
                <div className="text-center p-6 bg-slate-900/80 backdrop-blur-sm rounded-xl border border-slate-700 pointer-events-auto">
                  <Upload className="w-12 h-12 mx-auto mb-4 text-slate-400" />
                  <label className="cursor-pointer bg-blue-600 hover:bg-blue-500 text-white font-medium py-2 px-6 rounded-full transition-colors">
                    Upload Backing Track (MP3)
                    <input type="file" accept="audio/*" onChange={handleFileUpload} className="hidden" />
                  </label>
                  <p className="mt-2 text-xs text-slate-500">Supports MP3, WAV</p>
                </div>
             )}

             {appState === AppState.EXPORTING && (
                <div className="bg-black/70 px-8 py-4 rounded-xl backdrop-blur-md animate-pulse">
                  <h2 className="text-xl font-bold text-white">Rendering Video...</h2>
                  <p className="text-sm text-slate-300">Please wait while we mix your track</p>
                </div>
             )}
          </div>

          {/* Time Display */}
          {(appState !== AppState.IDLE) && (
            <div className="absolute top-4 right-4 font-mono text-xl bg-black/50 px-3 py-1 rounded text-blue-400">
              {formatTime(currentTime)} / {formatTime(duration)}
            </div>
          )}
        </div>

        {/* Timeline Scrubber */}
        {appState !== AppState.IDLE && (
           <div className="w-full bg-slate-800 rounded-full h-12 flex items-center px-4 gap-4 border border-slate-700">
              <span className="text-xs text-slate-400 font-mono w-10">{formatTime(currentTime)}</span>
              <input 
                type="range" 
                min={0} 
                max={duration || 100} 
                step={0.1}
                value={currentTime}
                onChange={(e) => handleSeek(parseFloat(e.target.value))}
                className="flex-1 h-2 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-blue-500"
                disabled={appState === AppState.RECORDING || appState === AppState.EXPORTING}
              />
              <span className="text-xs text-slate-400 font-mono w-10 text-right">{formatTime(duration)}</span>
           </div>
        )}

        {/* Main Controls */}
        {appState !== AppState.IDLE && appState !== AppState.EXPORTING && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Transport Controls */}
            <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700 flex flex-col justify-between">
              <h3 className="text-sm font-semibold text-slate-400 mb-4 uppercase tracking-wider">Transport</h3>
              
              <div className="flex justify-center gap-4">
                {appState === AppState.RECORDING ? (
                  <button 
                    onClick={stopRecording}
                    className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center shadow-lg shadow-red-500/20 animate-pulse"
                  >
                    <Square className="w-6 h-6 fill-current" />
                  </button>
                ) : appState === AppState.READY_TO_RECORD ? (
                  <button 
                    onClick={startRecording}
                    className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-500 flex items-center justify-center shadow-lg shadow-red-600/20 transition-all hover:scale-105"
                  >
                    <Mic className="w-8 h-8" />
                  </button>
                ) : (
                  // Review Mode Controls
                  <>
                    <button 
                      onClick={handleReset}
                      className="w-12 h-12 rounded-full bg-slate-700 hover:bg-slate-600 flex items-center justify-center transition-colors"
                      title="Reset Recording"
                    >
                      <RotateCcw className="w-5 h-5" />
                    </button>
                    <button 
                      onClick={togglePlayback}
                      className="w-16 h-16 rounded-full bg-blue-600 hover:bg-blue-500 flex items-center justify-center shadow-lg shadow-blue-600/20 transition-all hover:scale-105"
                    >
                      {isPlaying ? <Pause className="w-8 h-8 fill-current" /> : <Play className="w-8 h-8 fill-current ml-1" />}
                    </button>
                    <button 
                      onClick={handleDownload}
                      className="w-12 h-12 rounded-full bg-green-600 hover:bg-green-500 flex items-center justify-center shadow-lg shadow-green-600/20 transition-all hover:scale-105"
                      title="Download Video"
                    >
                      <Download className="w-5 h-5" />
                    </button>
                  </>
                )}
              </div>
              
              <div className="mt-4 text-center text-sm text-slate-500">
                {appState === AppState.READY_TO_RECORD && "Press Mic to Start"}
                {appState === AppState.RECORDING && "Recording..."}
                {appState === AppState.REVIEW && "Review & Edit"}
              </div>
            </div>

            {/* Vocal EQ */}
            <div className={`bg-slate-800/50 p-6 rounded-2xl border border-slate-700 ${appState !== AppState.REVIEW ? 'opacity-50 pointer-events-none' : ''}`}>
               <h3 className="text-sm font-semibold text-slate-400 mb-4 uppercase tracking-wider">Vocal EQ</h3>
               <div className="space-y-4">
                  <Slider 
                    label="Highs" min={-12} max={12} unit="dB" 
                    value={effects.highGain} 
                    onChange={(v) => setEffects(prev => ({ ...prev, highGain: v }))} 
                  />
                  <Slider 
                    label="Mids" min={-12} max={12} unit="dB" 
                    value={effects.midGain} 
                    onChange={(v) => setEffects(prev => ({ ...prev, midGain: v }))} 
                  />
                  <Slider 
                    label="Lows" min={-12} max={12} unit="dB" 
                    value={effects.lowGain} 
                    onChange={(v) => setEffects(prev => ({ ...prev, lowGain: v }))} 
                  />
               </div>
            </div>

            {/* Master & FX */}
            <div className={`bg-slate-800/50 p-6 rounded-2xl border border-slate-700 flex flex-col gap-4 ${appState !== AppState.REVIEW ? 'opacity-50 pointer-events-none' : ''}`}>
              <h3 className="text-sm font-semibold text-slate-400 mb-2 uppercase tracking-wider">Effects & Mix</h3>
              <div className="flex justify-around items-end flex-1">
                 <Knob 
                   label="Reverb" 
                   value={effects.reverbMix} 
                   min={0} max={1} 
                   onChange={(v) => setEffects(prev => ({ ...prev, reverbMix: v }))} 
                 />
                 <div className="h-full border-r border-slate-700 mx-2"></div>
                 <Knob 
                   label="Vocal Vol" 
                   value={effects.volume} 
                   min={0} max={2} 
                   onChange={(v) => setEffects(prev => ({ ...prev, volume: v }))} 
                 />
              </div>
            </div>

          </div>
        )}
      </main>
    </div>
  );
}