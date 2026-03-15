import { useState } from 'react'
import { useAppStore } from '../services/store'
import { generateAgentIdentities, generateOpeningMessage, buildAgentSystemPrompt } from '../services/gemini'
import { createAgent, getOrCreateConversation, sendMessage } from '../services/supabase'

const TARGET_LANGUAGES = [
  { code: 'ko', name: 'Korean', flag: '🇰🇷', label: '한국어' },
  { code: 'ja', name: 'Japanese', flag: '🇯🇵', label: '日本語' },
  { code: 'pt', name: 'Portuguese', flag: '🇧🇷', label: 'Português' },
  { code: 'zh', name: 'Chinese', flag: '🇨🇳', label: '中文' },
  { code: 'es', name: 'Spanish', flag: '🇪🇸', label: 'Español' },
  { code: 'fr', name: 'French', flag: '🇫🇷', label: 'Français' },
  { code: 'de', name: 'German', flag: '🇩🇪', label: 'Deutsch' },
  { code: 'it', name: 'Italian', flag: '🇮🇹', label: 'Italiano' },
]

// Grouped interest presets inspired by social media onboarding
const INTEREST_CATEGORIES = [
  {
    category: 'Music & Entertainment',
    items: [
      { label: 'K-Pop', icon: '🎤' },
      { label: 'Hip-Hop & Rap', icon: '🎧' },
      { label: 'Rock & Indie', icon: '🎸' },
      { label: 'Jazz & Soul', icon: '🎷' },
      { label: 'Classical Music', icon: '🎻' },
      { label: 'EDM & DJing', icon: '🎛️' },
    ],
  },
  {
    category: 'Film & TV',
    items: [
      { label: 'Anime & Manga', icon: '🌸' },
      { label: 'K-Drama', icon: '📺' },
      { label: 'Sci-Fi & Fantasy', icon: '🚀' },
      { label: 'Horror & Thriller', icon: '👻' },
      { label: 'Documentary', icon: '🎬' },
      { label: 'Stand-up Comedy', icon: '😂' },
    ],
  },
  {
    category: 'Sports & Fitness',
    items: [
      { label: 'Football / Soccer', icon: '⚽' },
      { label: 'Basketball', icon: '🏀' },
      { label: 'Tennis', icon: '🎾' },
      { label: 'Martial Arts', icon: '🥋' },
      { label: 'Yoga & Wellness', icon: '🧘' },
      { label: 'F1 & Motorsport', icon: '🏎️' },
      { label: 'Dance & Performance', icon: '💃' },
      { label: 'Choreography', icon: '🩰' },
      { label: 'Social Dance', icon: '🕺' },
    ],
  },
  {
    category: 'Lifestyle',
    items: [
      { label: 'Food & Cooking', icon: '🍜' },
      { label: 'Travel & Backpacking', icon: '✈️' },
      { label: 'Fashion & Streetwear', icon: '👟' },
      { label: 'Photography', icon: '📸' },
      { label: 'Pets & Animals', icon: '🐕' },
      { label: 'Coffee & Tea', icon: '☕' },
    ],
  },
  {
    category: 'Learning & Ideas',
    items: [
      { label: 'History & Culture', icon: '🏛️' },
      { label: 'Science & Space', icon: '🔬' },
      { label: 'Tech & Startups', icon: '💻' },
      { label: 'Gaming & Esports', icon: '🎮' },
      { label: 'Art & Design', icon: '🎨' },
      { label: 'Books & Literature', icon: '📚' },
      { label: 'Philosophy & Psychology', icon: '🧠' },
    ],
  },
]

const PROFICIENCY_LEVELS = [
  { value: 'beginner', label: 'Beginner', desc: 'I know almost nothing', emoji: '🌱' },
  { value: 'intermediate', label: 'Intermediate', desc: 'I know basics', emoji: '🌿' },
  { value: 'advanced', label: 'Advanced', desc: 'I can hold conversations', emoji: '🌳' },
]

export default function CreateAgentScreen() {
  const { user, addAgents, setOnboardingStep } = useAppStore()
  const [targetLang, setTargetLang] = useState(null)
  const [selectedInterests, setSelectedInterests] = useState([]) // array of label strings
  const [proficiency, setProficiency] = useState(null)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')

  const toggleInterest = (label) => {
    setSelectedInterests((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]
    )
  }

  const canCreate = targetLang && selectedInterests.length > 0 && proficiency

  const handleCreate = async () => {
    if (!canCreate) return
    setLoading(true)

    try {
      // Always create exactly 3 agents.
      // Distribute interests across the 3 slots.
      // Randomly pick which interest gets the special (celebrity) agent.
      const interests = [...selectedInterests]
      const specialIndex = Math.floor(Math.random() * interests.length)

      // Assign interests to 3 agent slots: round-robin if more interests than 3
      const agentSlots = [
        { interest: interests[0 % interests.length], isSpecial: specialIndex === (0 % interests.length) },
        { interest: interests[1 % interests.length], isSpecial: specialIndex === (1 % interests.length) },
        { interest: interests[2 % interests.length], isSpecial: specialIndex === (2 % interests.length) },
      ]
      // Ensure exactly one special
      const hasSpecial = agentSlots.some(s => s.isSpecial)
      if (!hasSpecial) agentSlots[Math.floor(Math.random() * 3)].isSpecial = true
      // Ensure at most one special
      let foundSpecial = false
      for (const slot of agentSlots) {
        if (slot.isSpecial && foundSpecial) slot.isSpecial = false
        if (slot.isSpecial) foundSpecial = true
      }

      setStatus('Creating your 3 chat friends…')

      const allCreatedAgents = []

      for (let i = 0; i < 3; i++) {
        const { interest, isSpecial } = agentSlots[i]
        setStatus(`Creating friend ${i + 1}/3 — ${interest}${isSpecial ? ' ⭐' : ''}…`)

        // Generate a single agent identity for this slot
        const identities = await generateAgentIdentities(targetLang, interest, proficiency)

        // Pick the right persona: special or one of the ordinary ones
        let identity
        if (isSpecial) {
          identity = identities.find(id => id.is_special) || identities[2] || identities[0]
          identity.is_special = true
        } else {
          // Pick an ordinary persona (alternate between the two)
          const ordinaryOnes = identities.filter(id => !id.is_special)
          identity = ordinaryOnes[i % ordinaryOnes.length] || identities[0]
          identity.is_special = false
        }

        const agentData = {
          user_id: user.id,
          name: identity.name,
          avatar_emoji: identity.avatar_emoji,
          target_language: targetLang,
          interest_tags: [interest],
          proficiency_level: proficiency,
          is_special: identity.is_special,
          identity_prompt: identity.identity_prompt,
          system_prompt: '',
        }
        agentData.system_prompt = buildAgentSystemPrompt(agentData, user.native_language)

        const created = await createAgent(agentData)
        allCreatedAgents.push(created)
      }

      // Generate opening messages
      setStatus('Your friends are saying hello…')
      for (const agent of allCreatedAgents) {
        try {
          const opening = await generateOpeningMessage(agent, user.native_language)
          const conv = await getOrCreateConversation(agent.id, user.id)
          await sendMessage(conv.id, 'agent', opening.message, opening.learning_points || [])
        } catch (err) {
          console.error(`Failed to generate opening for ${agent.name}:`, err)
        }
      }

      addAgents(allCreatedAgents)
      setOnboardingStep(2)
    } catch (err) {
      console.error('Agent creation failed:', err)
      setStatus('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-5 lg:px-0 pt-12 lg:pt-14 pb-4">
        <div className="lg:max-w-2xl lg:mx-auto">
          <h2 className="font-display text-xl lg:text-2xl font-bold">Find Chat Friends</h2>
          <p className="text-sm lg:text-base text-stone-400 mt-1">Pick a language & interests to get matched</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 lg:px-0 pb-36">
        <div className="lg:max-w-2xl lg:mx-auto">
        {/* Target Language */}
        <div className="mb-6 lg:mb-8">
          <label className="text-xs lg:text-sm uppercase tracking-widest text-stone-500 mb-3 block">
            I want to learn
          </label>
          <div className="grid grid-cols-4 lg:grid-cols-8 gap-2 lg:gap-3">
            {TARGET_LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                onClick={() => setTargetLang(lang.code)}
                className={`px-2 py-3 lg:py-4 rounded-xl text-xs lg:text-sm font-medium transition-all text-center
                  ${targetLang === lang.code
                    ? 'bg-accent text-white shadow-lg shadow-accent/20'
                    : 'bg-white/[0.06] text-stone-400 hover:bg-white/[0.1]'}`}
              >
                <span className="text-lg lg:text-xl block mb-1">{lang.flag}</span>
                {lang.label}
              </button>
            ))}
          </div>
        </div>

        {/* Interests — grouped by category */}
        <div className="mb-6">
          <label className="text-xs uppercase tracking-widest text-stone-500 mb-3 block">
            I'm interested in
          </label>
          {INTEREST_CATEGORIES.map((cat) => (
            <div key={cat.category} className="mb-4">
              <p className="text-[11px] text-stone-600 uppercase tracking-wider mb-2">{cat.category}</p>
              <div className="flex flex-wrap gap-2">
                {cat.items.map((item) => {
                  const selected = selectedInterests.includes(item.label)
                  return (
                    <button
                      key={item.label}
                      onClick={() => toggleInterest(item.label)}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium transition-all
                        ${selected
                          ? 'bg-accent/20 text-accent border border-accent/40'
                          : 'bg-white/[0.06] text-stone-400 border border-transparent hover:bg-white/[0.1]'}`}
                    >
                      <span className="text-sm">{item.icon}</span>
                      {item.label}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Proficiency */}
        <div className="mb-6">
          <label className="text-xs uppercase tracking-widest text-stone-500 mb-3 block">
            My level
          </label>
          <div className="space-y-2">
            {PROFICIENCY_LEVELS.map((level) => (
              <button
                key={level.value}
                onClick={() => setProficiency(level.value)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all
                  ${proficiency === level.value
                    ? 'bg-accent/15 border border-accent/30'
                    : 'bg-white/[0.04] border border-transparent hover:bg-white/[0.08]'}`}
              >
                <span className="text-xl">{level.emoji}</span>
                <div>
                  <div className={`text-sm font-medium ${proficiency === level.value ? 'text-accent' : 'text-stone-300'}`}>
                    {level.label}
                  </div>
                  <div className="text-xs text-stone-500">{level.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
        </div>{/* close lg:max-w-2xl wrapper */}
      </div>

      {/* Bottom CTA */}
      <div className="absolute bottom-0 left-0 right-0 p-5 lg:p-6 bg-gradient-to-t from-[#0c0a09] via-[#0c0a09] to-transparent pt-10">
        <div className="lg:max-w-2xl lg:mx-auto">
        {status && (
          <div className="text-center text-sm lg:text-base text-stone-400 mb-3 flex items-center justify-center gap-2">
            {loading && <span className="w-3 h-3 border-2 border-stone-500 border-t-accent rounded-full animate-spin" />}
            {status}
          </div>
        )}
        <button
          onClick={handleCreate}
          disabled={!canCreate || loading}
          className={`w-full py-3.5 lg:py-4 rounded-2xl font-display font-semibold text-base lg:text-lg transition-all
            ${canCreate && !loading
              ? 'bg-accent text-white shadow-lg shadow-accent/25 hover:bg-accent-light active:scale-[0.98]'
              : 'bg-white/[0.06] text-stone-600 cursor-not-allowed'}`}
        >
          {loading
            ? 'Creating…'
            : canCreate
              ? `Create 3 Friends`
              : 'Select language, interests & level'}
        </button>
        </div>
      </div>
    </div>
  )
}