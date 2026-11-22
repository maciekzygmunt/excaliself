import { createFileRoute } from "@tanstack/react-router"
import { useDocumentTitle } from "@/lib/document-title"
import { m } from "@/paraglide/messages"
import { ImportFilesSection } from "./-components/ImportFilesSection"
import { ImportSection } from "./-components/ImportSection"

// Open to every member: each one imports their own Excalidraw+ scenes.
export const Route = createFileRoute("/_app/settings/import")({
  component: ImportPage,
})

function ImportPage() {
  useDocumentTitle(m.settings_nav_import(), { chrome: true })
  return (
    <div className="flex flex-col gap-8">
      <ImportSection />
      <ImportFilesSection />
    </div>
  )
}
