// Give each code block inside [data-copy-code] a copy button.
for (const pre of document.querySelectorAll<HTMLPreElement>("[data-copy-code] pre")) {
  const wrap = document.createElement("div")
  wrap.className = "code-block"
  pre.replaceWith(wrap)
  const button = document.createElement("button")
  button.type = "button"
  button.textContent = "Copy"
  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(pre.textContent ?? "")
      button.textContent = "Copied"
    } catch {
      button.textContent = "Select and copy"
    }
    setTimeout(() => (button.textContent = "Copy"), 2000)
  })
  wrap.append(pre, button)
}
