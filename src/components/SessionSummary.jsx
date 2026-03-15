import { useState, useEffect } from 'react'
import { useAppStore } from '../services/store'
import { generateSessionSummary, speakText } from '../services/gemini'
import { addToNotebook } from '../services/supabase'

const MAX_REPLIES = 8

export default function SessionSummary({ agent, allMessages, onClose }) {
  const { user } = useAppStore()
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [savedToNotebook, setSavedToNotebook] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)

  useEffect(() => { generateSummary() }, [])

  const generateSummary = async () => {
    try {
      const allLPs = allMessages
        .filter(m => m.sender === 'agent' && m.learning_points?.length > 0)
        .flatMap(m => m.learning_points)

      if (allLPs.length === 0) {
        setSummary({ target_sentences: [], native_sentences: [], words_used: [], all_learning_points: [] })
        setLoading(false)
        return
      }

      const result = await generateSessionSummary(agent, allLPs, user.native_language)
      setSummary(result)

      if (result.target_paragraph && user) {
        try {
          await addToNotebook({
            user_id: user.id,
            agent_id: agent.id,
            target_language: agent.target_language,
            text: result.target_paragraph,
            type: 'sentence',
            translation: result.native_translation || '',
            pronunciation: '',
            context: `Session summary with ${agent.name}`,
          })
          setSavedToNotebook(true)
        } catch (e) {
          console.error('Failed to save summary to notebook:', e)
        }
      }
    } catch (err) {
      console.error('Summary generation failed:', err)
      setSummary({ target_sentences: [], native_sentences: [], words_used: [], all_learning_points: [] })
    } finally {
      setLoading(false)
    }
  }

  // Play entire paragraph as continuous speech
  const handlePlayAll = async () => {
    if (isPlaying || !summary?.target_paragraph) return
    setIsPlaying(true)
    try {
      await speakText(summary.target_paragraph, agent.target_language)
    } catch (e) {
      console.error('TTS error:', e)
    } finally {
      setIsPlaying(false)
    }
  }

  const totalLPs = summary?.all_learning_points?.length || 0
  const targetSentences = summary?.target_sentences || []
  const nativeSentences = summary?.native_sentences || []

  return (
    <div className="absolute inset-0 z-40 flex flex-col overflow-hidden"
      style={{ background: 'linear-gradient(170deg, #0c0a09 0%, #0f1729 40%, #0c0a09 100%)' }}>

      {/* Grid */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.04]"
        style={{
          backgroundImage: `linear-gradient(rgba(56,189,248,0.3) 1px, transparent 1px),
            linear-gradient(90deg, rgba(56,189,248,0.3) 1px, transparent 1px)`,
          backgroundSize: '40px 40px',
        }} />

      {/* Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[300px] h-[300px] pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(56,189,248,0.12) 0%, transparent 70%)' }} />

      {/* Header */}
      <div className="relative z-10 px-5 pt-12 pb-4 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
            <span className="text-[10px] uppercase tracking-[3px] text-sky-400/70 font-mono">Session Complete</span>
          </div>
          <h2 className="font-display text-xl font-bold text-white">Learning Review</h2>
        </div>
        <button onClick={onClose}
          className="w-9 h-9 rounded-full border border-white/[0.1] flex items-center justify-center text-stone-500 hover:text-stone-300 hover:border-white/[0.2] transition-all">
          ✕
        </button>
      </div>

      {/* Content */}
      <div className="relative z-10 flex-1 overflow-y-auto px-5 pb-8">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-60 gap-4">
            <div className="relative w-16 h-16">
              <div className="absolute inset-0 rounded-full border-2 border-sky-500/20" />
              <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-sky-400 animate-spin" />
              <div className="absolute inset-2 rounded-full border border-sky-500/10" />
              <div className="absolute inset-2 rounded-full border border-transparent border-b-sky-400/60 animate-spin"
                style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
            </div>
            <p className="text-sm text-sky-400/60 font-mono">Analyzing your session…</p>
          </div>
        ) : (
          <>
            {/* Stats */}
            <div className="flex gap-3 mb-6">
              <div className="flex-1 rounded-xl px-4 py-3 border border-sky-500/15"
                style={{ background: 'rgba(56,189,248,0.04)' }}>
                <div className="text-2xl font-display font-bold text-sky-400">{totalLPs}</div>
                <div className="text-[10px] text-sky-400/50 uppercase tracking-wider mt-0.5">Words Learned</div>
              </div>
              <div className="flex-1 rounded-xl px-4 py-3 border border-accent/15"
                style={{ background: 'rgba(249,115,22,0.04)' }}>
                <div className="text-2xl font-display font-bold text-accent">{MAX_REPLIES}</div>
                <div className="text-[10px] text-accent/50 uppercase tracking-wider mt-0.5">Rounds</div>
              </div>
              <div className="flex-1 rounded-xl px-4 py-3 border border-violet-500/15"
                style={{ background: 'rgba(139,92,246,0.04)' }}>
                <div className="text-2xl font-display font-bold text-violet-400">{agent.avatar_emoji}</div>
                <div className="text-[10px] text-violet-400/50 uppercase tracking-wider mt-0.5">with {agent.name}</div>
              </div>
            </div>

            {/* Vocabulary cloud */}
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-1 h-4 rounded-full bg-sky-400" />
                <span className="text-xs uppercase tracking-widest text-sky-400/60 font-mono">Vocabulary Collected</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {summary?.all_learning_points?.map((lp, i) => {
                  const isUsed = summary.words_used?.includes(lp.text)
                  return (
                    <div key={i} className={`rounded-lg px-3 py-2 border ${isUsed ? 'border-sky-500/30 bg-sky-500/[0.08]' : 'border-white/[0.06] bg-white/[0.02]'}`}>
                      <span className="text-sm font-medium" style={{ color: isUsed ? '#38bdf8' : '#78716c' }}>{lp.text}</span>
                      <span className="text-[10px] text-stone-600 ml-2">{lp.translation}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Sentence-by-sentence review */}
            {targetSentences.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-1 h-4 rounded-full bg-accent" />
                    <span className="text-xs uppercase tracking-widest text-accent/60 font-mono">Review Paragraph</span>
                  </div>
                  {/* Play all button */}
                  <button
                    onClick={handlePlayAll}
                    disabled={isPlaying}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all
                      ${isPlaying
                        ? 'bg-sky-500/20 text-sky-400'
                        : 'bg-sky-500/10 text-sky-400/70 hover:bg-sky-500/20 hover:text-sky-400'}`}
                  >
                    {isPlaying ? (
                      <>
                        <span className="w-2.5 h-2.5 rounded-sm bg-sky-400 animate-pulse" />
                        Playing…
                      </>
                    ) : (
                      <>🔊 Listen All</>
                    )}
                  </button>
                </div>

                {/* Interleaved sentences */}
                <div className="rounded-xl border border-sky-500/15 overflow-hidden"
                  style={{ background: 'rgba(56,189,248,0.03)' }}>
                  {targetSentences.map((sentence, i) => (
                    <div key={i} className={`${i > 0 ? 'border-t border-white/[0.04]' : ''}`}>
                      {/* Target language sentence */}
                      <div className="px-4 pt-3 pb-1">
                        <p className="text-[15px] leading-relaxed font-medium" style={{ color: '#7dd3fc' }}>
                          {sentence}
                        </p>
                      </div>
                      {/* Native translation */}
                      <div className="px-4 pt-0.5 pb-3">
                        <p className="text-[13px] leading-relaxed" style={{ color: '#78716c' }}>
                          {nativeSentences[i] || ''}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Saved notice */}
            {savedToNotebook && (
              <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-green-500/20 bg-green-500/[0.05] mb-6">
                <span className="text-green-400 text-sm">📒</span>
                <span className="text-xs text-green-400/80">Automatically saved to your Notebook</span>
              </div>
            )}

            {/* Close */}
            <button onClick={onClose}
              className="w-full py-3.5 rounded-2xl font-display font-semibold text-base text-white transition-all
                bg-gradient-to-r from-sky-500 to-violet-500 hover:from-sky-400 hover:to-violet-400
                shadow-lg shadow-sky-500/20 active:scale-[0.98]">
              Back to Chat List
            </button>
          </>
        )}
      </div>
    </div>
  )
}