import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseKey)

// ─── User ────────────────────────────────────────
export async function getOrCreateUser(nativeLang = 'en') {
  // For MVP: store user id in localStorage
  let userId = localStorage.getItem('cb_user_id')
  if (userId) {
    const { data } = await supabase.from('users').select('*').eq('id', userId).single()
    if (data) return data
  }
  const { data, error } = await supabase
    .from('users')
    .insert({ native_language: nativeLang })
    .select()
    .single()
  if (error) throw error
  localStorage.setItem('cb_user_id', data.id)
  return data
}

// ─── Agents ──────────────────────────────────────
export async function getUserAgents(userId) {
  const { data, error } = await supabase
    .from('agents')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function createAgent(agentData) {
  const { data, error } = await supabase
    .from('agents')
    .insert(agentData)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateAgent(agentId, updates) {
  const { data, error } = await supabase
    .from('agents')
    .update(updates)
    .eq('id', agentId)
    .select()
    .single()
  if (error) throw error
  return data
}

// ─── Conversations ───────────────────────────────
export async function getOrCreateConversation(agentId, userId) {
  // Look for active conversation
  const { data: existing } = await supabase
    .from('conversations')
    .select('*')
    .eq('agent_id', agentId)
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('started_at', { ascending: false })
    .limit(1)
    .single()

  if (existing) return existing

  const { data, error } = await supabase
    .from('conversations')
    .insert({ agent_id: agentId, user_id: userId })
    .select()
    .single()
  if (error) throw error
  return data
}

// ─── Messages ────────────────────────────────────
export async function getMessages(conversationId, limit = 50) {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(limit)
  if (error) throw error
  return data || []
}

export async function sendMessage(conversationId, sender, content, learningPoints = []) {
  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender,
      content,
      learning_points: learningPoints,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function markMessagesRead(conversationId) {
  await supabase
    .from('messages')
    .update({ is_read: true })
    .eq('conversation_id', conversationId)
    .eq('sender', 'agent')
    .eq('is_read', false)
}

export async function getUnreadCount(agentId, userId) {
  const { data: convs } = await supabase
    .from('conversations')
    .select('id')
    .eq('agent_id', agentId)
    .eq('user_id', userId)

  if (!convs?.length) return 0

  const convIds = convs.map(c => c.id)
  const { count } = await supabase
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .in('conversation_id', convIds)
    .eq('sender', 'agent')
    .eq('is_read', false)

  return count || 0
}

// ─── Notebook ────────────────────────────────────

// Upsert: if same word exists for this user+language, increment encounter_count
export async function addToNotebook(entry) {
  // First check if this word already exists
  const { data: existing } = await supabase
    .from('notebook')
    .select('id, encounter_count')
    .eq('user_id', entry.user_id)
    .eq('target_language', entry.target_language)
    .eq('text', entry.text)
    .maybeSingle()

  if (existing) {
    // Word already exists — increment encounter_count
    const newCount = (existing.encounter_count || 1) + 1
    const { data, error } = await supabase
      .from('notebook')
      .update({
        encounter_count: newCount,
        mastered: newCount >= 5,
        context: entry.context,       // update context to latest
        agent_id: entry.agent_id,     // update to latest agent
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select()
      .single()
    if (error) throw error
    return data
  } else {
    // New word — insert
    const { data, error } = await supabase
      .from('notebook')
      .insert({
        ...entry,
        encounter_count: 1,
        mastered: false,
      })
      .select()
      .single()
    if (error) throw error
    return data
  }
}

// Get words the user has already mastered (encountered >= 5 times)
export async function getMasteredWords(userId, targetLanguage) {
  const { data, error } = await supabase
    .from('notebook')
    .select('text, encounter_count')
    .eq('user_id', userId)
    .eq('target_language', targetLanguage)
    .gte('encounter_count', 5)
  if (error) throw error
  return (data || []).map(d => d.text)
}

export async function getNotebook(userId, targetLanguage = null) {
  let query = supabase
    .from('notebook')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (targetLanguage) {
    query = query.eq('target_language', targetLanguage)
  }
  const { data, error } = await query
  if (error) throw error
  return data || []
}

// ─── Realtime subscription for new messages ──────
export function subscribeToMessages(conversationId, callback) {
  const channel = supabase
    .channel(`messages:${conversationId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => callback(payload.new)
    )
    .subscribe()

  return () => supabase.removeChannel(channel)
}