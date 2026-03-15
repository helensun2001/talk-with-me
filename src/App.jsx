import { useEffect } from 'react'
import { useAppStore } from './services/store'
import WelcomeScreen from './components/WelcomeScreen'
import CreateAgentScreen from './components/CreateAgentScreen'
import ChatListScreen from './components/ChatListScreen'
import ChatScreen from './components/ChatScreen'
import Notebook from './components/Notebook'

export default function App() {
  const { onboardingStep, user, setUser, setOnboardingStep, setAgents } = useAppStore()

  // Check for existing user on mount
  useEffect(() => {
    const userId = localStorage.getItem('cb_user_id')
    if (userId) {
      // Restore session - skip to chat list
      setUser({ id: userId, native_language: localStorage.getItem('cb_native_lang') || 'en' })
      setOnboardingStep(2)
    }
  }, [])

  // Save native language when user is set
  useEffect(() => {
    if (user?.native_language) {
      localStorage.setItem('cb_native_lang', user.native_language)
    }
  }, [user?.native_language])

  return (
    <div className="h-full w-full relative" style={{ maxHeight: '100dvh' }}>
      <div className="h-full relative overflow-hidden bg-[#0c0a09]">
        {onboardingStep === 0 && <WelcomeScreen />}
        {onboardingStep === 1 && <CreateAgentScreen />}
        {onboardingStep === 2 && <ChatListScreen />}
        {onboardingStep === 3 && <ChatScreen />}
        <Notebook />
      </div>
    </div>
  )
}