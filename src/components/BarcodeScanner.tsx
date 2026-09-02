"use client";

import { useEffect, useRef, useState } from "react";
import { IconX } from "@tabler/icons-react";
import { track } from "@/lib/analytics";

const C = {
  primary: "#063330",
  teal: "#67b1b0",
  error: "#c0392b",
  white: "#ffffff",
};

// Tips shown in rotation once scanning has been going a few seconds without
// a hit — the "why isn't this working" moment is exactly when guidance
// actually helps, not before.
const STRUGGLE_TIPS = [
  "Move a little closer",
  "Make sure there's enough light",
  "Turn the barcode to face the camera directly",
  "Hold your phone steady",
];

// Redraws the current video frame onto `canvas`, rotated by the given angle
// — this is what lets a barcode held sideways or upside down still decode.
// zxing's own continuous decoder only ever reads the frame as captured, so
// this runs as a slower supplementary check alongside it. Downscaled for
// speed: barcode/QR decoding doesn't need full resolution, and this runs
// up to 3x per tick.
function drawRotatedFrame(video: HTMLVideoElement, angleDeg: 90 | 180 | 270, canvas: HTMLCanvasElement) {
  const MAX_DIM = 720;
  const vw = video.videoWidth, vh = video.videoHeight;
  const scale = Math.min(1, MAX_DIM / Math.max(vw, vh));
  const w = Math.round(vw * scale), h = Math.round(vh * scale);

  const swap = angleDeg === 90 || angleDeg === 270;
  canvas.width = swap ? h : w;
  canvas.height = swap ? w : h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  if (angleDeg === 90) { ctx.translate(h, 0); ctx.rotate(Math.PI / 2); }
  else if (angleDeg === 180) { ctx.translate(w, h); ctx.rotate(Math.PI); }
  else { ctx.translate(0, w); ctx.rotate(-Math.PI / 2); }
  ctx.drawImage(video, 0, 0, w, h);
  return canvas;
}

export default function BarcodeScanner({
  onDetected,
  onClose,
}: {
  onDetected: (barcode: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"starting" | "scanning">("starting");
  const [tipIndex, setTipIndex] = useState<number | null>(null);
  const detectedRef = useRef(false);

  useEffect(() => {
    let controls: { stop: () => void } | null = null;
    let cancelled = false;
    let rotationTimer: ReturnType<typeof setInterval> | null = null;
    let struggleTimer: ReturnType<typeof setTimeout> | null = null;
    let tipRotator: ReturnType<typeof setInterval> | null = null;

    function handleResult(result: { getText: () => string } | undefined) {
      if (result && !detectedRef.current) {
        detectedRef.current = true;
        // Vibrate on successful scan where supported — quiet feedback, no
        // sound needed.
        if (navigator.vibrate) navigator.vibrate(80);
        onDetected(result.getText());
      }
    }

    (async () => {
      try {
        // Dynamic import — this is a browser-only library (getUserMedia),
        // it can't load during SSR/build.
        const [{ BrowserMultiFormatReader, BarcodeFormat }, { DecodeHintType }] = await Promise.all([
          import("@zxing/browser"),
          import("@zxing/library"),
        ]);

        // Restricting formats to what groceries actually use (plus QR, in
        // case Akli ever prints its own) skips wasted decode attempts every
        // frame — that alone is most of "faster". TRY_HARDER adds extra
        // scanlines and tries the image reversed.
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13, BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
          BarcodeFormat.CODE_128, BarcodeFormat.QR_CODE,
        ]);
        hints.set(DecodeHintType.TRY_HARDER, true);

        const reader = new BrowserMultiFormatReader(hints);
        if (cancelled || !videoRef.current) return;

        controls = await reader.decodeFromConstraints(
          {
            video: {
              facingMode: "environment",
              // Higher resolution gives the decoder more to work with at a
              // distance or off-angle; browsers fall back gracefully if the
              // camera can't hit this.
              width: { ideal: 1920 }, height: { ideal: 1080 },
              frameRate: { ideal: 30 },
            },
          },
          videoRef.current,
          handleResult
        );
        if (cancelled) { controls.stop(); return; }
        setPhase("scanning");

        // Supplementary rotation pass — a barcode held sideways or upside
        // down never crosses zxing's own horizontal scanlines correctly,
        // no matter how good TRY_HARDER's tolerance for a slight tilt is.
        // This periodically re-checks the same frame rotated 90/180/270.
        const rotationCanvas = document.createElement("canvas");
        let rotationIndex = 0;
        const rotations: (90 | 180 | 270)[] = [90, 180, 270];
        rotationTimer = setInterval(() => {
          if (detectedRef.current || cancelled || !videoRef.current || videoRef.current.readyState < 2) return;
          const angle = rotations[rotationIndex % rotations.length];
          rotationIndex++;
          try {
            const canvas = drawRotatedFrame(videoRef.current, angle, rotationCanvas);
            const result = reader.decodeFromCanvas(canvas);
            handleResult(result);
          } catch {
            // No code found at this rotation — expected on most attempts.
          }
        }, 350);

        // Guidance only kicks in once someone's actually struggling —
        // showing tips immediately would just be noise on a fast scan.
        struggleTimer = setTimeout(() => {
          if (detectedRef.current || cancelled) return;
          setTipIndex(0);
          let i = 0;
          tipRotator = setInterval(() => {
            i = (i + 1) % STRUGGLE_TIPS.length;
            setTipIndex(i);
          }, 3200);
        }, 4000);
      } catch (e) {
        if (!cancelled) {
          const denied = e instanceof Error && e.name === "NotAllowedError";
          track("scan_camera_error", { reason: denied ? "denied" : "other" }, "food_diary");
          setError(
            denied
              ? "Camera access was denied. Allow camera access in your browser settings to scan a barcode."
              : "Couldn't access the camera on this device."
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      controls?.stop();
      if (rotationTimer) clearInterval(rotationTimer);
      if (struggleTimer) clearTimeout(struggleTimer);
      if (tipRotator) clearInterval(tipRotator);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const statusText =
    phase === "starting" ? "Starting camera…"
    : tipIndex != null ? STRUGGLE_TIPS[tipIndex]
    : "Scanning — hold steady";

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 300,
        background: "#000",
        display: "flex", flexDirection: "column",
      }}
    >
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "16px 16px 0", position: "relative", zIndex: 2,
      }}>
        <span style={{ color: C.white, fontSize: 14, fontWeight: 600 }}>Scan barcode</span>
        <button
          onClick={onClose}
          style={{
            background: "rgba(255,255,255,0.15)", border: "none", borderRadius: "50%",
            width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center",
            color: C.white, cursor: "pointer",
          }}
        >
          <IconX size={18} />
        </button>
      </div>

      <div style={{ flex: 1, position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          ref={videoRef}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
          muted
          playsInline
        />
        {!error && (
          <div style={{
            position: "absolute", width: "72%", maxWidth: 320, aspectRatio: "1.6",
            border: `2px solid ${C.teal}`, borderRadius: 12,
            boxShadow: "0 0 0 2000px rgba(0,0,0,0.45)",
          }} />
        )}
        {error && (
          <div style={{
            position: "absolute", inset: 0, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", padding: 32, textAlign: "center",
          }}>
            <p style={{ color: C.white, fontSize: 14, margin: "0 0 16px" }}>{error}</p>
            <button
              onClick={onClose}
              style={{
                background: C.teal, border: "none", borderRadius: 10,
                padding: "10px 20px", color: C.primary, fontWeight: 600, fontSize: 13, cursor: "pointer",
              }}
            >
              Close
            </button>
          </div>
        )}
      </div>

      {!error && (
        <p style={{
          textAlign: "center", color: tipIndex != null ? C.teal : "rgba(255,255,255,0.6)", fontSize: 12,
          fontWeight: tipIndex != null ? 600 : 400,
          padding: "12px 20px 28px", margin: 0, transition: "color 0.2s",
        }}>
          {statusText}
        </p>
      )}
    </div>
  );
}
