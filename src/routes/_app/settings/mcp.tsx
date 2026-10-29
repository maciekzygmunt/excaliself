import { createFileRoute } from "@tanstack/react-router"
import { useDocumentTitle } from "@/lib/document-title"
import { AccessTokensSection } from "./-components/AccessTokensSection"

// Open to every member: each one connects their own AI client.
export const Route = createFileRoute("/_app/settings/mcp")({
  component: McpPage,
})

function McpPage() {
  useDocumentTitle("MCP", { chrome: true })
  return <AccessTokensSection />
}
