"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { useProjectStore } from "../lib/store/project"
import { useSettingsStore } from "../lib/store/settings"
import { useUiStore } from "../lib/store/ui"
import { sendMessage } from "../lib/ai"
import type { AiMessage, AiResult } from "../lib/ai"

type ChatEntry =
  | { id: string; role: "user"; content: string }
  | { id: string; role: "assistant"; result: AiResult }

type Props = {
  onClose: () => void
}

export default function AiChat({ onClose }: Props) {
  const { project, addModule } = useProjectStore()
  const { apiKey, baseUrl, authToken, model } = useSettingsStore()
  const { pendingChatMessages, setPendingChatMessages } = useUiStore()

  const [entries, setEntries] = useState<ChatEntry[]>(() => {
    if (!pendingChatMessages?.length) return []
    return pendingChatMessages.map((m): ChatEntry => {
      if (m.role === "user") {
        return { id: crypto.randomUUID(), role: "user", content: m.content }
      }
      return { id: crypto.randomUUID(), role: "assistant", result: { type: "text", content: m.content } }
    })
  })
  const [input, setInput] = useState("")
  const [interimTranscript, setInterimTranscript] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [ttsEnabled, setTtsEnabled] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const bottomRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)
  const sendTextRef = useRef<(text: string) => void>(() => {})
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${el.scrollHeight}px`
  }, [input])

  useEffect(() => {
    if (pendingChatMessages) setPendingChatMessages(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [entries, isLoading])

  const speak = useCallback((text: string) => {
    if (!ttsEnabled || !("speechSynthesis" in window)) return
    window.speechSynthesis.cancel()
    const utt = new SpeechSynthesisUtterance(text)
    utt.lang = "pt-BR"
    utt.rate = 1.05
    window.speechSynthesis.speak(utt)
  }, [ttsEnabled])

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop()
    setIsListening(false)
  }, [])

  const startListening = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any
    const SpeechRecognitionCtor = w.SpeechRecognition ?? w.webkitSpeechRecognition
    if (!SpeechRecognitionCtor) {
      setError("Speech recognition not supported in this browser.")
      return
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognition = new SpeechRecognitionCtor() as any
    recognition.lang = "pt-BR"
    recognition.interimResults = true
    recognition.maxAlternatives = 1

    let finalTranscript = ""

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (e: any) => {
      let interim = ""
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t: string = e.results[i][0].transcript
        if (e.results[i].isFinal) finalTranscript += t
        else interim += t
      }
      setInterimTranscript(interim)
    }

    recognition.onerror = () => {
      setIsListening(false)
      setInterimTranscript("")
    }

    recognition.onend = () => {
      setIsListening(false)
      setInterimTranscript("")
      const text = finalTranscript.trim()
      if (text) setInput((prev) => prev ? prev + " " + text : text)
    }

    recognitionRef.current = recognition
    recognition.start()
    setIsListening(true)
  }, [])

  async function sendText(text: string) {
    if (!text || isLoading) return
    if (!apiKey && !authToken) {
      setError("Configure a chave de API do Claude nas configurações do projeto (⚙).")
      return
    }
    if (!project) return

    setError(null)
    setInput("")

    const userEntry: ChatEntry = { id: crypto.randomUUID(), role: "user", content: text }
    setEntries((prev) => [...prev, userEntry])
    setIsLoading(true)

    const history: AiMessage[] = []
    for (const e of [...entries, userEntry]) {
      if (e.role === "user") {
        history.push({ role: "user", content: e.content })
      } else {
        const content = e.result.type === "text" ? e.result.content : e.result.message
        history.push({ role: "assistant", content })
      }
    }

    try {
      const result = await sendMessage(
        history,
        project.name,
        project.roles.map((r) => r.name),
        project.modules.map((m) => m.name),
        apiKey,
        baseUrl || undefined,
        authToken || undefined,
        model || undefined
      )
      setEntries((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", result }])
      const spokenText = result.type === "text" ? result.content : result.message
      speak(spokenText)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { sendTextRef.current = sendText })

  function handleSend() {
    sendText(input.trim())
  }

  return (
    <div className="flex w-80 flex-col border-l border-zinc-800 bg-zinc-950">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <span className="text-sm font-semibold text-zinc-100">AI Assistant</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setTtsEnabled((v) => !v)
              if (ttsEnabled) window.speechSynthesis?.cancel()
            }}
            className={`rounded px-2 py-1 text-xs transition-colors ${
              ttsEnabled ? "text-indigo-400 hover:text-indigo-300" : "text-zinc-600 hover:text-zinc-400"
            }`}
            title={ttsEnabled ? "Disable voice output" : "Enable voice output"}
          >
            {ttsEnabled ? "🔊" : "🔇"}
          </button>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-sm">
            ✕
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
        {entries.length === 0 && (
          <p className="text-center text-xs text-zinc-600 mt-8">
            Descreva um módulo ou faça uma pergunta sobre seu projeto.
          </p>
        )}

        {entries.map((entry) => (
          <div key={entry.id}>
            {entry.role === "user" ? (
              <div className="flex justify-end">
                <div className="max-w-[90%] rounded-2xl rounded-tr-sm bg-indigo-600 px-3 py-2 text-sm text-white">
                  {entry.content}
                </div>
              </div>
            ) : entry.result.type === "text" ? (
              <div className="flex justify-start">
                <div className="max-w-[90%] rounded-2xl rounded-tl-sm bg-zinc-800 px-3 py-2 text-sm text-zinc-100 whitespace-pre-wrap">
                  {entry.result.content}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {entry.result.message && (
                  <div className="flex justify-start">
                    <div className="max-w-[90%] rounded-2xl rounded-tl-sm bg-zinc-800 px-3 py-2 text-sm text-zinc-100">
                      {entry.result.message}
                    </div>
                  </div>
                )}
                {entry.result.modules.map((mod, i) => (
                  <ModuleCard
                    key={i}
                    module={mod}
                    onAdd={() => addModule({ ...mod, id: crypto.randomUUID() })}
                  />
                ))}
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-tl-sm bg-zinc-800 px-3 py-2">
              <span className="flex gap-1">
                <span className="animate-bounce text-zinc-400" style={{ animationDelay: "0ms" }}>·</span>
                <span className="animate-bounce text-zinc-400" style={{ animationDelay: "150ms" }}>·</span>
                <span className="animate-bounce text-zinc-400" style={{ animationDelay: "300ms" }}>·</span>
              </span>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-red-950 border border-red-800 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-zinc-800 px-3 py-3">
        {isListening && (
          <div className="mb-2 flex items-center gap-2 rounded-lg border border-red-800 bg-red-950/40 px-3 py-2">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
            <span className="flex-1 text-xs text-red-300 italic min-h-[1rem]">
              {interimTranscript || "Ouvindo..."}
            </span>
            <button onClick={stopListening} className="text-xs text-red-400 hover:text-red-200">
              parar
            </button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            placeholder="Mensagem..."
            rows={1}
            style={{ maxHeight: "160px", overflowY: "auto" }}
            className="flex-1 resize-none rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-indigo-500"
          />
          <div className="flex flex-col gap-1.5">
            <button
              onClick={isListening ? stopListening : startListening}
              disabled={isLoading}
              className={`rounded-lg p-2 text-sm transition-colors disabled:opacity-40 ${
                isListening
                  ? "bg-red-600 text-white hover:bg-red-500 animate-pulse"
                  : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
              }`}
              title={isListening ? "Parar de ouvir" : "Falar (auto-envia)"}
            >
              🎤
            </button>
            <button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              className="rounded-lg bg-indigo-600 p-2 text-sm text-white transition-colors hover:bg-indigo-500 disabled:opacity-40"
              title="Enviar"
            >
              ↑
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ModuleCard({
  module,
  onAdd,
}: {
  module: Omit<import("../lib/types").Module, "id">
  onAdd: () => void
}) {
  const [added, setAdded] = useState(false)

  function handleAdd() {
    if (added) return
    onAdd()
    setAdded(true)
  }

  return (
    <div className="rounded-lg border border-indigo-800 bg-indigo-950/40 px-3 py-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-indigo-300">{module.name}</span>
        <span className="text-xs text-zinc-500">{module.tableName}</span>
      </div>

      {module.fields.length > 0 && (
        <div className="flex flex-col gap-1">
          {module.fields.slice(0, 5).map((f) => (
            <div key={f.id} className="flex items-center justify-between text-xs">
              <span className="text-zinc-300">{f.name}</span>
              <span className="text-zinc-500 font-mono">
                {typeof f.type === "string" ? f.type : f.type.kind}
              </span>
            </div>
          ))}
          {module.fields.length > 5 && (
            <span className="text-xs text-zinc-600">
              +{module.fields.length - 5} more fields
            </span>
          )}
        </div>
      )}

      <button
        onClick={handleAdd}
        disabled={added}
        className={`mt-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
          added
            ? "bg-zinc-800 text-zinc-500 cursor-default"
            : "bg-indigo-600 text-white hover:bg-indigo-500"
        }`}
      >
        {added ? "Adicionado ✓" : "Adicionar ao projeto"}
      </button>
    </div>
  )
}
