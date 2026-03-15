# 🌏 CultureBridge MVP

**Learn languages by chatting about your passions** — K-pop, anime, football, and more.

## Quick Start (5 minutes)

### 1. Prerequisites
- Node.js 18+
- A [Supabase](https://supabase.com) project (free tier works)
- A [Google AI Studio](https://aistudio.google.com/apikey) API key (Gemini)

### 2. Setup Supabase
1. Create a new Supabase project
2. Go to **SQL Editor** and run the contents of `supabase/schema.sql`
3. Go to **Settings → API** and copy your **Project URL** and **anon key**
4. In Supabase dashboard, go to **Database → Realtime** and enable realtime for the `messages` table

### 3. Configure Environment
```bash
cp .env.example .env
```
Edit `.env` with your keys:
```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbG...
VITE_GEMINI_API_KEY=AIza...
```

### 4. Install & Run
```bash
npm install
npm run dev
```
Open http://localhost:3000

---

## Architecture

```
┌─────────────────────────────────────────────┐
│                  Frontend                    │
│          React + Vite + Tailwind             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐    │
│  │ Welcome  │→│  Create  │→│   Chat   │    │
│  │ Screen   │ │  Agents  │ │  Screen  │    │
│  └──────────┘ └──────────┘ └──────────┘    │
│         │            │            │          │
│  ┌──────┴────────────┴────────────┴───────┐ │
│  │         Zustand State Store            │ │
│  └────────────────────────────────────────┘ │
└──────────┬─────────────────────┬────────────┘
           │                     │
    ┌──────▼──────┐     ┌───────▼───────┐
    │  Supabase   │     │  Gemini AI    │
    │  (Backend)  │     │  (LLM API)    │
    │             │     │               │
    │ • Users     │     │ • Agent Gen   │
    │ • Agents    │     │ • Chat Reply  │
    │ • Messages  │     │ • Learn Points│
    │ • Notebook  │     │               │
    │ • Realtime  │     │               │
    └─────────────┘     └───────────────┘
```

## Key Features (MVP)

| Feature | Status |
|---------|--------|
| Welcome + language selection | ✅ |
| Agent creation (2 normal + 1 star) | ✅ |
| Chat with mixed language | ✅ |
| Learning points with TTS/STT | ✅ |
| Pronunciation check (50% gate) | ✅ |
| Notebook for collected items | ✅ |
| Agent cooldown (15 replies) | ✅ |
| Unread message badges | ✅ |
| Realtime message updates | ✅ |
| Agent evolution system | 🔲 P2 |
| Scheduled push messages | 🔲 P2 |
| Internet search for topics | 🔲 P2 |

## Demo Recording Tips

1. **Start fresh**: Clear `cb_user_id` from localStorage
2. **Recommended flow**: English → Learn Korean → Select K-Pop + Gaming → Beginner
3. **Show the loop**: Chat → See learning points → Practice pronunciation → Continue
4. **Open notebook**: Show collected learning items
5. **Create more agents**: Show the "+" button to find more friends

## File Structure

```
src/
├── components/
│   ├── WelcomeScreen.jsx      # Step 1: Value prop + language
│   ├── CreateAgentScreen.jsx   # Step 2: Create chat agents
│   ├── ChatListScreen.jsx      # Chat list (main hub)
│   ├── ChatScreen.jsx          # Step 3: Conversation UI
│   ├── LearningPointCard.jsx   # Interactive learning cards
│   └── Notebook.jsx            # Review collected items
├── services/
│   ├── supabase.js             # Database + realtime
│   ├── gemini.js               # AI + TTS/STT + prompts
│   └── store.js                # Zustand global state
├── App.jsx
├── main.jsx
└── index.css
```

## Tech Stack
- **Frontend**: React 18 + Vite + Tailwind CSS
- **State**: Zustand
- **Backend**: Supabase (PostgreSQL + Realtime)
- **AI**: Google Gemini 2.0 Flash
- **TTS/STT**: Web Speech API (browser-native)
