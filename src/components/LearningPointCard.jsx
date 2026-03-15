import { useState, useRef, useCallback } from 'react'
import { useAppStore } from '../services/store'
import {
  speakText,
  requestMicPermission,
  startAudioRecording,
  transcribeAudio,
  checkPronunciationSimilarity,
} from '../services/gemini'

export default function LearningPointCard({ point, index, agentLang }) {
  const { markPointCompleted, markPointSkipped, completedPointIds, skippedPointIds } = useAppStore()
  const [isPlaying, setIsPlaying] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [permissionDenied, setPermissionDenied] = useState(false)
  const [result, setResult] = useState(null)
  const [seconds, setSeconds] = useState(0)

  const isCompleted = completedPointIds.has(index)
  const isSkipped = skippedPointIds.has(index)
  const isDone = isCompleted || isSkipped

  const recorderRef = useRef(null)       // MediaRecorder instance
  const resultPromiseRef = useRef(null)   // Promise<Blob>
  const timerRef = useRef(null)

  // ── Play TTS via Gemini ──
  const handlePlay = async () => {
    if (isPlaying) return
    setIsPlaying(true)
    try {
      await speakText(point.text, agentLang)
    } catch (err) {
      console.error('TTS error:', err)
    } finally {
      setIsPlaying(false)
    }
  }

  // ── Timer ──
  const startTimer = useCallback(() => {
    setSeconds(0)
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000)
  }, [])

  const stopTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
  }, [])

  // ── Toggle recording ──
  const handleRecordToggle = async () => {
    if (isDone || isTranscribing) return

    // ─ STOP recording ─
    if (isRecording) {
      setIsRecording(false)
      stopTimer()
      setIsTranscribing(true)

      try {
        // Stop the MediaRecorder → get audio blob
        recorderRef.current?.stop()
        const audioBlob = await resultPromiseRef.current
        recorderRef.current = null
        resultPromiseRef.current = null

        if (!audioBlob || audioBlob.size < 1000) {
          // Too short / empty recording
          setResult({ transcript: '', similarity: 0, passed: false, error: true })
          setIsTranscribing(false)
          return
        }

        // Send to Gemini for transcription
        const transcript = await transcribeAudio(audioBlob, agentLang)

        if (!transcript || transcript.trim() === '') {
          setResult({ transcript: '', similarity: 0, passed: false, error: true })
          setIsTranscribing(false)
          return
        }

        const similarity = checkPronunciationSimilarity(point.text, transcript)
        const passed = similarity >= 0.5
        setResult({ transcript, similarity: Math.round(similarity * 100), passed })
        if (passed) markPointCompleted(index)
      } catch (err) {
        console.error('STT error:', err)
        setResult({ transcript: '', similarity: 0, passed: false, error: true })
      } finally {
        setIsTranscribing(false)
      }
      return
    }

    // ─ START recording ─
    setResult(null)
    setPermissionDenied(false)

    const granted = await requestMicPermission()
    if (!granted) {
      setPermissionDenied(true)
      alert('Microphone access is required for pronunciation practice.\n\nPlease allow microphone access in your browser and try again.')
      return
    }

    try {
      const { mediaRecorder, resultPromise } = await startAudioRecording()
      recorderRef.current = mediaRecorder
      resultPromiseRef.current = resultPromise
      setIsRecording(true)
      startTimer()
    } catch (err) {
      console.error('Recording start error:', err)
      setResult({ transcript: '', similarity: 0, passed: false, error: true, message: 'Could not start microphone recording.' })
    }
  }

  // ── Skip ──
  const handleSkip = () => {
    if (isDone || isRecording || isTranscribing) return
    markPointSkipped(index)
  }

  // ── UI ──
  const typeLabel = point.type === 'vocabulary' ? 'Vocab' : point.type === 'phrase' ? 'Phrase' : 'Sentence'
  const typeColor =
    point.type === 'vocabulary'
      ? 'bg-sky-500/20 text-sky-400'
      : point.type === 'phrase'
        ? 'bg-violet-500/20 text-violet-400'
        : 'bg-emerald-500/20 text-emerald-400'

  const formatTime = (s) => `${String(Math.floor(s / 60)).padStart(1, '0')}:${String(s % 60).padStart(2, '0')}`

  return (
    <div className={`learning-card message-enter transition-all ${isDone ? 'opacity-50' : ''}`}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${typeColor}`}>
          {typeLabel}
        </span>
        {isSkipped && !isCompleted && (
          <span className="text-[10px] text-stone-500">⏭ Skipped</span>
        )}
        {isCompleted && !isSkipped && (
          <span className="text-[10px] text-green-400">✓ Completed</span>
        )}
      </div>

      {/* Content */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <p className="text-[16px] leading-relaxed">
            <span className="px-1.5 py-0.5 rounded"
              style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#7dd3fc' }}>
              {point.text}
            </span>
          </p>
          {point.pronunciation && (
            <p className="text-xs mt-1.5" style={{ color: '#78716c' }}>{point.pronunciation}</p>
          )}
          <p className="text-xs mt-1" style={{ color: '#a8a29e' }}>{point.translation}</p>
        </div>

        {/* Actions */}
        <div className="flex gap-1.5 flex-shrink-0 items-center">
          {/* Play */}
          <button
            onClick={handlePlay}
            disabled={isPlaying}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all
              ${isPlaying ? 'bg-sky-500/30' : 'bg-white/[0.08] hover:bg-white/[0.15]'}`}
          >
            {isPlaying ? (
              <span className="w-2.5 h-2.5 rounded-sm bg-sky-400 animate-pulse" />
            ) : (
              <span className="text-sm">🔊</span>
            )}
          </button>

          {/* Record toggle */}
          {!isDone && (
            <button
              onClick={handleRecordToggle}
              disabled={isTranscribing}
              className={`relative flex items-center justify-center rounded-full transition-all
                ${isTranscribing
                  ? 'w-auto h-8 px-3 gap-2 bg-sky-500/20'
                  : isRecording
                    ? 'w-auto h-8 px-3 gap-2 bg-red-500/25 hover:bg-red-500/35 ring-1 ring-red-500/40'
                    : 'w-8 h-8 bg-accent/20 hover:bg-accent/30'}`}
            >
              {isTranscribing ? (
                <>
                  <span className="w-3 h-3 border-2 border-sky-400/30 border-t-sky-400 rounded-full animate-spin" />
                  <span className="text-[11px] text-sky-400">…</span>
                </>
              ) : isRecording ? (
                <>
                  <span className="w-2.5 h-2.5 rounded-sm bg-red-400" />
                  <span className="text-[11px] text-red-400 font-mono tabular-nums">
                    {formatTime(seconds)}
                  </span>
                </>
              ) : (
                <span className="text-sm">🎤</span>
              )}
            </button>
          )}

          {/* Skip */}
          {!isDone && !isRecording && !isTranscribing && (
            <button
              onClick={handleSkip}
              className="h-8 px-2.5 rounded-full bg-white/[0.05] hover:bg-white/[0.1] transition-all
                text-[11px] text-stone-500 hover:text-stone-400"
            >
              Skip
            </button>
          )}
        </div>
      </div>

      {/* Recording hint */}
      {isRecording && (
        <div className="mt-2 text-[11px] text-stone-500 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-red-400 recording-pulse" />
          Listening… Tap the button again to stop
        </div>
      )}

      {/* Transcribing indicator */}
      {isTranscribing && (
        <div className="mt-2 text-[11px] text-sky-400/70 flex items-center gap-1.5">
          <span className="w-3 h-3 border-2 border-sky-400/30 border-t-sky-400 rounded-full animate-spin" />
          Analyzing your pronunciation…
        </div>
      )}

      {/* Permission denied */}
      {permissionDenied && (
        <div className="mt-2 text-xs rounded-lg px-3 py-2 bg-amber-500/10 text-amber-400">
          🔒 Microphone access is required. Please allow it in your browser settings, then tap 🎤 again.
        </div>
      )}

      {/* Result */}
      {result && !isRecording && !isTranscribing && (
        <div className={`mt-2 text-xs rounded-lg px-3 py-2
          ${result.passed ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
          {result.error ? (
            <span>{result.message || "Couldn't hear you. Tap 🎤 and try again!"}</span>
          ) : result.passed ? (
            <span>Nice! "{result.transcript}" — Similarity: {result.similarity}% ✨</span>
          ) : (
            <span>
              Got "{result.transcript}" ({result.similarity}%) — Need 50%+, try again!
            </span>
          )}
        </div>
      )}
    </div>
  )
}
