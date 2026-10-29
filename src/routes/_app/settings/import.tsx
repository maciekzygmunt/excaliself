import { createFileRoute } from "@tanstack/react-router"
import { useDocumentTitle } from "@/lib/document-title"
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
      {/* The drop itself lives in the sidebar (use-sidebar-dnd). */}
      <section className="animate-in fade-in-0 duration-200 motion-reduce:animate-none">
        <h2 className="text-sm font-medium text-foreground">Import files</h2>
        <p className="max-w-md text-xs text-muted-foreground">
          Drag .excalidraw files from your computer onto a folder in the
          sidebar, or onto Private or Team. Each file becomes a new drawing
          there. PNG and SVG exports that include the scene work too.
        </p>
      </section>
    </div>
  )
}
