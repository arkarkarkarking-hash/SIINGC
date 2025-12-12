import React, { useState } from 'react';
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

    // Handlers
    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (file) {
            setMrName(file.name);
            setIsProcessing(true);
            await audioEngine.loadBackingTrack(file);
            await audioEngine.requestMicrophone();
            setIsProcessing(false);
            setStep('record');
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
                        >
                            {isRecording ? <Square size={32} fill="white" /> : <Mic size={32} />}
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
