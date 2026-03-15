import { create } from 'zustand'

// ─── Persistent learning progress helpers ────────
// Key format: "lp_completed:<messageId>" → JSON array of completed point indices e.g. [0,1,2]
// Key format: "lp_skipped:<messageId>" → JSON array of skipped point indices e.g. [1]

function loadCompletedPoints(messageId) {
  try {
    const raw = localStorage.getItem(`lp_completed:${messageId}`)
    console.log(`[store] loadCompletedPoints("${messageId}") raw:`, raw)
    if (!raw) return new Set()
    return new Set(JSON.parse(raw))
  } catch {
    return new Set()
  }
}

function saveCompletedPoints(messageId, completedSet) {
  try {
    console.log(`[store] saveCompletedPoints("${messageId}"):`, [...completedSet])
    localStorage.setItem(`lp_completed:${messageId}`, JSON.stringify([...completedSet]))
  } catch {}
}

function loadSkippedPoints(messageId) {
  try {
    const raw = localStorage.getItem(`lp_skipped:${messageId}`)
    if (!raw) return new Set()
    return new Set(JSON.parse(raw))
  } catch {
    return new Set()
  }
}

function saveSkippedPoints(messageId, skippedSet) {
  try {
    localStorage.setItem(`lp_skipped:${messageId}`, JSON.stringify([...skippedSet]))
  } catch {}
}

export const useAppStore = create((set, get) => ({
  // ── User ──
  user: null,
  setUser: (user) => set({ user }),

  // ── Onboarding ──
  onboardingStep: 0, // 0=welcome, 1=create-agents, 2=chat-list, 3=chatting
  setOnboardingStep: (step) => set({ onboardingStep: step }),

  // ── Agents ──
  agents: [],
  setAgents: (agents) => set({ agents }),
  addAgents: (newAgents) => set((s) => ({ agents: [...newAgents, ...s.agents] })),

  // ── Active Chat ──
  activeAgentId: null,
  setActiveAgentId: (id) => set({ activeAgentId: id }),
  getActiveAgent: () => {
    const { agents, activeAgentId } = get()
    return agents.find((a) => a.id === activeAgentId) || null
  },

  // ── Messages ──
  messages: [],
  setMessages: (msgs) => set({ messages: msgs }),
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),

  // ── Conversation ──
  activeConversation: null,
  setActiveConversation: (conv) => set({ activeConversation: conv }),

  // ── UI State ──
  isTyping: false,
  setIsTyping: (v) => set({ isTyping: v }),

  // ── Learning lock (must complete or skip learning points before next message) ──
  // pendingMessageId: the message ID whose learning points are currently active
  pendingMessageId: null,
  pendingLearningPoints: [],
  completedPointIds: new Set(),
  skippedPointIds: new Set(),

  // Set pending learning points for a specific message, restoring any saved progress
  setPendingLearningPoints: (points, messageId = null) => {
    const restored = messageId ? loadCompletedPoints(messageId) : new Set()
    const restoredSkipped = messageId ? loadSkippedPoints(messageId) : new Set()
    console.log(`[store] setPendingLearningPoints msgId="${messageId}" points:${points.length} restored:`, [...restored], 'skipped:', [...restoredSkipped])
    set({
      pendingMessageId: messageId,
      pendingLearningPoints: points,
      completedPointIds: restored,
      skippedPointIds: restoredSkipped,
    })
  },

  markPointCompleted: (idx) => set((s) => {
    const newSet = new Set(s.completedPointIds)
    newSet.add(idx)
    console.log(`[store] markPointCompleted(${idx}) msgId="${s.pendingMessageId}" all completed:`, [...newSet])
    if (s.pendingMessageId) {
      saveCompletedPoints(s.pendingMessageId, newSet)
    }
    return { completedPointIds: newSet }
  }),

  markPointSkipped: (idx) => set((s) => {
    const newSkipped = new Set(s.skippedPointIds)
    newSkipped.add(idx)
    // Also add to completedPointIds so isInputLocked treats it as "done"
    const newCompleted = new Set(s.completedPointIds)
    newCompleted.add(idx)
    console.log(`[store] markPointSkipped(${idx}) msgId="${s.pendingMessageId}" skipped:`, [...newSkipped])
    if (s.pendingMessageId) {
      saveCompletedPoints(s.pendingMessageId, newCompleted)
      saveSkippedPoints(s.pendingMessageId, newSkipped)
    }
    return { completedPointIds: newCompleted, skippedPointIds: newSkipped }
  }),

  resetLearningLock: () => {
    console.log('[store] resetLearningLock called')
    set({
      pendingMessageId: null,
      pendingLearningPoints: [],
      completedPointIds: new Set(),
      skippedPointIds: new Set(),
    })
  },

  isInputLocked: () => {
    const { pendingLearningPoints, completedPointIds } = get()
    if (pendingLearningPoints.length === 0) return false
    const locked = !pendingLearningPoints.every((_, i) => completedPointIds.has(i))
    return locked
  },

  // ── Unread counts ──
  unreadCounts: {},
  setUnreadCount: (agentId, count) =>
    set((s) => ({ unreadCounts: { ...s.unreadCounts, [agentId]: count } })),

  // ── Notebook ──
  showNotebook: false,
  setShowNotebook: (v) => set({ showNotebook: v }),

  // ── Agent reply counter (for cooldown) ──
  agentReplyCounts: {},
  incrementReplyCount: (agentId) =>
    set((s) => ({
      agentReplyCounts: {
        ...s.agentReplyCounts,
        [agentId]: (s.agentReplyCounts[agentId] || 0) + 1,
      },
    })),
}))
