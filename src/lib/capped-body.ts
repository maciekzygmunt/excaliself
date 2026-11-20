// Caps the bytes read; `content-length` is optional, so a chunked body could
// otherwise stream unbounded into memory.
export async function readCappedBody(
  request: Request,
  maxBytes: number,
): Promise<{ status: "ok"; text: string } | { status: "too-large" | "empty" }> {
  const stream = request.body
  if (!stream) return { status: "empty" }

  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let text = ""
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) return { status: "too-large" }
      text += decoder.decode(value, { stream: true })
    }
  } catch {
    return { status: "empty" }
  } finally {
    await reader.cancel().catch(() => {})
  }
  return { status: "ok", text: text + decoder.decode() }
}
