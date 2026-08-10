"use client"

import { useState } from "react"
import { useProjectStore } from "../lib/store/project"
import WelcomeScreen from "../components/WelcomeScreen"
import Header from "../components/Header"
import Sidebar from "../components/Sidebar"
import ModuleDetail from "../components/ModuleDetail"
import CreateModuleModal from "../components/CreateModuleModal"
import ProjectSettingsModal from "../components/ProjectSettingsModal"

export default function Home() {
  const project = useProjectStore((s) => s.project)
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  if (!project) return <WelcomeScreen />

  const selectedModule = project.modules.find((m) => m.id === selectedModuleId)

  return (
    <div className="flex h-full flex-col">
      <Header onOpenSettings={() => setShowSettings(true)} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          selectedModuleId={selectedModuleId}
          onSelect={setSelectedModuleId}
          onAdd={() => setShowCreateModal(true)}
        />
        <main className="flex flex-1 overflow-hidden">
          {selectedModuleId ? (
            <ModuleDetail
              moduleId={selectedModuleId}
              onEdit={() => setShowEditModal(true)}
              onDelete={() => setSelectedModuleId(null)}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-zinc-600">
              Select a module or create a new one
            </div>
          )}
        </main>
      </div>

      {showCreateModal && (
        <CreateModuleModal onClose={() => setShowCreateModal(false)} />
      )}

      {showEditModal && selectedModule && (
        <CreateModuleModal
          initialModule={selectedModule}
          onClose={() => setShowEditModal(false)}
        />
      )}

      {showSettings && (
        <ProjectSettingsModal onClose={() => setShowSettings(false)} />
      )}
    </div>
  )
}
