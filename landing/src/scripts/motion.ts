// Page behavior on one clock (GSAP's ticker drives ScrollTrigger and every tween).
//   [data-draw]     rough strokes draw in like a pen when they scroll into view
//   [data-reveal]   blocks rise in once
//   [data-diagram]  the hero sketch: drawings travel into the database as the hero scrolls
// Under reduced motion only the UI wiring runs; CSS shows everything drawn.
import { gsap } from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import type { Route } from "../lib/hero-diagram"

gsap.registerPlugin(ScrollTrigger)

const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches

/* ---------- UI wiring ---------- */

const header = document.querySelector<HTMLElement>("[data-header]")!
ScrollTrigger.create({
  start: 8,
  end: "max",
  onToggle: (self) => document.documentElement.classList.toggle("is-scrolled", self.isActive),
})

// Mobile menu: the rest of the page goes inert while it is open, so focus stays in the menu.
const toggle = document.querySelector<HTMLButtonElement>("[data-menu-toggle]")!
const menu = document.querySelector<HTMLElement>("[data-menu]")!
const outside = [...document.querySelectorAll<HTMLElement>("main, footer")]
function setMenu(open: boolean) {
  toggle.setAttribute("aria-expanded", String(open))
  toggle.querySelector("[data-menu-label]")!.textContent = open ? "Close" : "Menu"
  menu.classList.toggle("is-open", open)
  for (const el of outside) el.inert = open
  header.querySelector("a")!.inert = open
  document.body.style.overflow = open ? "hidden" : ""
}
toggle.addEventListener("click", () => setMenu(toggle.getAttribute("aria-expanded") !== "true"))
menu.addEventListener("click", (e) => {
  if ((e.target as HTMLElement).closest("a")) setMenu(false)
})
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && menu.classList.contains("is-open")) {
    setMenu(false)
    toggle.focus()
  }
})

// Mark the section in view as current in the nav.
for (const link of document.querySelectorAll<HTMLAnchorElement>("[data-nav-links] a")) {
  const section = document.getElementById(link.hash.slice(1))
  if (!section) continue
  ScrollTrigger.create({
    trigger: section,
    start: "top 45%",
    end: "bottom 45%",
    onToggle: (self) => link.setAttribute("aria-current", String(self.isActive)),
  })
}

// Copy the install commands without the prompt marks.
for (const el of document.querySelectorAll<HTMLElement>("[data-terminal]")) {
  const button = el.querySelector<HTMLButtonElement>("[data-copy]")!
  const label = el.querySelector<HTMLElement>("[data-copy-label]")!
  const text = [...el.querySelectorAll("code > span")].map((l) => l.textContent?.replace(/^\$ /, "") ?? "").join("\n")
  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(text)
      label.textContent = "Copied"
    } catch {
      label.textContent = "Select and copy"
    }
    setTimeout(() => (label.textContent = "Copy"), 2000)
  })
}

/* ---------- Motion ---------- */

/** Draw a group's pen strokes in order, then fade in its fills and labels. */
function draw(root: Element, delay = 0) {
  const strokes = root.querySelectorAll(".sk-s")
  const rest = root.querySelectorAll(".sk-f, .sk-t")
  return gsap
    .timeline({ delay })
    .to(strokes, {
      strokeDashoffset: 0,
      duration: 0.7,
      ease: "power2.inOut",
      stagger: { amount: Math.min(1.1, strokes.length * 0.04) },
    })
    .to(rest, { opacity: 1, duration: 0.6, ease: "power3.out", stagger: { amount: 0.5 } }, 0.2)
}

/** Each teammate's drawing follows its route into the database and lands in the next empty slot. */
function journey(svg: SVGSVGElement) {
  const routes: Route[] = JSON.parse(svg.dataset.routes!)
  const cards = [...svg.querySelectorAll<SVGGElement>(".hd-card")]
  const empty = [...svg.querySelectorAll(".hd-slot")].filter((s) => s.getAttribute("opacity") === "0")
  const at = ([x, y]: [number, number]) => ({ x, y })
  const tl = gsap.timeline({ defaults: { ease: "none" } })
  cards.forEach((card, i) => {
    const route = routes[i]
    tl.addLabel(`c${i}`, i * 0.6)
      .to(card, { ...at(route.in), rotation: 0, scale: 0.48, duration: 0.3, ease: "power1.inOut" }, `c${i}`)
      .to(card, { ...at(route.boxIn), scale: 0.34, duration: 0.35 })
      .to(card, { opacity: 0, duration: 0.06 }, "-=0.06")
      .set(card, at(route.boxOut), "+=0.12")
      .to(card, { opacity: 1, duration: 0.06 })
      .to(card, { ...at(route.dbIn), scale: 0.3, duration: 0.3 }, "<")
      .to(card, { ...at(route.dbTop), scale: 0.1, opacity: 0, duration: 0.25, ease: "power1.in" })
      .fromTo(empty[i], { opacity: 0, y: -10 }, { opacity: 1, y: 0, duration: 0.2, ease: "power2.out" }, "-=0.05")
  })
  return tl
}

/** Idle: a small sheet runs the middle route every few seconds, the way each stroke autosaves. */
function autosave(svg: SVGSVGElement) {
  const route: Route = JSON.parse(svg.dataset.routes!)[1]
  const dot = svg.querySelector("[data-packet]")!
  gsap.set(dot, { transformOrigin: "50% 50%" })
  const at = ([x, y]: [number, number]) => ({ x, y })
  const loop = gsap
    .timeline({ repeat: -1, repeatDelay: 1.6, paused: true, delay: 1.2 })
    .set(dot, { ...at(route.in), opacity: 0, scale: 1 })
    .to(dot, { opacity: 1, duration: 0.2 })
    .to(dot, { ...at(route.boxIn), duration: 0.9, ease: "power1.inOut" }, "<")
    .to(dot, { opacity: 0, duration: 0.12 }, "-=0.12")
    .set(dot, at(route.boxOut), "+=0.35")
    .to(dot, { opacity: 1, duration: 0.12 })
    .to(dot, { ...at(route.dbIn), duration: 0.7, ease: "power1.inOut" }, "<")
    .to(dot, { ...at(route.dbTop), scale: 0.3, opacity: 0, duration: 0.45, ease: "power1.in" })
  ScrollTrigger.create({
    trigger: svg,
    start: "top bottom",
    end: "bottom top",
    onToggle: (self) => (self.isActive ? loop.play() : loop.pause()),
  })
}

function hero() {
  const hero = document.querySelector<HTMLElement>("[data-hero]")
  if (!hero) return
  const mm = gsap.matchMedia()
  const setup = (layout: "wide" | "tall", sticky: boolean) => {
    const svg = hero.querySelector<SVGSVGElement>(`[data-diagram="${layout}"]`)!
    gsap.set(svg.querySelectorAll(".hd-card"), { transformOrigin: "50% 50%" })
    draw(svg, 0.15)
    autosave(svg)
    const tl = journey(svg)
    ScrollTrigger.create({
      animation: tl,
      trigger: sticky ? hero : svg,
      start: sticky ? "top top" : "top 70%",
      end: sticky ? "bottom bottom" : "bottom 55%",
      scrub: 0.7,
      invalidateOnRefresh: true,
    })
  }
  mm.add("(min-width: 1024px) and (min-height: 640px)", () => setup("wide", true))
  mm.add("(min-width: 768px) and (not ((min-width: 1024px) and (min-height: 640px)))", () => setup("wide", false))
  mm.add("(max-width: 767px)", () => setup("tall", false))
}

if (!reduced) {
  hero()
  for (const el of document.querySelectorAll("[data-draw]:not([data-diagram])")) {
    const tl = draw(el).pause()
    ScrollTrigger.create({ trigger: el, start: "top 85%", once: true, onEnter: () => tl.play() })
  }
  for (const el of document.querySelectorAll("[data-reveal]")) {
    gsap.fromTo(
      el,
      { opacity: 0, y: 40 },
      { opacity: 1, y: 0, duration: 1.2, ease: "expo.out", scrollTrigger: { trigger: el, start: "top 88%", once: true } },
    )
  }
}
