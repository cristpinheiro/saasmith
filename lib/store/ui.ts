import { create } from "zustand"
import type { AiMessage } from "../ai"

type UiStore = {
  pendingChatMessages: AiMessage[] | null
  chatOpen: boolean
  setPendingChatMessages: (msgs: AiMessage[] | null) => void
  setChatOpen: (open: boolean) => void
}

export const useUiStore = create<UiStore>((set) => ({
  pendingChatMessages: null,
  chatOpen: false,
  setPendingChatMessages: (pendingChatMessages) => set({ pendingChatMessages }),
  setChatOpen: (chatOpen) => set({ chatOpen }),
}))
