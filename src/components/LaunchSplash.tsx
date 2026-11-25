"use client";

import { useEffect, useRef, useState } from "react";

// Opening animation: "akli" is written in Playfair Display, then the letters
// close up into the "ak" mark while the dot of the i floats to the top.
// Shown once per app session (see the inline script in layout.tsx, which also
// hides it before first paint on later page loads and on admin/legal pages).

const GREEN = "#063330";
const CREAM = "#F8F4EF";
const FONT_SIZE = 96;

// Geometry of /logo-mark.png (the "ak" without its dot), as fractions of the image.
const LOGO = { w: 150, ratio: 718 / 520, dotX: 0.44766, dotY: 0.05174, dotR: 0.06927, stemTop: 0.25487 };
// Playfair Display: distance from the top of a line box (line-height 1) to the baseline, in em.
const BASELINE_EM = 0.9155;

// Debug only: NEXT_PUBLIC_SPLASH_SLOW=3 plays it three times slower.
const SLOW = Number(process.env.NEXT_PUBLIC_SPLASH_SLOW) || 1;
const t = (n: number) => n * SLOW;

const EASE_OUT = "cubic-bezier(0.22, 0.7, 0.2, 1)";
const EASE_IO = "cubic-bezier(0.65, 0, 0.35, 1)";

export const SPLASH_SEEN_KEY = "akli-splash-seen";

export default function LaunchSplash() {
  const [done, setDone] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const word = useRef<HTMLDivElement>(null);
  const letters = {
    a: useRef<HTMLSpanElement>(null),
    k: useRef<HTMLSpanElement>(null),
    l: useRef<HTMLSpanElement>(null),
    i: useRef<HTMLSpanElement>(null),
  };
  const dot = useRef<HTMLSpanElement>(null);
  const logo = useRef<HTMLDivElement>(null);
  const skip = useRef<() => void>(() => {});

  useEffect(() => {
    const html = document.documentElement;
    let reduce = false;
    try { reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { /* ignore */ }
    if (reduce || html.classList.contains("splash-skip")) { setDone(true); return; }
    try { sessionStorage.setItem(SPLASH_SEEN_KEY, "1"); } catch { /* ignore */ }

    let cancelled = false;
    const anims: Animation[] = [];
    const play = (el: Element | null, frames: Keyframe[], opts: KeyframeAnimationOptions) => {
      if (!el) return null;
      const a = el.animate(frames, { fill: "forwards", ...opts });
      anims.push(a);
      return a;
    };
    const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

    async function fadeOutAndFinish() {
      if (cancelled) return;
      cancelled = true;
      const a = root.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 420, easing: "ease-out", fill: "forwards" });
      if (a) await a.finished.catch(() => {});
      setDone(true);
    }
    skip.current = fadeOutAndFinish;

    async function run() {
      // The brand font comes from Google Fonts; wait for it (but never for long).
      try {
        await Promise.race([
          document.fonts.load(`500 ${FONT_SIZE}px "Playfair Display"`, "aklı"),
          wait(1500),
        ]);
      } catch { /* fall back to the serif stack */ }
      if (cancelled || !stage.current) return;

      const s = stage.current.getBoundingClientRect();
      const rel = (el: HTMLElement) => {
        const r = el.getBoundingClientRect();
        return { left: r.left - s.left, top: r.top - s.top, w: r.width, h: r.height };
      };
      const a = letters.a.current!, k = letters.k.current!, l = letters.l.current!, i = letters.i.current!;
      const ra = rel(a), rk = rel(k), rl = rel(l), ri = rel(i), rLogo = rel(logo.current!);
      const dotEl = dot.current!;
      // Real ink sizes of the glyphs (canvas), so the merged letters can be scaled
      // to match the logo exactly.
      const ctx = document.createElement("canvas").getContext("2d")!;
      ctx.font = `500 ${FONT_SIZE}px "Playfair Display", Georgia, serif`;
      const mA = ctx.measureText("a"), mK = ctx.measureText("k"), mL = ctx.measureText("l");
      const dotSize = 2 * LOGO.dotR * LOGO.w;
      dotEl.style.width = dotEl.style.height = `${dotSize}px`;

      // Where the dot starts (above the i) and where it ends (above the mark's stem).
      const startX = ri.left + ri.w / 2;
      const startY = ri.top + ri.h * 0.2;
      const endX = rLogo.left + LOGO.dotX * rLogo.w;
      const endY = rLogo.top + LOGO.dotY * rLogo.h;
      dotEl.style.left = `${startX}px`;
      dotEl.style.top = `${startY}px`;

      // 1. Write "akli", letter by letter.
      const order: [HTMLElement, number][] = [[a, 150], [k, 380], [l, 610], [i, 840]];
      for (const [el, at] of order) {
        play(el, [
          { opacity: 0, transform: "translateY(16px)", clipPath: "inset(0 100% 0 0)" },
          { opacity: 1, transform: "translateY(0)", clipPath: "inset(0 0% 0 0)" },
        ], { duration: t(560), delay: t(at), easing: EASE_OUT });
      }
      play(dotEl, [
        { opacity: 0, transform: "translate(-50%, -50%) scale(0.1)" },
        { opacity: 1, transform: "translate(-50%, -50%) scale(0.55)" },
      ], { duration: t(360), delay: t(1100), easing: "cubic-bezier(0.34, 1.56, 0.64, 1)" });

      await wait(t(1900));
      if (cancelled) return;

      // 2. Close up: the l slides onto the k's stem, the a tucks in, the i's stem
      //    disappears and its dot floats up to the top of the mark.
      const kStem = rk.left + rk.w * 0.2;
      const lShift = kStem - (rl.left + rl.w / 2);
      const aShift = rk.left + rk.w * 0.06 - (ra.left + ra.w);
      play(l, [{ transform: "translateY(0)" }, { transform: `translate(${lShift}px, 0)` }], { duration: t(750), easing: EASE_IO });
      play(a, [{ transform: "translateY(0)" }, { transform: `translate(${aShift}px, 0)` }], { duration: t(750), easing: EASE_IO });
      play(i, [{ opacity: 1 }, { opacity: 0 }], { duration: t(300), easing: "ease-in" });
      // The dot grows from a typographic i-dot to the logo's dot while it floats up.
      const dotScale0 = 0.55;
      play(dotEl, [
        { left: `${startX}px`, top: `${startY}px`, transform: `translate(-50%, -50%) scale(${dotScale0})` },
        { left: `${endX}px`, top: `${endY}px`, transform: "translate(-50%, -50%) scale(1)" },
      ], { duration: t(850), easing: EASE_IO });

      // The whole word grows and settles onto the logo's footprint.
      const baselineY = ri.top + BASELINE_EM * FONT_SIZE;
      const stemHeight = mL.actualBoundingBoxAscent;
      const scale = ((1 - LOGO.stemTop) * rLogo.h) / stemHeight;
      const inkLeft = ra.left + aShift - mA.actualBoundingBoxLeft;
      const inkRight = rk.left + mK.actualBoundingBoxRight;
      const mergedCx = (inkLeft + inkRight) / 2;
      const targetCx = rLogo.left + rLogo.w / 2;
      const targetBase = rLogo.top + rLogo.h;
      if (word.current) {
        word.current.style.transformOrigin = `${mergedCx}px ${baselineY}px`;
        play(word.current, [
          { transform: "translate(0px, 0px) scale(1)" },
          { transform: `translate(${targetCx - mergedCx}px, ${targetBase - baselineY}px) scale(${scale})` },
        ], { duration: t(900), easing: EASE_IO });
      }

      await wait(t(850));
      if (cancelled) return;

      // 3. Hand over to the real logo.
      play(logo.current, [{ opacity: 0 }, { opacity: 1 }], { duration: t(450), easing: "ease-out" });
      for (const el of [a, k, l]) play(el, [{ opacity: 1 }, { opacity: 0 }], { duration: t(450), easing: "ease-out" });

      await wait(t(450 + 550));
      await fadeOutAndFinish();
    }
    run();

    return () => {
      cancelled = true;
      anims.forEach((x) => x.cancel());
    };
  }, []);

  if (done) return null;

  const letter: React.CSSProperties = { display: "inline-block", opacity: 0, willChange: "transform, opacity" };

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
      <div ref={stage} style={{ position: "relative", width: 340, height: 360 }}>
        <div
          ref={word}
          style={{
            position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 500, fontSize: FONT_SIZE,
            lineHeight: 1, color: CREAM, letterSpacing: "-0.01em", paddingTop: 28,
          }}
        >
          <span ref={letters.a} style={letter}>a</span>
          <span ref={letters.k} style={letter}>k</span>
          <span ref={letters.l} style={letter}>l</span>
          {/* dotless i: its dot is the separate floating circle below */}
          <span ref={letters.i} style={letter}>ı</span>
        </div>
        <div
          ref={logo}
          style={{
            position: "absolute", left: "50%", top: "50%", width: LOGO.w, height: LOGO.w * LOGO.ratio,
            transform: "translate(-50%, -50%)", opacity: 0, background: CREAM,
            WebkitMaskImage: "url(/logo-mark.png)", maskImage: "url(/logo-mark.png)",
            WebkitMaskSize: "100% 100%", maskSize: "100% 100%",
            WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat",
          }}
        />
        <span
          ref={dot}
          style={{
            position: "absolute", borderRadius: "50%", background: CREAM, opacity: 0,
            transform: "translate(-50%, -50%) scale(0.1)",
          }}
        />
      </div>
    </div>
  );
}
