"use client";

import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";

// Opening animation: "akli" is written letter by letter, then the letters close
// up into the "ak" logo while the dot of the i floats to the top.
// The artwork is the brand's own wordmark, cut into one sprite per letter
// (public/splash/*.png, all on the same canvas, so they line up by themselves).
// App only (iPhone/Android) — never on the website. Plays on every fresh launch of the app; the gate
// script in layout.tsx (SPLASH_GATE) decides before first paint and carries the animation across
// the redirects a signed-in launch goes through, until it has played through once.

const GREEN = "#063330";
// Set by the gate script in layout.tsx while a launch's animation has not finished yet.
const PENDING_KEY = "akli-splash-pending";
const clearPending = () => { try { localStorage.removeItem(PENDING_KEY); } catch { /* ignore */ } };

// Geometry of the sprites (px on their 380 x 285 canvas): see public/splash/meta.json.
const G = {
  w: 380,
  h: 285,
  aShift: 52,        // how far the a slides right to meet the k's stem
  kStemCx: 158.5,
  lCx: 286.5,
  iCx: 339.5,
  dotStart: [339.5, 122] as [number, number],
  dotEnd: [159.28, 27.39] as [number, number],
  boxes: {           // x0, x1 of each letter
    a: [22, 131], k: [145, 261], l: [268, 305], i: [321, 358],
  } as Record<string, [number, number]>,
};

// Debug only: NEXT_PUBLIC_SPLASH_SLOW=3 plays it three times slower.
const SLOW = Number(process.env.NEXT_PUBLIC_SPLASH_SLOW) || 1;
const t = (n: number) => n * SLOW;

const EASE_OUT = "cubic-bezier(0.22, 0.7, 0.2, 1)";
const EASE_IO = "cubic-bezier(0.65, 0, 0.35, 1)";

type Part = "a" | "k" | "l" | "istem" | "idot";
const PARTS: Part[] = ["a", "k", "l", "istem", "idot"];

export default function LaunchSplash() {
  const [done, setDone] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const el = useRef<Partial<Record<Part, HTMLImageElement | null>>>({});
  const skip = useRef<() => void>(() => {});

  useEffect(() => {
    const html = document.documentElement;
    // The website never plays it (layout.tsx also hides it before first paint, so there is no flash).
    if (!Capacitor.isNativePlatform()) { setDone(true); return; }
    let reduce = false;
    try { reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { /* ignore */ }
    if (reduce || html.classList.contains("splash-skip")) { clearPending(); setDone(true); return; }
    // The artwork is only fetched here, inside the app — the sprites have no src in the
    // server-rendered page, so the website never downloads them.
    for (const p of PARTS) {
      const img = el.current[p];
      if (img) img.src = `/splash/${p}.png`;
    }

    let cancelled = false;
    const anims: Animation[] = [];
    const play = (target: Element | null | undefined, frames: Keyframe[], opts: KeyframeAnimationOptions) => {
      if (!target) return null;
      const a = target.animate(frames, { fill: "forwards", ...opts });
      anims.push(a);
      return a;
    };
    const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

    async function fadeOutAndFinish() {
      if (cancelled) return;
      cancelled = true;
      const a = root.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 380, easing: "ease-out", fill: "forwards" });
      if (a) await a.finished.catch(() => {});
      clearPending();
      setDone(true);
    }
    skip.current = fadeOutAndFinish;

    async function run() {
      // Wait for the artwork (but never for long: a slow network shouldn't block the app).
      const imgs = PARTS.map((p) => el.current[p]).filter(Boolean) as HTMLImageElement[];
      await Promise.race([Promise.all(imgs.map((i) => i.decode().catch(() => {}))), wait(3000)]);
      if (cancelled || !stage.current) return;

      const f = stage.current.getBoundingClientRect().width / G.w; // canvas px -> screen px
      const px = (n: number) => `${n * f}px`;
      const e = el.current as Record<Part, HTMLImageElement>;

      // 1. Write "akli", letter by letter (each is wiped in from the left).
      const order: [Part, string, number][] = [["a", "a", 150], ["k", "k", 380], ["l", "l", 610], ["istem", "i", 840]];
      for (const [part, box, at] of order) {
        const [x0, x1] = G.boxes[box];
        play(e[part], [
          { opacity: 0, transform: `translateY(${px(10)})`, clipPath: `inset(0 ${100 * (1 - x0 / G.w)}% 0 0)` },
          { opacity: 1, transform: "translateY(0)", clipPath: `inset(0 ${100 * (1 - (x1 + 2) / G.w)}% 0 0)` },
        ], { duration: t(560), delay: t(at), easing: EASE_OUT });
      }
      // The dot of the i pops in last.
      e.idot.style.transformOrigin = `${px(G.dotStart[0])} ${px(G.dotStart[1])}`;
      play(e.idot, [
        { opacity: 0, transform: "scale(0.1)" },
        { opacity: 1, transform: "scale(1)" },
      ], { duration: t(380), delay: t(1100), easing: "cubic-bezier(0.34, 1.56, 0.64, 1)" });

      await wait(t(1700));
      if (cancelled) return;

      // 2. Close up: the a slides against the k's stem, the l and the i's stem
      //    melt into it, and the i's dot floats up to the top of the stem.
      play(e.a, [{ transform: "translateX(0)" }, { transform: `translateX(${px(G.aShift)})` }], { duration: t(800), easing: EASE_IO });
      play(e.l, [
        { opacity: 1, transform: "translateX(0)" },
        { opacity: 0.8, transform: `translateX(${px((G.kStemCx - G.lCx) * 0.5)})`, offset: 0.4 },
        { opacity: 0, transform: `translateX(${px(G.kStemCx - G.lCx)})` },
      ], { duration: t(800), easing: EASE_IO });
      play(e.istem, [
        { opacity: 1, transform: "translateX(0)" },
        { opacity: 0.8, transform: `translateX(${px((G.kStemCx - G.iCx) * 0.5)})`, offset: 0.4 },
        { opacity: 0, transform: `translateX(${px(G.kStemCx - G.iCx)})` },
      ], { duration: t(800), easing: EASE_IO });
      play(e.idot, [
        { transform: "translate(0, 0)" },
        { transform: `translate(${px(G.dotEnd[0] - G.dotStart[0])}, ${px(G.dotEnd[1] - G.dotStart[1])})` },
      ], { duration: t(900), easing: EASE_IO });

      // Done: as soon as the letters have closed into the logo, open the app.
      await wait(t(850));
      await fadeOutAndFinish();
    }
    run();

    return () => {
      cancelled = true;
      anims.forEach((x) => x.cancel());
    };
  }, []);

  if (done) return null;

  const sprite: React.CSSProperties = {
    position: "absolute", left: 0, top: 0, width: "100%", height: "100%",
    opacity: 0, userSelect: "none", pointerEvents: "none", willChange: "transform, opacity",
  };

  return (
    <div
      ref={root}
      className="launch-splash"
      aria-hidden="true"
      onClick={() => skip.current()}
      style={{
        position: "fixed", inset: 0, zIndex: 2147483001, background: GREEN,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div
        ref={stage}
        style={{ position: "relative", width: "min(50vw, 210px)", aspectRatio: `${G.w} / ${G.h}` }}
      >
        {PARTS.map((p) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={p}
            ref={(node) => { el.current[p] = node; }}
            alt=""
            draggable={false}
            style={sprite}
          />
        ))}
      </div>
    </div>
  );
}
