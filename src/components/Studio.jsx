import React, { useState, useRef, useEffect } from 'react';
import { Upload, Mic, Square, Play, Download, Music, Sliders } from 'lucide-react';
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
            const audioUrl = await audioEngine.stopRecording();
            setIsRecording(false);
            setStep('mix');
        } else {
            setIsRecording(true);
            audioEngine.startRecording(async () => {
                // Auto stop callback
                const audioUrl = await audioEngine.stopRecording();
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
        <div className="container" style={{ maxWidth: '800px', margin: '4rem auto' }}>
            <header style={{ textAlign: 'center', marginBottom: '3rem' }}>
                <h1 className="neon-text" style={{ fontSize: '3rem', marginBottom: '1rem', color: 'var(--primary)' }}>
                    NEON STUDIO
                </h1>
                <p style={{ color: 'var(--text-muted)' }}>Professional Web-Based Recording Suite</p>
            </header>

            <div className="glass-panel" style={{ padding: '3rem', minHeight: '400px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>

                {/* STEP 1: UPLOAD */}
                {step === 'upload' && (
                    <div style={{ textAlign: 'center' }}>
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
                    <div style={{ textAlign: 'center', width: '100%' }}>
                        <h2 style={{ marginBottom: '1rem' }}>{mrName}</h2>
                        <div style={{
                            height: '100px',
                            background: 'rgba(0,0,0,0.3)',
                            borderRadius: '8px',
                            marginBottom: '2rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            border: isRecording ? '1px solid #ff0055' : '1px solid var(--border)'
                        }}>
                            {isRecording ? (
                                <div className="recording-indicator" style={{ color: '#ff0055', animation: 'pulse 1s infinite' }}>
                                    ● RECORDING
                                </div>
                            ) : (
                                <span style={{ color: 'var(--text-muted)' }}>Ready to Record</span>
                            )}
                        </div>

                        <button className="btn-icon" onClick={toggleRecording} style={{
                            width: '80px', height: '80px', margin: '0 auto',
                            background: isRecording ? '#ff0055' : 'var(--bg-card)',
                            borderColor: isRecording ? '#ff0055' : 'var(--border)'
                        }}>
                            {isRecording ? <Square size={32} fill="white" /> : <Mic size={32} />}
                        </button>
                    </div>
                )}

                {/* STEP 3: MIX */}
                {step === 'mix' && (
                    <div style={{ width: '100%', maxWidth: '500px' }}>
                        <h2 style={{ marginBottom: '2rem', textAlign: 'center' }}>Mixing Console</h2>

                        <div style={{ marginBottom: '2rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                <span><Music size={16} /> Backing Track</span>
                                <span>{Math.round(backingVol * 100)}%</span>
                            </div>
                            <input
                                type="range" min="0" max="1.5" step="0.1"
                                value={backingVol} onChange={(e) => setBackingVol(parseFloat(e.target.value))}
                            />
                        </div>

                        <div style={{ marginBottom: '3rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                <span><Mic size={16} /> Vocals</span>
                                <span>{Math.round(vocalVol * 100)}%</span>
                            </div>
                            <input
                                type="range" min="0" max="1.5" step="0.1"
                                value={vocalVol} onChange={(e) => setVocalVol(parseFloat(e.target.value))}
                            />
                        </div>

                        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
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

            {/* Simple Global Animations */}
            <style>{`
        @keyframes pulse {
          0% { opacity: 1; }
          50% { opacity: 0.5; }
          100% { opacity: 1; }
        }
      `}</style>
        </div>
    );
}
