import React from 'react'
import { Play, Square, Mic, RotateCcw, Download, Slider } from 'lucide-react'

export function Studio({
    mrBuffer,
    voiceBuffer,
    isPlaying,
    isRecording,
    currentTime,
    mrVolume,
    voiceVolume,
    setMrVolume,
    setVoiceVolume,
    onPlay,
    onStop,
    onRecord,
    onStopRecord,
    onReset,
    onDownload
}) {

    const formatTime = (time) => {
        const min = Math.floor(time / 60)
        const sec = Math.floor(time % 60)
        return `${min}:${sec < 10 ? '0' : ''}${sec}`
    }

    const duration = mrBuffer ? mrBuffer.duration : 0
    const progress = duration > 0 ? (currentTime / duration) * 100 : 0

    return (
        <div className="glass" style={{ padding: '2rem', borderRadius: '16px', maxWidth: '800px', margin: '0 auto', textAlign: 'center' }}>
            <h2 style={{ marginBottom: '2rem' }}>Studio</h2>

            {/* Waveform Visualization */}
            <div style={{ height: '100px', background: 'rgba(0,0,0,0.3)', borderRadius: '8px', marginBottom: '2rem', position: 'relative', overflow: 'hidden' }}>
                <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    height: '100%',
                    width: `${progress}%`,
                    background: 'rgba(0, 255, 136, 0.2)',
                    borderRight: '2px solid #00ff88',
                    transition: 'width 0.1s linear'
                }} />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)' }}>
                    {isRecording ? <span style={{ color: '#ff4444', fontWeight: 'bold' }}>RECORDING...</span> : 'Waveform Visualization'}
                </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '2rem', marginBottom: '2rem' }}>
                <div style={{ fontFamily: 'monospace', fontSize: '1.5rem' }}>
                    {formatTime(currentTime)} / {formatTime(duration)}
                </div>
            </div>

            {/* Mixing Desk */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '3rem', marginBottom: '2rem' }}>
                <div className="volume-control">
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>MR Volume</label>
                    <input
                        type="range"
                        min="0"
                        max="1.5"
                        step="0.1"
                        value={mrVolume}
                        onChange={(e) => setMrVolume(parseFloat(e.target.value))}
                        style={{ accentColor: '#00ff88' }}
                    />
                </div>
                {voiceBuffer && (
                    <div className="volume-control">
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Voice Volume</label>
                        <input
                            type="range"
                            min="0"
                            max="1.5"
                            step="0.1"
                            value={voiceVolume}
                            onChange={(e) => setVoiceVolume(parseFloat(e.target.value))}
                            style={{ accentColor: '#00ccff' }}
                        />
                    </div>
                )}
            </div>

            {/* Transport Controls */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem' }}>
                {!isPlaying && !isRecording ? (
                    <>
                        <button
                            onClick={onPlay}
                            className="btn-primary"
                            style={{ borderRadius: '50%', width: '64px', height: '64px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            title="Play"
                        >
                            <Play fill="black" size={24} />
                        </button>

                        <button
                            onClick={onRecord}
                            className="glass"
                            style={{ borderRadius: '50%', width: '64px', height: '64px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderColor: '#ff4444', color: '#ff4444' }}
                            title="Record"
                        >
                            <Mic size={24} />
                        </button>
                    </>
                ) : (
                    <button
                        onClick={isRecording ? onStopRecord : onStop}
                        className="glass"
                        style={{ borderRadius: '50%', width: '64px', height: '64px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderColor: 'var(--text-primary)', background: '#333' }}
                        title="Stop"
                    >
                        <Square fill="white" size={24} />
                    </button>
                )}
            </div>

            {/* Footer Controls */}
            <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'space-between' }}>
                <button onClick={onReset} className="glass" style={{ padding: '0.5rem 1rem', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
                    <RotateCcw size={16} /> Reset
                </button>

                {voiceBuffer && (
                    <button
                        onClick={onDownload}
                        className="glass"
                        style={{ padding: '0.5rem 1rem', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', borderColor: 'var(--secondary-color)', color: 'var(--secondary-color)' }}
                    >
                        <Download size={16} /> Download Mix
                    </button>
                )}
            </div>
        </div>
    )
}
