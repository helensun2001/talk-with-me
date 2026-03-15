import { useState, useEffect } from 'react'
import { useAppStore } from '../services/store'
import { getUserAgents, getUnreadCount } from '../services/supabase'

export default function ChatListScreen() {
  const { user, agents, setAgents, setActiveAgentId, setOnboardingStep, unreadCounts, setUnreadCount, setShowNotebook } = useAppStore()
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!user) return
    loadAgents()
  }, [user])

  const loadAgents = async () => {
    try {
      const data = await getUserAgents(user.id)
      setAgents(data)
      // Load unread counts
      for (const agent of data) {
        const count = await getUnreadCount(agent.id, user.id)
        setUnreadCount(agent.id, count)
      }
    } catch (err) {
      console.error('Failed to load agents:', err)
    } finally {
      setLoaded(true)
    }
  }

  const openChat = (agentId) => {
    setActiveAgentId(agentId)
    setOnboardingStep(3)
  }

  const formatTime = (ts) => {
    if (!ts) return ''
    const d = new Date(ts)
    const now = new Date()
    const diff = now - d
    if (diff < 60000) return 'now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-5 lg:px-0 pt-12 lg:pt-14 pb-3 lg:pb-4">
        <div className="lg:max-w-2xl lg:mx-auto flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl lg:text-3xl font-bold">Chats</h1>
          <p className="text-xs lg:text-sm text-stone-500 mt-0.5">{agents.length} friend{agents.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowNotebook(true)}
            className="w-10 h-10 lg:w-11 lg:h-11 rounded-full bg-white/[0.06] flex items-center justify-center text-lg hover:bg-white/[0.1] transition-colors"
            title="Notebook"
          >
            📒
          </button>
          <button
            onClick={() => setOnboardingStep(1)}
            className="w-10 h-10 lg:w-11 lg:h-11 rounded-full bg-accent/15 flex items-center justify-center text-lg hover:bg-accent/25 transition-colors"
            title="Find new friends"
          >
            +
          </button>
        </div>
        </div>{/* close lg:max-w-2xl */}
      </div>

      {/* Agent List */}
      <div className="flex-1 overflow-y-auto">
        <div className="lg:max-w-2xl lg:mx-auto">
        {!loaded ? (
          <div className="flex items-center justify-center h-40 text-stone-500 text-sm lg:text-base">
            Loading chats…
          </div>
        ) : agents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-60 text-center px-8">
            <div className="text-4xl mb-3">💬</div>
            <p className="text-stone-400 text-sm">No chat friends yet</p>
            <button
              onClick={() => setOnboardingStep(1)}
              className="mt-4 px-5 py-2 rounded-full bg-accent text-sm font-medium text-white"
            >
              Find Friends
            </button>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {agents.map((agent) => {
              const unread = unreadCounts[agent.id] || 0
              return (
                <button
                  key={agent.id}
                  onClick={() => openChat(agent.id)}
                  className="w-full flex items-center gap-3.5 lg:gap-4 px-5 lg:px-6 py-3.5 lg:py-4 hover:bg-white/[0.03] active:bg-white/[0.06] transition-colors text-left"
                >
                  {/* Avatar */}
                  <div className="relative flex-shrink-0">
                    <div className={`w-12 h-12 lg:w-14 lg:h-14 rounded-full flex items-center justify-center text-2xl lg:text-3xl
                      ${agent.is_special
                        ? 'bg-gradient-to-br from-amber-500/20 to-orange-600/20 ring-1 ring-amber-500/30'
                        : 'bg-white/[0.06]'}`}>
                      {[...agent.avatar_emoji][0] || '🌍'}
                    </div>
                    {agent.is_online && (
                      <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-[#0c0a09]" />
                    )}
                    {agent.is_special && (
                      <div className="absolute -top-0.5 -right-0.5 text-xs">⭐</div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 overflow-hidden">
                      <span className="font-medium text-sm lg:text-base text-stone-100 truncate flex-shrink-1 min-w-0">
                        {agent.name}
                      </span>
                      <span className="text-[10px] lg:text-[11px] px-1.5 py-0.5 rounded bg-white/[0.06] text-stone-500 uppercase tracking-wider flex-shrink-0">
                        {agent.target_language}
                      </span>
                      {agent.interest_tags?.[0] && (
                        <span className="text-[10px] lg:text-[11px] px-1.5 py-0.5 rounded bg-accent/10 text-accent/70 flex-shrink-0 truncate max-w-[100px] lg:max-w-[160px] hidden sm:inline-block">
                          {agent.interest_tags[0]}
                        </span>
                      )}
                    </div>
                    <p className="text-xs lg:text-sm text-stone-500 mt-0.5 truncate">
                      {agent.interest_tags.join(' · ')}
                    </p>
                  </div>

                  {/* Right side */}
                  <div className="flex-shrink-0 flex flex-col items-end gap-1">
                    <span className="text-[10px] text-stone-600">
                      {formatTime(agent.last_conversation_at || agent.created_at)}
                    </span>
                    {unread > 0 && (
                      <span className="w-5 h-5 rounded-full bg-accent text-[10px] font-bold text-white flex items-center justify-center badge-pulse">
                        {unread}
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        )}
        </div>{/* close lg:max-w-2xl */}
      </div>
    </div>
  )
}