"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { useProjectStore } from "../lib/store/project"
import { useSettingsStore } from "../lib/store/settings"
import { useUiStore } from "../lib/store/ui"
import { sendSetupMessage } from "../lib/ai"
import type { SetupResult, AiMessage } from "../lib/ai"
import type { Module, Role } from "../lib/types"

type Step = "landing" | "name" | "chat"
type ChatEntry =
  | { id: string; role: "user"; content: string }
  | { id: string; role: "assistant"; result: SetupResult }

export default function WelcomeScreen() {
  const { newProject, openProject } = useProjectStore()
  const { apiKey, authToken, baseUrl, model, setApiKey, setAuthToken } = useSettingsStore()
  const { setPendingChatMessages } = useUiStore()

  const [step, setStep] = useState<Step>("landing")
  const [projectName, setProjectName] = useState("")
  const [entries, setEntries] = useState<ChatEntry[]>([])
  const [input, setInput] = useState("")
  const [interimTranscript, setInterimTranscript] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [inlineKey, setInlineKey] = useState("")
  const [inlineToken, setInlineToken] = useState("")
  const [readyToOpen, setReadyToOpen] = useState<{
    roles: Omit<Role, "id">[]
    modules: Omit<Module, "id">[]
  } | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${el.scrollHeight}px`
  }, [input])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [entries, isLoading])

  const hasCredentials = !!(apiKey || authToken)

  async function startChat(name: string) {
    setStep("chat")
    setIsLoading(true)
    setError(null)
    try {
      const result = await sendSetupMessage([], name, apiKey, baseUrl, authToken, model)
      setEntries([{ id: crypto.randomUUID(), role: "assistant", result }])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsLoading(false)
    }
  }

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop()
    setIsListening(false)
    setInterimTranscript("")
  }, [])

  const startListening = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any
    const SpeechRecognitionCtor = w.SpeechRecognition ?? w.webkitSpeechRecognition
    if (!SpeechRecognitionCtor) { setError("Speech recognition not supported."); return }

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
    recognition.onerror = () => { setIsListening(false); setInterimTranscript("") }
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
    setError(null)
    setInput("")

    const userEntry: ChatEntry = { id: crypto.randomUUID(), role: "user", content: text }
    const nextEntries = [...entries, userEntry]
    setEntries(nextEntries)
    setIsLoading(true)

    const history: { role: "user" | "assistant"; content: string }[] = nextEntries.map((e) =>
      e.role === "user"
        ? { role: "user", content: e.content }
        : { role: "assistant", content: e.result.type === "text" ? e.result.content : e.result.message }
    )

    try {
      const result = await sendSetupMessage(history, projectName, apiKey, baseUrl, authToken, model)
      setEntries((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", result }])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsLoading(false)
    }
  }

  function handleSend() { sendText(input.trim()) }

  function handleConfirm(roles: Omit<Role, "id">[], modules: Omit<Module, "id">[], currentEntries: ChatEntry[]) {
    const roleList = roles.map((r) => r.name).join(", ")
    const moduleList = modules.map((m) => m.name).join(", ")
    const summary =
      `Projeto configurado! ${roles.length} role${roles.length !== 1 ? "s" : ""} (${roleList}) e ` +
      `${modules.length} módulo${modules.length !== 1 ? "s" : ""} (${moduleList}) prontos. ` +
      `Você pode expandir qualquer módulo ou pedir ajustes ao assistente no projeto.`

    const summaryEntry: ChatEntry = {
      id: crypto.randomUUID(),
      role: "assistant",
      result: { type: "text", content: summary },
    }
    setEntries([...currentEntries, summaryEntry])
    setReadyToOpen({ roles, modules })
  }

  function doOpenProject() {
    if (!readyToOpen) return
    const allEntries = entries
    const history: AiMessage[] = []
    for (const e of allEntries) {
      if (e.role === "user") {
        history.push({ role: "user", content: e.content })
      } else {
        const content = e.result.type === "text" ? e.result.content : e.result.message
        if (content) history.push({ role: "assistant", content })
      }
    }
    setPendingChatMessages(history)
    const builtRoles: Role[] = readyToOpen.roles.map((r) => ({ id: crypto.randomUUID(), name: r.name }))
    const builtModules: Module[] = readyToOpen.modules.map((m) => ({ ...m, id: crypto.randomUUID() }))
    newProject(projectName.trim(), builtRoles, builtModules)
  }

  function saveInlineCredentials() {
    if (inlineToken.trim()) setAuthToken(inlineToken.trim())
    else if (inlineKey.trim()) setApiKey(inlineKey.trim())
  }

  if (step === "landing") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight text-zinc-100">SaaSMith</h1>
          <p className="mt-2 text-zinc-500">SaaS development harness</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setStep("name")}
            className="rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-indigo-500"
          >
            New Project
          </button>
          <button
            onClick={openProject}
            className="rounded-lg border border-zinc-700 px-6 py-2.5 text-sm font-medium text-zinc-300 hover:border-zinc-500 hover:text-zinc-100"
          >
            Open Project
          </button>
        </div>
      </div>
    )
  }

  if (step === "name") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-zinc-100">New Project</h2>
          <p className="mt-1 text-sm text-zinc-500">Give your project a name to get started</p>
        </div>
        <div className="flex w-80 flex-col gap-3">
          <input
            autoFocus
            type="text"
            placeholder="Project name"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && projectName.trim() && startChat(projectName.trim())}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-indigo-500"
          />
          <div className="flex gap-2">
            <button
              onClick={() => setStep("landing")}
              className="rounded-lg border border-zinc-700 px-4 py-2.5 text-sm text-zinc-400 hover:text-zinc-100"
            >
              Back
            </button>
            <button
              onClick={() => projectName.trim() && startChat(projectName.trim())}
              disabled={!projectName.trim()}
              className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
            >
              Start with AI →
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Chat step
  return (
    <div className="flex h-full flex-col items-center">
      <div className="flex w-full max-w-2xl flex-1 flex-col overflow-hidden py-6 px-4">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">{projectName}</h2>
            <p className="text-xs text-zinc-500">Describe your system to the AI</p>
          </div>
          <button
            onClick={() => { setStep("name"); setEntries([]) }}
            className="text-xs text-zinc-600 hover:text-zinc-400"
          >
            ← back
          </button>
        </div>

        {/* API key inline setup */}
        {!hasCredentials && (
          <div className="mb-4 rounded-lg border border-amber-800 bg-amber-950/40 p-3 flex flex-col gap-2">
            <p className="text-xs text-amber-300">Configure your Claude credentials to use the AI assistant.</p>
            <div className="flex gap-2">
              <input
                type="password"
                placeholder="API Key (sk-ant-...)"
                value={inlineKey}
                onChange={(e) => setInlineKey(e.target.value)}
                className="flex-1 rounded border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-100 placeholder-zinc-600 outline-none focus:border-indigo-500 font-mono"
              />
              <span className="text-xs text-zinc-600 self-center">or</span>
              <input
                type="password"
                placeholder="Auth Token (UUID)"
                value={inlineToken}
                onChange={(e) => setInlineToken(e.target.value)}
                className="flex-1 rounded border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-100 placeholder-zinc-600 outline-none focus:border-indigo-500 font-mono"
              />
              <button
                onClick={() => { saveInlineCredentials(); startChat(projectName) }}
                disabled={!inlineKey.trim() && !inlineToken.trim()}
                className="rounded bg-indigo-600 px-3 text-xs text-white hover:bg-indigo-500 disabled:opacity-40"
              >
                Save & Start
              </button>
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto flex flex-col gap-3 pr-1">
          {entries.map((entry) => (
            <div key={entry.id}>
              {entry.role === "user" ? (
                <div className="flex justify-end">
                  <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-indigo-600 px-3 py-2 text-sm text-white">
                    {entry.content}
                  </div>
                </div>
              ) : entry.result.type === "text" ? (
                <div className="flex justify-start">
                  <div className="max-w-[80%] rounded-2xl rounded-tl-sm bg-zinc-800 px-3 py-2 text-sm text-zinc-100 whitespace-pre-wrap">
                    {entry.result.content}
                  </div>
                </div>
              ) : (
                <ProposalCard result={entry.result} onConfirm={(roles, modules) => handleConfirm(roles, modules, entries)} />
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
        <div className="mt-3 flex flex-col gap-2">
          {readyToOpen ? (
            <button
              onClick={doOpenProject}
              className="w-full rounded-lg bg-indigo-600 py-3 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
            >
              Abrir Projeto →
            </button>
          ) : (
            <>
              {isListening && (
                <div className="flex items-center gap-2 rounded-lg border border-red-800 bg-red-950/40 px-3 py-2">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
                  <span className="flex-1 text-xs text-red-300 italic min-h-[1rem]">
                    {interimTranscript || "Ouvindo..."}
                  </span>
                  <button onClick={stopListening} className="text-xs text-red-400 hover:text-red-200">parar</button>
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
                  placeholder="Descreva seu sistema..."
                  rows={1}
                  style={{ maxHeight: "160px", overflowY: "auto" }}
                  disabled={!hasCredentials}
                  className="flex-1 resize-none rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-indigo-500 disabled:opacity-40"
                />
                <div className="flex flex-col gap-1.5">
                  <button
                    onClick={isListening ? stopListening : startListening}
                    disabled={isLoading || !hasCredentials}
                    className={`rounded-lg p-2 text-sm transition-colors disabled:opacity-40 ${
                      isListening
                        ? "bg-red-600 text-white hover:bg-red-500 animate-pulse"
                        : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
                    }`}
                    title={isListening ? "Parar" : "Falar"}
                  >
                    🎤
                  </button>
                  <button
                    onClick={handleSend}
                    disabled={!input.trim() || isLoading || !hasCredentials}
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-500 disabled:opacity-40"
                  >
                    ↑
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function ProposalCard({
  result,
  onConfirm,
}: {
  result: SetupResult & { type: "proposal" }
  onConfirm: (roles: Omit<Role, "id">[], modules: Omit<Module, "id">[]) => void
}) {
  const [confirmed, setConfirmed] = useState(false)

  function handleConfirm() {
    if (confirmed) return
    setConfirmed(true)
    onConfirm(result.roles, result.modules)
  }

  return (
    <div className="flex flex-col gap-3">
      {result.message && (
        <div className="flex justify-start">
          <div className="max-w-[80%] rounded-2xl rounded-tl-sm bg-zinc-800 px-3 py-2 text-sm text-zinc-100">
            {result.message}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-indigo-800 bg-indigo-950/30 p-4 flex flex-col gap-4">
        {result.summary && (
          <p className="text-xs text-zinc-400 italic">{result.summary}</p>
        )}

        {/* Roles */}
        <div>
          <h4 className="text-xs font-medium uppercase tracking-wider text-zinc-500 mb-2">
            Roles ({result.roles.length})
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {result.roles.map((r, i) => (
              <span key={i} className="rounded-full bg-zinc-800 px-2.5 py-0.5 text-xs text-zinc-300 border border-zinc-700">
                {r.name}
              </span>
            ))}
          </div>
        </div>

        {/* Modules */}
        <div>
          <h4 className="text-xs font-medium uppercase tracking-wider text-zinc-500 mb-2">
            Modules ({result.modules.length})
          </h4>
          <div className="flex flex-col gap-2">
            {result.modules.map((m, i) => (
              <div key={i} className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-zinc-200">{m.name}</span>
                  <span className="text-xs text-zinc-600 font-mono">{m.tableName}</span>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                  {m.fields.slice(0, 6).map((f) => (
                    <span key={f.id} className="text-xs text-zinc-500">
                      {f.name}: <span className="text-zinc-600">
                        {typeof f.type === "string" ? f.type : f.type.kind}
                      </span>
                    </span>
                  ))}
                  {m.fields.length > 6 && (
                    <span className="text-xs text-zinc-700">+{m.fields.length - 6} more</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={handleConfirm}
          disabled={confirmed}
          className={`rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
            confirmed
              ? "bg-zinc-800 text-zinc-500 cursor-default"
              : "bg-indigo-600 text-white hover:bg-indigo-500"
          }`}
        >
          {confirmed ? "Projeto criado ✓" : "Confirmar e criar projeto"}
        </button>
      </div>
    </div>
  )
}
