import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'split-expense::openai-key'

function readStoredKey(): string | null {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return null
  }
  const stored = window.localStorage.getItem(STORAGE_KEY)
  return stored && stored.trim().length > 0 ? stored : null
}

export function useOpenAiApiKey() {
  const [apiKey, setApiKey] = useState<string | null>(() => readStoredKey())

  const saveKey = useCallback((nextKey: string) => {
    const trimmed = nextKey.trim()
    setApiKey(trimmed)
    if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, trimmed)
    }
  }, [])

  const clearKey = useCallback(() => {
    setApiKey(null)
    if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
      window.localStorage.removeItem(STORAGE_KEY)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return
      setApiKey(event.newValue && event.newValue.trim().length > 0 ? event.newValue : null)
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])

  return {
    apiKey,
    saveKey,
    clearKey,
  }
}


