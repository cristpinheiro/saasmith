"use client"

import { create } from "zustand"

type SettingsStore = {
  apiKey: string
  authToken: string
  baseUrl: string
  model: string
  setApiKey: (key: string) => void
  setAuthToken: (token: string) => void
  setBaseUrl: (url: string) => void
  setModel: (model: string) => void
}

const STORAGE_KEY = "saasmith_settings"

function loadSettings(): { apiKey: string; authToken: string; baseUrl: string; model: string } {
  if (typeof window === "undefined") return { apiKey: "", authToken: "", baseUrl: "", model: "" }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw
      ? { apiKey: "", authToken: "", baseUrl: "", model: "", ...JSON.parse(raw) }
      : { apiKey: "", authToken: "", baseUrl: "", model: "" }
  } catch {
    return { apiKey: "", authToken: "", baseUrl: "", model: "" }
  }
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  ...loadSettings(),
  setApiKey: (apiKey) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...get(), apiKey }))
    set({ apiKey })
  },
  setAuthToken: (authToken) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...get(), authToken }))
    set({ authToken })
  },
  setBaseUrl: (baseUrl) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...get(), baseUrl }))
    set({ baseUrl })
  },
  setModel: (model) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...get(), model }))
    set({ model })
  },
}))
