import { useState, useEffect, useRef, useCallback } from 'react'
import { useAppStore } from '../services/store'
import { generateReply } from '../services/gemini'
import {
  getOrCreateConversation,
  getMessages,
  sendMessage,
  markMessagesRead,
  addToNotebook,
  getMasteredWords,
  subscribeToMessages,
} from '../services/supabase'
import LearningPointCard from './LearningPointCard'
import SessionSummary from './SessionSummary'

const MAX_REPLIES = 8

export default function ChatScreen() {
  const {
    user, getActiveAgent, messages, setMessages, addMessage,
    activeConversation, setActiveConversation,
    isTyping, setIsTyping,
    pendingLearningPoints, setPendingLearningPoints,
    completedPointIds, resetLearningLock, isInputLocked,
    setOnboardingStep, setActiveAgentId,
    incrementReplyCount, agentReplyCounts,
    setUnreadCount,
  } = useAppStore()

  const agent = getActiveAgent()
  const [inputText, setInputText] = useState('')
  const [sending, setSending] = useState(false)
  const [showSummary, setShowSummary] = useState(false)
  const scrollRef = useRef(null)
  const inputRef = useRef(null)

  const messagesRef = useRef([])
  useEffect(() => { messagesRef.current = messages }, [messages])

  const knownMsgIds = useRef(new Set())
  const masteredWordsRef = useRef([])  // words encountered >= 5 times

  const safeAddMessage = useCallback((msg) => {
    if (knownMsgIds.current.has(msg.id)) return
    knownMsgIds.current.add(msg.id)
    addMessage(msg)
  }, [addMessage])

  // ── Load conversation ──
  useEffect(() => {
    if (!agent || !user) return
    let unsub = null

    const init = async () => {
      const conv = await getOrCreateConversation(agent.id, user.id)
      setActiveConversation(conv)

      const msgs = await getMessages(conv.id)
      knownMsgIds.current = new Set(msgs.map((m) => m.id))
      setMessages(msgs)

      await markMessagesRead(conv.id)
      setUnreadCount(agent.id, 0)

      // Load mastered words so we can filter them out of future learning points
      try {
        masteredWordsRef.current = await getMasteredWords(user.id, agent.target_language)
        console.log('[ChatScreen] mastered words:', masteredWordsRef.current.length)
      } catch (e) {
        console.error('Failed to load mastered words:', e)
        masteredWordsRef.current = []
      }

      const lastAgentMsg = [...msgs].reverse().find(
        (m) => m.sender === 'agent' && m.learning_points?.length > 0
      )
      if (lastAgentMsg) {
        setPendingLearningPoints(lastAgentMsg.learning_points, lastAgentMsg.id)
      }

      unsub = subscribeToMessages(conv.id, (newMsg) => {
        safeAddMessage(newMsg)
        if (newMsg.sender === 'agent' && newMsg.learning_points?.length > 0) {
          setPendingLearningPoints(newMsg.learning_points, newMsg.id)
        }
      })
    }

    init()
    return () => {
      if (unsub) unsub()
      resetLearningLock()
      setActiveConversation(null)
    }
  }, [agent?.id])

  // ── Auto-scroll ──
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, isTyping, pendingLearningPoints])

  const handleBack = () => {
    setActiveAgentId(null)
    setOnboardingStep(2)
  }

  // ═══════════════════════════════════════════════════
  //  Highlight learning points in agent messages
  // ═══════════════════════════════════════════════════
  const renderAgentMessage = (content, learningPoints) => {
    if (!learningPoints?.length) return <span>{content}</span>

    // 1. Collect learning point texts (cleaned)
    const lpTexts = learningPoints.map(lp => lp.text).filter(Boolean)
    if (lpTexts.length === 0) return <span>{content}</span>

    // 2. Pre-clean the content: strip quotes/parentheses wrapping learning point words
    //    e.g. '음악' → 음악,  "음악" → 음악,  (음악) stays because it might be translation
    let cleaned = content
    for (const lpText of lpTexts) {
      // Remove single quotes wrapping the exact learning point
      const singleQuotePattern = new RegExp(
        `[''']${lpText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[''']`,
        'g'
      )
      cleaned = cleaned.replace(singleQuotePattern, lpText)

      // Remove double quotes wrapping the exact learning point
      const doubleQuotePattern = new RegExp(
        `["""]${lpText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["""]`,
        'g'
      )
      cleaned = cleaned.replace(doubleQuotePattern, lpText)
    }

    // 3. Sort by length (longest first) to prevent partial matches
    const sorted = [...lpTexts].sort((a, b) => b.length - a.length)

    // 4. Build segments by iteratively finding and splitting
    //    Using indexOf-based approach to avoid regex partial-match issues
    const segments = []
    let remaining = cleaned

    while (remaining.length > 0) {
      // Find the earliest occurrence of any learning point in the remaining string
      let earliestIdx = Infinity
      let matchedText = null

      for (const lp of sorted) {
        const idx = remaining.indexOf(lp)
        if (idx !== -1 && idx < earliestIdx) {
          earliestIdx = idx
          matchedText = lp
        }
      }

      if (matchedText === null) {
        // No more matches — push rest as plain text
        segments.push({ text: remaining, highlight: false })
        break
      }

      // Push text before the match
      if (earliestIdx > 0) {
        segments.push({ text: remaining.slice(0, earliestIdx), highlight: false })
      }

      // Push the matched learning point
      segments.push({ text: matchedText, highlight: true })

      // Advance past the match
      remaining = remaining.slice(earliestIdx + matchedText.length)
    }

    return (
      <span>
        {segments.map((seg, i) => {
          if (seg.highlight) {
            return (
              <span key={i}
                className="px-0.5 rounded"
                style={{ background: 'rgba(56, 189, 248, 0.2)', color: '#7dd3fc' }}>
                {seg.text}
              </span>
            )
          }
          return <span key={i}>{seg.text}</span>
        })}
      </span>
    )
  }

  // ═══ Send → AI reply loop ═══
  const handleSend = async () => {
    if (!inputText.trim() || sending || isInputLocked()) return

    const text = inputText.trim()
    setInputText('')
    setSending(true)
    resetLearningLock()

    try {
      const userMsg = await sendMessage(activeConversation.id, 'user', text)
      safeAddMessage(userMsg)

      const replyCount = agentReplyCounts[agent.id] || 0

      if (replyCount >= MAX_REPLIES) {
        const cooldownMsg = await sendMessage(
          activeConversation.id, 'agent',
          `It's been such a great chat! 😊 I need to head out for a bit. Let's review what you've learned today!`,
          []
        )
        safeAddMessage(cooldownMsg)
        setSending(false)
        setTimeout(() => setShowSummary(true), 800)
        return
      }

      setIsTyping(true)

      const historyForAI = [...messagesRef.current]
      const reply = await generateReply(
        agent, historyForAI, text, user.native_language,
        replyCount + 1, masteredWordsRef.current
      )

      // Filter out mastered words from learning points (in case model still includes them)
      const mastered = new Set(masteredWordsRef.current.map(w => w.toLowerCase()))
      const filteredLP = (reply.learning_points || []).filter(
        lp => !mastered.has((lp.text || '').toLowerCase())
      )

      const agentMsg = await sendMessage(
        activeConversation.id, 'agent',
        reply.message,
        filteredLP
      )
      safeAddMessage(agentMsg)
      incrementReplyCount(agent.id)

      if (filteredLP.length > 0) {
        setPendingLearningPoints(filteredLP, agentMsg.id)

        for (const lp of filteredLP) {
          try {
            const saved = await addToNotebook({
              user_id: user.id,
              agent_id: agent.id,
              target_language: agent.target_language,
              text: lp.text,
              type: lp.type || 'vocabulary',
              translation: lp.translation,
              pronunciation: lp.pronunciation || '',
              context: reply.message,
            })
            // If this word just hit 5 encounters, add to mastered ref
            if (saved?.encounter_count >= 5 && !masteredWordsRef.current.includes(lp.text)) {
              masteredWordsRef.current.push(lp.text)
            }
          } catch (e) {
            console.error('Failed to save to notebook:', e)
          }
        }
      }

      const newReplyCount = (agentReplyCounts[agent.id] || 0) + 1
      if (newReplyCount >= MAX_REPLIES && !reply.learning_points?.length) {
        setTimeout(() => setShowSummary(true), 1200)
      }
    } catch (err) {
      console.error('Send / reply failed:', err)
      safeAddMessage({
        id: `error-${Date.now()}`,
        sender: 'agent',
        content: '⚠️ Something went wrong — please try sending again.',
        learning_points: [],
        created_at: new Date().toISOString(),
      })
    } finally {
      setIsTyping(false)
      setSending(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const handleSummaryClose = () => {
    setShowSummary(false)
    handleBack()
  }

  if (!agent) return null

  const locked = isInputLocked()
  const replyCount = agentReplyCounts[agent.id] || 0
  const sessionEnded = replyCount >= MAX_REPLIES

  return (
    <div className="h-full flex flex-col bg-[#0c0a09] relative">
      {showSummary && (
        <SessionSummary agent={agent} allMessages={messages} onClose={handleSummaryClose} />
      )}

      {/* Header */}
      <div className="flex items-center gap-3 lg:gap-4 px-4 lg:px-6 py-3 lg:py-4 border-b border-white/[0.06] bg-[#0c0a09]/90 backdrop-blur-lg">
        <button onClick={handleBack}
          className="w-8 h-8 lg:w-10 lg:h-10 rounded-full flex items-center justify-center hover:bg-white/[0.08] transition-colors text-stone-400 lg:text-lg">
          ←
        </button>
        <div className={`w-9 h-9 lg:w-12 lg:h-12 rounded-full flex items-center justify-center text-xl lg:text-2xl flex-shrink-0
          ${agent.is_special ? 'bg-gradient-to-br from-amber-500/20 to-orange-600/20' : 'bg-white/[0.06]'}`}>
          {[...agent.avatar_emoji][0] || '🌍'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm lg:text-base truncate">{agent.name}</span>
            {agent.is_special && <span className="text-xs lg:text-sm">⭐</span>}
          </div>
          <div className="flex items-center gap-1.5">
            <div className={`w-1.5 h-1.5 rounded-full ${sessionEnded ? 'bg-stone-500' : 'bg-green-500'}`} />
            <span className="text-[10px] lg:text-xs text-stone-500">
              {agent.interest_tags.slice(0, 2).join(' · ')} · Lv.{agent.proficiency_level === 'beginner' ? 1 : agent.proficiency_level === 'intermediate' ? 2 : 3}
            </span>
          </div>
        </div>
        <div className={`text-[10px] lg:text-xs tabular-nums font-mono px-2 py-1 rounded-md
          ${replyCount >= MAX_REPLIES - 2 ? 'text-amber-400 bg-amber-500/10' : 'text-stone-600'}`}>
          {replyCount}/{MAX_REPLIES}
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 lg:px-0 py-4 lg:py-6">
        <div className="lg:max-w-2xl lg:mx-auto space-y-3 lg:space-y-4">
        {messages.map((msg) => (
          <div key={msg.id}>
            <div className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'} message-enter`}>
              <div className={`max-w-[80%] lg:max-w-[60%] rounded-2xl px-3.5 lg:px-5 py-2.5 lg:py-3 text-[14px] lg:text-[16px] leading-relaxed
                ${msg.sender === 'user'
                  ? 'bg-accent text-white rounded-br-md'
                  : 'bg-white/[0.07] text-stone-200 rounded-bl-md'}`}>
                {msg.sender === 'agent'
                  ? renderAgentMessage(msg.content, msg.learning_points)
                  : <span>{msg.content}</span>}
              </div>
            </div>

            {msg.sender === 'agent' && msg.learning_points?.length > 0 && (
              <div className="ml-0 mt-1.5 space-y-1.5">
                {msg.id === messages.filter((m) => m.sender === 'agent').slice(-1)[0]?.id &&
                  pendingLearningPoints.length > 0 ? (
                  pendingLearningPoints.map((lp, idx) => (
                    <LearningPointCard key={idx} point={lp} index={idx} agentLang={agent.target_language} />
                  ))
                ) : (
                  <div className="flex flex-wrap gap-1.5 ml-1">
                    {msg.learning_points.map((lp, idx) => (
                      <span key={idx} className="text-[11px] px-2 py-1 rounded-full bg-sky-500/10 text-sky-400/70">
                        {lp.text}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {isTyping && (
          <div className="flex justify-start message-enter">
            <div className="bg-white/[0.07] rounded-2xl rounded-bl-md px-4 py-3 flex gap-1.5">
              <span className="typing-dot" style={{ animationDelay: '0s' }} />
              <span className="typing-dot" style={{ animationDelay: '0.2s' }} />
              <span className="typing-dot" style={{ animationDelay: '0.4s' }} />
            </div>
          </div>
        )}

        {sessionEnded && !showSummary && (
          <div className="flex justify-center my-4 message-enter">
            <button onClick={() => setShowSummary(true)}
              className="px-5 py-2.5 rounded-2xl text-sm font-medium transition-all
                bg-gradient-to-r from-sky-500/20 to-violet-500/20
                border border-sky-500/20 hover:border-sky-500/40
                text-sky-400 hover:text-sky-300">
              📊 View Learning Review
            </button>
          </div>
        )}
        </div>{/* close lg:max-w-2xl wrapper */}
      </div>

      {locked && !sessionEnded && (
        <div className="px-4 py-2 bg-sky-500/10 border-t border-sky-500/20">
          <p className="text-xs lg:text-sm text-sky-400 text-center">
            🎤 Complete the pronunciation practice above to continue chatting
          </p>
        </div>
      )}

      {/* Input */}
      <div className="px-4 lg:px-0 py-3 lg:py-4 border-t border-white/[0.06] bg-[#0c0a09]">
        <div className="lg:max-w-2xl lg:mx-auto">
        {sessionEnded ? (
          <div className="flex items-center justify-center gap-3 py-1">
            <span className="text-xs lg:text-sm text-stone-500">Session complete</span>
            <button onClick={() => setShowSummary(true)}
              className="text-xs lg:text-sm text-sky-400 hover:text-sky-300 transition-colors">
              View Review →
            </button>
          </div>
        ) : (
          <div className="flex items-end gap-2 lg:gap-3">
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={locked || sending}
                placeholder={locked ? 'Complete practice first…' : 'Type a message…'}
                rows={1}
                className={`w-full px-4 py-2.5 lg:py-3 rounded-2xl text-sm lg:text-base resize-none outline-none transition-all
                  ${locked
                    ? 'bg-white/[0.03] text-stone-600 cursor-not-allowed'
                    : 'bg-white/[0.06] text-stone-200 placeholder:text-stone-600 focus:bg-white/[0.09] focus:ring-1 focus:ring-accent/30'}`}
                style={{ maxHeight: '120px' }}
                onInput={(e) => {
                  e.target.style.height = 'auto'
                  e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
                }}
              />
            </div>
            <button
              onClick={handleSend}
              disabled={!inputText.trim() || locked || sending}
              className={`w-10 h-10 lg:w-12 lg:h-12 rounded-full flex items-center justify-center flex-shrink-0 transition-all
                ${inputText.trim() && !locked && !sending
                  ? 'bg-accent text-white shadow-lg shadow-accent/25 active:scale-95'
                  : 'bg-white/[0.06] text-stone-600'}`}>
              {sending ? (
                <span className="w-4 h-4 border-2 border-stone-500 border-t-white rounded-full animate-spin" />
              ) : (
                <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 lg:w-6 lg:h-6" stroke="currentColor" strokeWidth="2">
                  <path d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13" strokeLinejoin="round" strokeLinecap="round" />
                </svg>
              )}
            </button>
          </div>
        )}
        </div>{/* close lg:max-w-2xl input wrapper */}
      </div>
    </div>
  )
}