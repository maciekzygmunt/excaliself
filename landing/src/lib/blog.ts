import { getCollection } from "astro:content"

export const author = { name: "Maciej Zygmunt", url: "https://github.com/maciekzygmunt" }

export const postHref = (id: string) => `${import.meta.env.BASE_URL}blog/${id}/`

// Posts, newest first.
export async function getPosts() {
  const posts = await getCollection("blog")
  return posts.sort((a, b) => b.data.date.getTime() - a.data.date.getTime())
}

// "12 November 2026". UTC, so the build machine's time zone cannot shift the day.
export const formatDate = (date: Date) =>
  date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
