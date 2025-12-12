import { useState } from 'react'
import './index.css'
import { useAudioSystem } from './hooks/useAudioSystem'
import { UploadZone } from './components/UploadZone'
import { Studio } from './components/Studio'

function App() {
  const {
    loadFile,
    mrBuffer,
    voiceBuffer,
    isPlaying,
    isRecording,
    currentTime,
    mrVolume,
    voiceVolume,
    setMrVolume,
    setVoiceVolume,
    play,
    stop,
    startRecording,
    stopRecording,
    mixAndDownload
  } = useAudioSystem()

  const [error, setError] = useState(null)

  const handleFileSelect = async (file) => {
    try {
      setError(null)
      await loadFile(file)
    } catch (err) {
      setError('Failed to load audio file. Please try another one.')
      console.error(err)
    }
  }

  const handleReset = () => {
    window.location.reload()
  }

  const handleDownload = async () => {
    try {
      await mixAndDownload()
    } catch (err) {
      console.error("Download failed", err)
      setError("Failed to export audio.")
    }
  }

  return (
    <div className="container" style={{ paddingTop: '2rem', textAlign: 'center' }}>
      <h1 style={{ fontSize: '3rem', fontWeight: '800', marginBottom: '1rem', background: 'linear-gradient(to right, #00ff88, #00ccff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Antigravity Audio
      </h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
        Professional Vocal Recording & Mixing Suite
      </p>

      {!mrBuffer ? (
        <>
          <UploadZone onFileSelect={handleFileSelect} />
          {error && <p style={{ color: '#ff4d4d', marginTop: '1rem' }}>{error}</p>}
        </>
      ) : (
        <Studio
          mrBuffer={mrBuffer}
          voiceBuffer={voiceBuffer}
          isPlaying={isPlaying}
          isRecording={isRecording}
          currentTime={currentTime}
          mrVolume={mrVolume}
          voiceVolume={voiceVolume}
          setMrVolume={setMrVolume}
          setVoiceVolume={setVoiceVolume}
          onPlay={play}
          onStop={stop}
          onRecord={startRecording}
          onStopRecord={stopRecording}
          onReset={handleReset}
          onDownload={handleDownload}
        />
      )}
    </div>
  )
}

export default App
