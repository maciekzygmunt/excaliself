import { TanStackDevtools } from "@tanstack/react-devtools"
import type { QueryClient } from "@tanstack/react-query"
import { ReactQueryDevtoolsPanel } from "@tanstack/react-query-devtools"
import {
  createRootRouteWithContext,
  HeadContent,
  Scripts,
} from "@tanstack/react-router"
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools"
import { createServerFn } from "@tanstack/react-start"
import { getRequest } from "@tanstack/react-start/server"
import { Toaster } from "@/components/ui/sonner"
import { env } from "@/env"
import { PRODUCT_NAME, TAGLINE } from "@/lib/document-title"
import { resolveOrigin } from "@/lib/site-origin"
import { THEME_COLORS, themeBootstrapScript } from "@/lib/theme"
import appCss from "../styles.css?url"

interface MyRouterContext {
  queryClient: QueryClient
}

const getSiteOrigin = createServerFn({ method: "GET" }).handler(async () => {
  const request = getRequest()
  return resolveOrigin({
    baseUrl: env.BASE_URL,
    headers: request.headers,
    requestUrl: request.url,
  })
})

export const Route = createRootRouteWithContext<MyRouterContext>()({
  // Crawlers only see the SSR pass, where the origin comes from the request;
  // on the client the loader stays local so navigations never RPC for it.
  loader: async () => {
    if (typeof window !== "undefined") {
      return { origin: window.location.origin }
    }
    return { origin: await getSiteOrigin() }
  },
  head: ({ loaderData }) => {
    // og:image must be absolute to resolve in link previews (spec §1).
    const ogImage = `${loaderData?.origin ?? ""}/og.png`
    return {
      meta: [
        {
          charSet: "utf-8",
        },
        {
          name: "viewport",
          content: "width=device-width, initial-scale=1",
        },
        {
          name: "theme-color",
          content: THEME_COLORS.light,
        },
        {
          title: PRODUCT_NAME,
        },
        {
          name: "description",
          content: TAGLINE,
        },
        {
          property: "og:type",
          content: "website",
        },
        {
          property: "og:site_name",
          content: PRODUCT_NAME,
        },
        {
          property: "og:title",
          content: PRODUCT_NAME,
        },
        {
          property: "og:description",
          content: TAGLINE,
        },
        {
          property: "og:image",
          content: ogImage,
        },
        {
          property: "og:image:width",
          content: "1200",
        },
        {
          property: "og:image:height",
          content: "630",
        },
        {
          name: "twitter:card",
          content: "summary_large_image",
        },
        {
          name: "twitter:title",
          content: PRODUCT_NAME,
        },
        {
          name: "twitter:description",
          content: TAGLINE,
        },
        {
          name: "twitter:image",
          content: ogImage,
        },
      ],
      links: [
        {
          rel: "icon",
          href: "/favicon.ico",
          sizes: "48x48",
        },
        {
          rel: "icon",
          type: "image/svg+xml",
          href: "/favicon.svg",
        },
        {
          rel: "manifest",
          href: "/manifest.json",
        },
        // Fonts are self-hosted (@fontsource, bundled into appCss) — a
        // self-hosted product must not phone a font CDN at runtime.
        {
          rel: "stylesheet",
          href: appCss,
        },
      ],
    }
  },
  errorComponent: () => (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10 text-lg text-destructive">
          !
        </div>
        <p className="text-sm text-foreground">Something went wrong</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Please try refreshing the page
        </p>
      </div>
    </div>
  ),
  notFoundComponent: () => (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-lg text-muted-foreground">
          ?
        </div>
        <p className="text-sm text-foreground">Page not found</p>
        <p className="mt-1 text-xs text-muted-foreground">
          The page you're looking for doesn't exist
        </p>
      </div>
    </div>
  ),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    // The bootstrap script may add .dark before hydration; the class is
    // client-only state, so the mismatch with the SSR'd markup is expected.
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
        {/* After HeadContent so the theme-color meta it renders already
            exists; blocks parsing, so the theme is set before first paint. */}
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: static theme bootstrap, no user input
          dangerouslySetInnerHTML={{ __html: themeBootstrapScript }}
        />
      </head>
      <body className="min-h-screen bg-background font-sans antialiased">
        {children}
        <Toaster />
        <TanStackDevtools
          config={{
            position: "bottom-right",
          }}
          plugins={[
            {
              name: "Tanstack Router",
              render: <TanStackRouterDevtoolsPanel />,
            },
            {
              name: "Tanstack Query",
              render: <ReactQueryDevtoolsPanel />,
            },
          ]}
        />
        <Scripts />
      </body>
    </html>
  )
}
