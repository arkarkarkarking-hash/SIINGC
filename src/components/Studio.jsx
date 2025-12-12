import React, { useState, useRef } from 'react';
import { Upload, Mic, Square, Play, Download, Music } from 'lucide-react';
import { AudioEngine } from '../services/AudioEngine';

const audioEngine = new AudioEngine();

export default function Studio() {
    const [step, setStep] = useState('upload'); // upload, record, mix
    const [isRecording, setIsRecording] = useState(false);
    const [mrName, setMrName] = useState('');
    const [backingVol, setBackingVol] = useState(1.0);
    const [vocalVol, setVocalVol] = useState(1.0);
    const [isProcessing, setIsProcessing] = useState(false);

    const videoRef = useRef(null);
    const [error, setError] = useState(null);

    // Handlers
    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (file) {
            try {
                setError(null);
                setMrName(file.name);
                setIsProcessing(true);
                await audioEngine.loadBackingTrack(file);
                const stream = await audioEngine.requestStream(); // Updated method

                // Initialize Video Preview
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    videoRef.current.muted = true; // Prevent feedback loops
                }

                setIsProcessing(false);
                setStep('record');
            } catch (err) {
                console.error(err);
                setError("Error accessing microphone/camera or loading file. Please allow permissions.");
                setIsProcessing(false);
            }
        }
    };

    const toggleRecording = async () => {
        if (isRecording) {
            await audioEngine.stopRecording();
            setIsRecording(false);
            setStep('mix');
        } else {
            setIsRecording(true);
            audioEngine.startRecording(async () => {
                // Auto stop callback
                await audioEngine.stopRecording();
                setIsRecording(false);
                setStep('mix');
            });
        }
    };

    const handleDownload = async () => {
        setIsProcessing(true);
        const blob = await audioEngine.mixAndDownload(backingVol, vocalVol);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `remix-${mrName}.wav`;
        a.click();
        setIsProcessing(false);
    };

    return (
        <div className="studio-container">
            <header className="studio-header">
                <h1 className="studio-title neon-text">NEON STUDIO</h1>
                <p style={{ color: 'var(--text-muted)' }}>Professional Web-Based Recording Suite</p>
            </header>

            <div className="glass-panel studio-panel">

                {error && (
                    <div style={{ color: '#ff0055', marginBottom: '1rem', textAlign: 'center' }}>
                        {error}
                    </div>
                )}

                {/* STEP 1: UPLOAD */}
                {step === 'upload' && (
                    <div className="upload-section">
                        <div style={{ marginBottom: '2rem' }}>
                            <Music size={64} color="var(--primary)" />
                        </div>
                        <h2 style={{ marginBottom: '2rem' }}>Upload Instrumental (MR)</h2>
                        <label className="btn-primary">
                            <Upload size={20} />
                            <span>Select File</span>
                            <input type="file" accept="audio/*" onChange={handleFileUpload} style={{ display: 'none' }} />
                        </label>
                        {isProcessing && <p style={{ marginTop: '1rem', color: 'var(--primary)' }}>Loading Audio Engine...</p>}
                    </div>
                )}

                {/* STEP 2: RECORD */}
                {step === 'record' && (
                    <div className="record-section">
                        <h2 style={{ marginBottom: '1rem' }}>{mrName}</h2>

                        {/* Video Preview */}
                        <div style={{
                            width: '100%',
                            maxWidth: '400px',
                            height: '300px',
                            background: '#000',
                            margin: '0 auto 2rem auto',
                            borderRadius: '12px',
                            overflow: 'hidden',
                            border: '1px solid var(--border)'
                        }}>
                            <video
                                ref={videoRef}
                                autoPlay
                                playsInline
                                muted
                                style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
                            />
                        </div>

                        <div className={`status-display ${isRecording ? 'recording' : ''}`}>
                            {isRecording ? (
                                <div className="recording-text">
                                    ● RECORDING
                                </div>
                            ) : (
                                <span style={{ color: 'var(--text-muted)' }}>Ready to Record</span>
                            )}
                        </div>

                        <button
                            className={`btn-icon record-btn ${isRecording ? 'active' : ''}`}
                            onClick={toggleRecording}
                            style={{
                                width: 'auto',
                                height: 'auto',
                                borderRadius: '8px',
                                padding: '12px 32px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '8px'
                            }}
                        >
                            {isRecording ? <Square size={32} fill="white" /> : <Mic size={32} />}
                            <span style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>
                                {isRecording ? "STOP" : "녹화 시작"}
                            </span>
                        </button>
                    </div>
                )}

                {/* STEP 3: MIX */}
                {step === 'mix' && (
                    <div className="mix-section">
                        <h2 style={{ marginBottom: '2rem', textAlign: 'center' }}>Mixing Console</h2>

                        <div className="slider-group">
                            <div className="slider-label">
                                <span><Music size={16} /> Backing Track</span>
                                <span>{Math.round(backingVol * 100)}%</span>
                            </div>
                            <input
                                type="range" min="0" max="1.5" step="0.1"
                                value={backingVol} onChange={(e) => setBackingVol(parseFloat(e.target.value))}
                            />
                        </div>

                        <div className="slider-group" style={{ marginBottom: '3rem' }}>
                            <div className="slider-label">
                                <span><Mic size={16} /> Vocals</span>
                                <span>{Math.round(vocalVol * 100)}%</span>
                            </div>
                            <input
                                type="range" min="0" max="1.5" step="0.1"
                                value={vocalVol} onChange={(e) => setVocalVol(parseFloat(e.target.value))}
                            />
                        </div>

                        <div className="action-buttons">
                            <button className="btn-primary" onClick={() => setStep('record')} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-main)' }}>
                                Retry
                            </button>
                            <button className="btn-primary" onClick={handleDownload} disabled={isProcessing}>
                                <Download size={20} />
                                {isProcessing ? 'Rendering...' : 'Download Mix'}
                            </button>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
}
