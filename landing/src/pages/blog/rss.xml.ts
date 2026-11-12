import rss from "@astrojs/rss"
import type { APIContext } from "astro"
import { getPosts, postHref } from "../../lib/blog"

export async function GET(context: APIContext) {
  const posts = await getPosts()
  return rss({
    title: "Excaliself blog",
    description: "Notes from the maintainer of Excaliself, self-hosted Excalidraw for teams.",
    site: context.site!,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.date,
      link: postHref(post.id),
    })),
  })
}
