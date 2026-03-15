import { useState } from 'react'
import { useAppStore } from '../services/store'
import { getOrCreateUser } from '../services/supabase'

const LANGUAGES = [
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'zh', name: '中文', flag: '🇨🇳' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'ja', name: '日本語', flag: '🇯🇵' },
  { code: 'ko', name: '한국어', flag: '🇰🇷' },
  { code: 'pt', name: 'Português', flag: '🇧🇷' },
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
]

export default function WelcomeScreen() {
  const [selectedLang, setSelectedLang] = useState('en')
  const [loading, setLoading] = useState(false)
  const { setUser, setOnboardingStep } = useAppStore()

  const handleStart = async () => {
    setLoading(true)
    try {
      const user = await getOrCreateUser(selectedLang)
      setUser(user)
      setOnboardingStep(1)
    } catch (err) {
      console.error('Failed to create user:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto relative">
      {/* Background glow */}
      <div className="fixed top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-20 pointer-events-none"
        style={{ background: 'radial-gradient(circle, #f97316 0%, transparent 70%)' }} />

      <div className="min-h-full flex flex-col items-center justify-center px-6 py-12 lg:py-20 relative z-10">
        <div className="w-full max-w-sm lg:max-w-lg text-center">
          {/* Logo */}
          <div className="mb-8 lg:mb-12">
            <div className="text-5xl lg:text-7xl mb-4">🌏</div>
            <h1 className="font-display text-3xl lg:text-5xl font-bold tracking-tight mb-2">
              Talk With Me
            </h1>
            <div className="w-12 lg:w-16 h-0.5 bg-accent mx-auto mb-6 rounded-full" />
          </div>

          {/* Value prop */}
          <div className="space-y-3 mb-10 lg:mb-14 text-[15px] lg:text-xl leading-relaxed text-stone-300">
            <p>Chat with friends from around the world,</p>
            <p>talk about the culture you love,</p>
            <p className="text-white font-medium">and naturally learn their language.</p>
          </div>

          {/* Features */}
          <div className="space-y-2.5 lg:space-y-3 mb-10 lg:mb-14 text-left">
            {[
              ['💬', 'Chat about your favorite idols, movies, football'],
              ['🔀', 'Native + target language mixed naturally'],
              ['🎓', 'No exams — just friends'],
            ].map(([emoji, text], i) => (
              <div key={i}
                className="flex items-center gap-3 lg:gap-4 px-4 lg:px-6 py-2.5 lg:py-4 rounded-xl bg-white/[0.04] text-sm lg:text-base text-stone-300"
                style={{ animationDelay: `${i * 100}ms` }}>
                <span className="text-lg lg:text-2xl">{emoji}</span>
                <span>{text}</span>
              </div>
            ))}
          </div>

          {/* Language selector */}
          <div className="mb-8 lg:mb-10">
            <label className="text-xs lg:text-sm uppercase tracking-widest text-stone-500 mb-3 lg:mb-4 block">
              Your native language
            </label>
            <div className="grid grid-cols-4 gap-2 lg:gap-3">
              {LANGUAGES.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => setSelectedLang(lang.code)}
                  className={`px-2 py-2.5 lg:py-3.5 rounded-xl text-xs lg:text-sm font-medium transition-all
                    ${selectedLang === lang.code
                      ? 'bg-accent text-white shadow-lg shadow-accent/20'
                      : 'bg-white/[0.06] text-stone-400 hover:bg-white/[0.1]'}`}
                >
                  <span className="text-base lg:text-xl block mb-0.5">{lang.flag}</span>
                  {lang.name}
                </button>
              ))}
            </div>
          </div>

          {/* CTA */}
          <button
            onClick={handleStart}
            disabled={loading}
            className="w-full py-3.5 lg:py-4 rounded-2xl bg-accent font-display font-semibold text-white text-base lg:text-lg
              hover:bg-accent-light active:scale-[0.98] transition-all
              disabled:opacity-50 disabled:cursor-not-allowed
              shadow-lg shadow-accent/25"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Setting up…
              </span>
            ) : (
              'Start Exploring →'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}