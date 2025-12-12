import { useState, useRef, useCallback, useEffect } from 'react'
import { audioBufferToWav } from '../utils/audioUtils'

export function useAudioSystem() {
    const [audioContext, setAudioContext] = useState(null)
    const [mrBuffer, setMrBuffer] = useState(null)
    const [voiceBuffer, setVoiceBuffer] = useState(null)
    const [isReady, setIsReady] = useState(false)
    const [isPlaying, setIsPlaying] = useState(false)
    const [isRecording, setIsRecording] = useState(false)
    const [currentTime, setCurrentTime] = useState(0)

    // Volume State (0.0 to 1.0)
    const [mrVolume, setMrVolume] = useState(0.8)
    const [voiceVolume, setVoiceVolume] = useState(1.0)

    // Refs
    const mrSourceNode = useRef(null)
    const voiceSourceNode = useRef(null)
    const mrGainNode = useRef(null)
    const voiceGainNode = useRef(null)

    const mediaRecorderRef = useRef(null)
    const streamRef = useRef(null)
    const startTimeRef = useRef(0)
    const animationFrameRef = useRef(null)

    const initAudioContext = useCallback(() => {
        if (!audioContext) {
            const AudioContext = window.AudioContext || window.webkitAudioContext
            const ctx = new AudioContext()
            setAudioContext(ctx)
            setIsReady(true)
            return ctx
        }
        return audioContext
    }, [audioContext])

    // Update gains in real-time
    useEffect(() => {
        if (mrGainNode.current) {
            mrGainNode.current.gain.value = mrVolume
        }
    }, [mrVolume])

    useEffect(() => {
        if (voiceGainNode.current) {
            voiceGainNode.current.gain.value = voiceVolume
        }
    }, [voiceVolume])

    const loadFile = useCallback(async (file) => {
        let ctx = audioContext
        if (!ctx) {
            ctx = initAudioContext()
        }
        if (ctx.state === 'suspended') await ctx.resume()

        try {
            const arrayBuffer = await file.arrayBuffer()
            const decodedBuffer = await ctx.decodeAudioData(arrayBuffer)
            setMrBuffer(decodedBuffer)
            setVoiceBuffer(null)
            return decodedBuffer
        } catch (error) {
            console.error('Error decoding audio:', error)
            throw error
        }
    }, [audioContext, initAudioContext])

    const play = useCallback(() => {
        if (!audioContext || !mrBuffer) return
        if (audioContext.state === 'suspended') audioContext.resume()

        // Stop if playing
        if (isPlaying) stop()

        // MR Chain
        const source = audioContext.createBufferSource()
        source.buffer = mrBuffer
        const gain = audioContext.createGain()
        gain.gain.value = mrVolume
        source.connect(gain)
        gain.connect(audioContext.destination)

        mrSourceNode.current = source
        mrGainNode.current = gain

        // Voice Chain
        if (voiceBuffer) {
            const vSource = audioContext.createBufferSource()
            vSource.buffer = voiceBuffer
            const vGain = audioContext.createGain()
            vGain.gain.value = voiceVolume
            vSource.connect(vGain)
            vGain.connect(audioContext.destination)

            voiceSourceNode.current = vSource
            voiceGainNode.current = vGain
            vSource.start(0)
        }

        source.start(0)
        startTimeRef.current = audioContext.currentTime
        setIsPlaying(true)

        const tick = () => {
            setCurrentTime(audioContext.currentTime - startTimeRef.current)
            animationFrameRef.current = requestAnimationFrame(tick)
        }
        animationFrameRef.current = requestAnimationFrame(tick)

        source.onended = () => {
            setIsPlaying(false)
            cancelAnimationFrame(animationFrameRef.current)
            setCurrentTime(0)
        }
    }, [audioContext, mrBuffer, voiceBuffer, isPlaying, mrVolume, voiceVolume]) // Note: volumes in deps might cause re-play if not handled, but here it's fine as we use refs for update or simple restart logic

    const stop = useCallback(() => {
        if (mrSourceNode.current) {
            try { mrSourceNode.current.stop() } catch (e) { }
            mrSourceNode.current = null
        }
        if (voiceSourceNode.current) {
            try { voiceSourceNode.current.stop() } catch (e) { }
            voiceSourceNode.current = null
        }
        cancelAnimationFrame(animationFrameRef.current)
        setIsPlaying(false)
        setCurrentTime(0)
    }, [])

    const startRecording = useCallback(async () => {
        if (!audioContext) return

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
            streamRef.current = stream
            const mediaRecorder = new MediaRecorder(stream)
            mediaRecorderRef.current = mediaRecorder
            const chunks = []

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunks.push(e.data)
            }

            mediaRecorder.onstop = async () => {
                const blob = new Blob(chunks, { type: 'audio/webm' })
                const arrayBuffer = await blob.arrayBuffer()
                const decoded = await audioContext.decodeAudioData(arrayBuffer)
                setVoiceBuffer(decoded)
                stream.getTracks().forEach(track => track.stop())
            }

            play()
            mediaRecorder.start()
            setIsRecording(true)

        } catch (err) {
            console.error("Mic Error", err)
            alert('Could not access microphone.')
        }
    }, [audioContext, play])

    const stopRecording = useCallback(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop()
        }
        stop()
        setIsRecording(false)
    }, [stop])

    const mixAndDownload = useCallback(async () => {
        if (!mrBuffer) return

        const length = voiceBuffer ? Math.max(mrBuffer.length, voiceBuffer.length) : mrBuffer.length
        const sampleRate = mrBuffer.sampleRate
        const offlineCtx = new OfflineAudioContext(2, length, sampleRate)

        const mrSource = offlineCtx.createBufferSource()
        mrSource.buffer = mrBuffer
        const mrGain = offlineCtx.createGain()
        mrGain.gain.value = mrVolume
        mrSource.connect(mrGain)
        mrGain.connect(offlineCtx.destination)
        mrSource.start(0)

        if (voiceBuffer) {
            const vSource = offlineCtx.createBufferSource()
            vSource.buffer = voiceBuffer
            const vGain = offlineCtx.createGain()
            vGain.gain.value = voiceVolume
            vSource.connect(vGain)
            vGain.connect(offlineCtx.destination)
            vSource.start(0)
        }

        const renderedBuffer = await offlineCtx.startRendering()
        const wavBuffer = audioBufferToWav(renderedBuffer)
        const blob = new Blob([wavBuffer], { type: 'audio/wav' })
        const url = URL.createObjectURL(blob)

        const a = document.createElement('a')
        a.href = url
        a.download = 'antigravity-mix.wav'
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)

    }, [mrBuffer, voiceBuffer, mrVolume, voiceVolume])

    useEffect(() => {
        return () => {
            cancelAnimationFrame(animationFrameRef.current)
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop())
            }
        }
    }, [])

    return {
        audioContext,
        mrBuffer,
        voiceBuffer,
        isReady,
        isPlaying,
        isRecording,
        currentTime,
        mrVolume,
        voiceVolume,
        setMrVolume,
        setVoiceVolume,
        loadFile,
        play,
        stop,
        startRecording,
        stopRecording,
        mixAndDownload
    }
}
