import { createFileRoute } from "@tanstack/react-router"
import { useDocumentTitle } from "@/lib/document-title"
import { ImportSection } from "./-components/ImportSection"

// Open to every member: each one imports their own Excalidraw+ scenes.
export const Route = createFileRoute("/_app/settings/import")({
  component: ImportPage,
})

function ImportPage() {
  useDocumentTitle("Import", { chrome: true })
  return <ImportSection />
}
