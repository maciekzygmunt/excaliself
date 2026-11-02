import { defineCollection } from "astro:content"
import { glob } from "astro/loaders"
import { z } from "astro/zod"

// Docs pages. Each markdown file is one page; add it to the sidebar in lib/docs.ts.
const docs = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/docs" }),
  schema: z.object({ title: z.string(), description: z.string() }),
})

// Blog posts: release notes and tutorials. Each markdown file is one post at /blog/<file name>/.
const blog = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/blog" }),
  schema: z.object({ title: z.string(), description: z.string(), date: z.coerce.date() }),
})

export const collections = { docs, blog }
