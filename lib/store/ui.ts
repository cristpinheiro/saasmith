import { create } from "zustand"
import type { AiMessage } from "../ai"

type UiStore = {
  pendingChatMessages: AiMessage[] | null
  setPendingChatMessages: (msgs: AiMessage[] | null) => void
}

export const useUiStore = create<UiStore>((set) => ({
  pendingChatMessages: null,
  setPendingChatMessages: (pendingChatMessages) => set({ pendingChatMessages }),
}))
