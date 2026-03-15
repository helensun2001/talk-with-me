import { GoogleGenAI, Modality } from '@google/genai'

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY })

// ─── Centralized model IDs ──────────────────────
const MODEL_CHAT = 'gemini-2.5-flash'
const MODEL_TTS = 'gemini-2.5-flash-preview-tts'
const MODEL_STT = 'gemini-2.5-flash'

const LANGUAGE_NAMES = {
  ko: 'Korean', ja: 'Japanese', pt: 'Portuguese', zh: 'Chinese',
  es: 'Spanish', fr: 'French', de: 'German', it: 'Italian',
  ar: 'Arabic', th: 'Thai', vi: 'Vietnamese', hi: 'Hindi',
  ru: 'Russian', tr: 'Turkish',
}

// Map langCode to a suitable Gemini TTS voice
const VOICE_MAP = {
  ko: 'Kore',
  ja: 'Kore',
  zh: 'Kore',
  en: 'Puck',
  es: 'Puck',
  pt: 'Puck',
  fr: 'Puck',
  de: 'Puck',
  it: 'Puck',
  ar: 'Puck',
  th: 'Kore',
  vi: 'Kore',
  hi: 'Puck',
  ru: 'Puck',
  tr: 'Puck',
}

const PROFICIENCY_CONFIG = {
  beginner:     { ratio: 0.15, types: 'simple vocabulary and very short phrases',     complexity: 'basic greetings, common words, simple nouns and verbs', maxPoints: 2 },
  intermediate: { ratio: 0.30, types: 'vocabulary, phrases, and short sentences',     complexity: 'conversational phrases, idioms, compound sentences', maxPoints: 3 },
  advanced:     { ratio: 0.45, types: 'complex phrases, sentences, and expressions',  complexity: 'nuanced expressions, slang, cultural references, complex grammar', maxPoints: 3 },
}

// ─── Robust JSON parser ──────────────────────────
function parseJsonResponse(raw) {
  if (!raw || typeof raw !== 'string') return null
  let text = raw.trim()
  text = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?\s*```\s*$/i, '').trim()
  try { return JSON.parse(text) } catch {}
  const fb = text.indexOf('{'), lb = text.lastIndexOf('}')
  if (fb !== -1 && lb > fb) { try { return JSON.parse(text.slice(fb, lb + 1)) } catch {} }
  const fb2 = text.indexOf('['), lb2 = text.lastIndexOf(']')
  if (fb2 !== -1 && lb2 > fb2) { try { return JSON.parse(text.slice(fb2, lb2 + 1)) } catch {} }
  console.warn('[parseJsonResponse] failed:', text.slice(0, 200))
  return null
}

// ─── Build system prompt for an agent ────────────
export function buildAgentSystemPrompt(agent, userNativeLang = 'en') {
  const langName = LANGUAGE_NAMES[agent.target_language] || agent.target_language
  const nativeName = LANGUAGE_NAMES[userNativeLang] || userNativeLang
  const prof = PROFICIENCY_CONFIG[agent.proficiency_level] || PROFICIENCY_CONFIG.beginner
  const ratio = Math.round((agent.target_lang_ratio || prof.ratio) * 100)
  const nativeRatio = 100 - ratio

  // Build concrete good/bad examples based on proficiency
  const exampleGood = prof === PROFICIENCY_CONFIG.beginner
    ? `"Hey, have you heard the new album? The 음악 (music) is so good! I've been listening to it all day."`
    : prof === PROFICIENCY_CONFIG.intermediate
      ? `"I went to a 콘서트 (concert) last weekend and the 분위기 (atmosphere) was incredible! Do you go to live shows often?"`
      : `"The 가사 (lyrics) in their latest track really 감동적이에요 (are touching). I think the songwriter drew from 경험 (experience)."`

  const exampleBad = prof === PROFICIENCY_CONFIG.beginner
    ? `"안녕하세요! 오늘 새로운 앨범 들었어요? 음악이 너무 좋아요!"  ← This is WRONG: it's nearly 100% ${langName}. The user cannot understand this.`
    : `"오늘 콘서트에 갔는데 분위기가 정말 좋았어요! 자주 가세요?"  ← This is WRONG: it's nearly 100% ${langName}.`

  return `You are a chat friend with the following identity:
${agent.identity_prompt}

═══ IDENTITY RULES ═══
• Stay in character at ALL times. Your personality, tone, and knowledge must match your identity.
• ${agent.is_special ? 'You are a CELEBRITY / HISTORICAL FIGURE. Use their known mannerisms and worldview.' : 'You are an ORDINARY PERSON. Never claim to be famous. Share everyday stories.'}
• NEVER break character. Discuss ONLY topics related to: ${agent.interest_tags.join(', ')}.

═══ LANGUAGE RATIO — THIS IS THE MOST IMPORTANT RULE ═══

Your message MUST be ${nativeRatio}% ${nativeName} with only ${ratio}% ${langName} words sprinkled in.

THE STRUCTURE OF EVERY MESSAGE:
• The MAIN BODY of your message is written in ${nativeName}.
• You INSERT only 1-${prof.maxPoints} ${langName} words or short phrases INTO the ${nativeName} sentences.
• Each ${langName} word you insert becomes a learning point.
• The user is a ${agent.proficiency_level} learner — they will NOT understand full ${langName} sentences.

✅ CORRECT EXAMPLE:
${exampleGood}
→ Notice: The sentence is mostly ${nativeName}. Only 1-2 ${langName} words appear, embedded naturally.

❌ WRONG EXAMPLE:
${exampleBad}
→ A ${agent.proficiency_level} learner CANNOT read this. NEVER do this.

HARD RULES:
• Count your words: at least ${nativeRatio > 70 ? '7 out of 10' : nativeRatio > 50 ? '6 out of 10' : '5 out of 10'} words MUST be ${nativeName}.
• NEVER write a full sentence in ${langName}. Every sentence must have a ${nativeName} backbone.
• Even if the user writes to you in ${langName}, you MUST reply in mostly ${nativeName} with only a few ${langName} words mixed in.
• If the user asks you to "speak more ${langName}" or "make it harder": add more learning points (up to 3), but do NOT increase the ${langName} ratio.
• This ratio is LOCKED for the entire 8-message session. It does not change.

═══ CONVERSATION STYLE ═══
• Warm, casual, authentic — like texting a friend. 2-4 sentences max. Vary topics within your interests.
• THIS IS AN ONGOING CONVERSATION. Read the chat history carefully before replying.
• NEVER re-introduce yourself or greet the user again after your first message. No "Hey!", "Hi!", "Olá!", "안녕!" or any greeting after message 1.
• Continue naturally from where the conversation left off — respond to what the user just said, ask follow-up questions, share reactions, or bring up a new angle on the topic.
• Act like you've been chatting for a while. Be mid-conversation, not starting fresh each time.

═══ RESPONSE FORMAT (CRITICAL — MUST FOLLOW) ═══
Respond with ONLY a raw JSON object. No markdown, no code fences, no explanation before or after.

{"message":"your chat message — mostly ${nativeName} with ${ratio}% ${langName} words mixed in","learning_points":[{"text":"${langName} word used","type":"vocabulary","translation":"${nativeName} meaning","pronunciation":"romanized guide"}]}

Learning point rules:
• 1-${prof.maxPoints} learning points per message.
• Complexity: ${prof.complexity}. Do NOT exceed or simplify.
• Types: ${prof.types}.
• ${langName} text MUST use actual script/characters (not romanization).
• Every learning point text must appear in your "message" field EXACTLY as written — no quotes, no apostrophes, no parentheses around the ${langName} word itself. Just embed it naturally in the sentence.
• WRONG: "I love '음악' so much" — do NOT wrap learning words in quotes.
• CORRECT: "I love 음악 so much" — the word appears bare in the sentence.
• Output ONLY the raw JSON object.`
}

// ─── Helper: call Gemini chat model ──────────────
async function geminiChat(systemPrompt, history, userMessage) {
  const response = await ai.models.generateContent({
    model: MODEL_CHAT,
    contents: [
      // System instruction as first user context
      ...history,
      { role: 'user', parts: [{ text: userMessage }] },
    ],
    config: {
      systemInstruction: systemPrompt,
    },
  })
  return response.text || ''
}

// ─── Helper: call Gemini with simple prompt ──────
async function geminiGenerate(prompt, systemInstruction = undefined) {
  const config = systemInstruction ? { systemInstruction } : {}
  const response = await ai.models.generateContent({
    model: MODEL_CHAT,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config,
  })
  return response.text || ''
}

// ─── Generate agent identity (3 agents per interest) ─────
export async function generateAgentIdentities(targetLang, interestLabel, proficiency) {
  const langName = LANGUAGE_NAMES[targetLang] || targetLang

  const prompt = `You are building personas for a language learning chat app. Create 3 chat friend personas who are native ${langName} speakers deeply passionate about: "${interestLabel}".

PERSONA 1 — ORDINARY PERSON (young, 20s):
A real, relatable young person from a ${langName}-speaking country who is genuinely obsessed with "${interestLabel}". They have deep knowledge — they follow every trend, know obscure facts, and love discussing details with friends. But they are patient, warm, and never condescending. They explain things simply and get excited when someone new shares their interest. Give them a specific angle (e.g. a producer, a superfan, a player, a collector, a content creator). Give them a distinct speaking style and personality quirks.

PERSONA 2 — ORDINARY PERSON (any age, different from Person 1):
Another real person from a ${langName}-speaking country with a completely different personality and angle on "${interestLabel}". Maybe they are older, or approach the topic from a professional vs hobby perspective. They are knowledgeable, patient, and love mentoring newcomers. They should feel like a totally different person from Persona 1 — different age, different vibe, different speaking style.

PERSONA 3 — SPECIAL CELEBRITY / HISTORICAL FIGURE:
A well-known real celebrity, artist, athlete, historical figure, or iconic fictional character who is strongly associated with "${interestLabel}" and ${langName} culture. This persona MUST speak as if they ARE this person — using their known catchphrases, referencing their real achievements and experiences, embodying their documented personality. They should feel authentic, not generic. Pick someone the user would be thrilled to "chat with".

Return ONLY a raw JSON array (no markdown, no explanation):
[
  {"name":"LocalName","avatar_emoji":"emoji","identity_prompt":"4-5 sentences: who they are, their specific angle on ${interestLabel}, personality, speaking style, what they love to discuss","is_special":false},
  {"name":"LocalName","avatar_emoji":"emoji","identity_prompt":"4-5 sentences: different person, different angle, different vibe","is_special":false},
  {"name":"RealCelebrityName","avatar_emoji":"emoji","identity_prompt":"4-5 sentences: embody this real person — their achievements, personality, way of speaking, what they'd chat about as a friend. Write in first person perspective describing yourself.","is_special":true}
]`

  const text = await geminiGenerate(prompt)
  const parsed = parseJsonResponse(text)
  if (!parsed || !Array.isArray(parsed)) throw new Error('Failed to parse identities')
  return parsed
}

// ─── Generate opening message from agent ─────────
export async function generateOpeningMessage(agent, userNativeLang = 'en') {
  const sysPrompt = buildAgentSystemPrompt(agent, userNativeLang)
  const prompt = `Start a new conversation! Introduce yourself briefly and bring up something exciting about ${agent.interest_tags.join(' or ')}. Mix in some ${LANGUAGE_NAMES[agent.target_language] || agent.target_language}. Keep it short. Output ONLY the JSON object.`

  const text = await geminiGenerate(prompt, sysPrompt)
  const parsed = parseJsonResponse(text)
  return parsed && parsed.message ? parsed : { message: text, learning_points: [] }
}

// ─── Generate conversation reply ─────────────────
export async function generateReply(agent, conversationHistory, userMessage, userNativeLang = 'en', replyNumber = 0, masteredWords = []) {
  const sysPrompt = buildAgentSystemPrompt(agent, userNativeLang)

  // Build Gemini-compatible history
  let rawHistory = conversationHistory.slice(-20).map(msg => ({
    role: msg.sender === 'agent' ? 'model' : 'user',
    parts: [{ text: msg.content }],
  }))

  // Drop leading model messages
  while (rawHistory.length > 0 && rawHistory[0].role === 'model') rawHistory.shift()

  // Merge consecutive same-role entries
  const history = []
  for (const entry of rawHistory) {
    const prev = history[history.length - 1]
    if (prev && prev.role === entry.role) {
      prev.parts[0].text += '\n' + entry.parts[0].text
    } else {
      history.push({ role: entry.role, parts: [{ text: entry.parts[0].text }] })
    }
  }

  // Pop trailing user (goes into sendMessage)
  if (history.length > 0 && history[history.length - 1].role === 'user') history.pop()

  console.log('[generateReply] history roles:', history.map(h => h.role))

  // Build mastered words instruction
  const masteredNote = masteredWords.length > 0
    ? `\nThe user has already mastered these words (practiced 5+ times). Do NOT include any of them as learning points — use NEW words instead: ${masteredWords.join(', ')}`
    : ''

  const enhanced = userMessage + `\n\n[SYSTEM: This is message #${replyNumber} of 8. Continue the conversation naturally — do NOT greet or re-introduce yourself.${masteredNote}\nRespond with ONLY a raw JSON object: {"message":"...","learning_points":[...]}]`

  const response = await ai.models.generateContent({
    model: MODEL_CHAT,
    contents: [...history, { role: 'user', parts: [{ text: enhanced }] }],
    config: { systemInstruction: sysPrompt },
  })

  const text = (response.text || '').trim()
  console.log('[generateReply] raw:', text.slice(0, 300))

  const parsed = parseJsonResponse(text)
  if (parsed && parsed.message) {
    if (!Array.isArray(parsed.learning_points)) parsed.learning_points = []
    return parsed
  }

  console.warn('[generateReply] JSON parse failed, using raw text')
  return { message: text, learning_points: [] }
}

// ─── Generate session summary ────────────────────
export async function generateSessionSummary(agent, allLearningPoints, userNativeLang = 'en') {
  const langName = LANGUAGE_NAMES[agent.target_language] || agent.target_language
  const nativeName = LANGUAGE_NAMES[userNativeLang] || userNativeLang

  const seen = new Set()
  const uniquePoints = []
  for (const lp of allLearningPoints) {
    if (!seen.has(lp.text)) { seen.add(lp.text); uniquePoints.push(lp) }
  }

  const vocabList = uniquePoints.map(lp => `${lp.text} (${lp.translation})`).join(', ')

  const prompt = `Language learning assistant.

Learned ${langName} words: ${vocabList}

Write a SHORT review paragraph (3-5 sentences) using 100% ${langName} that incorporates these words. Grammar for ${agent.proficiency_level}.

IMPORTANT: Return the result as a JSON object with TWO arrays of equal length:
- "target_sentences": array of sentences in ${langName} (one per sentence)
- "native_sentences": array of corresponding ${nativeName} translations (same order, same count)
- "words_used": array of learned words that appear in the paragraph

Example format:
{"target_sentences":["sentence1 in ${langName}","sentence2 in ${langName}"],"native_sentences":["translation1 in ${nativeName}","translation2 in ${nativeName}"],"words_used":["word1","word2"]}

Output ONLY raw JSON. No markdown.`

  const text = await geminiGenerate(prompt)
  const parsed = parseJsonResponse(text)

  if (parsed) {
    // Handle new format (sentence arrays)
    if (parsed.target_sentences?.length > 0) {
      return {
        ...parsed,
        target_paragraph: parsed.target_sentences.join(' '),
        native_translation: (parsed.native_sentences || []).join(' '),
        all_learning_points: uniquePoints,
      }
    }
    // Handle old format (single paragraph strings) — split into sentences
    if (parsed.target_paragraph) {
      const targetSentences = parsed.target_paragraph.split(/(?<=[.!?。！？])\s*/).filter(Boolean)
      const nativeRaw = parsed.native_translation || ''
      const nativeSentences = nativeRaw.split(/(?<=[.!?。！？])\s*/).filter(Boolean)
      return {
        ...parsed,
        target_sentences: targetSentences,
        native_sentences: nativeSentences,
        target_paragraph: parsed.target_paragraph,
        native_translation: nativeRaw,
        all_learning_points: uniquePoints,
      }
    }
  }

  return { target_sentences: [], native_sentences: [], target_paragraph: '', native_translation: '', words_used: [], all_learning_points: uniquePoints }
}

// ═══════════════════════════════════════════════════
//  TTS — Gemini Text-to-Speech API
// ═══════════════════════════════════════════════════

// Create a WAV header for raw PCM data
// Gemini TTS returns raw PCM: signed 16-bit little-endian, 24kHz, mono
function createWavHeader(pcmByteLength, sampleRate = 24000, numChannels = 1, bitsPerSample = 16) {
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8)
  const blockAlign = numChannels * (bitsPerSample / 8)
  const headerSize = 44
  const buffer = new ArrayBuffer(headerSize)
  const view = new DataView(buffer)

  // "RIFF" chunk
  view.setUint32(0, 0x52494646, false)   // "RIFF"
  view.setUint32(4, 36 + pcmByteLength, true) // file size - 8
  view.setUint32(8, 0x57415645, false)   // "WAVE"

  // "fmt " sub-chunk
  view.setUint32(12, 0x666d7420, false)  // "fmt "
  view.setUint32(16, 16, true)           // sub-chunk size (16 for PCM)
  view.setUint16(20, 1, true)            // audio format (1 = PCM)
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitsPerSample, true)

  // "data" sub-chunk
  view.setUint32(36, 0x64617461, false)  // "data"
  view.setUint32(40, pcmByteLength, true)

  return new Uint8Array(buffer)
}

// Parse mimeType like "audio/L16;rate=24000" to extract sample rate & bits
function parseTtsMimeType(mimeType) {
  let sampleRate = 24000
  let bitsPerSample = 16

  if (!mimeType) return { sampleRate, bitsPerSample }

  // Extract L-number for bits (e.g. "audio/L16" → 16)
  const formatMatch = mimeType.match(/audio\/L(\d+)/)
  if (formatMatch) bitsPerSample = parseInt(formatMatch[1], 10)

  // Extract rate parameter (e.g. ";rate=24000")
  const rateMatch = mimeType.match(/rate=(\d+)/)
  if (rateMatch) sampleRate = parseInt(rateMatch[1], 10)

  return { sampleRate, bitsPerSample }
}

let audioContext = null
function getAudioContext() {
  if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)()
  return audioContext
}

export async function speakText(text, langCode) {
  try {
    const voiceName = VOICE_MAP[langCode] || 'Puck'
    console.log(`[TTS] Speaking "${text.slice(0, 40)}..." with voice ${voiceName}`)

    const response = await ai.models.generateContent({
      model: MODEL_TTS,
      contents: [{ parts: [{ text: `Read the following text aloud exactly as written, with natural pronunciation:\n\n${text}` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName }
          }
        }
      }
    })

    // Extract base64 audio from response
    const audioPart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData)
    if (!audioPart?.inlineData?.data) {
      console.warn('[TTS] No audio data in response, falling back')
      return speakTextFallback(text, langCode)
    }

    const base64Audio = audioPart.inlineData.data
    const mimeType = audioPart.inlineData.mimeType || 'audio/L16;rate=24000'
    console.log(`[TTS] Got audio, mimeType: ${mimeType}, base64 length: ${base64Audio.length}`)

    // Decode base64 to raw PCM bytes
    const binaryStr = atob(base64Audio)
    const pcmBytes = new Uint8Array(binaryStr.length)
    for (let i = 0; i < binaryStr.length; i++) pcmBytes[i] = binaryStr.charCodeAt(i)

    // Parse audio parameters from mimeType
    const { sampleRate, bitsPerSample } = parseTtsMimeType(mimeType)

    // Create WAV by prepending header to PCM data
    const wavHeader = createWavHeader(pcmBytes.length, sampleRate, 1, bitsPerSample)
    const wavBytes = new Uint8Array(wavHeader.length + pcmBytes.length)
    wavBytes.set(wavHeader, 0)
    wavBytes.set(pcmBytes, wavHeader.length)

    // Play using Audio element (most reliable cross-browser)
    const blob = new Blob([wavBytes], { type: 'audio/wav' })
    const url = URL.createObjectURL(blob)

    return new Promise((resolve, reject) => {
      const audio = new Audio(url)
      audio.onended = () => { URL.revokeObjectURL(url); resolve() }
      audio.onerror = (e) => { URL.revokeObjectURL(url); reject(e) }
      audio.play().catch(reject)
    })
  } catch (err) {
    console.error('[TTS] Gemini TTS failed, falling back:', err)
    return speakTextFallback(text, langCode)
  }
}

// Browser fallback TTS (in case Gemini TTS fails)
function speakTextFallback(text, langCode) {
  return new Promise((resolve) => {
    const langMap = {
      ko: 'ko-KR', ja: 'ja-JP', pt: 'pt-BR', zh: 'zh-CN',
      es: 'es-ES', fr: 'fr-FR', de: 'de-DE', it: 'it-IT',
      ar: 'ar-SA', th: 'th-TH', vi: 'vi-VN', hi: 'hi-IN',
      ru: 'ru-RU', tr: 'tr-TR', en: 'en-US',
    }
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = langMap[langCode] || langCode
    utterance.rate = 0.85
    utterance.onend = resolve
    utterance.onerror = resolve
    speechSynthesis.speak(utterance)
  })
}

// ═══════════════════════════════════════════════════
//  STT — Gemini Audio Transcription
// ═══════════════════════════════════════════════════

let micPermissionGranted = false

export async function requestMicPermission() {
  if (micPermissionGranted) return true
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    stream.getTracks().forEach(t => t.stop())
    micPermissionGranted = true
    return true
  } catch (err) {
    console.error('Microphone permission denied:', err)
    return false
  }
}

// Start recording and return a controller to stop and get the blob
export function startAudioRecording() {
  return new Promise((resolve, reject) => {
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then((stream) => {
        const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
        const chunks = []

        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data)
        }

        // Promise that resolves when recording stops
        const resultPromise = new Promise((res) => {
          mediaRecorder.onstop = () => {
            stream.getTracks().forEach(t => t.stop())
            const blob = new Blob(chunks, { type: 'audio/webm' })
            res(blob)
          }
        })

        mediaRecorder.start()
        resolve({ mediaRecorder, resultPromise })
      })
      .catch(reject)
  })
}

// Convert audio blob to base64
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result
      const base64 = dataUrl.split(',')[1]
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

// Transcribe audio blob using Gemini
export async function transcribeAudio(audioBlob, targetLanguage) {
  const langName = LANGUAGE_NAMES[targetLanguage] || targetLanguage
  const base64Audio = await blobToBase64(audioBlob)

  console.log(`[STT] Transcribing ${(audioBlob.size / 1024).toFixed(1)}KB audio for ${langName}`)

  const response = await ai.models.generateContent({
    model: MODEL_STT,
    contents: [
      {
        role: 'user',
        parts: [
          { text: `Transcribe this audio exactly into ${langName}. Output ONLY the transcription text, nothing else.` },
          { inlineData: { mimeType: 'audio/webm', data: base64Audio } }
        ]
      }
    ]
  })

  const transcription = (response.text || '').trim()
  console.log(`[STT] Transcription: "${transcription}"`)
  return transcription
}

// ═══════════════════════════════════════════════════
//  Pronunciation similarity check
// ═══════════════════════════════════════════════════

export function checkPronunciationSimilarity(expected, actual) {
  const normalize = (s) => s.toLowerCase().replace(/[^\w\s]/g, '').trim()
  const a = normalize(expected)
  const b = normalize(actual)
  if (a === b) return 1.0
  const bigrams = (str) => {
    const set = new Set()
    for (let i = 0; i < str.length - 1; i++) set.add(str.slice(i, i + 2))
    return set
  }
  const setA = bigrams(a)
  const setB = bigrams(b)
  let intersection = 0
  for (const bi of setA) { if (setB.has(bi)) intersection++ }
  return (2 * intersection) / (setA.size + setB.size) || 0
}