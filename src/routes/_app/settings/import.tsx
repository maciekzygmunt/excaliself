import { createFileRoute } from "@tanstack/react-router"
import { useDocumentTitle } from "@/lib/document-title"
import { ImportFilesSection } from "./-components/ImportFilesSection"
import { ImportSection } from "./-components/ImportSection"

// Open to every member: each one imports their own Excalidraw+ scenes.
export const Route = createFileRoute("/_app/settings/import")({
  component: ImportPage,
})

function ImportPage() {
  useDocumentTitle("Import", { chrome: true })
  return (
    <div className="flex flex-col gap-8">
      <ImportSection />
      <ImportFilesSection />
    </div>
  )
}
