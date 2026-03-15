import { useState, useEffect } from 'react'
import { useAppStore } from '../services/store'
import { getNotebook } from '../services/supabase'
import { speakText } from '../services/gemini'

export default function Notebook() {
  const { user, showNotebook, setShowNotebook } = useAppStore()
  const [entries, setEntries] = useState([])
  const [filter, setFilter] = useState('all') // all | vocabulary | phrase | sentence
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!showNotebook || !user) return
    loadEntries()
  }, [showNotebook, user])

  const loadEntries = async () => {
    setLoading(true)
    try {
      const data = await getNotebook(user.id)
      setEntries(data)
    } catch (err) {
      console.error('Notebook load error:', err)
    } finally {
      setLoading(false)
    }
  }

  if (!showNotebook) return null

  const filtered = filter === 'all' ? entries : entries.filter(e => e.type === filter)

  const typeColor = (type) => {
    if (type === 'vocabulary') return 'bg-sky-500/20 text-sky-400'
    if (type === 'phrase') return 'bg-violet-500/20 text-violet-400'
    return 'bg-emerald-500/20 text-emerald-400'
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#0c0a09] flex flex-col">
      {/* Header */}
      <div className="px-5 pt-12 pb-3 flex items-center justify-between border-b border-white/[0.06]">
        <div>
          <h2 className="font-display text-xl font-bold">📒 Notebook</h2>
          <p className="text-xs text-stone-500 mt-0.5">{entries.length} items collected</p>
        </div>
        <button
          onClick={() => setShowNotebook(false)}
          className="w-9 h-9 rounded-full bg-white/[0.06] flex items-center justify-center text-stone-400 hover:bg-white/[0.1]"
        >
          ✕
        </button>
      </div>

      {/* Filter tabs */}
      <div className="px-5 py-3 flex gap-2">
        {['all', 'vocabulary', 'phrase', 'sentence'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all capitalize
              ${filter === f
                ? 'bg-accent/20 text-accent'
                : 'bg-white/[0.04] text-stone-500 hover:bg-white/[0.08]'}`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Entries */}
      <div className="flex-1 overflow-y-auto px-5 pb-6">
        {loading ? (
          <div className="text-center text-stone-500 text-sm py-10">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-stone-500 text-sm py-10">
            No entries yet. Start chatting to collect learning points!
          </div>
        ) : (
          <div className="space-y-2 mt-2">
            {filtered.map((entry) => (
              <div
                key={entry.id}
                className="bg-white/[0.04] rounded-xl px-4 py-3 border border-white/[0.04]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${typeColor(entry.type)}`}>
                        {entry.type}
                      </span>
                      <span className="text-[10px] text-stone-600 uppercase">{entry.target_language}</span>
                    </div>
                    <p className="text-sm font-medium" style={{ color: 'var(--color-target-lang)' }}>
                      {entry.text}
                    </p>
                    {entry.pronunciation && (
                      <p className="text-[11px] text-stone-500 mt-0.5">{entry.pronunciation}</p>
                    )}
                    <p className="text-xs text-stone-400 mt-1">{entry.translation}</p>
                  </div>
                  <button
                    onClick={() => speakText(entry.text, entry.target_language)}
                    className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center flex-shrink-0 hover:bg-white/[0.1]"
                  >
                    🔊
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
