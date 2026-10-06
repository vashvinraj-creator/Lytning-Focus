import { supabase } from "./supabaseClient";
import React, { useState, useEffect, useRef, useCallback, createContext, useContext } from "react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

// Lets anyone browse the app's tabs and UI without signing in first — but
// the moment they try to actually DO something (create a task, start a
// focus session, add a habit, etc.), useRequireAuth() sends them to the
// sign-in screen instead of letting the action silently fail or crash.
// This is a Context specifically so deeply-nested components (a button
// three components deep in HabitTracker, say) can gate an action without
// threading a callback prop through every layer in between.
const AuthGateContext = createContext({ isGuest: false, requireAuth: (fn) => fn() });
function useRequireAuth() {
  return useContext(AuthGateContext);
}

// BUILTIN_AVATARS and GROWTH_PORTRAIT_IMAGES are loaded lazily via
// dynamic import() at the two places that actually use them (avatar picker,
// portrait character), not here — this file alone was ~644KB, adding it to
// every user's initial load even if they never touch either feature.
import {
  Home, Timer, CheckSquare, BarChart3, Bot, Layers, Calendar, Settings as SettingsIcon,
  LogOut, Menu, X, Eye, EyeOff, Plus, Trash2, Play, Pause, RotateCcw, SkipForward,
  Send, Copy, Flame, Sparkles, ChevronRight, ChevronLeft, ChevronUp, ChevronDown, Check, Zap, Bell, User,
  Lock, Mail, ArrowRight, TrendingUp, Clock, FileText, Crown, Loader2, AlertTriangle, Pencil, Users, Trophy, Search, Download, Image as ImageIcon, Smartphone, MessageSquare, UserX, Star, HelpCircle, Gift, IndianRupee
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LineChart, Line,
  AreaChart, Area, PieChart, Pie, Cell
} from "recharts";

const WEEK_DATA = [
  { day: "Mon", hours: 1.8 },
  { day: "Tue", hours: 2.4 },
  { day: "Wed", hours: 1.2 },
  { day: "Thu", hours: 3.1 },
  { day: "Fri", hours: 2.6 },
  { day: "Sat", hours: 0.9 },
  { day: "Sun", hours: 2.35 },
];

const MONTH_DATA = [
  { week: "W1", hours: 9.2 },
  { week: "W2", hours: 11.4 },
  { week: "W3", hours: 8.6 },
  { week: "W4", hours: 13.1 },
];

/* ---------------------------- Theme (Dark / Light) ---------------------------- */
/* All the app's neutral colors now reference these CSS variables instead of      */
/* hardcoded Tailwind grays/black/white, so switching themes actually recolors    */
/* the whole app at once. Purple accents intentionally stay the same in both.     */

function hexToRgbString(hex) {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `${r},${g},${b}`;
}

const DARK_THEME = {
  "--bg": "#000000",
  "--input-bg": "rgba(0,0,0,0.4)",
  "--overlay-bg-90": "rgba(0,0,0,0.90)",
  "--overlay-bg-95": "rgba(0,0,0,0.95)",
  "--surface": "rgba(24,24,27,0.6)",
  "--surface-solid": "#18181b",
  "--surface-2": "#27272a",
  "--surface-3": "#3f3f46",
  "--text-primary": "#ffffff",
  "--text-secondary-strong": "#d1d5db",
  "--text-secondary": "#9ca3af",
  "--text-muted": "#6b7280",
  "--text-faint": "#4b5563",
  "--border-subtle": "#18181b",
  "--border": "#27272a",
  "--border-strong": "#3f3f46",
  "--card-border": "rgba(168,85,247,0.10)",
  "--card-border-width": "1px",
  "--accent": "#9333ea",
  "--accent-hover": "#a855f7",
  "--accent-text": "#c084fc",
  "--accent-rgb": "168,85,247",
};

const LIGHT_THEME = {
  "--bg": "#ffffff",
  "--input-bg": "rgba(0,0,0,0.015)",
  "--overlay-bg-90": "rgba(255,255,255,0.90)",
  "--overlay-bg-95": "rgba(255,255,255,0.96)",
  "--surface": "rgba(0,0,0,0.012)",
  "--surface-solid": "#fcfcfd",
  "--surface-2": "#f4f4f5",
  "--surface-3": "#e4e4e7",
  "--text-primary": "#09090b",
  "--text-secondary-strong": "#18181b",
  "--text-secondary": "#27272a",
  "--text-muted": "#3f3f46",
  "--text-faint": "#52525b",
  "--border-subtle": "#a1a1aa",
  "--border": "#71717a",
  "--border-strong": "#52525b",
  "--card-border": "#27272a",
  "--card-border-width": "1.5px",
  "--accent": "#9333ea",
  "--accent-hover": "#a855f7",
  "--accent-text": "#9333ea",
  "--accent-rgb": "147,51,234",
};

/* ---------------------------- Completion sounds ---------------------------- */
/* Synthesized with the Web Audio API rather than audio files — no assets to  */
/* host or load, and every sound is generated instantly on demand.            */

function playTone(ctx, freq, startDelay, duration, type = "sine", volume = 0.4) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const startTime = ctx.currentTime + startDelay;
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(volume, startTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.05);
}

const SOUND_OPTIONS = [
  {
    key: "beep",
    name: "Classic Beep",
    description: "A simple, clean beep",
    tier: "free",
    play: (ctx) => playTone(ctx, 800, 0, 0.5, "square", 0.32),
  },
  {
    key: "chime",
    name: "Soft Chime",
    description: "A gentle two-note chime",
    tier: "free",
    play: (ctx) => {
      playTone(ctx, 523, 0, 0.5, "sine", 0.4);
      playTone(ctx, 659, 0.12, 0.55, "sine", 0.4);
    },
  },
  {
    key: "bell",
    name: "Bell",
    description: "A single bell-like tone",
    tier: "free",
    play: (ctx) => playTone(ctx, 880, 0, 1.1, "triangle", 0.35),
  },
  {
    key: "ding",
    name: "Ding",
    description: "A short, bright ding",
    tier: "free",
    play: (ctx) => playTone(ctx, 1046, 0, 0.45, "sine", 0.4),
  },
  {
    key: "zenbowl",
    name: "Zen Bowl",
    description: "A warm, sustained singing-bowl tone",
    tier: "premium",
    play: (ctx) => {
      playTone(ctx, 220, 0, 2.4, "sine", 0.35);
      playTone(ctx, 440, 0, 2.2, "sine", 0.18);
      playTone(ctx, 660, 0.05, 2.0, "sine", 0.12);
    },
  },
  {
    key: "cascade",
    name: "Crystal Cascade",
    description: "A sparkling descending arpeggio",
    tier: "premium",
    play: (ctx) => {
      [1318, 1174, 987, 784].forEach((freq, i) => playTone(ctx, freq, i * 0.09, 0.55, "sine", 0.3));
    },
  },
  {
    key: "resolve",
    name: "Warm Resolve",
    description: "A rich, satisfying chord",
    tier: "premium",
    play: (ctx) => {
      [523, 659, 784].forEach((freq) => playTone(ctx, freq, 0, 1.3, "sine", 0.26));
    },
  },
];

function getSoundPrefs() {
  try {
    return {
      enabled: localStorage.getItem("studyflow-sound-enabled") !== "false",
      soundKey: localStorage.getItem("studyflow-sound-key") || "chime",
    };
  } catch {
    return { enabled: true, soundKey: "chime" };
  }
}

function playCompletionSound() {
  const { enabled, soundKey } = getSoundPrefs();
  if (!enabled) return;
  const sound = SOUND_OPTIONS.find((s) => s.key === soundKey) || SOUND_OPTIONS[1];
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    sound.play(ctx);
  } catch (e) {
    console.error("Sound playback failed:", e);
  }
}

// Reads the CURRENT theme's actual --bg color and computes its luminance,
// rather than hardcoding which theme keys are "light" — this stays correct
// automatically for any theme, including ones added later, with no manual
// per-theme list to maintain.
function isCurrentThemeLight() {
  try {
    const bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
    const hex = bg.replace("#", "");
    if (hex.length !== 6) return false;
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    // Standard perceived-luminance formula.
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5;
  } catch {
    return false;
  }
}

// Computes a CSS filter that recolors an image toward the theme's accent
// hue. sepia(1) first neutralizes the image to a consistent warm-brown
// base, THEN hue-rotate shifts that neutral base accurately to the target
// hue — this gives far more even, controlled results than hue-rotating the
// original multi-colored artwork directly, which would shift every
// existing color (skin tones, whites, background) by the same angle and
// often look muddy or wrong depending on what colors were already there.
function getThemeImageFilter() {
  try {
    const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
    const hex = accent.replace("#", "");
    if (hex.length !== 6) return "";
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    let hue = 0;
    if (d !== 0) {
      if (max === r) hue = ((g - b) / d) % 6;
      else if (max === g) hue = (b - r) / d + 2;
      else hue = (r - g) / d + 4;
      hue = Math.round(hue * 60);
      if (hue < 0) hue += 360;
    }
    // sepia() lands at roughly a 30deg hue baseline, so rotate from there
    // to the target accent hue.
    const rotation = hue - 30;
    return `sepia(0.75) saturate(4.5) hue-rotate(${rotation}deg) brightness(0.95) contrast(1.05)`;
  } catch {
    return "";
  }
}

function applyTheme(themeKey) {
  const found = THEMES.find((t) => t.key === themeKey);
  const vars = found ? found.vars : DARK_THEME;
  Object.entries(vars).forEach(([key, value]) => {
    document.documentElement.style.setProperty(key, value);
  });
}

// Builds a full dark-mode variant from just the handful of colors that
// actually differ between themes, reusing DARK_THEME for everything else
// (text colors, borders) so every theme stays legible and consistent.
// Accent colors are per-theme now — every button, link, and highlight in the
// app reads from --accent instead of a hardcoded purple, EXCEPT the
// Lytning Focus logo itself, which intentionally always stays purple.
function darkVariant(bg, surfaceSolid, surface2, surface3, accent, accentHover) {
  const base = { ...DARK_THEME, "--bg": bg, "--surface-solid": surfaceSolid, "--surface-2": surface2, "--surface-3": surface3, "--border-subtle": bg };
  if (accent) {
    base["--accent"] = accent;
    base["--accent-hover"] = accentHover || accent;
    base["--accent-text"] = accentHover || accent;
    base["--accent-rgb"] = hexToRgbString(accentHover || accent);
  }
  return base;
}
function lightVariant(bg, surfaceSolid, surface2, surface3, accent, accentHover) {
  const base = { ...LIGHT_THEME, "--bg": bg, "--surface-solid": surfaceSolid, "--surface-2": surface2, "--surface-3": surface3 };
  if (accent) {
    base["--accent"] = accent;
    base["--accent-hover"] = accentHover || accent;
    base["--accent-text"] = accent;
    base["--accent-rgb"] = hexToRgbString(accent);
  }
  return base;
}

// 7 free + 7 premium — nothing is actually locked yet (no real billing
// exists), this is purely for preview so the free/premium split can be
// reviewed before deciding what to actually gate later.
const THEMES = [
  {
    key: "dark",
    name: "Default",
    description: "Clean and minimal dark theme",
    tier: "free",
    preview: "linear-gradient(135deg, #18181b, #09090b)",
    dots: ["#ffffff", "#a1a1aa", "#a855f7", "#09090b"],
    vars: DARK_THEME,
  },
  {
    key: "light",
    name: "Light",
    description: "Bright and clean for daytime studying",
    tier: "free",
    preview: "linear-gradient(135deg, #ffffff, #e4e4e7)",
    dots: ["#09090b", "#a1a1aa", "#a855f7", "#ffffff"],
    vars: LIGHT_THEME,
  },
  {
    key: "sepia",
    name: "Sepia Light",
    description: "Warm beige tones — easiest on the eyes for daytime",
    tier: "free",
    preview: "linear-gradient(135deg, #d97706, #78350f)",
    dots: ["#d97706", "#92400e", "#f59e0b", "#451a03"],
    vars: lightVariant("#fdf6ec", "#faf0dd", "#f5e6cc", "#eddab0", "#d97706", "#f59e0b"),
  },
  {
    key: "ocean",
    name: "Ocean Deep",
    description: "Deep teal and blue, like studying underwater",
    tier: "premium",
    preview: "linear-gradient(135deg, #06b6d4, #0e7490)",
    dots: ["#22d3ee", "#0891b2", "#67e8f9", "#083344"],
    vars: darkVariant("#071a1e", "#0d2a30", "#153a41", "#1f4d56", "#0891b2", "#22d3ee"),
  },
  {
    key: "softpink",
    name: "Soft Pink",
    description: "Dark gray with a punchy pink accent — easier on the eyes at night",
    tier: "premium",
    preview: "linear-gradient(135deg, #ec4899, #831843)",
    vars: darkVariant("#1c1c1f", "#262629", "#323236", "#403f45", "#db2777", "#f472b6"),
  },
  {
    key: "pastel",
    name: "Pastel Dream",
    description: "Fresh mint and teal tones for a calming study vibe",
    tier: "free",
    preview: "linear-gradient(135deg, #2dd4bf, #0f766e)",
    vars: lightVariant("#f0fdfa", "#e3faf5", "#ccf5ec", "#a6ecdd", "#0d9488", "#2dd4bf"),
  },
  {
    key: "midnight",
    name: "Midnight Blue",
    description: "Deep blue tones for late-night sessions",
    tier: "free",
    preview: "linear-gradient(135deg, #2563eb, #1e3a8a)",
    dots: ["#3b82f6", "#1e40af", "#60a5fa", "#0f172a"],
    vars: darkVariant("#0a0e1a", "#111c35", "#1c2d52", "#2a3f6b", "#2563eb", "#60a5fa"),
  },
  {
    key: "coral",
    name: "Coral",
    description: "Warm, bright coral and peach tones",
    tier: "free",
    preview: "linear-gradient(135deg, #fb7185, #c2410c)",
    vars: lightVariant("#fff5f2", "#ffe8e0", "#ffd4c2", "#ffb896", "#e11d48", "#fb7185"),
  },
  {
    key: "forest",
    name: "Forest",
    description: "Deep green tones for a calm, focused mindset",
    tier: "premium",
    preview: "linear-gradient(135deg, #16a34a, #14532d)",
    dots: ["#22c55e", "#166534", "#4ade80", "#052e16"],
    vars: darkVariant("#0d1810", "#132018", "#1a2b20", "#25392c", "#16a34a", "#22c55e"),
  },
  {
    key: "rosegold",
    name: "Red",
    description: "Bold red tones with a premium feel",
    tier: "premium",
    preview: "linear-gradient(135deg, #ef4444, #7f1d1d)",
    dots: ["#ef4444", "#dc2626", "#fca5a5", "#450a0a"],
    vars: darkVariant("#1a0e0e", "#261616", "#341e1e", "#472727", "#dc2626", "#ef4444"),
  },
  {
    key: "sunset",
    name: "Sunset",
    description: "Warm orange and amber gradients",
    tier: "premium",
    preview: "linear-gradient(135deg, #f97316, #7c2d12)",
    dots: ["#fb923c", "#c2410c", "#fdba74", "#431407"],
    vars: darkVariant("#1a1108", "#2c1c0d", "#3d2712", "#4f3218", "#ea580c", "#fdba74"),
  },
  {
    key: "orchid",
    name: "Orchid",
    description: "Bold, moody dark theme with a vivid magenta accent",
    tier: "premium",
    preview: "linear-gradient(135deg, #d946ef, #4a044e)",
    vars: darkVariant("#170a1a", "#211026", "#2c1633", "#391d42", "#a21caf", "#e879f9"),
  },
  {
    key: "charcoal",
    name: "Charcoal Pro",
    description: "High-contrast neutral dark theme",
    tier: "premium",
    preview: "linear-gradient(135deg, #0ea5e9, #000000)",
    vars: darkVariant("#000000", "#050505", "#0d0d0f", "#161618", "#0ea5e9", "#38bdf8"),
  },
  {
    key: "arctic",
    name: "Arctic Frost",
    description: "Cool, crisp icy-blue tones for a clear mind",
    tier: "premium",
    preview: "linear-gradient(135deg, #ffffff, #7dd3fc)",
    vars: lightVariant("#f0f9ff", "#e0f2fe", "#bae6fd", "#7dd3fc", "#0284c7", "#38bdf8"),
  },
];
;

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

// Local calendar date as "YYYY-MM-DD", used anywhere a feature needs to
// know "which day is it right now" for the person's own local midnight
// (not UTC) — e.g. the daily task-XP cap.
function localDateStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// How tall the bolt is relative to the wordmark's font size. 1.35 makes it
// clearly taller than the text (cap-top to descender) in every place the logo
// appears, since the size always scales from the same text size. Change this
// one number to make the bolt bigger or smaller everywhere at once.
// (Tuned for the wide bolt. The older tall, narrow bolt needed 1.5.)
const LOGO_BOLT_RATIO = 1.35;

function Logo({ size = 28 }) {
  // `size` is the wordmark's font size in px. logo-mark.png is tightly
  // cropped (no transparent padding), so its height IS the visible bolt height,
  // and flex centering lines it up with the middle of the text line.
  return (
    <div className="flex items-center" style={{ gap: size * 0.5 }}>
      <img
        src="/logo-mark.png"
        alt="Lytning Focus"
        style={{ height: Math.round(size * LOGO_BOLT_RATIO), width: "auto" }}
        className="block shrink-0"
      />
      <span className="font-semibold text-[var(--text-primary)] tracking-tight leading-none" style={{ fontSize: size }}>
        Lytning Focus
      </span>
    </div>
  );
}

function GlowCard({ children, className = "", glow = false, borderColor }) {
  return (
    <div
      className={
        "relative rounded-2xl bg-[var(--surface)] backdrop-blur-sm p-5 " +
        (glow ? "shadow-[0_0_40px_-12px_rgb(var(--accent-rgb)/0.35)] " : "") +
        className
      }
      style={{ border: `var(--card-border-width) solid ${borderColor || "var(--card-border)"}` }}
    >
      {children}
    </div>
  );
}

// Reusable "current/max" usage indicator with an "Increase Limit" button —
// used anywhere a plan-based limit exists (habits, events, lists, groups,
// etc.) so upgrading is always one visible tap away. Pass max={null} for a
// tier with no cap (shows "Unlimited" instead, no button).
function LimitBadge({ current, max, goTo, label }) {
  if (max === null || max === undefined) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400">
        {label ? `${label}: ` : ""}Unlimited
      </span>
    );
  }
  return (
    <div className="inline-flex items-center gap-2">
      <span className="text-xs text-[var(--text-muted)]">
        {label ? `${label}: ` : ""}
        <span className="font-medium text-[var(--text-secondary-strong)]">{current}/{max}</span>
      </span>
      <button
        onClick={() => goTo && goTo("pricing")}
        className="text-[10px] font-semibold uppercase tracking-wide bg-[rgb(var(--accent-rgb)/0.15)] text-[var(--accent-text)] border border-[rgb(var(--accent-rgb)/0.3)] px-2 py-0.5 rounded-full hover:bg-[rgb(var(--accent-rgb)/0.25)] transition-colors whitespace-nowrap"
      >
        Increase Limit
      </button>
    </div>
  );
}

// Full popup shown the moment a backend limit actually blocks an action —
// not just an inline error, a real modal explaining what happened and
// offering a direct path to upgrade. Reused across every limit-gated
// feature (tasks, habits, events, lists, groups) rather than each building
// its own version.
function LimitReachedModal({ message, onClose, goTo }) {
  if (!message) return null;
  return (
    <div className="fixed inset-0 md:left-60 lg:left-64 z-[400] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div onClick={(e) => e.stopPropagation()} className="relative bg-[var(--surface-solid)] border border-[rgb(var(--accent-rgb)/0.4)] rounded-3xl p-6 max-w-sm w-full text-center shadow-[0_0_60px_-10px_rgb(var(--accent-rgb)/0.5)]">
        <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-hover)] flex items-center justify-center glow-accent-30 mx-auto mb-4">
          <Lock size={22} className="text-white" />
        </div>
        <p className="text-base font-semibold text-[var(--text-primary)] mb-2">Plan limit reached</p>
        <p className="text-sm text-[var(--text-muted)] mb-6">{message}</p>
        <div className="flex gap-2">
          <button
            onClick={() => {
              onClose();
              goTo && goTo("pricing");
            }}
            className="flex-1 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium py-2.5 rounded-xl transition-colors"
          >
            Upgrade
          </button>
          <button onClick={onClose} className="flex-1 bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-secondary-strong)] text-sm font-medium py-2.5 rounded-xl transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// Celebratory popup shown the moment a saved session pushes the person past a
// Growth level threshold — works no matter which tab they're on when it happens.
function LevelUpModal({ info, onClose }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (info) {
      setVisible(false);
      const raf = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(raf);
    }
  }, [info]);

  if (!info) return null;
  const { from, to } = info;
  return (
    <div
      className={"fixed inset-0 z-[300] flex items-center justify-center p-4 transition-opacity duration-200 " + (visible ? "opacity-100" : "opacity-0")}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        onClick={(e) => e.stopPropagation()}
        className={
          "relative bg-[var(--surface-solid)] border border-[rgb(var(--accent-rgb)/0.4)] rounded-3xl p-8 max-w-sm w-full text-center shadow-[0_0_60px_-10px_rgb(var(--accent-rgb)/0.5)] transition-all duration-300 " +
          (visible ? "scale-100 opacity-100" : "scale-90 opacity-0")
        }
      >
        <div className="flex items-center justify-center gap-2 mb-3">
          <Sparkles size={20} className="text-[var(--accent-text)]" />
          <p className="text-xs uppercase tracking-widest text-[var(--accent-text)] font-semibold">Level Up!</p>
          <Sparkles size={20} className="text-[var(--accent-text)]" />
        </div>
        <p className="text-sm text-[var(--text-muted)]">You've grown from</p>
        <p className="text-lg font-semibold mt-1" style={{ color: from.color }}>
          {from.name}
        </p>
        <p className="text-[var(--text-faint)] my-2">↓</p>
        <p className="text-sm text-[var(--text-muted)]">to</p>
        <p className="text-2xl font-bold mt-1" style={{ color: to.color }}>
          {to.name}
        </p>
        <p className="text-xs text-[var(--text-muted)] mt-2">Level {to.level} of {GROWTH_LEVEL_COUNT}</p>
        <button
          onClick={onClose}
          className="mt-6 w-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-medium py-3 rounded-xl transition-all duration-200 active:scale-[0.98]"
        >
          Nice!
        </button>
      </div>
    </div>
  );
}

// A trash icon that opens a real floating confirmation block instead of deleting
// immediately — bigger, clearer buttons, and it closes itself if you click
// anywhere outside it (same pattern used by the date picker dropdown).
function DeleteConfirmButton({ onConfirm, itemLabel = "this item", align = "right", onOpenChange }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  const changeOpen = (next) => {
    setOpen(next);
    onOpenChange && onOpenChange(next);
  };

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) changeOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={"relative inline-block " + (open ? "z-30" : "")} ref={containerRef}>
      <button
        onClick={() => changeOpen(!open)}
        className="text-[var(--text-faint)] hover:text-red-400 transition-colors p-1"
        title="Delete"
      >
        <Trash2 size={15} />
      </button>
      {open && (
        <div
          className={
            "absolute z-30 mt-2 w-64 bg-[var(--surface-solid)] border border-[var(--card-border)] rounded-2xl shadow-xl shadow-black/40 p-4 text-left " +
            (align === "right" ? "right-0" : "left-0")
          }
        >
          <p className="text-sm text-[var(--text-primary)] mb-1 font-medium">Delete {itemLabel}?</p>
          <p className="text-xs text-[var(--text-muted)] mb-4">This can't be undone.</p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                onConfirm();
                changeOpen(false);
              }}
              className="flex-1 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium py-2.5 rounded-xl transition-all duration-150 active:scale-95"
            >
              Delete
            </button>
            <button
              onClick={() => changeOpen(false)}
              className="flex-1 bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-secondary-strong)] text-sm font-medium py-2.5 rounded-xl transition-all duration-150 active:scale-95"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const PRIORITY_OPTIONS = [
  { value: "HIGH", label: "High priority", dotColor: "bg-red-400" },
  { value: "MEDIUM", label: "Medium priority", dotColor: "bg-amber-400" },
  { value: "LOW", label: "Low priority", dotColor: "bg-emerald-400" },
];

// A fully custom-styled dropdown, since a native <select>'s open list is
// rendered by the browser/OS itself and can't be reliably restyled with CSS —
// that's exactly why the old version looked like plain browser chrome instead
// of matching the app's theme.
function PriorityPicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const current = PRIORITY_OPTIONS.find((o) => o.value === value) || PRIORITY_OPTIONS[1];

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 bg-[var(--input-bg)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] outline-none transition-colors"
      >
        <span className="flex items-center gap-2">
          <span className={"h-2 w-2 rounded-full " + current.dotColor} />
          {current.label}
        </span>
        <ChevronDown size={15} className={"text-[var(--text-muted)] transition-transform duration-200 " + (open ? "rotate-180" : "")} />
      </button>
      {open && (
        <div className="absolute z-30 mt-2 w-full bg-[var(--surface-solid)] border border-[var(--card-border)] rounded-xl shadow-xl shadow-black/40 overflow-hidden">
          {PRIORITY_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
              className={
                "w-full flex items-center gap-2 text-left px-4 py-2.5 text-sm transition-colors " +
                (o.value === value ? "bg-[rgb(var(--accent-rgb)/0.1)] text-[var(--text-primary)]" : "text-[var(--text-secondary-strong)] hover:bg-[var(--surface-2)]")
              }
            >
              <span className={"h-2 w-2 rounded-full " + o.dotColor} />
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Generic version of the same themed-dropdown pattern as PriorityPicker,
// for anywhere a plain list of text options is needed instead of a
// browser-native <select> (which can't be styled to match the theme).
function ThemedSelect({ value, onChange, options, placeholder = "Select..." }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const current = options.find((o) => (typeof o === "string" ? o === value : o.value === value));
  const currentLabel = current ? (typeof current === "string" ? current : current.label) : placeholder;

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 bg-[var(--input-bg)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] outline-none transition-colors"
      >
        <span className={value ? "" : "text-[var(--text-faint)]"}>{currentLabel}</span>
        <ChevronDown size={15} className={"text-[var(--text-muted)] shrink-0 transition-transform duration-200 " + (open ? "rotate-180" : "")} />
      </button>
      {open && (
        <div className="absolute z-50 w-full top-full mt-2 bg-[var(--surface-solid)] border border-[var(--card-border)] rounded-xl shadow-xl shadow-black/40 overflow-hidden">
          <div className="max-h-56 overflow-y-auto overscroll-contain">
            {options.map((o) => {
              const optValue = typeof o === "string" ? o : o.value;
              const optLabel = typeof o === "string" ? o : o.label;
              return (
                <button
                  key={optValue}
                  type="button"
                  onClick={() => {
                    onChange(optValue);
                    setOpen(false);
                  }}
                  className={
                    "w-full text-left px-4 py-2.5 text-sm transition-colors " +
                    (optValue === value ? "bg-[rgb(var(--accent-rgb)/0.1)] text-[var(--text-primary)]" : "text-[var(--text-secondary-strong)] hover:bg-[var(--surface-2)]")
                  }
                >
                  {optLabel}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Landing({ onStart, user, onOpenAuth, onLogout }) {
  const features = [
    { icon: Timer, title: "Focus", desc: "Stay focused with a powerful Pomodoro timer." },
    { icon: CheckSquare, title: "Tasks", desc: "Organize everything you need to study." },
    { icon: BarChart3, title: "Statistics", desc: "See how your study habits improve." },
    { icon: Sparkles, title: "Insights", desc: "See your monthly and lifetime study trends." },
    { icon: Calendar, title: "Events", desc: "Keep track of deadlines, exams, and study sessions." },
    { icon: Layers, title: "Habit Tracker", desc: "Track daily habits alongside your studying." },
    { icon: Flame, title: "Growth", desc: "Level up and watch your character evolve as you study." },
    { icon: Users, title: "Groups", desc: "Study together, set shared goals, and stay accountable." },
    { icon: Trophy, title: "Leaderboard", desc: "See where you rank and stay motivated to climb higher." },
  ];

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)]">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 h-[560px] w-[560px] rounded-full bg-[rgb(var(--accent-rgb)/0.2)] blur-[120px]" />
      </div>

      <header className="relative z-10 flex items-center justify-between px-6 md:px-12 py-6 max-w-7xl mx-auto">
        <Logo />
        <div className="flex items-center gap-3">
          {user ? (
            <>
              <button
                onClick={onStart}
                className="flex items-center gap-2 text-sm text-[var(--text-secondary-strong)] hover:text-[var(--text-primary)] transition-colors px-2 py-1.5 rounded-lg"
                title="Go to your account"
              >
                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-[var(--accent)] to-[var(--accent-hover)] flex items-center justify-center text-white text-xs font-medium">
                  {user.name?.[0]?.toUpperCase() || "?"}
                </div>
                <span className="hidden sm:inline">{user.name}</span>
              </button>
              <button
                onClick={onLogout}
                className="text-sm text-[var(--text-secondary-strong)] hover:text-[var(--text-primary)] transition-colors px-3 py-2"
              >
                Log out
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => onOpenAuth("login")}
                className="hidden sm:block text-sm text-[var(--text-secondary-strong)] hover:text-[var(--text-primary)] transition-colors px-4 py-2"
              >
                Log in
              </button>
              <button
                onClick={() => onOpenAuth("signup")}
                className="hidden sm:block text-sm font-medium text-[var(--text-secondary-strong)] hover:text-[var(--text-primary)] border border-[var(--border)] hover:border-[var(--accent)] transition-colors px-4 py-2 rounded-lg"
              >
                Sign up
              </button>
            </>
          )}
        </div>
      </header>

      <main className="relative z-10 px-6 md:px-12 max-w-7xl mx-auto">
        <section className="text-center pt-16 pb-20">
          <div className="inline-flex items-center gap-2 text-xs font-medium text-[var(--accent-text)] bg-[rgb(var(--accent-rgb)/0.1)] border border-[rgb(var(--accent-rgb)/0.2)] rounded-full px-3 py-1 mb-6">
            <Sparkles size={13} /> Built for focused studying
          </div>
          <h1 className="text-4xl sm:text-6xl font-semibold tracking-tight text-[var(--text-primary)] leading-[1.05]">
            Study Smarter.<br />
            <span className="bg-gradient-to-r from-[var(--accent)] to-[var(--accent-hover)] bg-clip-text text-transparent">
              Focus Better.
            </span>
          </h1>
          <p className="mt-6 text-[var(--text-secondary)] text-lg max-w-xl mx-auto">
            One workspace for focused studying, productivity, and building better habits.
          </p>
          <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={onStart}
              className="w-full sm:w-auto bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--text-primary)] font-medium px-6 py-3 rounded-xl transition-colors glow-accent-40 flex items-center justify-center gap-2"
            >
              Start Studying <ArrowRight size={16} />
            </button>
          </div>

          <div className="mt-16 mx-auto max-w-4xl">
            <GlowCard glow className="text-left">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <p className="text-sm text-[var(--text-secondary)]">Good evening, Sarah 👋</p>
                  <p className="text-[var(--text-primary)] font-medium">Ready to focus?</p>
                </div>
                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-[var(--accent)] to-[var(--accent-hover)]" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl bg-[var(--input-bg)] border border-[rgb(var(--accent-rgb)/0.1)] p-4">
                  <p className="text-2xl font-semibold text-[var(--text-primary)]">2h 35m</p>
                  <p className="text-xs text-[var(--text-muted)] mt-1">Study Time</p>
                </div>
                <div className="rounded-xl bg-[var(--input-bg)] border border-[rgb(var(--accent-rgb)/0.1)] p-4">
                  <p className="text-2xl font-semibold text-[var(--text-primary)]">🔥 7</p>
                  <p className="text-xs text-[var(--text-muted)] mt-1">Day Streak</p>
                </div>
                <div className="rounded-xl bg-[var(--input-bg)] border border-[rgb(var(--accent-rgb)/0.1)] p-4">
                  <p className="text-2xl font-semibold text-[var(--text-primary)]">✓ 4</p>
                  <p className="text-xs text-[var(--text-muted)] mt-1">Sessions</p>
                </div>
              </div>
            </GlowCard>
          </div>
        </section>

        <section className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 pb-24">
          {features.map((f) => (
            <GlowCard key={f.title} className="hover:border-[rgb(var(--accent-rgb)/0.3)] transition-colors">
              <div className="h-10 w-10 rounded-lg bg-[rgb(var(--accent-rgb)/0.1)] flex items-center justify-center mb-3">
                <f.icon size={18} className="text-[var(--accent-text)]" />
              </div>
              <h3 className="text-[var(--text-primary)] font-medium mb-1">{f.title}</h3>
              <p className="text-sm text-[var(--text-secondary)]">{f.desc}</p>
            </GlowCard>
          ))}
        </section>

        <section className="text-center pb-24">
          <GlowCard glow className="max-w-2xl mx-auto py-10">
            <h2 className="text-2xl font-semibold text-[var(--text-primary)] mb-2">Start your next study session.</h2>
            <p className="text-[var(--text-secondary)] mb-6 text-sm">Free to start. No credit card required.</p>
            <button
              onClick={onStart}
              className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--text-primary)] font-medium px-6 py-3 rounded-xl transition-colors glow-accent-40"
            >
              Start Studying
            </button>
          </GlowCard>
        </section>
      </main>
    </div>
  );
}

function PasswordInput({ value, onChange, placeholder, compact }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={"w-full bg-[var(--input-bg)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl pl-10 pr-10 text-sm text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-faint)] " + (compact ? "py-2.5" : "py-3")}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-secondary-strong)]"
      >
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

function strengthOf(pw) {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return score;
}

function AuthScreen({ mode, setMode, onAuth, onBack, embedded }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const isSignup = mode === "signup";
  const strength = strengthOf(pw);

  // Clicking "Sign in with Google" redirects the whole tab away to Google —
  // this component's state gets frozen mid-flight. If the browser restores
  // this page from its back-forward cache (bfcache) when the person hits
  // the browser's own Back button, it can restore that exact frozen
  // "Connecting..." moment without ever running new code to clear it. The
  // "pageshow" event with persisted=true fires specifically for a bfcache
  // restore, so use it to reset the stuck state.
  useEffect(() => {
    function handlePageShow(e) {
      if (e.persisted) {
        setGoogleLoading(false);
        setLoading(false);
        setError("");
      }
    }
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

  const handleGoogleAuth = async () => {
    setError("");
    setGoogleLoading(true);
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
        // Without this, Google silently reuses whichever account is already
        // active in the browser instead of showing the account picker —
        // this forces the "choose an account" screen every time, so people
        // with multiple Google accounts can actually pick the right one.
        queryParams: { prompt: "select_account" },
      },
    });
    // On success, Supabase redirects the browser to Google immediately — this
    // component unmounts, so there's nothing more to do here. We only reach
    // this line if something went wrong before the redirect even happened.
    if (oauthError) {
      setGoogleLoading(false);
      setError(oauthError.message);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (isSignup && !name.trim()) return setError("Please enter your full name.");
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError("Please enter a valid email.");
    if (pw.length < 6) return setError("Password must be at least 6 characters.");
    if (isSignup && pw !== pw2) return setError("Passwords do not match.");

    setLoading(true);

    if (isSignup) {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password: pw,
        options: { data: { full_name: name } },
      });
      setLoading(false);

      if (signUpError) return setError(signUpError.message);

      if (!data.session) {
        // Email confirmation is turned on in Supabase — there's no session yet.
        setError("Account created — check your email to confirm it, then log in.");
        return;
      }

      onAuth({ name, email });
      return;
    }

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password: pw,
    });
    setLoading(false);

    if (signInError) return setError(signInError.message);

    const displayName = data.user?.user_metadata?.full_name || email.split("@")[0];
    onAuth({ name: displayName, email });
  };

  return (
    <div className={embedded ? "px-6 py-5 relative" : "min-h-screen bg-[var(--bg)] flex items-center justify-center px-4 relative overflow-hidden"}>
      {!embedded && <div className="pointer-events-none absolute top-1/4 left-1/2 -translate-x-1/2 h-[500px] w-[500px] rounded-full bg-[rgb(var(--accent-rgb)/0.2)] blur-[120px]" />}
      <div className={embedded ? "relative z-10 w-full" : "relative z-10 w-full max-w-md"}>
        {onBack && !embedded && (
          <button onClick={onBack} className="flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--text-secondary-strong)] mb-4 transition-colors">
            <ChevronLeft size={15} /> Back
          </button>
        )}
        <div className={embedded ? "flex justify-center mb-4" : "flex justify-center mb-8"}>
          <Logo size={32} />
        </div>
        <AuthCardWrapper embedded={embedded}>
          <h1 className="text-xl font-semibold text-[var(--text-primary)] mb-1">
            {isSignup ? "Create your account" : "Sign in to save your progress"}
          </h1>
          <p className={embedded ? "text-sm text-[var(--text-secondary)] mb-4" : "text-sm text-[var(--text-secondary)] mb-6"}>
            {isSignup ? "Start building better study habits." : "Your streaks, tasks, and stats pick up right where you left off."}
          </p>

          <button
            type="button"
            onClick={handleGoogleAuth}
            disabled={googleLoading}
            className={"w-full flex items-center justify-center gap-2.5 bg-white hover:bg-gray-100 disabled:opacity-60 text-gray-800 font-medium rounded-xl transition-colors " + (embedded ? "py-2.5 mb-3" : "py-3 mb-4")}
          >
            {googleLoading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
                <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
                <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
                <path fill="#FBBC05" d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33z" />
                <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.59-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
              </svg>
            )}
            {googleLoading ? "Connecting..." : `${isSignup ? "Sign up" : "Sign in"} with Google`}
          </button>

          <div className={embedded ? "flex items-center gap-3 mb-3" : "flex items-center gap-3 mb-4"}>
            <div className="flex-1 h-px bg-[var(--border)]" />
            <span className="text-xs text-[var(--text-muted)]">or</span>
            <div className="flex-1 h-px bg-[var(--border)]" />
          </div>

          <form onSubmit={submit} className={embedded ? "space-y-2.5" : "space-y-3"}>
            {isSignup && (
              <div className="relative">
                <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Full name"
                  className={"w-full bg-[var(--input-bg)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl pl-10 pr-4 text-sm text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-faint)] " + (embedded ? "py-2.5" : "py-3")}
                />
              </div>
            )}
            <div className="relative">
              <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                className={"w-full bg-[var(--input-bg)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl pl-10 pr-4 text-sm text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-faint)] " + (embedded ? "py-2.5" : "py-3")}
              />
            </div>
            <PasswordInput value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Password" compact={embedded} />
            {isSignup && pw && (
              <div className="flex gap-1 px-1">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className={
                      "h-1 flex-1 rounded-full " +
                      (i < strength
                        ? strength <= 1
                          ? "bg-red-500"
                          : strength === 2
                          ? "bg-amber-500"
                          : "bg-[var(--accent-hover)]"
                        : "bg-[var(--surface-2)]")
                    }
                  />
                ))}
              </div>
            )}
            {isSignup && (
              <PasswordInput value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="Confirm password" compact={embedded} />
            )}

            {!isSignup && (
              <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" style={{ accentColor: "var(--accent)" }} /> Remember me
                </label>
                <button type="button" className="hover:text-[var(--accent-text)]">
                  Forgot password?
                </button>
              </div>
            )}

            {error && <p className="text-xs text-red-400 pt-1">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className={"w-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-60 text-[var(--text-primary)] font-medium rounded-xl transition-colors glow-accent-40 flex items-center justify-center gap-2 " + (embedded ? "mt-1 py-2.5" : "mt-2 py-3")}
            >
              {loading && <Loader2 size={16} className="animate-spin" />}
              {isSignup ? "Create Account" : "Log In"}
            </button>
          </form>

          <p className={embedded ? "text-center text-sm text-[var(--text-muted)] mt-3" : "text-center text-sm text-[var(--text-muted)] mt-5"}>
            {isSignup ? "Already have an account?" : "Don't have an account?"}{" "}
            <button
              onClick={() => setMode(isSignup ? "login" : "signup")}
              className="text-[var(--accent-text)] hover:text-[var(--accent-text)] font-medium"
            >
              {isSignup ? "Log in" : "Sign up"}
            </button>
          </p>
        </AuthCardWrapper>
      </div>
    </div>
  );
}

// Shared by AuthScreen for both its full-page (GlowCard) and embedded
// (plain, since the modal it sits in already provides its own card chrome)
// presentations, so the actual form markup only has to be written once.
function AuthCardWrapper({ embedded, children }) {
  if (embedded) return <>{children}</>;
  return <GlowCard glow>{children}</GlowCard>;
}

/* ---------------------------- Study stats helpers ---------------------------- */

// Substring matching (catches embedded/concatenated profanity like
// "fuckbitch" or "sahbfuckiug"), with a curated allowlist of legitimate
// whole words that happen to contain a blocked substring — checked first,
// per word, so "assam" is protected while "sahbfuckiug" still gets caught.
const BLOCKED_WORDS = [
  "nigga", "nigger",
  "fuck",
  "shit",
  "ass",
  "dick",
  "hoe",
  "slut",
  "cum",
  "bitch",
  "bastard",
  "cunt",
  "whore",
  "pussy",
  "twat",
  "fag",
  "retard",
  "punda", "sunni", "umbu", "mairu", "potta",
];

const PROFANITY_ALLOWLIST = new Set([
  "assam", "assassin", "assassinate", "assassination", "assemble", "assembly", "assert", "assertion",
  "assess", "assessment", "asset", "assets", "assign", "assignment", "assist", "assistance", "assistant",
  "associate", "associates", "association", "assume", "assumption", "assure", "assurance",
  "brass", "bass", "class", "classes", "classic", "classical", "classy", "classroom",
  "compass", "embarrass", "embarrassed", "embarrassing", "embarrassment", "glass", "glasses",
  "grass", "harass", "harassment", "mass", "massive", "pass", "passage", "passenger", "password",
  "surpass", "bypass", "trespass", "molasses", "amass", "cassette", "kickass",
  "cucumber", "circumstance", "circumstances", "circumference", "document", "documents",
  "documentation", "cumulative", "cumulate", "accumulate", "accumulation", "encumber", "incumbent", "succumb",
  "shoe", "shoes", "hoedown",
]);

function containsProfanity(text) {
  if (!text) return false;
  const words = text.toLowerCase().match(/[a-z]+/g) || [];
  return words.some((w) => {
    if (PROFANITY_ALLOWLIST.has(w)) return false;
    return BLOCKED_WORDS.some((bad) => w.includes(bad));
  });
}

function formatDuration(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// Same idea as formatDuration, but takes minutes directly and spells out "hr"/"min" —
// used for the timer's own duration labels, e.g. "1 hr 15 min" instead of "75 min".
function formatMinutesLong(totalMinutes) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h > 0 && m > 0) return `${h} hr ${m} min`;
  if (h > 0) return `${h} hr`;
  return `${m} min`;
}

// Group goal amounts show in whichever unit actually makes sense for the
// value — minutes for anything under an hour (so a real minutes-based goal
// displays as "45 min", not rounding down to "0 hours"), hours otherwise.
function formatGoalAmount(totalMinutes) {
  const m = Math.round(totalMinutes || 0);
  if (m < 60) return `${m} min`;
  const hours = m / 60;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} hr`;
}

// Countdown clock display: H:MM:SS once past an hour, MM:SS otherwise — so a
// 2-hour timer reads "1:59:32" instead of an incorrect "119:32".
function formatClock(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// Preset chips for one-tap common durations, plus a fine-tune +/- row below for
// anything custom — nicer to use than always-visible steppers for every case.
function DurationPicker({ value, onChange, presets, step = 5, min = 5, max = 300 }) {
  return (
    <div>
      <div className="flex flex-wrap justify-center gap-2 mb-3">
        {presets.map((p) => (
          <button
            key={p}
            onClick={() => onChange(p)}
            className={
              "px-3.5 py-2 rounded-full text-xs font-medium border transition-all duration-150 active:scale-95 " +
              (value === p
                ? "bg-[var(--accent)] border-[var(--accent)] text-white"
                : "bg-[var(--surface-2)] border-[var(--card-border)] text-[var(--text-secondary-strong)] hover:bg-[var(--surface-3)]")
            }
          >
            {formatMinutesLong(p)}
          </button>
        ))}
      </div>
      <div className="flex items-center justify-center gap-4">
        <button
          onClick={() => onChange(Math.max(min, value - step))}
          className="h-8 w-8 rounded-lg bg-[var(--surface-2)] border border-[var(--card-border)] text-[var(--text-secondary-strong)] hover:bg-[var(--surface-3)] flex items-center justify-center transition-all duration-150 active:scale-90"
        >
          −
        </button>
        <span className="text-[var(--text-primary)] text-sm font-bold min-w-[84px] text-center tabular-nums">{formatMinutesLong(value)}</span>
        <button
          onClick={() => onChange(Math.min(max, value + step))}
          className="h-8 w-8 rounded-lg bg-[var(--surface-2)] border border-[var(--card-border)] text-[var(--text-secondary-strong)] hover:bg-[var(--surface-3)] flex items-center justify-center transition-all duration-150 active:scale-90"
        >
          +
        </button>
      </div>
    </div>
  );
}

function computeStudyStats(sessions, frozenDates = []) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // Sunday-start week: JS getDay() is already 0 = Sunday, so no offset math needed.
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfToday.getDate() - now.getDay());

  let todaySeconds = 0;
  let weekSeconds = 0;
  let totalSeconds = 0;
  // Restored dates count toward the streak the same way a real session day
  // would, without ever being treated as an actual study session for XP,
  // stats, or anything else — they only ever touch this one Set.
  const daysWithSessions = new Set(frozenDates.map((d) => new Date(d + "T00:00:00").toDateString()));

  sessions.forEach((s) => {
    const focused = s.focused_seconds || 0;
    totalSeconds += focused;
    const completed = new Date(s.completed_at);
    if (completed >= startOfToday) todaySeconds += focused;
    if (completed >= startOfWeek) weekSeconds += focused;
    daysWithSessions.add(completed.toDateString());
  });

  // Build the current calendar week, Sunday through Saturday, for the weekly chart.
  const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const weekDays = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    weekDays.push({ key: d.toDateString(), day: dayLabels[d.getDay()], hours: 0 });
  }
  sessions.forEach((s) => {
    const completed = new Date(s.completed_at);
    const key = completed.toDateString();
    const bucket = weekDays.find((b) => b.key === key);
    if (bucket) bucket.hours += (s.focused_seconds || 0) / 3600;
  });
  const weekChartData = weekDays.map((b) => ({ day: b.day, hours: Math.round(b.hours * 100) / 100 }));

  // Streak: consecutive days with at least one session, counting back from today
  // (or from yesterday if nothing has been logged yet today).
  let streak = 0;
  let cursor = new Date(startOfToday);
  if (!daysWithSessions.has(cursor.toDateString())) {
    cursor.setDate(cursor.getDate() - 1);
  }
  while (daysWithSessions.has(cursor.toDateString())) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  return {
    todaySeconds,
    weekSeconds,
    totalSeconds,
    sessionCount: sessions.length,
    streak,
    weekChartData,
  };
}

// Longest-ever streak of consecutive days with a saved session — separate
// from the "current streak" above, which only looks at the run ending today.
function computeLongestStreak(sessions) {
  const days = Array.from(new Set(sessions.map((s) => new Date(s.completed_at).toDateString())))
    .map((d) => new Date(d))
    .sort((a, b) => a - b);
  if (days.length === 0) return 0;

  let longest = 1;
  let current = 1;
  for (let i = 1; i < days.length; i++) {
    const diffDays = Math.round((days[i] - days[i - 1]) / (1000 * 60 * 60 * 24));
    if (diffDays === 1) {
      current++;
      longest = Math.max(longest, current);
    } else {
      current = 1;
    }
  }
  return longest;
}

// Builds a Sunday-through-Saturday chart for any week relative to the current one.
// offset 0 = this week, -1 = last week, -2 = two weeks ago, etc.
function computeWeekChart(sessions, offset) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfThisWeek = new Date(startOfToday);
  startOfThisWeek.setDate(startOfToday.getDate() - now.getDay());

  const startOfTargetWeek = new Date(startOfThisWeek);
  startOfTargetWeek.setDate(startOfThisWeek.getDate() + offset * 7);
  const endOfTargetWeek = new Date(startOfTargetWeek);
  endOfTargetWeek.setDate(startOfTargetWeek.getDate() + 6);

  const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const weekDays = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(startOfTargetWeek);
    d.setDate(startOfTargetWeek.getDate() + i);
    weekDays.push({ key: d.toDateString(), day: dayLabels[d.getDay()], hours: 0 });
  }
  sessions.forEach((s) => {
    const completed = new Date(s.completed_at);
    const key = completed.toDateString();
    const bucket = weekDays.find((b) => b.key === key);
    if (bucket) bucket.hours += (s.focused_seconds || 0) / 3600;
  });

  const fmt = (d) => d.toLocaleDateString([], { month: "short", day: "numeric" });
  const label =
    offset === 0 ? "This week" : offset === -1 ? "Last week" : `${fmt(startOfTargetWeek)} – ${fmt(endOfTargetWeek)}`;

  return {
    data: weekDays.map((b) => ({ day: b.day, hours: Math.round(b.hours * 100) / 100 })),
    label,
    rangeLabel: `${fmt(startOfTargetWeek)} – ${fmt(endOfTargetWeek)}`,
  };
}

// The most negative week offset that still contains at least one real session —
// i.e. the week of the person's very first saved session. Going further back than
// this is pointless, since there's nothing there yet.
function computeMinWeekOffset(sessions) {
  if (sessions.length === 0) return 0;

  const earliest = sessions.reduce((min, s) => {
    const d = new Date(s.completed_at);
    return d < min ? d : min;
  }, new Date(sessions[0].completed_at));

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfThisWeek = new Date(startOfToday);
  startOfThisWeek.setDate(startOfToday.getDate() - now.getDay());

  const startOfEarliestWeek = new Date(earliest.getFullYear(), earliest.getMonth(), earliest.getDate());
  startOfEarliestWeek.setDate(startOfEarliestWeek.getDate() - earliest.getDay());

  const diffWeeks = Math.round((startOfThisWeek - startOfEarliestWeek) / (7 * 24 * 60 * 60 * 1000));
  return -diffWeeks;
}

function timerTypeLabel(type) {
  if (type === "pomodoro") return "Pomodoro";
  if (type === "stopwatch") return "Stopwatch";
  return "Focus Timer";
}

function formatSessionTime(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (isToday) return `Today, ${time}`;
  if (isYesterday) return `Yesterday, ${time}`;
  return `${d.toLocaleDateString([], { month: "short", day: "numeric" })}, ${time}`;
}

/* ---------------------------- Dashboard ---------------------------- */

function Dashboard({ user, goTo, refreshKey, goToAbout }) {
  const [sessions, setSessions] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [frozenDates, setFrozenDates] = useState([]);
  const [restoreStatus, setRestoreStatus] = useState(null); // { eligible, used, max, remaining }
  const [confirmingRestore, setConfirmingRestore] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreMessage, setRestoreMessage] = useState("");
  const [myTier, setMyTier] = useState("free");
  const [birthdayStatus, setBirthdayStatus] = useState(null);
  const [claimingGift, setClaimingGift] = useState(false);
  const [giftResult, setGiftResult] = useState(null); // { xp_awarded } once opened
  const [giftError, setGiftError] = useState("");
  const [xpToastMessage, setXpToastMessage] = useState("");
  const [xpToastKey, setXpToastKey] = useState(0);
  const [showAboutPrompt, setShowAboutPrompt] = useState(false);

  useEffect(() => {
    loadSessions();
    loadTasks();
    loadStreakData();
    (async () => {
      const { data: { session: authSession } } = await supabase.auth.getSession();
      const authUser = authSession?.user;
      if (!authUser) return;
      const { data } = await supabase.from("profiles").select("premium_tier, has_seen_about_prompt").eq("user_id", authUser.id).maybeSingle();
      setMyTier(data?.premium_tier || "free");
      setShowAboutPrompt(data?.has_seen_about_prompt === false);
    })();
    supabase.rpc("get_my_birthday_status").then(({ data }) => setBirthdayStatus(data));
  }, [refreshKey]);

  // Persisted server-side, not just hidden in this session — once
  // dismissed (by clicking through OR closing it), it stays gone across
  // devices and future visits, since by then the person has either seen
  // the guide or actively said they don't need it.
  async function dismissAboutPrompt() {
    setShowAboutPrompt(false);
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (authUser) await supabase.from("profiles").update({ has_seen_about_prompt: true }).eq("user_id", authUser.id);
  }

  async function handleOpenGift() {
    setClaimingGift(true);
    const { data, error } = await supabase.rpc("claim_birthday_gift");
    setClaimingGift(false);
    if (error) {
      console.error("Failed to claim birthday gift:", error);
      setGiftError("Couldn't open your gift — please try again.");
      return;
    }
    setGiftResult(data);
    setBirthdayStatus((s) => ({ ...s, already_claimed_this_year: true }));
    setXpToastMessage(`🎁 Birthday gift opened — +${data.xp_awarded.toLocaleString()} XP!`);
    setXpToastKey((k) => k + 1);
  }

  async function loadStreakData() {
    const { data: freezes } = await supabase.from("streak_freezes").select("freeze_date");
    setFrozenDates((freezes || []).map((f) => f.freeze_date));
    const { data: status } = await supabase.rpc("get_my_streak_restore_status");
    setRestoreStatus(status || { eligible: false, used: 0, max: 0, remaining: 0 });
  }

  async function handleRestoreStreak(missedDateStr) {
    setRestoring(true);
    const { data, error } = await supabase.rpc("restore_streak", { p_freeze_date: missedDateStr });
    setRestoring(false);
    setConfirmingRestore(false);
    if (error) {
      setRestoreMessage((error.message || "").includes("STREAK_RESTORE_LIMIT") ? "You've used all your streak restores for this year." : "Couldn't restore your streak — please try again.");
      return;
    }
    setRestoreMessage(`Streak restored — ${data.remaining} of ${data.max} restores left this year.`);
    loadStreakData();
    loadSessions();
  }

  async function loadSessions() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("study_sessions")
        .select("*")
        .order("completed_at", { ascending: false });
      if (!error) setSessions(data || []);
    } catch (e) {
      console.error("Failed to load sessions:", e);
    } finally {
      setLoading(false);
    }
  }

  async function loadTasks() {
    const { data, error } = await supabase.from("tasks").select("*");
    if (!error) setTasks(data || []);
  }

  const hour = new Date().getHours();
  const isNight = hour >= 22 || hour < 5; // 10pm - 5am
  const displayName = user?.name || "there";
  const greeting =
    hour >= 5 && hour < 12 ? "Good morning" // 5am - 12pm
      : hour >= 12 && hour < 17 ? "Good afternoon" // 12pm - 5pm
      : hour >= 17 && hour < 22 ? "Good evening" // 5pm - 10pm
      : "Hey, Night Owl"; // 10pm - 5am
  const doneTasks = tasks.filter((t) => t.done).length;
  const stats = computeStudyStats(sessions, frozenDates);

  // Streak-ending warning: fires when today hasn't been logged yet, the
  // streak is actually something worth protecting (>0), and we're within
  // the last 2 hours of the day (local time) — i.e. genuinely about to lose it.
  const nowForStreak = new Date();
  const todayKey = nowForStreak.toDateString();
  const hasLoggedToday = sessions.some((s) => new Date(s.completed_at).toDateString() === todayKey) || frozenDates.some((d) => new Date(d + "T00:00:00").toDateString() === todayKey);
  const minutesLeftToday = 24 * 60 - (nowForStreak.getHours() * 60 + nowForStreak.getMinutes());
  const streakEndingSoon = stats.streak > 0 && !hasLoggedToday && minutesLeftToday <= 120;

  // Restore window: the streak just broke (last logged day was 1-2 days
  // ago, today has nothing) — the button disappears entirely once that
  // window closes.
  const yesterday = new Date(nowForStreak);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);
  const lastLoggedDay = [...sessions.map((s) => new Date(s.completed_at)), ...frozenDates.map((d) => new Date(d + "T00:00:00"))].sort((a, b) => b - a)[0];
  const daysSinceLastLogged = lastLoggedDay ? Math.floor((nowForStreak - lastLoggedDay) / (1000 * 60 * 60 * 24)) : Infinity;
  const streakJustBroke = !hasLoggedToday && daysSinceLastLogged >= 1 && daysSinceLastLogged <= 2 && lastLoggedDay;
  const canShowRestore = streakJustBroke && restoreStatus?.eligible && restoreStatus?.remaining > 0;

  return (
    <div className="space-y-6">
      <SavedToast key={xpToastKey} message={xpToastMessage} />
      {giftError && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
          <p className="text-sm text-red-400">{giftError}</p>
          <button onClick={() => setGiftError("")} className="text-red-400 hover:text-red-300 shrink-0">
            <X size={14} />
          </button>
        </div>
      )}
      {streakEndingSoon && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 flex items-center gap-3">
          <Flame size={18} className="text-amber-400 shrink-0" />
          <p className="text-sm text-amber-400">Your {stats.streak}-day streak ends in less than 2 hours — study something today to keep it going.</p>
        </div>
      )}
      {canShowRestore && !restoreMessage && (
        <div
          className="rounded-xl px-4 py-3 flex items-center justify-between gap-3"
          style={{ background: "rgba(251,146,60,0.1)", border: "1.5px solid rgba(251,146,60,0.5)" }}
        >
          <div className="flex items-center gap-3">
            <Flame size={18} className="text-orange-400 shrink-0" />
            <p className="text-sm text-orange-400">Your streak broke yesterday — restore it with your Yearly Pro benefit.</p>
          </div>
          {confirmingRestore ? (
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-orange-300">{restoreStatus.remaining} of {restoreStatus.max} left</span>
              <button
                onClick={() => handleRestoreStreak(yesterdayStr)}
                disabled={restoring}
                className="text-xs font-medium bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg transition-colors"
              >
                {restoring ? "Restoring..." : "Restore"}
              </button>
              <button onClick={() => setConfirmingRestore(false)} className="text-xs text-orange-300 hover:text-orange-200 px-2 py-1.5">
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmingRestore(true)}
              className="text-xs font-medium text-orange-400 border border-orange-500/50 hover:bg-orange-500/10 transition-colors px-3 py-1.5 rounded-lg shrink-0"
            >
              Restore Streak
            </button>
          )}
        </div>
      )}
      {restoreMessage && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
          <p className="text-sm text-emerald-400">{restoreMessage}</p>
          <button onClick={() => setRestoreMessage("")} className="text-emerald-400 hover:text-emerald-300 shrink-0">
            <X size={14} />
          </button>
        </div>
      )}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-[var(--text-primary)] truncate">
            {birthdayStatus?.is_birthday_today ? (
              <>🎉 Happy Birthday, {birthdayStatus.display_name || displayName}!</>
            ) : isNight ? (
              <>Hey, Night Owl 🦉</>
            ) : (
              <>
                {greeting}, {displayName} 👋
              </>
            )}
          </h1>
          <p className="text-[var(--text-secondary)] text-sm mt-1">{birthdayStatus?.is_birthday_today && !birthdayStatus?.already_claimed_this_year ? "A gift is waiting for you today." : "Ready to focus?"}</p>
        </div>

        {birthdayStatus?.is_birthday_today && (
          <div className="shrink-0 bg-gradient-to-br from-[var(--accent)]/20 to-[var(--accent-hover)]/10 border border-[rgb(var(--accent-rgb)/0.3)] rounded-2xl pl-4 pr-2 py-2.5 flex items-center gap-3">
            <span className="text-3xl shrink-0">🎁</span>
            {birthdayStatus?.already_claimed_this_year ? (
              <p className="text-sm font-semibold text-emerald-400 whitespace-nowrap pr-2">+{(giftResult?.xp_awarded ?? birthdayStatus.claimed_xp ?? 0).toLocaleString()} XP!</p>
            ) : (
              <button
                onClick={handleOpenGift}
                disabled={claimingGift}
                className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors whitespace-nowrap"
              >
                {claimingGift ? "Opening..." : "Open Gift"}
              </button>
            )}
          </div>
        )}
      </div>

      {showAboutPrompt && (
        <div className="bg-gradient-to-r from-[rgb(var(--accent-rgb)/0.12)] to-[rgb(var(--accent-rgb)/0.04)] border border-[rgb(var(--accent-rgb)/0.3)] rounded-xl px-4 py-3 flex items-center gap-3">
          <HelpCircle size={18} className="text-[var(--accent-text)] shrink-0" />
          <button
            onClick={() => {
              dismissAboutPrompt();
              goToAbout && goToAbout();
            }}
            className="flex-1 text-left text-sm text-[var(--text-secondary-strong)] hover:text-[var(--text-primary)] transition-colors"
          >
            New here, or still figuring out how everything works? <span className="text-[var(--accent-text)] font-medium">Take a quick look at the guide →</span>
          </button>
          <button onClick={dismissAboutPrompt} className="text-[var(--text-faint)] hover:text-[var(--text-primary)] shrink-0 p-1 -m-1">
            <X size={14} />
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <GlowCard>
          <p className="text-xs text-[var(--text-muted)] mb-1">Today's Focus</p>
          <p className="text-2xl font-semibold text-[var(--text-primary)]">
            {loading ? "…" : formatDuration(stats.todaySeconds)}
          </p>
          <p className="text-xs text-[var(--text-muted)] mt-1">Study Time</p>
        </GlowCard>
        <GlowCard>
          <p className="text-xs text-[var(--text-muted)] mb-1 flex items-center gap-1">
            <Flame size={12} className="text-orange-400" /> Streak
          </p>
          <p className="text-2xl font-semibold text-[var(--text-primary)]">{loading ? "…" : stats.streak}</p>
          <p className="text-xs text-[var(--text-muted)] mt-1">Day Streak</p>
        </GlowCard>
        <GlowCard>
          <p className="text-xs text-[var(--text-muted)] mb-1">Sessions</p>
          <p className="text-2xl font-semibold text-[var(--text-primary)]">✓ {loading ? "…" : stats.sessionCount}</p>
          <p className="text-xs text-[var(--text-muted)] mt-1">Saved Sessions</p>
        </GlowCard>
        <GlowCard>
          <p className="text-xs text-[var(--text-muted)] mb-1">Tasks</p>
          <p className="text-2xl font-semibold text-[var(--text-primary)]">
            {doneTasks}/{tasks.length}
          </p>
          <p className="text-xs text-[var(--text-muted)] mt-1">Completed Tasks</p>
        </GlowCard>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <button
          onClick={() => goTo("focus")}
          className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-hover)] p-6 text-left glow-accent-40 transition-shadow"
        >
          <Timer className="text-[var(--text-primary)]/80 mb-3" size={22} />
          <p className="text-[var(--text-primary)] font-medium text-lg">Start Focus Session</p>
          <p className="text-[var(--text-primary)]/80 text-sm mt-1">Stopwatch, Focus Timer or Pomodoro</p>
          <ChevronRight className="absolute right-5 top-1/2 -translate-y-1/2 text-[var(--accent-text)] group-hover:translate-x-1 transition-transform" />
        </button>
        {myTier === "premium" ? (
          <button
            onClick={() => goTo("insights")}
            className="group relative overflow-hidden rounded-2xl bg-[var(--surface-solid)] border border-[rgb(var(--accent-rgb)/0.2)] p-6 text-left hover:border-[rgb(var(--accent-rgb)/0.4)] transition-colors"
          >
            <TrendingUp className="text-[var(--accent-text)] mb-3" size={22} />
            <p className="text-[var(--text-primary)] font-medium text-lg">
              {(() => {
                const ph = computePeakHours(sessions);
                return ph ? `Peak hour: ${ph.bestHourLabel}` : "Insights";
              })()}
            </p>
            <p className="text-[var(--text-secondary)] text-sm mt-1">See your full study patterns</p>
            <ChevronRight className="absolute right-5 top-1/2 -translate-y-1/2 text-[var(--accent-text)] group-hover:translate-x-1 transition-transform" />
          </button>
        ) : (
          <button
            onClick={() => goTo("pricing")}
            className="group relative overflow-hidden rounded-2xl bg-[var(--surface-solid)] border border-[rgb(var(--accent-rgb)/0.2)] p-6 text-left hover:border-[rgb(var(--accent-rgb)/0.4)] transition-colors"
          >
            <Crown className="text-[var(--accent-text)] mb-3" size={22} />
            <p className="text-[var(--text-primary)] font-medium text-lg">Go Premium</p>
            <p className="text-[var(--text-secondary)] text-sm mt-1">Unlock deeper insights and more</p>
            <ChevronRight className="absolute right-5 top-1/2 -translate-y-1/2 text-[var(--text-faint)] group-hover:translate-x-1 transition-transform" />
          </button>
        )}
      </div>

      <GlowCard>
        <div className="flex items-center justify-between mb-3">
          <p className="text-[var(--text-primary)] font-medium text-sm">This week</p>
          <span className="text-xs text-[var(--text-muted)]">Focused time (hrs)</span>
        </div>
        <div style={{ width: "100%", height: 160 }}>
          <ResponsiveContainer>
            <BarChart data={stats.weekChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis dataKey="day" stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} width={24} />
              <Tooltip
                contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8, fontSize: 12 }}
                cursor={{ fill: "rgba(168,85,247,0.08)" }}
              />
              <Bar dataKey="hours" fill="var(--accent)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </GlowCard>
    </div>
  );
}

const DEFAULT_POMODORO = { focus: 25, short: 5, long: 15 };

/* Small reusable success toast — fades and slides in, then fades out. */
function ErrorToast({ message }) {
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (message) {
      setLeaving(false);
      setVisible(false);
      const showTimer = requestAnimationFrame(() => setVisible(true));
      const leaveTimer = setTimeout(() => setLeaving(true), 4200); // a touch longer than the success toast, since errors need a beat more time to actually read
      return () => {
        cancelAnimationFrame(showTimer);
        clearTimeout(leaveTimer);
      };
    }
  }, [message]);

  if (!message) return null;

  return (
    <div
      className={
        "fixed z-[200] bottom-24 md:bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-2 text-sm text-red-400 bg-[var(--surface-solid)] border border-red-500/30 rounded-xl px-4 py-2.5 shadow-xl shadow-black/30 transition-all duration-300 max-w-[90vw] " +
        (visible && !leaving ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2")
      }
    >
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-red-500/20">
        <X size={11} className="text-red-400" />
      </span>
      <span>{message}</span>
    </div>
  );
}

function SavedToast({ message }) {
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (message) {
      setLeaving(false);
      setVisible(false);
      const showTimer = requestAnimationFrame(() => setVisible(true));
      const leaveTimer = setTimeout(() => setLeaving(true), 3200);
      return () => {
        cancelAnimationFrame(showTimer);
        clearTimeout(leaveTimer);
      };
    }
  }, [message]);

  if (!message) return null;

  return (
    <div
      className={
        "fixed z-[200] bottom-24 md:bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-2 text-sm text-emerald-400 bg-[var(--surface-solid)] border border-emerald-500/30 rounded-xl px-4 py-2.5 shadow-xl shadow-black/30 transition-all duration-300 " +
        (visible && !leaving ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2")
      }
    >
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/20">
        <Check size={11} className="text-emerald-400" />
      </span>
      <span className="whitespace-nowrap">{message}</span>
    </div>
  );
}

/* Small inline "saving..." / "saved" button state, reused by all three modes. */
function SaveButton({ onClick, saving, label = "Save Session" }) {
  return (
    <button
      onClick={onClick}
      disabled={saving}
      className="mt-6 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-70 text-[var(--text-primary)] text-sm font-medium px-5 py-2.5 rounded-xl transition-all duration-200 flex items-center gap-2 active:scale-95"
    >
      {saving && <Loader2 size={14} className="animate-spin" />}
      {saving ? "Saving..." : label}
    </button>
  );
}

function Focus({ onSessionSaved, isActive }) {
  const [viewMode, setViewMode] = useState("focus"); // "stopwatch" | "focus" | "pomodoro"
  const [saveMessage, setSaveMessage] = useState("");
  const [saveMessageKey, setSaveMessageKey] = useState(0);
  const [saveError, setSaveError] = useState("");
  const [contentVisible, setContentVisible] = useState(true);
  const [myGroupsForFocus, setMyGroupsForFocus] = useState([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState([]);
  const [runningMode, setRunningMode] = useState(null); // "stopwatch" | "focus" | "pomodoro" | null
  const [contributionMax, setContributionMax] = useState(1); // how many groups a single session can contribute to at once
  const [contributionLimitMsgTrigger, setContributionLimitMsgTrigger] = useState(0);

  // This runs the instant the Focus tab is opened at all — unlike the same
  // check living inside StopwatchMode itself, which only ever ran if you
  // happened to be on the Stopwatch sub-tab specifically. Since Focus
  // defaults to "Focus Timer", a closed-and-reopened stopwatch session
  // was silently never recovered unless you manually clicked back into
  // Stopwatch first. Checking here means it's caught no matter which
  // sub-mode the page happens to load into.
  useEffect(() => {
    try {
      const liveRaw = sessionStorage.getItem(STOPWATCH_STORAGE_KEY);
      if (liveRaw) return; // same tab still going — StopwatchMode itself will resume this normally
      const backupRaw = localStorage.getItem(STOPWATCH_STORAGE_KEY);
      if (!backupRaw) return;
      const saved = JSON.parse(backupRaw);
      const abandonedSeconds =
        saved.running && saved.segmentStartedAt
          ? Math.floor((saved.accumulatedSeconds || 0) + (Date.now() - new Date(saved.segmentStartedAt).getTime()) / 1000)
          : Math.floor(saved.accumulatedSeconds || 0);
      localStorage.removeItem(STOPWATCH_STORAGE_KEY);
      if (abandonedSeconds > 0) {
        saveSession("stopwatch", abandonedSeconds, abandonedSeconds, saved.sessionStartedAt || new Date().toISOString());
      }
    } catch {
      // ignore — worst case a genuinely-interrupted session isn't recovered
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isActive) return;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("group_members").select("groups(id, name, icon, goal_locked, pending_activation)").eq("user_id", user.id);
      const groups = (data || []).map((m) => m.groups).filter(Boolean);
      // Active (selectable) groups first, locked/pending ones pushed to the
      // bottom — they can't actually receive a contribution right now, so
      // they shouldn't compete for attention with the ones that can.
      groups.sort((a, b) => {
        const aInactive = a.goal_locked || a.pending_activation ? 1 : 0;
        const bInactive = b.goal_locked || b.pending_activation ? 1 : 0;
        return aInactive - bInactive;
      });
      setMyGroupsForFocus(groups);
      // Drop any previously-selected group that's since become locked/pending
      // — a session can't usefully contribute to it anymore.
      setSelectedGroupIds((ids) => ids.filter((id) => {
        const g = groups.find((x) => x.id === id);
        return g && !g.goal_locked && !g.pending_activation;
      }));
      const { data: entitlements } = await supabase.rpc("get_my_entitlements");
      setContributionMax(entitlements?.group_contribution_max ?? 1);
    })();
  }, [isActive]);

  const toggleGroupSelection = (groupId) => {
    setSelectedGroupIds((ids) => {
      if (ids.includes(groupId)) return ids.filter((id) => id !== groupId);
      if (ids.length >= contributionMax) {
        setContributionLimitMsgTrigger((p) => p + 1);
        return ids;
      }
      return [...ids, groupId];
    });
  };

  // Small fade when switching between Stopwatch / Focus Timer / Pomodoro tabs.
  const switchView = (mode) => {
    if (mode === viewMode) return;
    if (runningMode && runningMode !== mode) return; // a different timer is actively running — can't switch away
    setContentVisible(false);
    setTimeout(() => {
      setViewMode(mode);
      requestAnimationFrame(() => setContentVisible(true));
    }, 150);
  };

  async function saveSession(timerType, durationSeconds, focusedSeconds, startedAt, breakSeconds = 0, completedAt = null) {
    setSaveError("");
    if (focusedSeconds < 1) return false;

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      console.error("Save Session — not logged in:", userError);
      setSaveError("You're not logged in — please log in again and retry.");
      return false;
    }

    const { error } = await supabase.from("study_sessions").insert({
      user_id: userData.user.id,
      timer_type: timerType,
      duration_seconds: Math.round(durationSeconds),
      focused_seconds: Math.round(focusedSeconds),
      break_seconds: Math.round(breakSeconds),
      started_at: startedAt,
      completed_at: completedAt || new Date().toISOString(),
      group_ids: selectedGroupIds,
    });

    // Log a visible activity entry in each contributed-to group's feed —
    // the goal-progress math itself reads group_ids directly from the
    // session, this is purely for the "Alex focused 25m" feed entry.
    if (!error && selectedGroupIds.length > 0) {
      const { data: { user: activityUser } } = await supabase.auth.getUser();
      const { data: profileRow } = await supabase.from("profiles").select("display_name, username").eq("user_id", activityUser.id).maybeSingle();
      const name = profileRow?.display_name || profileRow?.username || "Someone";
      const rows = selectedGroupIds.map((groupId) => ({
        group_id: groupId,
        user_id: activityUser.id,
        type: "focus_contribution",
        message: `${name} completed ${formatDuration(Math.round(focusedSeconds))} of focus.`,
      }));
      supabase.from("group_activity").insert(rows).then(({ error: actErr }) => {
        if (actErr) console.error("Failed to log group activity:", actErr);
      });
    }

    if (error) {
      // This is the important part: log AND show the real reason instead of failing silently.
      console.error("Save Session failed:", error);
      setSaveError(
        (error.message || "").includes("GROUP_CONTRIBUTION_LIMIT")
          ? "Your plan doesn't allow contributing to that many groups at once — deselect one and try again."
          : `Couldn't save: ${error.message || "unknown error"}` +
              (error.message && error.message.toLowerCase().includes("column")
                ? " — have you run the latest Supabase migrations yet?"
                : "")
      );
      return false;
    }

    const mins = Math.round(focusedSeconds / 60);
    // Show what this session ACTUALLY earned, not a flat uncapped number —
    // if today's focus cap was already partly or fully used up, only the
    // remaining headroom counts. Query today's real total (this session is
    // already saved, so it's included) to work out the marginal XP gained.
    const { data: { session: xpSession } } = await supabase.auth.getSession();
    const xpUser = xpSession?.user;
    let xpGained = mins * GROWTH_XP_PER_MINUTE;
    if (xpUser) {
      const [{ data: tierData }, { data: todaySessions }] = await Promise.all([
        supabase.from("profiles").select("premium_tier").eq("user_id", xpUser.id).maybeSingle(),
        supabase.from("study_sessions").select("focused_seconds, completed_at").eq("user_id", xpUser.id).gte("completed_at", new Date(new Date().setHours(0, 0, 0, 0)).toISOString()),
      ]);
      const capMinutes = FOCUS_DAILY_CAP_MINUTES[tierData?.premium_tier || "free"];
      const todayTotalMinutes = (todaySessions || []).reduce((sum, s) => sum + (s.focused_seconds || 0) / 60, 0);
      const cappedAfter = Math.min(todayTotalMinutes, capMinutes);
      const cappedBefore = Math.min(Math.max(0, todayTotalMinutes - mins), capMinutes);
      xpGained = Math.floor(cappedAfter - cappedBefore) * GROWTH_XP_PER_MINUTE;
    }
    setSaveMessage(
      xpGained > 0
        ? `Session saved — ${mins} minute${mins !== 1 ? "s" : ""} focused, +${xpGained.toLocaleString()} XP`
        : `Session saved — ${mins} minute${mins !== 1 ? "s" : ""} focused. Daily focus XP cap already reached.`
    );
    setSaveMessageKey((k) => k + 1);
    onSessionSaved && onSessionSaved(focusedSeconds);
    return true;
  }

  return (
    <div className="flex flex-col items-center min-h-[calc(100vh-140px)] md:min-h-[calc(100vh-100px)] pt-6 md:pt-10">
      <div className="flex gap-2 mb-8 bg-[var(--surface-solid)] border border-[var(--border)] rounded-xl p-1 shrink-0">
        {[
          ["stopwatch", "Stopwatch"],
          ["focus", "Focus Timer"],
          ["pomodoro", "Pomodoro"],
        ].map(([key, label]) => {
          const isBlocked = runningMode && runningMode !== key;
          return (
            <button
              key={key}
              onClick={() => switchView(key)}
              disabled={isBlocked}
              title={isBlocked ? "Finish or save your current session first" : undefined}
              className={
                "px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 " +
                (viewMode === key
                  ? "bg-[var(--accent)] text-[var(--text-primary)]"
                  : isBlocked
                  ? "text-[var(--text-faint)] opacity-40 cursor-not-allowed"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]")
              }
            >
              {label}
            </button>
          );
        })}
      </div>

      <div className="w-full flex flex-col items-center">
        <div className={"w-full flex flex-col items-center transition-all duration-200 " + (contentVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1")}>
          {viewMode === "stopwatch" && <StopwatchMode onSave={saveSession} onRunningChange={(r) => setRunningMode(r ? "stopwatch" : null)} />}
          {viewMode === "focus" && <FocusTimerMode onSave={saveSession} onRunningChange={(r) => setRunningMode(r ? "focus" : null)} />}
          {viewMode === "pomodoro" && <PomodoroMode onSave={saveSession} onRunningChange={(r) => setRunningMode(r ? "pomodoro" : null)} />}
        </div>

        {myGroupsForFocus.length > 0 && (
          <div className="w-full max-w-md mt-8 relative">
            <p className="text-xs text-[var(--text-muted)] text-center mb-2">
              Contribute this session to (up to {contributionMax}):
            </p>
            <FadeMessage trigger={contributionLimitMsgTrigger} text={`Your plan allows contributing to up to ${contributionMax} group${contributionMax === 1 ? "" : "s"} per session.`} />
            <div className="flex flex-wrap items-center justify-center gap-2">
              {myGroupsForFocus.map((g) => {
                const selected = selectedGroupIds.includes(g.id);
                const inactive = g.goal_locked || g.pending_activation;
                const atLimit = !selected && !inactive && selectedGroupIds.length >= contributionMax;
                return (
                  <button
                    key={g.id}
                    onClick={() => !inactive && toggleGroupSelection(g.id)}
                    disabled={inactive}
                    title={
                      inactive
                        ? g.pending_activation
                          ? "Not activated yet — can't contribute until it starts"
                          : "Locked — waiting for the owner to start the next round"
                        : atLimit
                        ? `Your plan allows up to ${contributionMax} at once — deselect one first`
                        : undefined
                    }
                    className={
                      "flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors " +
                      (inactive
                        ? "bg-[var(--surface-2)]/40 border-[var(--border)] text-[var(--text-faint)] cursor-not-allowed opacity-60"
                        : selected
                        ? "bg-[rgb(var(--accent-rgb)/0.15)] border-[var(--accent)] text-[var(--accent-text)]"
                        : atLimit
                        ? "bg-[var(--surface-2)]/40 border-[var(--border)] text-[var(--text-faint)] opacity-60"
                        : "bg-[var(--surface-2)] border-[var(--border)] text-[var(--text-secondary-strong)] hover:border-[var(--accent)]")
                    }
                  >
                    <span>{g.icon}</span>
                    {g.name}
                    {inactive ? <Lock size={11} /> : selected && <Check size={12} />}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <SavedToast key={saveMessageKey} message={saveMessage} />
        {saveError && (
          <div className="mt-6 max-w-sm text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5">
            {saveError}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Stopwatch ---------- */

// Writes the current status straight to the database — no local state to get
// out of sync, and it's what friends' Realtime subscriptions pick up. Starting
// a new active status (focusing/break/stopwatch) resets session_started_at so
// elapsed time counts from when THIS run began, not accumulated total time.
async function setPresence(status, category) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const isActive = status === "focusing" || status === "break" || status === "stopwatch";
  const { error } = await supabase.from("user_presence").upsert({
    user_id: user.id,
    status,
    category: category || null,
    session_started_at: isActive ? new Date().toISOString() : null,
    last_heartbeat: new Date().toISOString(),
  });
  if (error) console.error("setPresence failed — is the presence migration run yet?", error);
}

// Keeps last_heartbeat fresh while a timer is actively running — this is
// what lets viewers detect "actually offline" (heartbeat gone stale) versus
// "still here, just paused," without needing a reliable disconnect signal.
async function sendPresenceHeartbeat() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase.from("user_presence").update({ last_heartbeat: new Date().toISOString() }).eq("user_id", user.id);
  if (error) console.error("sendPresenceHeartbeat failed:", error);
}

const PRESENCE_HEARTBEAT_MS = 45000;

const STOPWATCH_STORAGE_KEY = "studyflow-stopwatch-state";

function StopwatchMode({ onSave, onRunningChange }) {
  const { requireAuth } = useRequireAuth();
  // The source of truth is real timestamps, not a naive per-tick counter —
  // accumulatedSeconds banks whatever was earned in PAST run segments, and
  // segmentStartedAt marks when the CURRENT segment began (null if paused).
  // Elapsed time for the current segment is always recomputed from
  // wall-clock time, so it's correct even through browser tab-throttling,
  // and — the actual point of all this — it's persisted to localStorage so
  // switching to a different tab inside the app, reloading the page, or
  // closing and reopening the browser entirely never loses a running
  // session. It only ever goes away when you explicitly Save or Reset.
  const [accumulatedSeconds, setAccumulatedSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const [segmentStartedAt, setSegmentStartedAt] = useState(null);
  const [sessionStartedAt, setSessionStartedAt] = useState(null); // when this whole session first began, for the saved record's timestamp
  const [seconds, setSeconds] = useState(0); // recomputed display value
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const restoredRef = useRef(false);

  // Two different storages doing two different jobs:
  //   - sessionStorage is per-tab and clears the instant the tab actually
  //     closes. If it still has data on mount, this is the SAME tab
  //     session continuing (e.g. switched to another app tab and back) —
  //     resume seamlessly, exactly where it left off.
  //   - localStorage survives an actual close. If sessionStorage came back
  //     empty but localStorage has something, the site was genuinely
  //     closed while this was running — in that case, DON'T resume (you
  //     already stopped studying), auto-save what was recorded instead.
  useEffect(() => {
    let restoredLive = false;
    try {
      const liveRaw = sessionStorage.getItem(STOPWATCH_STORAGE_KEY);
      if (liveRaw) {
        const saved = JSON.parse(liveRaw);
        // A browser's "continue where you left off" startup setting can
        // restore sessionStorage across an actual close — a heartbeat much
        // older than the 5s refresh interval means it wasn't really still
        // live, whatever sessionStorage claims, so fall through to backup
        // recovery instead of wrongly resuming a long-dead session.
        const heartbeatAge = saved.lastHeartbeatAt ? (Date.now() - new Date(saved.lastHeartbeatAt).getTime()) / 1000 : 0;
        if (!(saved.running && heartbeatAge > 30)) {
          setAccumulatedSeconds(saved.accumulatedSeconds || 0);
          setRunning(!!saved.running);
          setSegmentStartedAt(saved.segmentStartedAt || null);
          setSessionStartedAt(saved.sessionStartedAt || null);
          restoredLive = true;
        }
      }
    } catch {
      // ignore a corrupted/unavailable sessionStorage entry
    }

    if (!restoredLive) {
      try {
        const backupRaw = sessionStorage.getItem(STOPWATCH_STORAGE_KEY) || localStorage.getItem(STOPWATCH_STORAGE_KEY);
        if (backupRaw) {
          const saved = JSON.parse(backupRaw);
          const lastKnownAt = saved.lastHeartbeatAt ? new Date(saved.lastHeartbeatAt).getTime() : Date.now();
          const abandonedSeconds =
            saved.running && saved.segmentStartedAt
              ? Math.floor((saved.accumulatedSeconds || 0) + (lastKnownAt - new Date(saved.segmentStartedAt).getTime()) / 1000)
              : Math.floor(saved.accumulatedSeconds || 0);
          if (abandonedSeconds > 0) {
            onSave("stopwatch", abandonedSeconds, abandonedSeconds, saved.sessionStartedAt || new Date(lastKnownAt).toISOString(), 0, new Date(lastKnownAt).toISOString());
          }
        }
      } catch {
        // ignore — worst case a genuinely-interrupted session isn't recovered
      } finally {
        try {
          sessionStorage.removeItem(STOPWATCH_STORAGE_KEY);
          localStorage.removeItem(STOPWATCH_STORAGE_KEY);
        } catch {}
      }
    }
    restoredRef.current = true;
  }, []);

  // Persist on every change, to BOTH storages. Skipped until restore has
  // run once, so we never overwrite real saved data with the initial blank
  // state during the first render.
  useEffect(() => {
    if (!restoredRef.current) return;
    try {
      if (accumulatedSeconds === 0 && !running && !sessionStartedAt) {
        sessionStorage.removeItem(STOPWATCH_STORAGE_KEY);
        localStorage.removeItem(STOPWATCH_STORAGE_KEY);
      } else {
        const payload = JSON.stringify({ accumulatedSeconds, running, segmentStartedAt, sessionStartedAt, lastHeartbeatAt: new Date().toISOString() });
        sessionStorage.setItem(STOPWATCH_STORAGE_KEY, payload);
        localStorage.setItem(STOPWATCH_STORAGE_KEY, payload);
      }
    } catch {
      // ignore — worst case this specific update doesn't persist
    }
  }, [accumulatedSeconds, running, segmentStartedAt, sessionStartedAt]);

  // A heartbeat that refreshes the persisted timestamp every few seconds
  // while running — not just at start/pause. This is what recovery uses to
  // know "the last moment we know for sure this was actually running,"
  // rather than "now" (which could be hours or days after the tab actually
  // closed, wrongly counting that whole gap as focus time and attributing
  // the session to the wrong day).
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      try {
        const raw = sessionStorage.getItem(STOPWATCH_STORAGE_KEY);
        if (!raw) return;
        const saved = JSON.parse(raw);
        const payload = JSON.stringify({ ...saved, lastHeartbeatAt: new Date().toISOString() });
        sessionStorage.setItem(STOPWATCH_STORAGE_KEY, payload);
        localStorage.setItem(STOPWATCH_STORAGE_KEY, payload);
      } catch {}
    }, 5000);
    return () => clearInterval(id);
  }, [running]);


  // Recompute the displayed seconds every tick from the real timestamp,
  // not by naively incrementing — stays accurate regardless of throttling.
  useEffect(() => {
    const update = () => {
      if (running && segmentStartedAt) {
        const elapsed = (Date.now() - new Date(segmentStartedAt).getTime()) / 1000;
        setSeconds(Math.max(0, Math.floor(accumulatedSeconds + elapsed)));
      } else {
        setSeconds(Math.max(0, Math.floor(accumulatedSeconds)));
      }
    };
    update();
    if (!running) return;
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [running, segmentStartedAt, accumulatedSeconds]);

  useEffect(() => {
    onRunningChange?.(running);
  }, [running, onRunningChange]);

  useEffect(() => {
    setPresence(running ? "stopwatch" : "idle");
    if (!running) return;
    const heartbeat = setInterval(sendPresenceHeartbeat, PRESENCE_HEARTBEAT_MS);
    return () => clearInterval(heartbeat);
  }, [running]);

  const toggle = () => {
    requireAuth(() => {
      if (!running) {
        if (!sessionStartedAt) setSessionStartedAt(new Date().toISOString());
        setSegmentStartedAt(new Date().toISOString());
        setRunning(true);
      } else {
        // Pausing — bank this segment's elapsed time into the running total.
        const elapsed = segmentStartedAt ? (Date.now() - new Date(segmentStartedAt).getTime()) / 1000 : 0;
        setAccumulatedSeconds((a) => a + elapsed);
        setSegmentStartedAt(null);
        setRunning(false);
      }
    });
  };

  const reset = async () => {
    setRunning(false);
    if (seconds > 0) {
      await onSave("stopwatch", seconds, seconds, sessionStartedAt || new Date().toISOString());
    }
    setAccumulatedSeconds(0);
    setSegmentStartedAt(null);
    setSessionStartedAt(null);
    setJustSaved(false);
  };

  // Used only right after a successful save() — just clears state for a
  // fresh session, with NO re-save check. Using reset() here instead would
  // be a real bug: if the person starts a brand new session during the
  // brief post-save confirmation window, reset()'s own "seconds > 0" check
  // would see the NEW session's elapsed time and either re-save it
  // prematurely or wipe it out entirely when this fires.
  const clearForNewSession = () => {
    setRunning(false);
    setAccumulatedSeconds(0);
    setSegmentStartedAt(null);
    setSessionStartedAt(null);
    setJustSaved(false);
  };

  const save = async () => {
    setRunning(false);
    setSaving(true);
    const ok = await onSave("stopwatch", seconds, seconds, sessionStartedAt || new Date().toISOString());
    setSaving(false);
    if (ok) {
      playCompletionSound();
      setJustSaved(true);
      setTimeout(() => clearForNewSession(), 400); // brief confirmation, then ready for a new session
    }
  };

  // Silent auto-save if the page actually closes — writes straight to Supabase
  // WITHOUT touching any visible timer state (no reset, no pause, no UI change).
  // This way, even if it fires unexpectedly (e.g. some browsers' background tab
  // handling), the timer just keeps running undisturbed — worst case is one
  // harmless extra save, never a disrupted session. This is on top of the
  // localStorage persistence above, not a replacement for it — pagehide is
  // unreliable for actually completing an async network request during a
  // real tab close, while localStorage read-back on next load always works.
  const secondsRef = useRef(seconds);
  useEffect(() => {
    secondsRef.current = seconds;
  }, [seconds]);
  const sessionStartedAtRef = useRef(sessionStartedAt);
  useEffect(() => {
    sessionStartedAtRef.current = sessionStartedAt;
  }, [sessionStartedAt]);
  useEffect(() => {
    function handleInterrupt() {
      if (secondsRef.current > 0) {
        try {
          localStorage.removeItem(STOPWATCH_STORAGE_KEY);
        } catch {}
        onSave("stopwatch", secondsRef.current, secondsRef.current, sessionStartedAtRef.current || new Date().toISOString());
      }
    }
    window.addEventListener("pagehide", handleInterrupt);
    return () => {
      window.removeEventListener("pagehide", handleInterrupt);
    };
  }, []);

  const h = String(Math.floor(seconds / 3600)).padStart(2, "0");
  const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
  const s = String(seconds % 60).padStart(2, "0");

  return (
    <>
      <div className={"relative h-72 w-72 flex items-center justify-center rounded-full border-4 transition-colors duration-300 " + (running ? "border-[rgb(var(--accent-rgb)/0.6)]" : "border-[var(--border)]")}>
        {running && <div className="absolute inset-0 rounded-full border-4 border-[rgb(var(--accent-rgb)/0.3)] animate-ping" style={{ animationDuration: "2s" }} />}
        <div className="flex flex-col items-center">
          <span className="text-5xl font-semibold text-[var(--text-primary)] tabular-nums">
            {h}:{m}:{s}
          </span>
          <span className="text-xs text-[var(--text-muted)] mt-2 uppercase tracking-wide">Elapsed time</span>
        </div>
      </div>
      {(running || seconds > 0) && (
        <p className="text-xs text-[var(--text-faint)] mt-4 text-center max-w-[240px]">Don't forget to save your session before closing, or you'll lose your progress.</p>
      )}
      <div className="flex items-center gap-4 mt-8">
        <button onClick={reset} className="h-11 w-11 rounded-full bg-[var(--surface-solid)] border border-[var(--border)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all duration-200 active:scale-90">
          <RotateCcw size={17} />
        </button>
        <button onClick={toggle} className="h-16 w-16 rounded-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] flex items-center justify-center text-[var(--text-primary)] glow-accent-50 transition-all duration-200 active:scale-90">
          {running ? <Pause size={24} /> : <Play size={24} className="ml-1" />}
        </button>
      </div>
      {justSaved ? (
        <div className="mt-6 flex items-center gap-2 text-emerald-400 text-sm font-medium">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/15">
            <Check size={13} />
          </span>
          Saved! {formatDuration(seconds)} added
        </div>
      ) : (
        seconds > 0 && <SaveButton onClick={save} saving={saving} />
      )}
    </>
  );
}

/* ---------- Focus Timer (no auto break) ---------- */

function FocusTimerMode({ onSave, onRunningChange }) {
  const { requireAuth } = useRequireAuth();
  const [configured, setConfigured] = useState(false);
  const [durationMin, setDurationMin] = useState(25);
  const [draftMin, setDraftMin] = useState(25);
  const [secondsLeft, setSecondsLeft] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [startedAt, setStartedAt] = useState(null);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [savedSeconds, setSavedSeconds] = useState(0);
  const [viewFading, setViewFading] = useState(false);
  const [justCompleted, setJustCompleted] = useState(false);
  const [completePopIn, setCompletePopIn] = useState(false);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setSecondsLeft((s) => {
          if (s <= 1) {
            clearInterval(intervalRef.current);
            setRunning(false);
            setJustCompleted(true);
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    }
    return () => clearInterval(intervalRef.current);
  }, [running]);

  useEffect(() => {
    onRunningChange?.(running);
  }, [running, onRunningChange]);

  useEffect(() => {
    setPresence(configured && running ? "focusing" : "idle");
    if (!(configured && running)) return;
    const heartbeat = setInterval(sendPresenceHeartbeat, PRESENCE_HEARTBEAT_MS);
    return () => clearInterval(heartbeat);
  }, [running, configured]);

  const begin = () => {
    setViewFading(true);
    setTimeout(() => {
      setDurationMin(draftMin);
      setSecondsLeft(draftMin * 60);
      setConfigured(true);
      setStartedAt(new Date().toISOString());
      setRunning(false);
      setJustCompleted(false);
      requestAnimationFrame(() => setViewFading(false));
    }, 220);
  };

  // Fully resets back to the setup screen, ready to start a brand-new timer.
  const backToSetup = () => {
    setConfigured(false);
    setRunning(false);
    setJustCompleted(false);
    setStartedAt(null);
    setDraftMin(durationMin);
  };

  const toggle = () => setRunning((r) => !r);

  const reset = () => {
    setRunning(false);
    setSecondsLeft(durationMin * 60);
    setJustCompleted(false);
  };

  const changeDuration = async () => {
    setRunning(false);
    const soFar = durationMin * 60 - secondsLeft;
    if (soFar > 0) {
      await onSave("focus", durationMin * 60, soFar, startedAt || new Date().toISOString());
    }
    setViewFading(true);
    setTimeout(() => {
      setConfigured(false);
      setDraftMin(durationMin);
      requestAnimationFrame(() => setViewFading(false));
    }, 220);
  };

  const focusedSoFar = durationMin * 60 - secondsLeft;
  const isComplete = configured && secondsLeft === 0;

  useEffect(() => {
    if (isComplete) {
      playCompletionSound();
      setCompletePopIn(false);
      const t = requestAnimationFrame(() => setCompletePopIn(true));
      return () => cancelAnimationFrame(t);
    } else {
      setCompletePopIn(false);
    }
  }, [isComplete]);

  const save = async () => {
    setRunning(false);
    setSaving(true);
    const ok = await onSave("focus", durationMin * 60, focusedSoFar, startedAt || new Date().toISOString());
    setSaving(false);
    if (ok) {
      if (!isComplete) playCompletionSound(); // isComplete already played its own sound above
      setSavedSeconds(focusedSoFar);
      setJustSaved(true);
      // Brief pause so the person actually sees the confirmation, then fade out,
      // swap to the setup screen, and fade it back in — instead of an instant snap.
      setTimeout(() => {
        setJustSaved(false);
        setViewFading(true);
        setTimeout(() => {
          backToSetup();
          requestAnimationFrame(() => setViewFading(false));
        }, 150);
      }, 400);
    }
  };

  // Silent auto-save if the page actually closes — writes straight to Supabase
  // WITHOUT touching any visible timer state, so it can never disrupt an
  // in-progress session even if it fires unexpectedly.
  const durationMinRef = useRef(durationMin);
  useEffect(() => {
    durationMinRef.current = durationMin;
  }, [durationMin]);
  const focusedSoFarRef = useRef(focusedSoFar);
  useEffect(() => {
    focusedSoFarRef.current = focusedSoFar;
  }, [focusedSoFar]);
  const startedAtRef = useRef(startedAt);
  useEffect(() => {
    startedAtRef.current = startedAt;
  }, [startedAt]);
  useEffect(() => {
    function handleInterrupt() {
      if (focusedSoFarRef.current > 0) {
        onSave("focus", durationMinRef.current * 60, focusedSoFarRef.current, startedAtRef.current || new Date().toISOString());
      }
    }
    window.addEventListener("pagehide", handleInterrupt);
    return () => {
      window.removeEventListener("pagehide", handleInterrupt);
    };
  }, []);

  if (!configured) {
    return (
      <div className={"transition-all duration-300 " + (viewFading ? "opacity-0 scale-95" : "opacity-100 scale-100")}>
        <GlowCard glow className="w-full max-w-sm">
          <h2 className="text-[var(--text-primary)] font-medium mb-1">Set your focus duration</h2>
          <p className="text-xs text-[var(--text-muted)] mb-5">Runs continuously with no automatic breaks.</p>
          <DurationPicker value={draftMin} onChange={setDraftMin} presets={[15, 25, 45, 60, 90, 120]} max={300} />
          <button onClick={() => requireAuth(begin)} className="w-full mt-6 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--text-primary)] font-medium py-3 rounded-xl transition-all duration-200 active:scale-[0.98]">
            Start Focus Timer
          </button>
        </GlowCard>
      </div>
    );
  }

  const pct = ((durationMin * 60 - secondsLeft) / (durationMin * 60)) * 100;
  const clockDisplay = formatClock(secondsLeft);
  const r = 90;
  const circumference = 2 * Math.PI * r;

  return (
    <div className={"flex flex-col items-center transition-all duration-300 " + (viewFading ? "opacity-0 scale-95" : "opacity-100 scale-100")}>
      <button onClick={changeDuration} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary-strong)] mb-4 transition-colors">
        Change duration
      </button>
      <div className="relative h-72 w-72">
        {isComplete && (
          <div className="absolute inset-0 rounded-full border-4 border-emerald-400/40 animate-ping" style={{ animationDuration: "1.4s" }} />
        )}
        <svg viewBox="0 0 200 200" className="h-full w-full -rotate-90">
          <circle cx="100" cy="100" r={r} fill="none" stroke="#27272a" strokeWidth="10" />
          <circle
            cx="100" cy="100" r={r} fill="none"
            stroke={isComplete ? "#34d399" : "url(#grad2)"}
            strokeWidth="10" strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference - (pct / 100) * circumference}
            style={{ transition: "stroke-dashoffset 1s linear, stroke 0.4s ease" }}
          />
          <defs>
            <linearGradient id="grad2" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="var(--accent)" />
              <stop offset="100%" stopColor="var(--accent-hover)" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {isComplete ? (
            <div className={"flex flex-col items-center transition-all duration-500 " + (completePopIn ? "scale-100 opacity-100" : "scale-75 opacity-0")}>
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 mb-2">
                <Check size={22} className="text-emerald-400" />
              </span>
              <span className="text-xl font-semibold text-[var(--text-primary)]">Session complete!</span>
              <span className="text-xs text-[var(--text-muted)] mt-1 uppercase tracking-wide">{formatMinutesLong(durationMin)} focused</span>
            </div>
          ) : (
            <>
              <span className="text-4xl sm:text-5xl font-semibold text-[var(--text-primary)] tabular-nums">{clockDisplay}</span>
              <span className="text-xs text-[var(--text-muted)] mt-2 uppercase tracking-wide">Focus time</span>
            </>
          )}
        </div>
      </div>
      {(running || secondsLeft !== durationMin * 60) && (
        <p className="text-xs text-[var(--text-faint)] mt-4 text-center max-w-[240px]">Don't forget to save your session before closing, or you'll lose your progress.</p>
      )}
      <div className="flex items-center gap-4 mt-8">
        <button onClick={reset} className="h-11 w-11 rounded-full bg-[var(--surface-solid)] border border-[var(--border)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all duration-200 active:scale-90">
          <RotateCcw size={17} />
        </button>
        {!isComplete && (
          <button onClick={toggle} className="h-16 w-16 rounded-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] flex items-center justify-center text-[var(--text-primary)] glow-accent-50 transition-all duration-200 active:scale-90">
            {running ? <Pause size={24} /> : <Play size={24} className="ml-1" />}
          </button>
        )}
      </div>
      {justSaved ? (
        <div className="mt-6 flex items-center gap-2 text-emerald-400 text-sm font-medium">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/15">
            <Check size={13} />
          </span>
          Saved! {formatDuration(savedSeconds)} added
        </div>
      ) : (
        focusedSoFar > 0 && <SaveButton onClick={save} saving={saving} label="Save Session" />
      )}
    </div>
  );
}

/* ---------- Pomodoro (auto breaks, only focus time counted) ---------- */

function PomodoroMode({ onSave, onRunningChange }) {
  const { requireAuth } = useRequireAuth();
  const [configured, setConfigured] = useState(false);
  const [durations, setDurations] = useState(DEFAULT_POMODORO);
  const [draftDurations, setDraftDurations] = useState(DEFAULT_POMODORO);
  const [mode, setMode] = useState("focus");
  // Each mode keeps its own independent remaining time, so switching tabs
  // pauses whichever is running instead of wiping its progress.
  const [secondsLeftByMode, setSecondsLeftByMode] = useState({
    focus: DEFAULT_POMODORO.focus * 60,
    short: DEFAULT_POMODORO.short * 60,
    long: DEFAULT_POMODORO.long * 60,
  });
  const [running, setRunning] = useState(false);
  const [sessionCount, setSessionCount] = useState(0);
  const [focusedAccumulated, setFocusedAccumulated] = useState(0);
  const [breakAccumulated, setBreakAccumulated] = useState(0);
  const [startedAt, setStartedAt] = useState(null);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [savedSeconds, setSavedSeconds] = useState(0);
  const [viewFading, setViewFading] = useState(false);
  const [phaseJustChanged, setPhaseJustChanged] = useState(false);
  const intervalRef = useRef(null);

  const secondsLeft = secondsLeftByMode[mode];

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setSecondsLeftByMode((prev) => {
          const current = prev[mode];
          if (current <= 1) {
            clearInterval(intervalRef.current);
            handlePhaseEnd();
            return { ...prev, [mode]: 0 };
          }
          return { ...prev, [mode]: current - 1 };
        });
      }, 1000);
    }
    return () => clearInterval(intervalRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, mode]);

  useEffect(() => {
    onRunningChange?.(running);
  }, [running, onRunningChange]);

  useEffect(() => {
    const isActive = configured && running;
    setPresence(isActive ? (mode === "focus" ? "focusing" : "break") : "idle");
    if (!isActive) return;
    const heartbeat = setInterval(sendPresenceHeartbeat, PRESENCE_HEARTBEAT_MS);
    return () => clearInterval(heartbeat);
  }, [running, mode, configured]);

  function pulsePhaseChange() {
    setPhaseJustChanged(true);
    setTimeout(() => setPhaseJustChanged(false), 700);
  }

  function handlePhaseEnd() {
    setRunning(false);
    playCompletionSound();
    if (mode === "focus") {
      const newCount = sessionCount + 1;
      setSessionCount(newCount);
      setFocusedAccumulated((f) => f + durations.focus * 60);
      const nextMode = newCount % 4 === 0 ? "long" : "short";
      // A natural phase transition starts the next phase fresh, at its full duration.
      setSecondsLeftByMode((prev) => ({ ...prev, [nextMode]: durations[nextMode] * 60 }));
      setMode(nextMode);
      pulsePhaseChange();
      setRunning(true);
    } else {
      // A break phase (short or long) just finished naturally — count its
      // full duration as real break time taken.
      setBreakAccumulated((b) => b + durations[mode] * 60);
      setSecondsLeftByMode((prev) => ({ ...prev, focus: durations.focus * 60 }));
      setMode("focus");
      pulsePhaseChange();
      setRunning(true);
    }
  }

  const begin = () => {
    setViewFading(true);
    setTimeout(() => {
      setDurations(draftDurations);
      setSecondsLeftByMode({
        focus: draftDurations.focus * 60,
        short: draftDurations.short * 60,
        long: draftDurations.long * 60,
      });
      setMode("focus");
      setSessionCount(0);
      setFocusedAccumulated(0);
      setBreakAccumulated(0);
      setStartedAt(new Date().toISOString());
      setConfigured(true);
      setRunning(false);
      requestAnimationFrame(() => setViewFading(false));
    }, 220);
  };

  const openSettings = async () => {
    setRunning(false);
    if (currentFocusedTotal > 0) {
      const isInBreakNow = mode === "short" || mode === "long";
      const partialBreakNow = isInBreakNow ? Math.max(0, durations[mode] * 60 - secondsLeftByMode[mode]) : 0;
      const totalBreak = breakAccumulated + partialBreakNow;
      await onSave(
        "pomodoro",
        Math.max(plannedFocusTotal, currentFocusedTotal),
        currentFocusedTotal,
        startedAt || new Date().toISOString(),
        totalBreak
      );
    }
    setViewFading(true);
    setTimeout(() => {
      setDraftDurations(durations);
      setConfigured(false);
      requestAnimationFrame(() => setViewFading(false));
    }, 220);
  };

  // Switching tabs just pauses whichever mode was running and shows the
  // other mode's own remaining time — nothing gets reset.
  const switchMode = (m) => {
    clearInterval(intervalRef.current);
    setRunning(false);
    setMode(m);
  };

  const reset = () => {
    clearInterval(intervalRef.current);
    setRunning(false);
    setSecondsLeftByMode((prev) => ({ ...prev, [mode]: durations[mode] * 60 }));
  };

  // Focus progress is always measured against focus's own remaining time,
  // regardless of which mode tab happens to be showing right now.
  const currentFocusedTotal = focusedAccumulated + Math.max(0, durations.focus * 60 - secondsLeftByMode.focus);
  // What they were actually attempting: every fully-completed round, plus one
  // more full round's target if they've made any progress on an incomplete
  // one. This is what "duration_seconds" should represent for a completion %
  // to mean anything — previously it just duplicated the actual value, which
  // made every saved Pomodoro session look like 100% completion regardless
  // of whether it was cut short.
  const hasPartialCurrentRound = secondsLeftByMode.focus < durations.focus * 60;
  const plannedFocusTotal = sessionCount * durations.focus * 60 + (hasPartialCurrentRound ? durations.focus * 60 : 0);

  const save = async () => {
    setRunning(false);
    setSaving(true);
    const totalToSave = currentFocusedTotal;
    const isInBreakNow = mode === "short" || mode === "long";
    const partialBreakNow = isInBreakNow ? Math.max(0, durations[mode] * 60 - secondsLeftByMode[mode]) : 0;
    const totalBreakToSave = breakAccumulated + partialBreakNow;
    const ok = await onSave(
      "pomodoro",
      Math.max(plannedFocusTotal, totalToSave), // never let "planned" undercount the actual
      totalToSave,
      startedAt || new Date().toISOString(),
      totalBreakToSave
    );
    setSaving(false);
    if (ok) {
      playCompletionSound();
      setSavedSeconds(totalToSave);
      setFocusedAccumulated(0);
      setBreakAccumulated(0);
      // Prevent the just-saved focus progress from being double-counted on the next save.
      setSecondsLeftByMode((prev) => ({ ...prev, focus: durations.focus * 60 }));
      setJustSaved(true);
      // Brief pause so the person actually sees the confirmation, then fade out,
      // return to the duration setup screen, and fade it back in.
      setTimeout(() => {
        setJustSaved(false);
        setViewFading(true);
        setTimeout(() => {
          setDraftDurations(durations);
          setConfigured(false);
          requestAnimationFrame(() => setViewFading(false));
        }, 150);
      }, 400);
    }
  };

  // Silent auto-save if the page actually closes — writes straight to Supabase
  // WITHOUT touching any visible timer state, so it can never disrupt an
  // in-progress session even if it fires unexpectedly.
  const currentFocusedTotalRef = useRef(currentFocusedTotal);
  useEffect(() => {
    currentFocusedTotalRef.current = currentFocusedTotal;
  }, [currentFocusedTotal]);
  const plannedFocusTotalRef = useRef(plannedFocusTotal);
  useEffect(() => {
    plannedFocusTotalRef.current = plannedFocusTotal;
  }, [plannedFocusTotal]);
  const breakAccumulatedRef = useRef(breakAccumulated);
  useEffect(() => {
    breakAccumulatedRef.current = breakAccumulated;
  }, [breakAccumulated]);
  const pomodoroStartedAtRef = useRef(startedAt);
  useEffect(() => {
    pomodoroStartedAtRef.current = startedAt;
  }, [startedAt]);
  useEffect(() => {
    function handleInterrupt() {
      if (currentFocusedTotalRef.current > 0) {
        onSave(
          "pomodoro",
          Math.max(plannedFocusTotalRef.current, currentFocusedTotalRef.current),
          currentFocusedTotalRef.current,
          pomodoroStartedAtRef.current || new Date().toISOString(),
          breakAccumulatedRef.current
        );
      }
    }
    window.addEventListener("pagehide", handleInterrupt);
    return () => {
      window.removeEventListener("pagehide", handleInterrupt);
    };
  }, []);

  const total = durations[mode] * 60;
  const pct = total ? ((total - secondsLeft) / total) * 100 : 0;
  const clockDisplay = formatClock(secondsLeft);
  const r = 90;
  const circumference = 2 * Math.PI * r;

  if (!configured) {
    const presetsFor = { focus: [15, 25, 45, 60], short: [5, 10, 15], long: [15, 20, 30] };
    const maxFor = { focus: 300, short: 60, long: 90 };
    return (
      <div className={"transition-all duration-300 " + (viewFading ? "opacity-0 scale-95" : "opacity-100 scale-100")}>
        <GlowCard glow className="w-full max-w-sm">
          <h2 className="text-[var(--text-primary)] font-medium mb-1">Set up your session</h2>
          <p className="text-xs text-[var(--text-muted)] mb-5">Choose durations once — breaks switch automatically after that.</p>
          <div className="space-y-4">
            {[
              ["focus", "Focus length"],
              ["short", "Short break"],
              ["long", "Long break"],
            ].map(([key, label]) => (
              <div key={key}>
                <p className="text-sm text-[var(--text-secondary-strong)] text-center mb-2">{label}</p>
                <DurationPicker
                  value={draftDurations[key]}
                  onChange={(v) => setDraftDurations((d) => ({ ...d, [key]: v }))}
                  presets={presetsFor[key]}
                  max={maxFor[key]}
                />
              </div>
            ))}
          </div>
          <button onClick={() => requireAuth(begin)} className="w-full mt-6 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--text-primary)] font-medium py-3 rounded-xl transition-all duration-200 active:scale-[0.98]">
            Start Pomodoro
          </button>
        </GlowCard>
      </div>
    );
  }

  return (
    <div className={"flex flex-col items-center transition-all duration-300 " + (viewFading ? "opacity-0 scale-95" : "opacity-100 scale-100")}>
      <div className="flex items-center gap-2 mb-6">
        <div className="flex gap-2 bg-[var(--surface-solid)] border border-[var(--border)] rounded-xl p-1">
          {[
            ["focus", "Focus"],
            ["short", "Short Break"],
            ["long", "Long Break"],
          ].map(([key, label]) => (
            <button key={key} onClick={() => switchMode(key)} className={"px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 " + (mode === key ? "bg-[var(--accent)] text-[var(--text-primary)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]")}>
              {label}
            </button>
          ))}
        </div>
        <button onClick={openSettings} title="Change durations" className="h-9 w-9 rounded-lg bg-[var(--surface-solid)] border border-[var(--border)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all duration-200 active:scale-90">
          <SettingsIcon size={16} />
        </button>
      </div>

      <div className={"relative h-72 w-72 transition-transform duration-500 " + (phaseJustChanged ? "scale-105" : "scale-100")}>
        {phaseJustChanged && (
          <div className={"absolute inset-0 rounded-full border-4 animate-ping " + (mode === "focus" ? "border-[rgb(var(--accent-rgb)/0.4)]" : "border-emerald-400/40")} style={{ animationDuration: "1s" }} />
        )}
        <svg viewBox="0 0 200 200" className="h-full w-full -rotate-90">
          <circle cx="100" cy="100" r={r} fill="none" stroke="#27272a" strokeWidth="10" />
          <circle cx="100" cy="100" r={r} fill="none" stroke="url(#grad3)" strokeWidth="10" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference - (pct / 100) * circumference} style={{ transition: "stroke-dashoffset 1s linear" }} />
          <defs>
            <linearGradient id="grad3" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="var(--accent)" />
              <stop offset="100%" stopColor="var(--accent-hover)" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-4xl sm:text-5xl font-semibold text-[var(--text-primary)] tabular-nums">{clockDisplay}</span>
          <span className="text-xs text-[var(--text-muted)] mt-2 uppercase tracking-wide">{mode === "focus" ? "Focus time" : "Break time"}</span>
        </div>
      </div>

      {(running || focusedAccumulated > 0 || mode !== "focus" || secondsLeft !== durations.focus * 60) && (
        <p className="text-xs text-[var(--text-faint)] mt-4 text-center max-w-[240px]">Don't forget to save your session before closing, or you'll lose your progress.</p>
      )}

      <div className="flex items-center gap-4 mt-8">
        <button onClick={reset} className="h-11 w-11 rounded-full bg-[var(--surface-solid)] border border-[var(--border)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all duration-200 active:scale-90">
          <RotateCcw size={17} />
        </button>
        <button onClick={() => setRunning((r) => !r)} className="h-16 w-16 rounded-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] flex items-center justify-center text-[var(--text-primary)] glow-accent-50 transition-all duration-200 active:scale-90">
          {running ? <Pause size={24} /> : <Play size={24} className="ml-1" />}
        </button>
      </div>

      {justSaved ? (
        <div className="mt-4 flex items-center gap-2 text-emerald-400 text-sm font-medium">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/15">
            <Check size={13} />
          </span>
          Saved! {formatDuration(savedSeconds)} added
        </div>
      ) : (
        (focusedAccumulated > 0 || (mode === "focus" && durations.focus * 60 - secondsLeft > 0)) && (
          <SaveButton onClick={save} saving={saving} label="Save Session" />
        )
      )}
    </div>
  );
}

/* ---------- Custom date + time picker (replaces the plain native input) ---------- */

function DateTimePicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => (value ? new Date(value) : new Date()));
  const [draftDate, setDraftDate] = useState(() => (value ? new Date(value) : null));
  const containerRef = useRef(null);

  useEffect(() => {
    setDraftDate(value ? new Date(value) : null);
    setViewDate(value ? new Date(value) : new Date());
  }, [value]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const totalDays = new Date(year, month + 1, 0).getDate();
  const startWeekday = new Date(year, month, 1).getDay();
  const monthLabel = viewDate.toLocaleDateString([], { month: "long", year: "numeric" });

  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= totalDays; d++) cells.push(d);

  function selectDay(d) {
    const base = draftDate ? new Date(draftDate) : new Date();
    let mins = Math.round(base.getMinutes() / 5) * 5;
    if (mins === 60) mins = 55;
    setDraftDate(new Date(year, month, d, base.getHours(), mins));
  }

  function setHour12(h12) {
    const base = draftDate ? new Date(draftDate) : new Date();
    const isPM = base.getHours() >= 12;
    let h = h12 % 12;
    if (isPM) h += 12;
    const next = new Date(base);
    next.setHours(h);
    setDraftDate(next);
  }

  function setMinute(m) {
    const next = draftDate ? new Date(draftDate) : new Date();
    next.setMinutes(m);
    setDraftDate(new Date(next));
  }

  function togglePeriod() {
    const base = draftDate ? new Date(draftDate) : new Date();
    const currentlyPM = base.getHours() >= 12;
    base.setHours(currentlyPM ? base.getHours() - 12 : base.getHours() + 12);
    setDraftDate(new Date(base));
  }

  function confirm() {
    if (draftDate) onChange(draftDate);
    setOpen(false);
  }

  function clear() {
    setDraftDate(null);
    onChange(null);
    setOpen(false);
  }

  const displayLabel = value
    ? new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : "Select deadline";

  const hour12 = draftDate ? draftDate.getHours() % 12 || 12 : 12;
  const isPM = draftDate ? draftDate.getHours() >= 12 : false;
  const minuteVal = draftDate ? Math.round(draftDate.getMinutes() / 5) * 5 % 60 : 0;

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 bg-[var(--input-bg)] border border-[var(--border)] hover:border-[var(--border-strong)] focus:border-[var(--accent)] rounded-xl px-4 py-2.5 text-sm text-left transition-colors"
      >
        <span className={value ? "text-[var(--text-primary)]" : "text-[var(--text-faint)]"}>{displayLabel}</span>
        <Calendar size={15} className="text-[var(--text-muted)] shrink-0" />
      </button>

      {open && (
        <div className="absolute z-50 mt-2 w-96 bg-[var(--surface-solid)] border border-[var(--border)] rounded-2xl shadow-xl shadow-black/50 p-4">
          <div className="flex items-center justify-between mb-3">
            <button type="button" onClick={() => setViewDate(new Date(year, month - 1, 1))} className="h-7 w-7 rounded-lg hover:bg-[var(--surface-2)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
              <ChevronLeft size={15} />
            </button>
            <span className="text-sm text-[var(--text-primary)] font-medium">{monthLabel}</span>
            <button type="button" onClick={() => setViewDate(new Date(year, month + 1, 1))} className="h-7 w-7 rounded-lg hover:bg-[var(--surface-2)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
              <ChevronRight size={15} />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-1">
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <div key={i} className="text-center text-[10px] text-[var(--text-faint)] font-medium py-1">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1 mb-4">
            {cells.map((d, i) => {
              if (d === null) return <div key={i} />;
              const isSelected = draftDate && draftDate.getFullYear() === year && draftDate.getMonth() === month && draftDate.getDate() === d;
              const isToday = new Date().toDateString() === new Date(year, month, d).toDateString();
              return (
                <button
                  type="button"
                  key={i}
                  onClick={() => selectDay(d)}
                  className={
                    "h-7 w-7 rounded-lg text-xs flex items-center justify-center transition-all duration-150 active:scale-90 " +
                    (isSelected
                      ? "bg-[var(--accent)] text-[var(--text-primary)] font-medium"
                      : isToday
                      ? "text-[var(--accent-text)] border border-[rgb(var(--accent-rgb)/0.4)]"
                      : "text-[var(--text-secondary-strong)] hover:bg-[var(--surface-2)]")
                  }
                >
                  {d}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-2 border-t border-[var(--border)] pt-5 pb-1">
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setHour12(hour12 === 1 ? 12 : hour12 - 1)} className="h-7 w-7 shrink-0 rounded-lg bg-[var(--surface-2)] text-[var(--text-secondary-strong)] border border-[var(--card-border)] hover:bg-[var(--surface-3)] flex items-center justify-center text-sm transition-all duration-150 active:scale-90">
                −
              </button>
              <span className="text-[var(--text-primary)] text-sm font-bold w-6 text-center tabular-nums">{String(hour12).padStart(2, "0")}</span>
              <button type="button" onClick={() => setHour12(hour12 === 12 ? 1 : hour12 + 1)} className="h-7 w-7 shrink-0 rounded-lg bg-[var(--surface-2)] text-[var(--text-secondary-strong)] border border-[var(--card-border)] hover:bg-[var(--surface-3)] flex items-center justify-center text-sm transition-all duration-150 active:scale-90">
                +
              </button>
            </div>
            <span className="text-[var(--text-faint)] text-sm">:</span>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setMinute((minuteVal + 55) % 60)} className="h-7 w-7 shrink-0 rounded-lg bg-[var(--surface-2)] text-[var(--text-secondary-strong)] border border-[var(--card-border)] hover:bg-[var(--surface-3)] flex items-center justify-center text-sm transition-all duration-150 active:scale-90">
                −
              </button>
              <span className="text-[var(--text-primary)] text-sm font-bold w-6 text-center tabular-nums">{String(minuteVal).padStart(2, "0")}</span>
              <button type="button" onClick={() => setMinute((minuteVal + 5) % 60)} className="h-7 w-7 shrink-0 rounded-lg bg-[var(--surface-2)] text-[var(--text-secondary-strong)] border border-[var(--card-border)] hover:bg-[var(--surface-3)] flex items-center justify-center text-sm transition-all duration-150 active:scale-90">
                +
              </button>
            </div>
            <button type="button" onClick={togglePeriod} className="h-7 px-3 shrink-0 rounded-lg bg-[rgb(var(--accent-rgb)/0.1)] border border-[rgb(var(--accent-rgb)/0.2)] text-[var(--accent-text)] text-xs font-medium hover:bg-[rgb(var(--accent-rgb)/0.2)] transition-all duration-150 active:scale-95">
              {isPM ? "PM" : "AM"}
            </button>
          </div>

          <div className="flex items-center gap-2 mt-4">
            <button type="button" onClick={clear} className="flex-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] py-2 rounded-lg transition-colors">
              Clear
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={!draftDate}
              className="flex-1 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 text-[var(--text-primary)] text-xs font-medium py-2 rounded-lg transition-all duration-200 active:scale-95"
            >
              Set deadline
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function formatTaskDeadline(deadline) {
  if (!deadline) return null;
  const d = new Date(deadline);
  if (isNaN(d.getTime())) return deadline; // old plain-text deadlines like "Tomorrow" still display as-is
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const isTomorrow = d.toDateString() === tomorrow.toDateString();
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (isToday) return `Today, ${time}`;
  if (isTomorrow) return `Tomorrow, ${time}`;
  return `${d.toLocaleDateString([], { month: "short", day: "numeric" })}, ${time}`;
}

// "overdue" = past due, "soon" = due within the next 24 hours, null = nothing to warn about
function getDeadlineStatus(deadline) {
  if (!deadline) return null;
  const d = new Date(deadline);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  if (diffMs < 0) return "overdue";
  if (diffMs <= 24 * 60 * 60 * 1000) return "soon";
  return null;
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function TaskLists({ goTo }) {
  const { requireAuth } = useRequireAuth();
  const [lists, setLists] = useState([]);
  const [items, setItems] = useState([]); // all list_items across all lists
  const [completions, setCompletions] = useState({}); // `${itemId}:${dateStr}` -> completion row
  const [limitModalMessage, setLimitModalMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [showNewList, setShowNewList] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [expandedListId, setExpandedListId] = useState(null); // only one list's tasks show at a time
  const [renamingListId, setRenamingListId] = useState(null);
  const [renameListName, setRenameListName] = useState("");
  const [addingItemToList, setAddingItemToList] = useState(null); // list id, or null
  const [editingItemId, setEditingItemId] = useState(null); // list_item id being edited, or null
  const [newItemTitle, setNewItemTitle] = useState("");
  const [newItemRecurrence, setNewItemRecurrence] = useState("daily"); // "daily" | "specific_days"
  const [newItemDays, setNewItemDays] = useState([]); // 0-6
  const [error, setError] = useState("");
  const [xpToastMessage, setXpToastMessage] = useState("");
  const [xpToastKey, setXpToastKey] = useState(0);
  const [dailyTaskXPEarned, setDailyTaskXPEarned] = useState(0);
  const [myDailyTaskXPCap, setMyDailyTaskXPCap] = useState(DAILY_TASK_XP_CAP); // tier-based, replaces the flat constant once loaded
  const [dailyCapDate, setDailyCapDate] = useState(() => localDateStr());
  const [myLimits, setMyLimits] = useState(null);

  const todayStr = dailyCapDate; // kept in state so a midnight rollover while the tab is open actually updates the UI
  const todayWeekday = new Date().getDay();

  useEffect(() => {
    supabase.rpc("get_my_entitlements").then(({ data }) => setMyLimits(data));
  }, []);

  useEffect(() => {
    loadAll();
  }, []);

  // Same pattern used for the daily task XP cap elsewhere — checks every
  // 30s whether the calendar day has rolled over, and if so, refreshes
  // "today" so items correctly reset at midnight without needing a reload.
  useEffect(() => {
    const t = setInterval(() => {
      const today = localDateStr();
      setDailyCapDate((prev) => {
        if (prev !== today) {
          loadAll();
          return today;
        }
        return prev;
      });
    }, 30000);
    return () => clearInterval(t);
  }, []);

  async function loadAll() {
    setLoading(true);
    const today = localDateStr();
    const { data: { user } } = await supabase.auth.getUser();
    const [{ data: listRows }, { data: itemRows }, { data: completionRows }, { data: xpStats }] = await Promise.all([
      supabase.from("task_lists").select("*").order("created_at", { ascending: true }),
      supabase.from("list_items").select("*").order("created_at", { ascending: true }),
      supabase.from("list_item_completions").select("*").eq("completion_date", today),
      user ? supabase.from("user_task_stats").select("daily_task_xp_date, daily_task_xp_earned").eq("user_id", user.id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    setLists(listRows || []);
    setItems(itemRows || []);
    const map = {};
    (completionRows || []).forEach((c) => {
      map[`${c.list_item_id}:${c.completion_date}`] = c;
    });
    setCompletions(map);
    setDailyTaskXPEarned(xpStats?.daily_task_xp_date === today ? xpStats?.daily_task_xp_earned || 0 : 0);
    if (user) supabase.rpc("get_daily_task_xp_cap", { p_user_id: user.id }).then(({ data: cap }) => setMyDailyTaskXPCap(cap ?? DAILY_TASK_XP_CAP));
    setDailyCapDate(today);
    setLoading(false);
  }

  function isDueToday(item) {
    if (item.recurrence_type === "daily") return true;
    return (item.recurrence_days || []).includes(todayWeekday);
  }

  async function createList() {
    if (!newListName.trim()) return;
    if (containsProfanity(newListName)) {
      setError("That name violates our terms and isn't available.");
      return;
    }
    setError("");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data, error: insertError } = await supabase.from("task_lists").insert({ user_id: user.id, name: newListName.trim() }).select().single();
    if (insertError) {
      if ((insertError.message || "").includes("LIST_LIMIT")) {
        setLimitModalMessage("You've reached your plan's list limit. Upgrade to create more lists.");
      } else {
        setError("Couldn't create the list — please try again.");
      }
      return;
    }
    setLists((l) => [...l, data]);
    setNewListName("");
    setShowNewList(false);
  }

  async function deleteList(id) {
    const previous = lists;
    setLists((l) => l.filter((x) => x.id !== id));
    setItems((it) => it.filter((x) => x.list_id !== id));
    setExpandedListId((cur) => (cur === id ? null : cur));
    const { error: deleteError } = await supabase.from("task_lists").delete().eq("id", id);
    if (deleteError) setLists(previous);
  }

  function startRenameList(list) {
    setRenamingListId(list.id);
    setRenameListName(list.name);
  }

  async function saveRenameList() {
    if (!renameListName.trim()) return;
    if (containsProfanity(renameListName)) {
      setError("That name violates our terms and isn't available.");
      return;
    }
    setError("");
    const previous = lists;
    setLists((l) => l.map((x) => (x.id === renamingListId ? { ...x, name: renameListName.trim() } : x)));
    const { error: updateError } = await supabase.from("task_lists").update({ name: renameListName.trim() }).eq("id", renamingListId);
    if (updateError) {
      setLists(previous);
      setError("Couldn't rename the list — please try again.");
    }
    setRenamingListId(null);
    setRenameListName("");
  }

  async function addItem(listId) {
    if (!newItemTitle.trim()) return;
    if (newItemRecurrence === "specific_days" && newItemDays.length === 0) {
      setError("Pick at least one day, or switch back to Daily.");
      return;
    }
    setError("");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    if (editingItemId) {
      const { data, error: updateError } = await supabase
        .from("list_items")
        .update({
          title: newItemTitle.trim(),
          recurrence_type: newItemRecurrence,
          recurrence_days: newItemRecurrence === "specific_days" ? newItemDays : [],
        })
        .eq("id", editingItemId)
        .select()
        .single();
      if (updateError) {
        setError("Couldn't save changes — please try again.");
        return;
      }
      setItems((it) => it.map((x) => (x.id === editingItemId ? data : x)));
      setEditingItemId(null);
    } else {
      const { data, error: insertError } = await supabase
        .from("list_items")
        .insert({
          list_id: listId,
          user_id: user.id,
          title: newItemTitle.trim(),
          recurrence_type: newItemRecurrence,
          recurrence_days: newItemRecurrence === "specific_days" ? newItemDays : [],
        })
        .select()
        .single();
      if (insertError) {
        if ((insertError.message || "").includes("TASKS_PER_LIST_LIMIT")) {
          setLimitModalMessage("This list is at your plan's task limit. Upgrade to add more tasks per list.");
        } else {
          setError("Couldn't add that item — please try again.");
        }
        return;
      }
      setItems((it) => [...it, data]);
    }
    setNewItemTitle("");
    setNewItemRecurrence("daily");
    setNewItemDays([]);
    setAddingItemToList(null);
  }

  function startEditItem(item) {
    setEditingItemId(item.id);
    setNewItemTitle(item.title);
    setNewItemRecurrence(item.recurrence_type);
    setNewItemDays(item.recurrence_days || []);
    setAddingItemToList(item.list_id);
  }

  function cancelItemForm() {
    setAddingItemToList(null);
    setEditingItemId(null);
    setNewItemTitle("");
    setNewItemRecurrence("daily");
    setNewItemDays([]);
    setError("");
  }

  async function deleteItem(id) {
    const previous = items;
    setItems((it) => it.filter((x) => x.id !== id));
    const { error: deleteError } = await supabase.from("list_items").delete().eq("id", id);
    if (deleteError) setItems(previous);
  }

  // Toggling never deletes the completion row once it exists for a given
  // day — only flips a `completed` flag. This is what stops someone from
  // checking, unchecking, and rechecking the same item on the same day to
  // farm XP repeatedly: the row (and its permanent xp_claimed memory)
  // sticks around regardless of the visible checked/unchecked state.
  async function toggleToday(item) {
    const key = `${item.id}:${todayStr}`;
    const existing = completions[key];
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    if (existing) {
      const newCompleted = !existing.completed;
      setCompletions((c) => ({ ...c, [key]: { ...existing, completed: newCompleted } }));
      await supabase.from("list_item_completions").update({ completed: newCompleted }).eq("id", existing.id);
      return;
    }

    // First time this item is checked today — create the row and, if this
    // is genuinely a fresh completion, award XP through the exact same
    // shared daily cap regular tasks use.
    const { data: created, error: insertError } = await supabase
      .from("list_item_completions")
      .insert({ list_item_id: item.id, user_id: user.id, completion_date: todayStr, completed: true })
      .select()
      .single();
    if (insertError || !created) return;

    const { data: result, error: claimError } = await supabase.rpc("claim_list_item_xp", { p_completion_id: created.id, p_local_date: todayStr });
    if (claimError) {
      console.error("Failed to claim list item XP:", claimError);
      setCompletions((c) => ({ ...c, [key]: created }));
      setXpToastMessage("Task marked complete, but XP couldn't be claimed — please try again.");
      setXpToastKey((k) => k + 1);
      return;
    }
    const xpAwarded = result.xp_awarded;
    setCompletions((c) => ({ ...c, [key]: { ...created, xp_awarded: xpAwarded, xp_claimed: true } }));
    setDailyTaskXPEarned(result.daily_earned);
    setMyDailyTaskXPCap(result.daily_cap);
    setXpToastMessage(xpAwarded > 0 ? `Task complete — +${xpAwarded} XP` : "Task complete — daily XP cap reached");
    setXpToastKey((k) => k + 1);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={20} className="text-[var(--accent-text)] animate-spin" />
      </div>
    );
  }

  if (myLimits === null) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={20} className="text-[var(--accent-text)] animate-spin" />
      </div>
    );
  }

  if (myLimits?.plan === "free") {
    return (
      <>
        <div className="pointer-events-none select-none blur-md opacity-60 space-y-4">
          {["Morning Routine", "Study Checklist", "Exam Prep"].map((name) => (
            <GlowCard key={name}>
              <div className="flex items-center gap-2 mb-3">
                <ChevronRight size={16} className="text-[var(--text-faint)] shrink-0" />
                <div>
                  <p className="font-medium text-[var(--text-primary)]">{name}</p>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">5 tasks in list · 3/5 completed today</p>
                </div>
              </div>
              <div className="space-y-2">
                {["Review flashcards", "Practice problems", "Read chapter summary"].map((item) => (
                  <div key={item} className="flex items-center gap-3 bg-[var(--surface-2)]/40 rounded-lg p-2.5">
                    <div className="h-4 w-4 rounded border border-[var(--border-strong)]" />
                    <span className="text-sm text-[var(--text-secondary-strong)]">{item}</span>
                  </div>
                ))}
              </div>
            </GlowCard>
          ))}
        </div>
        <div className="fixed inset-0 md:left-60 lg:left-64 z-[200] flex items-center justify-center p-4 pointer-events-none">
          <div className="bg-[var(--surface-solid)] border border-[rgb(var(--accent-rgb)/0.4)] rounded-3xl p-6 max-w-sm w-full text-center shadow-[0_0_60px_-10px_rgb(var(--accent-rgb)/0.5)] pointer-events-auto">
            <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-hover)] flex items-center justify-center glow-accent-30 mx-auto mb-4">
              <Lock size={22} className="text-white" />
            </div>
            <p className="text-base font-semibold text-[var(--text-primary)] mb-2">To-Do List is a Basic feature</p>
            <p className="text-sm text-[var(--text-muted)] mb-6">Build recurring checklists for your daily and weekly routines — included with Basic and Pro.</p>
            <button
              onClick={() => requireAuth(() => goTo && goTo("pricing"))}
              className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-medium px-6 py-3 rounded-xl transition-colors glow-accent-40 w-full"
            >
              Upgrade to Unlock
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="space-y-4">
      <SavedToast key={xpToastKey} message={xpToastMessage} />
      <div className="flex items-center justify-between text-xs">
        <span className="text-[var(--text-muted)]">
          Daily task XP: <span className="text-[var(--text-secondary-strong)] font-medium">{dailyTaskXPEarned}</span> / {myDailyTaskXPCap}
          {dailyTaskXPEarned >= myDailyTaskXPCap && <span className="text-amber-400 ml-1.5">— cap reached, resets at midnight</span>}
        </span>
        <div className="w-24 h-1.5 rounded-full bg-[var(--surface-solid)] overflow-hidden">
          <div
            className={"h-full rounded-full transition-all " + (dailyTaskXPEarned >= myDailyTaskXPCap ? "bg-amber-400" : "bg-[var(--accent)]")}
            style={{ width: `${Math.min(100, (dailyTaskXPEarned / myDailyTaskXPCap) * 100)}%` }}
          />
        </div>
      </div>
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
          <p className="text-sm text-red-400">{error}</p>
          <button onClick={() => setError("")} className="text-red-400 hover:text-red-300 shrink-0">
            <X size={14} />
          </button>
        </div>
      )}

      {lists.map((list) => {
        const listItems = items.filter((it) => it.list_id === list.id);
        const dueTodayItems = listItems.filter((it) => isDueToday(it));
        const completedTodayCount = dueTodayItems.filter((it) => completions[`${it.id}:${todayStr}`]?.completed).length;
        const expanded = expandedListId === list.id;
        return (
          <GlowCard key={list.id}>
            {renamingListId === list.id ? (
              <div className="flex items-center gap-2 mb-1" onClick={(e) => e.stopPropagation()}>
                <input
                  value={renameListName}
                  onChange={(e) => setRenameListName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && saveRenameList()}
                  autoFocus
                  className="flex-1 bg-[var(--input-bg)] border border-[var(--accent)] rounded-lg px-3 py-1.5 text-sm text-[var(--text-primary)] outline-none"
                />
                <button onClick={saveRenameList} className="text-xs font-medium bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white px-3 py-1.5 rounded-lg transition-colors shrink-0">
                  Save
                </button>
                <button onClick={() => setRenamingListId(null)} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] px-2 shrink-0">
                  Cancel
                </button>
              </div>
            ) : (
              <div onClick={() => setExpandedListId(expanded ? null : list.id)} className="w-full flex items-center justify-between gap-3 text-left cursor-pointer">
                <div className="flex items-center gap-2 min-w-0">
                  <ChevronRight size={16} className={"text-[var(--text-faint)] transition-transform shrink-0 " + (expanded ? "rotate-90" : "")} />
                  <div className="min-w-0">
                    <p className="font-medium text-[var(--text-primary)] truncate">{list.name}</p>
                    <div className="flex items-center gap-1.5 flex-wrap mt-0.5" onClick={(e) => e.stopPropagation()}>
                      <LimitBadge label="Task limit" current={listItems.length} max={myLimits?.tasks_per_list_max ?? null} goTo={goTo} />
                      <span className="text-xs text-[var(--text-muted)]">· {completedTodayCount}/{dueTodayItems.length} completed today</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => startRenameList(list)}
                    className="text-[var(--text-faint)] hover:text-[var(--accent-text)] transition-colors"
                  >
                    <Pencil size={14} />
                  </button>
                  <DeleteConfirmButton onConfirm={() => deleteList(list.id)} itemLabel={`"${list.name}"`} />
                </div>
              </div>
            )}

            {expanded && (
              <div className="mt-4 pt-4 border-t border-[var(--border-subtle)]">
                {listItems.length === 0 && <p className="text-sm text-[var(--text-muted)] mb-3">No items yet.</p>}

                <div className="space-y-2 mb-3">
                  {listItems.map((item) => {
                    const due = isDueToday(item);
                    const done = !!completions[`${item.id}:${todayStr}`]?.completed;
                    const scheduleLabel = item.recurrence_type === "daily" ? "Daily" : (item.recurrence_days || []).map((d) => WEEKDAY_LABELS[d]).join(", ") || "No days set";
                    return (
                      <div key={item.id} className={"flex items-center gap-3 group rounded-lg px-2 py-1.5 -mx-2 " + (!due ? "bg-[var(--surface-2)]/40" : "")}>
                        <button
                          onClick={() => due && requireAuth(() => toggleToday(item))}
                          disabled={!due}
                          title={!due ? `Only available on: ${scheduleLabel}` : undefined}
                          className={
                            "h-5 w-5 rounded-md border flex items-center justify-center shrink-0 transition-colors " +
                            (done ? "bg-[var(--accent)] border-[var(--accent)]" : due ? "border-[var(--border)] hover:border-[var(--accent)]" : "border-[var(--border)] cursor-not-allowed")
                          }
                        >
                          {done ? <Check size={13} className="text-white" /> : !due ? <Lock size={10} className="text-[var(--text-faint)]" /> : null}
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className={"text-sm " + (done ? "text-[var(--text-muted)] line-through" : due ? "text-[var(--text-primary)]" : "text-[var(--text-faint)]")}>{item.title}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={due ? "text-[11px] text-[var(--text-faint)]" : "text-[11px] text-amber-500/70"}>{due ? scheduleLabel : `Locked — opens on ${scheduleLabel}`}</span>
                            {done && (
                              (completions[`${item.id}:${todayStr}`]?.xp_awarded ?? 0) > 0 ? (
                                <span className="text-[11px] font-medium text-emerald-400" title="This completion earned XP">
                                  +{completions[`${item.id}:${todayStr}`].xp_awarded} XP
                                </span>
                              ) : (
                                <span className="text-[11px] text-[var(--text-faint)]" title="No XP from this completion — the daily cap was already reached">
                                  No XP (cap reached)
                                </span>
                              )
                            )}
                          </div>
                        </div>
                        <button onClick={() => startEditItem(item)} className="text-[var(--text-faint)] hover:text-[var(--accent-text)] transition-colors shrink-0 ml-2">
                          <Pencil size={13} />
                        </button>
                        <div className="ml-3 shrink-0">
                          <DeleteConfirmButton onConfirm={() => deleteItem(item.id)} itemLabel={`"${item.title}"`} />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {addingItemToList === list.id ? (
                  <div className="border-t border-[var(--border-subtle)] pt-3 space-y-2">
                    <input
                      value={newItemTitle}
                      onChange={(e) => setNewItemTitle(e.target.value)}
                      placeholder="Item name"
                      className="w-full bg-[var(--input-bg)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl px-3 py-2 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)]"
                    />
                    <div className="flex gap-2">
                  <button
                    onClick={() => setNewItemRecurrence("daily")}
                    className={"flex-1 text-xs font-medium px-3 py-2 rounded-lg transition-colors " + (newItemRecurrence === "daily" ? "bg-[var(--accent)] text-white" : "bg-[var(--input-bg)] text-[var(--text-muted)]")}
                  >
                    Daily
                  </button>
                  <button
                    onClick={() => setNewItemRecurrence("specific_days")}
                    className={"flex-1 text-xs font-medium px-3 py-2 rounded-lg transition-colors " + (newItemRecurrence === "specific_days" ? "bg-[var(--accent)] text-white" : "bg-[var(--input-bg)] text-[var(--text-muted)]")}
                  >
                    Specific days
                  </button>
                </div>
                {newItemRecurrence === "specific_days" && (
                  <div className="flex gap-1.5 flex-wrap">
                    {WEEKDAY_LABELS.map((label, idx) => (
                      <button
                        key={idx}
                        onClick={() => setNewItemDays((d) => (d.includes(idx) ? d.filter((x) => x !== idx) : [...d, idx]))}
                        className={
                          "h-8 w-8 rounded-lg text-xs font-medium transition-colors " +
                          (newItemDays.includes(idx) ? "bg-[var(--accent)] text-white" : "bg-[var(--input-bg)] text-[var(--text-muted)] hover:text-[var(--text-primary)]")
                        }
                      >
                        {label[0]}
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <button onClick={() => addItem(list.id)} className="flex-1 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium py-2 rounded-lg transition-colors">
                    {editingItemId ? "Save changes" : "Add item"}
                  </button>
                  <button onClick={cancelItemForm} className="px-4 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => requireAuth(() => setAddingItemToList(list.id))}
                className="text-sm text-[var(--accent-text)] hover:brightness-110 flex items-center gap-1"
              >
                <Plus size={14} /> Add item
              </button>
            )}
              </div>
            )}
          </GlowCard>
        );
      })}

      {showNewList ? (
        <GlowCard>
          <div className="flex gap-2">
            <input
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              placeholder="List name (e.g. Morning Routine)"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && createList()}
              className="flex-1 bg-[var(--input-bg)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl px-3 py-2 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)]"
            />
            <button onClick={createList} className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium px-4 rounded-xl transition-colors">
              Create
            </button>
            <button
              onClick={() => {
                setShowNewList(false);
                setNewListName("");
              }}
              className="px-3 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              Cancel
            </button>
          </div>
        </GlowCard>
      ) : (
        <div className="space-y-2">
          <div className="flex justify-center">
            <LimitBadge label="List limit" current={lists.length} max={myLimits?.lists_max ?? null} goTo={goTo} />
          </div>
          <button
            onClick={() => requireAuth(() => setShowNewList(true))}
            className="flex items-center gap-2 text-sm text-[var(--accent-text)] hover:brightness-110 border border-dashed border-[var(--border)] hover:border-[var(--accent)] rounded-xl px-4 py-3 w-full justify-center transition-colors"
          >
            <Plus size={16} /> New List
          </button>
        </div>
      )}
      <LimitReachedModal message={limitModalMessage} onClose={() => setLimitModalMessage("")} goTo={goTo} />
    </div>
  );
}

function Tasks({ goTo }) {
  const { requireAuth } = useRequireAuth();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [limitModalMessage, setLimitModalMessage] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [subject, setSubject] = useState("");
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [deadline, setDeadline] = useState(null); // Date object or null
  const [newTaskId, setNewTaskId] = useState(null);
  const [justToggledId, setJustToggledId] = useState(null);
  const [sortDelay, setSortDelay] = useState({}); // id -> effective done value to use for sorting only
  const [editingTaskId, setEditingTaskId] = useState(null); // null = creating a new task, otherwise editing this id
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [taskNameError, setTaskNameError] = useState("");
  const [xpToastMessage, setXpToastMessage] = useState("");
  const [xpToastKey, setXpToastKey] = useState(0);
  const [dailyTaskXPEarned, setDailyTaskXPEarned] = useState(0);
  const [myDailyTaskXPCap, setMyDailyTaskXPCap] = useState(DAILY_TASK_XP_CAP); // tier-based, replaces the flat constant once loaded
  const [dailyCapDate, setDailyCapDate] = useState(() => localDateStr());
  const [viewMode, setViewMode] = useState("tasks"); // "tasks" | "lists"
  const [myLimits, setMyLimits] = useState(null);

  useEffect(() => {
    loadTasks();
    loadDailyTaskXPCap();
    supabase.rpc("get_my_entitlements").then(({ data }) => setMyLimits(data));
  }, []);

  // Keeps the daily-cap counter honest even if the tab is left open across
  // midnight — checks every 30s whether the calendar day has rolled over
  // and, if so, resets the displayed counter back to 0 without a reload.
  useEffect(() => {
    const t = setInterval(() => {
      const today = localDateStr();
      setDailyCapDate((prev) => {
        if (prev !== today) {
          setDailyTaskXPEarned(0);
          return today;
        }
        return prev;
      });
    }, 30000);
    return () => clearInterval(t);
  }, []);

  async function loadDailyTaskXPCap() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from("user_task_stats").select("daily_task_xp_date, daily_task_xp_earned").eq("user_id", user.id).maybeSingle();
    const today = localDateStr();
    setDailyCapDate(today);
    setDailyTaskXPEarned(data?.daily_task_xp_date === today ? data?.daily_task_xp_earned || 0 : 0);
    supabase.rpc("get_daily_task_xp_cap", { p_user_id: user.id }).then(({ data: cap }) => setMyDailyTaskXPCap(cap ?? DAILY_TASK_XP_CAP));
  }

  useEffect(() => {
    function handleScroll() {
      const pageHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (pageHeight <= 0) {
        setShowScrollTop(false);
        return;
      }
      setShowScrollTop(window.scrollY > 100);
    }
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToTop = () => {
    const startY = window.scrollY;
    const duration = 400;
    const startTime = performance.now();

    function easeOutCubic(t) {
      return 1 - Math.pow(1 - t, 3);
    }

    function step(now) {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      const eased = easeOutCubic(progress);
      window.scrollTo(0, startY * (1 - eased));
      if (progress < 1) requestAnimationFrame(step);
    }

    requestAnimationFrame(step);
  };


  async function loadTasks() {
    setLoading(true);
    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error) setTasks(data);
    setLoading(false);
  }

  const doneCount = tasks.filter((t) => t.done).length;
  const pct = tasks.length ? (doneCount / tasks.length) * 100 : 0;

  const saveTask = async () => {
    if (!subject.trim()) return;
    setTaskNameError("");
    if (containsProfanity(subject) || containsProfanity(title)) {
      setTaskNameError("That name violates our terms and isn't available.");
      return;
    }

    if (editingTaskId) {
      // Editing an existing task — update in place.
      const updates = {
        subject: subject.trim(),
        title: title.trim(),
        priority,
        deadline: deadline ? deadline.toISOString() : null,
      };
      const previous = tasks;
      setTasks((t) => t.map((x) => (x.id === editingTaskId ? { ...x, ...updates } : x)));
      const { error } = await supabase.from("tasks").update(updates).eq("id", editingTaskId);
      if (error) setTasks(previous);
    } else {
      // Creating a brand new task.
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("tasks")
        .insert({
          user_id: user.id,
          subject: subject.trim(),
          title: title.trim(),
          priority,
          // Stored as a real ISO datetime string so it can be compared/formatted later,
          // instead of free-text like "Tomorrow".
          deadline: deadline ? deadline.toISOString() : null,
        })
        .select()
        .single();

      if (!error) {
        setTasks((t) => [data, ...t]);
        setNewTaskId(data.id);
        setTimeout(() => setNewTaskId(null), 500);
      } else if ((error.message || "").includes("TASK_LIMIT")) {
        setLimitModalMessage("You've reached your plan's task limit. Upgrade to create more tasks.");
      } else {
        setTaskNameError("Couldn't create the task — please try again.");
      }
    }

    resetForm();
  };

  const resetForm = () => {
    setSubject("");
    setTitle("");
    setPriority("MEDIUM");
    setDeadline(null);
    setShowForm(false);
    setEditingTaskId(null);
  };

  const startEdit = (task) => {
    setSubject(task.subject || "");
    setTitle(task.title || "");
    setPriority(task.priority || "MEDIUM");
    setDeadline(task.deadline ? new Date(task.deadline) : null);
    setEditingTaskId(task.id);
    setShowForm(true);
    scrollToTop();
  };

  const toggle = async (id) => {
    const current = tasks.find((t) => t.id === id);
    const newDone = !current.done;
    const completedAt = newDone ? new Date().toISOString() : null;
    setTasks((t) => t.map((x) => (x.id === id ? { ...x, done: newDone, completed_at: completedAt } : x)));
    setJustToggledId(id);
    setTimeout(() => setJustToggledId(null), 1300);

    if (newDone) {
      // Checking off: keep it sorted as "not done" for a moment so the strike-through
      // animation actually gets to play before the task jumps down to the completed section.
      setSortDelay((m) => ({ ...m, [id]: false }));
      setTimeout(() => {
        setSortDelay((m) => {
          const next = { ...m };
          delete next[id];
          return next;
        });
      }, 700);
    } else {
      // Unchecking: no delay needed, move it back up right away.
      setSortDelay((m) => {
        const next = { ...m };
        delete next[id];
        return next;
      });
    }

    const { error } = await supabase.from("tasks").update({ done: newDone, completed_at: completedAt }).eq("id", id);
    if (error) {
      loadTasks();
      return;
    }

    // Keep a durable lifetime-completed count in a separate table, so it
    // survives even if this task is deleted later — the tasks table itself
    // has no way to remember a completion happened once the row is gone.
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: existing } = await supabase
      .from("user_task_stats")
      .select("lifetime_tasks_completed")
      .eq("user_id", user.id)
      .maybeSingle();
    const nextCount = Math.max(0, (existing?.lifetime_tasks_completed || 0) + (newDone ? 1 : -1));
    await supabase.from("user_task_stats").upsert({ user_id: user.id, lifetime_tasks_completed: nextCount });

    // Task XP is a ONE-TIME grant per task, permanently — not tied to the
    // checkbox state. Without this, unchecking a task, waiting for the
    // daily cap to reset the next day, and re-checking the SAME task would
    // farm XP forever from a single task. Once xp_claimed is true, this
    // task can never earn XP again no matter how many more times it gets
    // toggled on/off — and unchecking never claws back XP already granted.
    if (newDone && !current.xp_claimed) {
      const today = localDateStr();
      const { data: result, error: claimError } = await supabase.rpc("claim_task_xp", { p_task_id: id, p_local_date: today });
      if (claimError) {
        console.error("Failed to claim task XP:", claimError);
        setXpToastMessage("Task marked complete, but XP couldn't be claimed — please try unchecking and rechecking it.");
        setXpToastKey((k) => k + 1);
        return;
      }
      const xpAwarded = result.xp_awarded;
      setTasks((t) => t.map((x) => (x.id === id ? { ...x, xp_awarded: xpAwarded, xp_claimed: true } : x)));
      setDailyCapDate(today);
      setDailyTaskXPEarned(result.daily_earned);
      setMyDailyTaskXPCap(result.daily_cap);
      setXpToastMessage(xpAwarded > 0 ? `Task complete — +${xpAwarded} XP` : "Task complete — daily XP cap reached");
      setXpToastKey((k) => k + 1);
    } else if (newDone && current.xp_claimed) {
      // Already earned XP from this task once before — re-completing it
      // (after an earlier untick) is fine for tracking purposes, just
      // doesn't pay out again.
      setXpToastMessage("Task marked complete — XP already claimed for this task");
      setXpToastKey((k) => k + 1);
    }
  };

  const remove = async (id) => {
    const previous = tasks;
    setTasks((t) => t.filter((x) => x.id !== id));
    const { error } = await supabase.from("tasks").delete().eq("id", id);
    if (error) setTasks(previous);
    // Note: deleting a task never touches user_task_stats — the lifetime
    // completed count is intentionally independent of whether the task
    // still exists, so it keeps counting tasks that were completed and
    // later cleaned up / deleted.
  };

  const priorityColor = { HIGH: "text-red-400 bg-red-500/10", MEDIUM: "text-amber-400 bg-amber-500/10", LOW: "text-emerald-400 bg-emerald-500/10" };
  const priorityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };

  // Unfinished tasks always come before completed ones. Within each of those
  // two groups: tasks with a due date come first (soonest at the top), then
  // tasks with no due date, sorted High -> Medium -> Low priority.
  const effectiveDone = (t) => (Object.prototype.hasOwnProperty.call(sortDelay, t.id) ? sortDelay[t.id] : t.done);

  const sortedTasks = [...tasks].sort((a, b) => {
    const aDone = effectiveDone(a);
    const bDone = effectiveDone(b);
    if (aDone !== bDone) return aDone ? 1 : -1;

    const aDate = a.deadline ? new Date(a.deadline) : null;
    const bDate = b.deadline ? new Date(b.deadline) : null;
    const aHasDate = aDate && !isNaN(aDate.getTime());
    const bHasDate = bDate && !isNaN(bDate.getTime());

    if (aHasDate && bHasDate) return aDate - bDate;
    if (aHasDate && !bHasDate) return -1;
    if (!aHasDate && bHasDate) return 1;

    return (priorityOrder[a.priority] ?? 3) - (priorityOrder[b.priority] ?? 3);
  });

  if (loading) {
    return <p className="text-[var(--text-secondary)] text-sm">Loading tasks...</p>;
  }

  if (viewMode === "lists") {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-hover)] flex items-center justify-center glow-accent-30 shrink-0">
            <CheckSquare size={19} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-[var(--text-primary)]">Tasks</h1>
            <p className="text-sm text-[var(--text-secondary)] mt-0.5">Recurring to-do checklists — daily or on specific days, tracked separately from one-time tasks</p>
          </div>
        </div>
        <div className="flex gap-2 bg-[var(--surface-solid)] border border-[var(--border)] rounded-xl p-1 w-fit">
          <button onClick={() => setViewMode("tasks")} className="px-4 py-1.5 rounded-lg text-sm font-medium transition-colors text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
            Tasks
          </button>
          <button onClick={() => setViewMode("lists")} className="px-4 py-1.5 rounded-lg text-sm font-medium transition-colors bg-[var(--accent)] text-white">
            To-Do List
          </button>
        </div>
        <TaskLists goTo={goTo} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-hover)] flex items-center justify-center glow-accent-30 shrink-0">
            <CheckSquare size={19} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-[var(--text-primary)]">Tasks</h1>
            <p className="text-sm text-[var(--text-secondary)] mt-0.5">
              {doneCount} / {tasks.length} tasks completed
            </p>
          </div>
        </div>
        <button
          onClick={() => requireAuth(() => {
            if (showForm && !editingTaskId) {
              resetForm();
            } else {
              setEditingTaskId(null);
              setSubject("");
              setTitle("");
              setPriority("MEDIUM");
              setDeadline(null);
              setShowForm(true);
            }
          })}
          className="flex items-center gap-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--text-primary)] text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
        >
          <Plus size={16} /> Add task
        </button>
      </div>

      <div className="flex gap-2 bg-[var(--surface-solid)] border border-[var(--border)] rounded-xl p-1 w-fit">
        <button onClick={() => setViewMode("tasks")} className="px-4 py-1.5 rounded-lg text-sm font-medium transition-colors bg-[var(--accent)] text-white">
          Tasks
        </button>
        <button onClick={() => setViewMode("lists")} className="px-4 py-1.5 rounded-lg text-sm font-medium transition-colors text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
          To-Do List
        </button>
      </div>

      <LimitBadge label="Task limit" current={tasks.length} max={myLimits?.tasks_max ?? null} goTo={goTo} />

      <div className="h-2 rounded-full bg-[var(--surface-solid)] overflow-hidden">
        <div className="h-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-hover)] transition-all" style={{ width: `${pct}%` }} />
      </div>

      <div className="flex items-center justify-between text-xs">
        <span className="text-[var(--text-muted)]">
          Daily task XP: <span className="text-[var(--text-secondary-strong)] font-medium">{dailyTaskXPEarned}</span> / {myDailyTaskXPCap}
          {dailyTaskXPEarned >= myDailyTaskXPCap && <span className="text-amber-400 ml-1.5">— cap reached, resets at midnight</span>}
        </span>
        <div className="w-24 h-1.5 rounded-full bg-[var(--surface-solid)] overflow-hidden">
          <div
            className={"h-full rounded-full transition-all " + (dailyTaskXPEarned >= myDailyTaskXPCap ? "bg-amber-400" : "bg-[var(--accent)]")}
            style={{ width: `${Math.min(100, (dailyTaskXPEarned / myDailyTaskXPCap) * 100)}%` }}
          />
        </div>
      </div>

      {showForm && (
        <GlowCard className="relative z-30">
          <p className="text-sm font-medium text-[var(--text-primary)] mb-3">{editingTaskId ? "Edit task" : "New task"}</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] text-[var(--text-muted)]">
                  Subject <span className="text-[var(--accent-text)]">*</span>
                </label>
                <span className="text-[11px] text-[var(--text-muted)]">{60 - subject.length} left</span>
              </div>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value.slice(0, 60))}
                maxLength={60}
                placeholder="e.g. Mathematics"
                className="w-full bg-[var(--input-bg)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)]"
              />
            </div>
            <div className="sm:col-span-2">
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] text-[var(--text-muted)]">Task description</label>
                <span className="text-[11px] text-[var(--text-muted)]">{200 - title.length} left</span>
              </div>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value.slice(0, 200))}
                maxLength={200}
                placeholder="What do you need to do?"
                className="w-full bg-[var(--input-bg)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)]"
              />
            </div>
            <div>
              <label className="text-[11px] text-[var(--text-muted)] block mb-1">Deadline</label>
              <DateTimePicker value={deadline} onChange={setDeadline} />
            </div>
            <div>
              <label className="text-[11px] text-[var(--text-muted)] block mb-1">Priority</label>
              <PriorityPicker value={priority} onChange={setPriority} />
            </div>
            {taskNameError && <p className="sm:col-span-2 text-xs text-red-400">{taskNameError}</p>}
            <div className="sm:col-span-2 flex items-center gap-2">
              <button onClick={saveTask} disabled={!subject.trim()} className="flex-1 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed text-[var(--text-primary)] text-sm font-medium rounded-xl px-4 py-2.5 transition-colors">
                {editingTaskId ? "Save changes" : "Add task"}
              </button>
              <button onClick={resetForm} className="flex-1 bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-secondary-strong)] text-sm font-medium rounded-xl px-4 py-2.5 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </GlowCard>
      )}

      <div className="space-y-2.5 pb-16">
        {tasks.length === 0 && (
          <GlowCard className="text-center py-10 text-[var(--text-muted)] text-sm">
            No tasks yet. Add your first task to get started.
          </GlowCard>
        )}
        {sortedTasks.map((t) => (
          <TaskRow
            key={t.id}
            t={t}
            isNew={t.id === newTaskId}
            justToggled={t.id === justToggledId}
            priorityColor={priorityColor}
            onToggle={(id) => requireAuth(() => toggle(id))}
            onRemove={remove}
            onEdit={startEdit}
          />
        ))}
      </div>

      {tasks.length > 10 && (
        <button
          onClick={scrollToTop}
          aria-hidden={!showScrollTop}
          className={
            "fixed z-40 bottom-16 md:bottom-6 left-1/2 -translate-x-1/2 h-11 w-20 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] glow-accent-50 flex items-center justify-center transition-all duration-300 active:scale-90 " +
            (showScrollTop ? "opacity-100 pointer-events-auto translate-y-0" : "opacity-0 pointer-events-none translate-y-3")
          }
          title="Back to top"
        >
          <ChevronUp size={20} className="text-white" />
        </button>
      )}
      <SavedToast key={xpToastKey} message={xpToastMessage} />
      <LimitReachedModal message={limitModalMessage} onClose={() => setLimitModalMessage("")} goTo={goTo} />
    </div>
  );
}

function TaskRow({ t, isNew, justToggled, priorityColor, onToggle, onRemove, onEdit }) {
  // Real mount-triggered entrance: starts hidden/offset, then flips to its
  // normal state a frame later so the CSS transition actually has something
  // to animate between (a class present only at first mount can't animate).
  const [entered, setEntered] = useState(!isNew);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (isNew) {
      setEntered(false);
      const raf = requestAnimationFrame(() => setEntered(true));
      return () => cancelAnimationFrame(raf);
    }
  }, [isNew]);

  const status = t.done ? null : getDeadlineStatus(t.deadline);

  let cardClasses = "relative isolate transition-[opacity,transform] duration-300 " + (confirmOpen ? "z-40 " : "z-0 ") + "flex items-start gap-3 ";
  if (!entered) {
    cardClasses += "opacity-0 -translate-y-2 ";
  } else {
    cardClasses += "opacity-100 translate-y-0 ";
  }
  // Dims just the checkbox + text content when a task is done — not the whole
  // card — so the edit/delete buttons (and the delete confirmation popover)
  // always stay fully visible, never inheriting a faded-out appearance.
  const contentDimClass = t.done ? "opacity-50 " : "opacity-100 ";

  const glowClasses =
    "absolute -inset-px rounded-2xl pointer-events-none transition-all duration-700 ease-out " +
    (justToggled
      ? "opacity-100 ring-2 ring-[rgb(var(--accent-rgb)/0.7)] shadow-[0_0_20px_-4px_rgb(var(--accent-rgb)/0.5)] "
      : "opacity-0 ring-2 ring-[rgb(var(--accent-rgb)/0.7)] shadow-[0_0_20px_-4px_rgb(var(--accent-rgb)/0.5)] ");

  return (
    <GlowCard className={cardClasses}>
      <div className={glowClasses} />
      <button
        onClick={() => onToggle(t.id)}
        className={
          contentDimClass +
          "mt-0.5 h-5 w-5 shrink-0 rounded-md border flex items-center justify-center transition-all duration-200 active:scale-90 " +
          (t.done ? "bg-[var(--accent)] border-[var(--accent)]" : "border-[var(--border-strong)] hover:border-[var(--accent)]")
        }
      >
        <span className={"transition-all duration-200 " + (t.done ? "scale-100 opacity-100" : "scale-0 opacity-0")}>
          <Check size={13} className="text-[var(--text-primary)]" />
        </span>
      </button>
      <div className={contentDimClass + "flex-1 min-w-0"}>
        <p className="text-xs text-[var(--accent-text)] font-medium break-words">{t.subject}</p>
        {t.title && (
          <p className="text-[var(--text-primary)] text-sm mt-0.5 break-words">
            <span className="relative inline-block max-w-full break-words">
              {t.title}
              <span
                className={
                  "absolute left-0 top-1/2 h-px bg-[var(--text-primary)] transition-all ease-out " +
                  (t.done ? "w-full duration-500" : "w-0 duration-200")
                }
              />
            </span>
          </p>
        )}
        <div className="flex items-center gap-2 mt-2">
          <span className={"text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide " + priorityColor[t.priority]}>
            {t.priority}
          </span>
          {t.deadline && (
            <span className={"text-[11px] " + (status ? "text-amber-400" : "text-[var(--text-muted)]")}>
              Due: {formatTaskDeadline(t.deadline)}
            </span>
          )}
          {t.done && t.completed_at && (
            <span className="text-[11px] text-emerald-400/80">
              ✓ Completed {formatSessionTime(t.completed_at)}
            </span>
          )}
          {t.done && t.xp_claimed && (
            t.xp_awarded > 0 ? (
              <span className="text-[11px] font-medium text-emerald-400" title="This task already earned you XP">
                +{t.xp_awarded} XP
              </span>
            ) : (
              <span className="text-[11px] text-[var(--text-faint)]" title="No XP from this task — the daily cap was already reached when it was completed">
                No XP (cap reached)
              </span>
            )
          )}
        </div>
      </div>
      {status && (
        <span
          title={status === "overdue" ? "Overdue" : "Due soon"}
          className={
            "shrink-0 flex items-center justify-center h-6 w-6 rounded-full " +
            (status === "overdue" ? "bg-red-500/15 text-red-400 animate-pulse" : "bg-amber-500/15 text-amber-400")
          }
        >
          <AlertTriangle size={13} />
        </span>
      )}
      <button onClick={() => onEdit(t)} className="text-[var(--text-faint)] hover:text-[var(--accent-text)] transition-colors p-1" title="Edit task">
        <Pencil size={14} />
      </button>
      <DeleteConfirmButton onConfirm={() => onRemove(t.id)} itemLabel="this task" onOpenChange={setConfirmOpen} />
    </GlowCard>
  );
}


// A small inline message that fades in, holds briefly, then fades out on its own —
// re-triggered by bumping `trigger` (a number), rather than a boolean the parent
// has to time itself.
function FadeMessage({ trigger, text }) {
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const isShowingRef = useRef(false);
  const timersRef = useRef([]);

  useEffect(() => {
    if (trigger === 0) return;

    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];

    function startCycle() {
      setLeaving(false);
      setVisible(false);
      requestAnimationFrame(() => setVisible(true));
      isShowingRef.current = true;
      const t = setTimeout(() => {
        setLeaving(true);
        isShowingRef.current = false;
      }, 1600);
      timersRef.current.push(t);
    }

    if (isShowingRef.current) {
      // Already showing (e.g. a rapid extra click) — fade it out fully first,
      // then start a fresh fade-in, instead of jumping mid-transition.
      setLeaving(true);
      const t = setTimeout(startCycle, 350);
      timersRef.current.push(t);
    } else {
      startCycle();
    }

    return () => {
      timersRef.current.forEach(clearTimeout);
    };
  }, [trigger]);

  if (trigger === 0) return null;

  return (
    <p
      className={
        "absolute top-full left-1/2 -translate-x-1/2 mt-1 w-max max-w-[90vw] text-center text-xs text-amber-400 transition-opacity duration-500 pointer-events-none " +
        (visible && !leaving ? "opacity-100" : "opacity-0")
      }
    >
      {text}
    </p>
  );
}

function Statistics({ refreshKey }) {
  const [sessions, setSessions] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [weekOffset, setWeekOffset] = useState(0); // 0 = this week, -1 = last week, etc.
  const [boundaryMsgTrigger, setBoundaryMsgTrigger] = useState(0);
  const [boundaryMsgText, setBoundaryMsgText] = useState("");
  const [myTier, setMyTier] = useState("free");

  useEffect(() => {
    loadSessions();
    loadTasks();
    (async () => {
      const { data: { session: authSession } } = await supabase.auth.getSession();
      const user = authSession?.user;
      if (!user) return;
      const { data } = await supabase.from("profiles").select("premium_tier").eq("user_id", user.id).maybeSingle();
      setMyTier(data?.premium_tier || "free");
    })();
  }, [refreshKey]);

  async function loadSessions() {
    setLoading(true);
    try {
      // Enforced server-side now — a Free-tier user's sessions older than
      // 2 weeks are never sent to the client at all, not fetched-then-hidden.
      const { data, error } = await supabase.rpc("get_my_study_sessions");
      if (!error) setSessions(data || []);
    } catch (e) {
      console.error("Failed to load sessions:", e);
    } finally {
      setLoading(false);
    }
  }


  async function loadTasks() {
    const { data, error } = await supabase.from("tasks").select("*");
    if (!error) setTasks(data || []);
  }

  const doneTasks = tasks.filter((t) => t.done).length;
  const stats = computeStudyStats(sessions);
  const weekChart = computeWeekChart(sessions, weekOffset);
  // How many recent sessions show in the list below — Free sees the last
  // 5, Basic the last 10, Pro sees everything (already bounded by however
  // many sessions actually exist within their full/unlimited stats window).
  const RECENT_SESSIONS_LIMIT = { free: 5, basic: 10 }; // undefined for premium = show all
  const recentLimit = RECENT_SESSIONS_LIMIT[myTier];
  const recent = recentLimit ? sessions.slice(0, recentLimit) : sessions;

  // Free/Basic can only look back a limited number of weeks — Premium is
  // unrestricted (still capped by however far real data actually goes back).
  const TIER_WEEK_LIMITS = { free: 2, basic: 4 };
  const tierWeekLimit = TIER_WEEK_LIMITS[myTier]; // undefined for premium = no tier cap
  const dataMinWeekOffset = computeMinWeekOffset(sessions);
  const tierMinWeekOffset = tierWeekLimit !== undefined ? -(tierWeekLimit - 1) : -Infinity;
  const minWeekOffset = Math.max(dataMinWeekOffset, tierMinWeekOffset);

  const goPrevWeek = () => {
    if (weekOffset - 1 < minWeekOffset) {
      setBoundaryMsgText(
        tierMinWeekOffset > dataMinWeekOffset && weekOffset - 1 < tierMinWeekOffset
          ? `${myTier === "free" ? "Free" : "Basic"} plans can only view the last ${tierWeekLimit} weeks — upgrade to see your full history.`
          : "No records found before this week."
      );
      setBoundaryMsgTrigger((p) => p + 1);
      return;
    }
    setWeekOffset((o) => o - 1);
  };

  const goNextWeek = () => {
    if (weekOffset >= 0) {
      setBoundaryMsgText("You're already viewing the current week.");
      setBoundaryMsgTrigger((p) => p + 1);
      return;
    }
    setWeekOffset((o) => Math.min(0, o + 1));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-hover)] flex items-center justify-center glow-accent-30 shrink-0">
          <BarChart3 size={19} className="text-white" />
        </div>
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">Statistics</h1>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          ["Today", loading ? "…" : formatDuration(stats.todaySeconds)],
          ["This week", loading ? "…" : formatDuration(stats.weekSeconds)],
          ["Total focused", loading ? "…" : formatDuration(stats.totalSeconds)],
          ["Saved sessions", loading ? "…" : stats.sessionCount],
          ["Current streak", loading ? "…" : `🔥 ${stats.streak}`],
          ["Completed tasks", doneTasks],
        ].map(([label, value]) => (
          <GlowCard key={label}>
            <p className="text-xs text-[var(--text-muted)] mb-1">{label}</p>
            <p className="text-xl font-semibold text-[var(--text-primary)]">{value}</p>
          </GlowCard>
        ))}
      </div>

      <GlowCard>
        <div className="flex items-center justify-between mb-1">
          <button
            onClick={goPrevWeek}
            className="h-7 w-7 rounded-lg bg-[var(--surface-2)] border border-[var(--card-border)] text-[var(--text-secondary-strong)] hover:bg-[var(--surface-3)] flex items-center justify-center transition-all duration-150 active:scale-90"
            title="Previous week"
          >
            <ChevronLeft size={15} />
          </button>
          <div className="text-center">
            <p className="text-[var(--text-primary)] font-medium text-sm">{weekChart.label}</p>
            <p className="text-[10px] text-[var(--text-muted)]">{weekChart.rangeLabel}</p>
          </div>
          <button
            onClick={goNextWeek}
            className="h-7 w-7 rounded-lg bg-[var(--surface-2)] border border-[var(--card-border)] text-[var(--text-secondary-strong)] hover:bg-[var(--surface-3)] flex items-center justify-center transition-all duration-150 active:scale-90"
            title="Next week"
          >
            <ChevronRight size={15} />
          </button>
        </div>
        <FadeMessage trigger={boundaryMsgTrigger} text={boundaryMsgText} />
        <div style={{ width: "100%", height: 200 }} className="mt-3">
          <ResponsiveContainer>
            <BarChart data={weekChart.data}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="day" stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} width={24} />
              <Tooltip
                contentStyle={{ background: "var(--surface-solid)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, color: "var(--text-primary)" }}
                cursor={{ fill: "rgba(168,85,247,0.08)" }}
              />
              <Bar dataKey="hours" fill="var(--accent)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </GlowCard>

      <GlowCard>
        <p className="text-[var(--text-primary)] font-medium text-sm mb-1">Recent Sessions</p>
        {recentLimit && <p className="text-xs text-[var(--text-muted)] mb-3">Showing your {recentLimit} most recent — upgrade to see more.</p>}
        {loading && <p className="text-[var(--text-muted)] text-sm">Loading...</p>}
        {!loading && recent.length === 0 && (
          <p className="text-[var(--text-muted)] text-sm">No saved sessions yet — finish a timer and hit Save Session to see it here.</p>
        )}
        <div className="space-y-2">
          {recent.map((s) => (
            <div key={s.id} className="flex items-center justify-between text-sm border-b border-[var(--border)] last:border-0 pb-2 last:pb-0">
              <span className="text-[var(--text-primary)]">
                {timerTypeLabel(s.timer_type)} · {Math.round((s.focused_seconds || 0) / 60)} min
              </span>
              <span className="text-xs text-[var(--text-muted)]">{formatSessionTime(s.completed_at)}</span>
            </div>
          ))}
        </div>
      </GlowCard>
    </div>
  );
}

function computeMonthlyTrend(sessions) {
  const now = new Date();
  const months = [];
  for (let m = 0; m <= now.getMonth(); m++) {
    const d = new Date(now.getFullYear(), m, 1);
    months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, month: d.toLocaleDateString([], { month: "short" }), hours: 0 });
  }
  sessions.forEach((s) => {
    const d = new Date(s.completed_at);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const bucket = months.find((m) => m.key === key);
    if (bucket) bucket.hours += (s.focused_seconds || 0) / 3600;
  });
  return months.map((m) => ({ month: m.month, hours: Math.round(m.hours * 100) / 100 }));
}

// Distinct calendar days with at least one saved session, out of every day
// that's passed since the account was created — a real "how consistent have
// you actually been" stat, not just a raw session count.
function computeDaysFocused(sessions, accountCreatedAt) {
  if (!accountCreatedAt) return { focusedDays: 0, totalDays: 0 };
  const created = new Date(accountCreatedAt);
  const startOfCreated = new Date(created.getFullYear(), created.getMonth(), created.getDate());
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const totalDays = Math.max(1, Math.round((startOfToday - startOfCreated) / (1000 * 60 * 60 * 24)) + 1);

  const uniqueDays = new Set(sessions.map((s) => new Date(s.completed_at).toDateString()));
  return { focusedDays: uniqueDays.size, totalDays };
}

const TIMER_TYPE_LABELS = { stopwatch: "Stopwatch", focus: "Focus Timer", pomodoro: "Pomodoro" };

// Which timer mode gets used most, plus — for Focus Timer and Pomodoro
// specifically, since only those two have an actual planned duration to
// compare against — what fraction of sessions ran to completion versus
// getting saved partway through. Stopwatch has no target duration, so
// "completion" isn't a meaningful concept for it and it's excluded here.
// Also totals up real break time taken (Pomodoro only tracks this).
function computeTimerUsageStats(sessions) {
  const counts = { stopwatch: 0, focus: 0, pomodoro: 0 };
  let completableTotal = 0;
  let completableFinished = 0;
  let totalBreakSeconds = 0;

  sessions.forEach((s) => {
    const type = s.timer_type;
    if (counts[type] !== undefined) counts[type]++;
    if (type === "focus" || type === "pomodoro") {
      completableTotal++;
      // Small tolerance for rounding — treat 97%+ of the planned duration as "completed."
      if ((s.duration_seconds || 0) > 0 && s.focused_seconds >= s.duration_seconds * 0.97) {
        completableFinished++;
      }
    }
    totalBreakSeconds += s.break_seconds || 0;
  });

  const mostUsedType = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const completionPct = completableTotal > 0 ? Math.round((completableFinished / completableTotal) * 100) : 0;

  return {
    counts,
    mostUsedLabel: mostUsedType && mostUsedType[1] > 0 ? TIMER_TYPE_LABELS[mostUsedType[0]] : null,
    mostUsedCount: mostUsedType ? mostUsedType[1] : 0,
    completionPct,
    completableTotal,
    completableFinished,
    totalBreakSeconds,
  };
}

// A composite score blending three distinct, real signals: how often
// sessions actually run to completion, how many sessions are genuinely
// substantial (15+ min, not just a quick check-in), and how many days you
// actually show up. Each is shown separately, plus one overall letter grade.
function computeProductivityScore(completionPct, sessions, daysFocusedPct) {
  const substantialCount = sessions.filter((s) => (s.focused_seconds || 0) >= 15 * 60).length;
  const sessionQuality = sessions.length > 0 ? Math.round((substantialCount / sessions.length) * 100) : 0;
  const consistency = Math.round(daysFocusedPct);
  const completionRate = Math.round(completionPct);

  const overall = Math.round(0.4 * completionRate + 0.3 * sessionQuality + 0.3 * consistency);
  const grade = overall >= 85 ? "A" : overall >= 70 ? "B" : overall >= 55 ? "C" : overall >= 40 ? "D" : "F";

  return { score: Math.max(0, Math.min(100, overall)), grade, completionRate, sessionQuality, consistency };
}

// Finds the 3-hour block of the day with the most total focused time, and
// how much more focused that window is compared to your hourly average —
// a real comparison against your own history, not a guess.
function computeBestHourWindow(sessions) {
  const hourly = Array(24).fill(0);
  sessions.forEach((s) => {
    const h = new Date(s.completed_at).getHours();
    hourly[h] += s.focused_seconds || 0;
  });
  const total = hourly.reduce((a, b) => a + b, 0);
  if (total === 0) return null;

  const avgPerHour = total / 24;
  let bestStart = 0;
  let bestSum = -1;
  for (let start = 0; start < 24; start++) {
    let sum = 0;
    for (let i = 0; i < 3; i++) sum += hourly[(start + i) % 24];
    if (sum > bestSum) {
      bestSum = sum;
      bestStart = start;
    }
  }
  const bestAvgPerHour = bestSum / 3;
  const pctMore = avgPerHour > 0 ? Math.round(((bestAvgPerHour - avgPerHour) / avgPerHour) * 100) : 0;
  if (pctMore <= 5) return null; // not a meaningful pattern yet

  const fmt = (h) => {
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    const period = h < 12 ? "AM" : "PM";
    return `${hour12}${period}`;
  };
  const endHour = (bestStart + 3) % 24;
  return { label: `${fmt(bestStart)}–${fmt(endHour)}`, pctMore };
}

// Single most productive hour, plus focused minutes bucketed into
// Morning/Afternoon/Evening/Night — same underlying hourly histogram as
// the best-window calc above, just a different, more visual presentation.
function computePeakHours(sessions) {
  const hourly = Array(24).fill(0);
  sessions.forEach((s) => {
    const h = new Date(s.completed_at).getHours();
    hourly[h] += s.focused_seconds || 0;
  });
  const total = hourly.reduce((a, b) => a + b, 0);
  if (total === 0) return null;

  let bestHour = 0;
  let bestVal = -1;
  hourly.forEach((v, h) => {
    if (v > bestVal) {
      bestVal = v;
      bestHour = h;
    }
  });
  const fmt12 = (h) => {
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    return `${hour12}${h < 12 ? "am" : "pm"}`;
  };

  const buckets = [
    { label: "Morning", range: [5, 11] },
    { label: "Afternoon", range: [12, 16] },
    { label: "Evening", range: [17, 20] },
    { label: "Night", range: [21, 4] }, // wraps past midnight
  ].map((b) => {
    let sum = 0;
    for (let h = 0; h < 24; h++) {
      const inRange = b.range[0] <= b.range[1] ? h >= b.range[0] && h <= b.range[1] : h >= b.range[0] || h <= b.range[1];
      if (inRange) sum += hourly[h];
    }
    return { label: b.label, seconds: sum };
  });
  const maxBucket = Math.max(...buckets.map((b) => b.seconds), 1);

  return {
    bestHourLabel: fmt12(bestHour),
    buckets: buckets.map((b) => ({ ...b, pct: Math.round((b.seconds / maxBucket) * 100) })),
  };
}

// A compact set of session-shape stats — longest single session, average
// length, and how many distinct days were active in the last 30.
function computeStudyPatterns(sessions) {
  const now = new Date();
  const start30 = new Date(now);
  start30.setDate(start30.getDate() - 30);

  const longestSession = sessions.reduce((max, s) => Math.max(max, s.focused_seconds || 0), 0);
  const avgSession = sessions.length > 0 ? sessions.reduce((sum, s) => sum + (s.focused_seconds || 0), 0) / sessions.length : 0;
  const activeDays30 = new Set(sessions.filter((s) => new Date(s.completed_at) >= start30).map((s) => new Date(s.completed_at).toDateString())).size;

  return { longestSession, avgSession, activeDays30 };
}

// Projects forward from your actual recent pace (last 14 days) to estimate
// when you'll cross the next round-number milestone — a straight-line
// projection from real numbers, not a model forecast.
function computeMilestonePrediction(sessions, totalFocusedSeconds) {
  const now = new Date();
  const start14 = new Date(now);
  start14.setDate(start14.getDate() - 14);
  const recentSeconds = sessions
    .filter((s) => new Date(s.completed_at) >= start14)
    .reduce((sum, s) => sum + (s.focused_seconds || 0), 0);
  const dailyPaceSeconds = recentSeconds / 14;

  if (dailyPaceSeconds <= 0) return null;

  const totalHours = totalFocusedSeconds / 3600;
  const milestones = [10, 25, 50, 100, 200, 500, 1000];
  const nextMilestone = milestones.find((m) => m > totalHours);
  if (!nextMilestone) return null;

  const secondsNeeded = nextMilestone * 3600 - totalFocusedSeconds;
  const daysNeeded = Math.max(1, Math.ceil(secondsNeeded / dailyPaceSeconds));
  return { milestone: nextMilestone, days: daysNeeded };
}

// This week's total focused time vs last week's — a real week-over-week
// comparison, not a vague trend line.
function computeWeekOverWeek(sessions) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfThisWeek = new Date(startOfToday);
  startOfThisWeek.setDate(startOfToday.getDate() - startOfToday.getDay());
  const startOfLastWeek = new Date(startOfThisWeek);
  startOfLastWeek.setDate(startOfThisWeek.getDate() - 7);

  let thisWeekSeconds = 0;
  let lastWeekSeconds = 0;
  sessions.forEach((s) => {
    const d = new Date(s.completed_at);
    const seconds = s.focused_seconds || 0;
    if (d >= startOfThisWeek) thisWeekSeconds += seconds;
    else if (d >= startOfLastWeek) lastWeekSeconds += seconds;
  });

  if (lastWeekSeconds === 0) {
    return thisWeekSeconds > 0 ? { pct: null, isNew: true } : { pct: 0, isNew: false };
  }
  const pct = Math.round(((thisWeekSeconds - lastWeekSeconds) / lastWeekSeconds) * 100);
  return { pct, isNew: false, thisWeekSeconds, lastWeekSeconds };
}

// Only "decided" tasks count here: ones that were actually completed, or
// ones that are still incomplete with their deadline already passed. A task
// that's simply pending with time left isn't counted either way yet — so
// completing it on time genuinely increases the "met" count (it moves from
// undecided into the on-time bucket), rather than having been silently
// pre-counted as on-time before you ever touched it.
function computeTaskTimeliness(tasks) {
  const now = new Date();
  let met = 0;
  let missed = 0;

  tasks.forEach((t) => {
    if (!t.deadline) return;
    const deadlineDate = new Date(t.deadline);
    if (t.done && t.completed_at) {
      if (new Date(t.completed_at) <= deadlineDate) met++;
      else missed++;
    } else if (!t.done && deadlineDate < now) {
      missed++;
    }
    // else: still pending with time left — not decided yet, excluded entirely
  });

  const total = met + missed;
  if (total === 0) return null;
  return {
    onTime: met,
    late: missed,
    total,
    onTimePct: Math.round((met / total) * 100),
  };
}

// Daily patterns: total focused minutes per weekday across all history, so we
// can surface which day of the week is genuinely the strongest.
const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function computeDailyPatterns(sessions) {
  const totals = [0, 0, 0, 0, 0, 0, 0];
  sessions.forEach((s) => {
    const dow = new Date(s.completed_at).getDay();
    totals[dow] += (s.focused_seconds || 0) / 60;
  });
  const data = WEEKDAY_SHORT.map((day, i) => ({ day, minutes: Math.round(totals[i]) }));
  const strongestIdx = totals.indexOf(Math.max(...totals));
  const hasData = totals.some((t) => t > 0);
  return { data, strongestDay: hasData ? WEEKDAY_SHORT[strongestIdx] : null, strongestMinutes: Math.round(totals[strongestIdx]) };
}

// Routine changes: which part of the day (morning/afternoon/evening/night) a
// person mostly studies in, compared between the last 14 days and the 14
// days before that — flags a genuine shift, not just noise.
function timeOfDayBucket(date) {
  const h = date.getHours();
  if (h >= 5 && h < 12) return "Morning";
  if (h >= 12 && h < 17) return "Afternoon";
  if (h >= 17 && h < 22) return "Evening";
  return "Night";
}
function dominantBucket(sessions) {
  const counts = { Morning: 0, Afternoon: 0, Evening: 0, Night: 0 };
  sessions.forEach((s) => {
    counts[timeOfDayBucket(new Date(s.completed_at))] += s.focused_seconds || 0;
  });
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}
function computeRoutineChange(sessions) {
  const now = new Date();
  const start14 = new Date(now);
  start14.setDate(start14.getDate() - 14);
  const start28 = new Date(now);
  start28.setDate(start28.getDate() - 28);

  const recent = sessions.filter((s) => new Date(s.completed_at) >= start14);
  const previous = sessions.filter((s) => {
    const d = new Date(s.completed_at);
    return d >= start28 && d < start14;
  });

  const recentBucket = dominantBucket(recent);
  const previousBucket = dominantBucket(previous);

  if (!recentBucket || !previousBucket) return { hasEnoughData: false };
  return { hasEnoughData: true, changed: recentBucket !== previousBucket, recentBucket, previousBucket };
}

// Today / this week / this month, side by side.
function computeCompareStats(sessions) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfToday.getDate() - startOfToday.getDay());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  let today = 0, week = 0, month = 0;
  let todayCount = 0, weekCount = 0, monthCount = 0;
  sessions.forEach((s) => {
    const d = new Date(s.completed_at);
    const seconds = s.focused_seconds || 0;
    if (d >= startOfToday) { today += seconds; todayCount++; }
    if (d >= startOfWeek) { week += seconds; weekCount++; }
    if (d >= startOfMonth) { month += seconds; monthCount++; }
  });
  return { today, week, month, todayCount, weekCount, monthCount };
}

function usernameValid(u) {
  return /^[a-z0-9_]{3,20}$/.test(u);
}

const USERNAME_CHANGE_LIMIT_PER_WEEK = 2;
const USERNAME_WINDOW_DAYS = 7;

// Username changes only — capped at 2 per rolling 7-day window, resetting
// automatically rather than being a lifetime limit. Display name has no
// restriction at all, anywhere.
function checkUsernameChangeAllowed(profile) {
  if (!profile) return { allowed: false, reason: "" };
  const windowStart = profile.username_week_started_at ? new Date(profile.username_week_started_at) : new Date(profile.created_at);
  const daysSinceWindowStart = (Date.now() - windowStart.getTime()) / (1000 * 60 * 60 * 24);
  const windowExpired = daysSinceWindowStart >= USERNAME_WINDOW_DAYS;
  const usedThisWindow = windowExpired ? 0 : profile.username_changes_this_week || 0;

  if (usedThisWindow >= USERNAME_CHANGE_LIMIT_PER_WEEK) {
    const daysLeft = Math.max(1, Math.ceil(USERNAME_WINDOW_DAYS - daysSinceWindowStart));
    return { allowed: false, reason: `You've used both username changes for this week. Try again in ${daysLeft} day${daysLeft === 1 ? "" : "s"}.`, changesLeft: 0, windowExpired };
  }
  return { allowed: true, reason: "", changesLeft: USERNAME_CHANGE_LIMIT_PER_WEEK - usedThisWindow, windowExpired };
}

// Builds the DB fields to write when a username change is actually saved —
// either resetting the rolling window (if it had expired) or incrementing
// within the current one.
function buildUsernameChangePayload(profile, check) {
  if (check.windowExpired) {
    return { username_week_started_at: new Date().toISOString(), username_changes_this_week: 1 };
  }
  return { username_changes_this_week: (profile.username_changes_this_week || 0) + 1 };
}

function initialsFor(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

// A heartbeat older than 2 minutes means they're not actually here anymore
// (closed the tab, lost connection, laptop slept) — shown as Offline
// regardless of whatever status was last written, without needing a
// reliable "goodbye" signal from the closing browser. `now` is passed in
// (rather than read internally) so callers can control how often this
// recomputes, instead of it always using the instant this function runs.
function computeEffectiveStatus(presence, now) {
  if (!presence || !presence.last_heartbeat) return { status: "offline", label: "Offline", dot: "bg-[var(--text-faint)]" };
  const heartbeatAgeMs = now - new Date(presence.last_heartbeat).getTime();
  if (heartbeatAgeMs > 2 * 60 * 1000) return { status: "offline", label: "Offline", dot: "bg-[var(--text-faint)]" };
  if (presence.status === "idle") return { status: "idle", label: "Idle", dot: "bg-[var(--border-strong)]" };

  const elapsedMs = presence.session_started_at ? Math.max(0, now - new Date(presence.session_started_at).getTime()) : 0;
  const elapsedMin = Math.floor(elapsedMs / 60000);
  const meta = {
    focusing: { label: "Focusing", dot: "bg-emerald-400" },
    break: { label: "On break", dot: "bg-amber-400" },
    stopwatch: { label: "Using Stopwatch", dot: "bg-sky-400" },
  }[presence.status] || { label: presence.status, dot: "bg-[var(--text-faint)]" };

  return { status: presence.status, label: `${meta.label} — ${elapsedMin} min`, dot: meta.dot };
}

function PersonAvatar({ name, size = 40, isActive, avatarUrl }) {
  const dotSize = Math.max(10, Math.round(size * 0.32));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {avatarUrl ? (
        <img src={avatarUrl} alt={name} className="rounded-full object-cover" style={{ width: size, height: size }} />
      ) : (
        <div
          className="rounded-full bg-gradient-to-br from-[var(--accent)] to-[var(--accent-hover)] flex items-center justify-center font-bold text-white"
          style={{ width: size, height: size, fontSize: size * 0.36 }}
        >
          {initialsFor(name)}
        </div>
      )}
      {isActive !== undefined && (
        <span
          className={"absolute rounded-full border-2 border-[var(--surface)] " + (isActive ? "bg-emerald-400" : "bg-[var(--text-faint)]")}
          style={{ width: dotSize, height: dotSize, right: -1, bottom: -1 }}
        />
      )}
    </div>
  );
}

// Shows a friend's real stats — level, streaks, focus time, tasks completed —
// using the exact same computeStudyStats/computeGrowth logic as your own
// Profile tab, just pointed at their data instead of yours. Also shows their
// real live status now that presence tracking exists.
function InspectFriendPage({ profile, onBack, backLabel = "Back to Friends", onRemoveFriend }) {
  const [loading, setLoading] = useState(true);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [tasksCompleted, setTasksCompleted] = useState(0);
  const [friendTaskXP, setFriendTaskXP] = useState(0);
  const [friendGroupXP, setFriendGroupXP] = useState(0);
  const [presence, setPresence] = useState(null);
  const [nowTick, setNowTick] = useState(Date.now());
  const [friendAchievements, setFriendAchievements] = useState([]);
  const [globalRank, setGlobalRank] = useState(null);
  const [friendCount, setFriendCount] = useState(0);
  const [friendCappedFocusXP, setFriendCappedFocusXP] = useState(0);

  useEffect(() => {
    if (!profile) return;
    setLoading(true);
    (async () => {
      const [sessionsRes, statsRes, presenceRes, achievementsRes, cappedFocusXPRes] = await Promise.all([
        supabase.from("study_sessions").select("focused_seconds, completed_at").eq("user_id", profile.user_id),
        supabase.from("user_task_stats").select("lifetime_tasks_completed, lifetime_task_xp, lifetime_group_xp").eq("user_id", profile.user_id).maybeSingle(),
        supabase.from("user_presence").select("*").eq("user_id", profile.user_id).maybeSingle(),
        supabase.from("user_achievements").select("*").eq("user_id", profile.user_id),
        supabase.rpc("get_capped_focus_xp", { p_user_id: profile.user_id }),
      ]);
      setSessions(sessionsRes.data || []);
      setFriendCappedFocusXP(cappedFocusXPRes.data || 0);
      setTasksCompleted(statsRes.data?.lifetime_tasks_completed || 0);
      setFriendTaskXP(statsRes.data?.lifetime_task_xp || 0);
      setFriendGroupXP(statsRes.data?.lifetime_group_xp || 0);
      setPresence(presenceRes.data || null);
      setFriendAchievements(achievementsRes.data || []);
      setLoading(false);
      fetchGlobalRank(profile.user_id).then(setGlobalRank);
      supabase.rpc("get_user_friend_count", { p_user_id: profile.user_id }).then(({ data }) => setFriendCount(data || 0));
    })();
  }, [profile]);

  useEffect(() => {
    if (!profile) return;
    const channel = supabase
      .channel(`inspect-presence-${profile.user_id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "user_presence", filter: `user_id=eq.${profile.user_id}` }, (payload) => {
        setPresence(payload.new || null);
      })
      .subscribe();
    const tick = setInterval(() => setNowTick(Date.now()), 15000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(tick);
    };
  }, [profile]);

  if (!profile) return null;

  const stats = computeStudyStats(sessions);
  const longestStreak = computeLongestStreak(sessions);
  const friendAchievementXP = friendAchievements.reduce((sum, r) => sum + (r.xp_awarded || 0), 0);
  const friendTotalXPEarned = friendCappedFocusXP + friendTaskXP + friendGroupXP + friendAchievementXP;
  const { current, pct } = computeGrowth(friendTotalXPEarned);
  const friendLevel200Threshold = GROWTH_LEVELS[GROWTH_NORMAL_LEVEL_COUNT - 1].threshold; // 7,000,000
  const friendIsAscended = friendTotalXPEarned >= GROWTH_MAX_XP;
  const friendXPColor = friendIsAscended
    ? "text-red-600 animate-pulse"
    : friendTotalXPEarned >= friendLevel200Threshold
    ? "text-orange-400"
    : "text-[var(--text-primary)]";
  const eff = computeEffectiveStatus(presence, nowTick);

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-3">
        <button onClick={onBack} className="text-sm text-[var(--accent-text)] hover:brightness-110 flex items-center gap-1">
          <ChevronLeft size={15} /> {backLabel}
        </button>
        {onRemoveFriend && (
          confirmingRemove ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--text-muted)]">Remove friend?</span>
              <button
                onClick={async () => {
                  setRemoving(true);
                  await onRemoveFriend();
                  setRemoving(false);
                }}
                disabled={removing}
                className="text-xs font-medium bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg transition-colors"
              >
                {removing ? "Removing..." : "Confirm"}
              </button>
              <button onClick={() => setConfirmingRemove(false)} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] px-2 py-1.5">
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmingRemove(true)}
              className="text-xs font-medium text-red-400 border border-red-500/30 hover:bg-red-500/10 transition-colors px-3 py-1.5 rounded-lg flex items-center gap-1.5"
            >
              <UserX size={13} /> Remove friend
            </button>
          )
        )}
      </div>

      <div className="grid md:grid-cols-3 gap-4 items-start">
        <div className="md:col-span-2 space-y-4">
          <GlowCard glow>
            <div className="flex items-start gap-4 mb-4">
              <PersonAvatar
                name={profile.display_name || profile.username}
                avatarUrl={profile.avatar_url}
                size={64}
                isActive={eff.status === "focusing" || eff.status === "break" || eff.status === "stopwatch"}
              />
              <div className="flex-1 min-w-0">
                <p className="text-lg font-semibold text-[var(--text-primary)] truncate flex items-center gap-1.5">
                  {profile.display_name || profile.username}
                  {profile.is_premium && <Crown size={16} className="text-amber-400 shrink-0" />}
                  {profile.user_id === "97f98bca-98b3-47f6-b2d1-0ac78bc2674f" && (
                    <span className="text-[10px] font-bold uppercase tracking-wide bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded shrink-0">Admin</span>
                  )}
                </p>
                <p className="text-sm text-[var(--accent-text)]">@{profile.username}</p>
                {profile.bio && <p className="text-sm text-[var(--text-secondary)] mt-2 break-words">{profile.bio}</p>}
              </div>
            </div>

            <div className="bg-[var(--surface-2)]/40 rounded-xl p-3 flex items-center gap-2">
              <span className={"h-2 w-2 rounded-full shrink-0 " + eff.dot} />
              <p className="text-xs text-[var(--text-secondary-strong)]">{eff.label}</p>
            </div>
          </GlowCard>

          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center gap-3">
              <Loader2 size={22} className="text-[var(--accent-text)] animate-spin" />
              <p className="text-sm text-[var(--text-muted)]">Loading stats...</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {[
                  ["Focus time", formatDuration(stats.totalSeconds)],
                  ["Sessions", stats.sessionCount],
                  ["Current streak", `🔥 ${stats.streak}`],
                  ["Longest streak", `🏆 ${longestStreak}`],
                  ["Tasks completed", tasksCompleted],
                  ["Friends", `${friendCount}/200`],
                ].map(([label, value]) => (
                  <GlowCard key={label}>
                    <p className="text-xs text-[var(--text-muted)] mb-1">{label}</p>
                    <p className="text-lg font-semibold text-[var(--text-primary)]">{value}</p>
                  </GlowCard>
                ))}
              </div>

              <GlowCard>
                <p className="text-sm font-medium text-[var(--text-primary)] mb-3">
                  Achievements ({friendAchievements.length} / {ACHIEVEMENTS.length})
                </p>
                {friendAchievements.length === 0 ? (
                  <p className="text-xs text-[var(--text-muted)]">No achievements earned yet.</p>
                ) : (
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                    {friendAchievements.map((r) => {
                      const def = ACHIEVEMENTS.find((a) => a.key === r.achievement_key);
                      if (!def) return null;
                      return (
                        <div key={r.achievement_key} className="flex flex-col items-center gap-1" title={def.title}>
                          <div className="h-11 w-11 rounded-xl bg-[rgb(var(--accent-rgb)/0.2)] flex items-center justify-center text-xl">{def.icon}</div>
                          <p className="text-[9px] text-[var(--text-muted)] text-center leading-tight truncate w-full">{def.title}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </GlowCard>
            </>
          )}
        </div>

        <GlowCard className="flex flex-col items-center py-10 px-6 md:sticky md:top-4">
          <CompactCharacterPreview styleKey={profile.character_style} level={current.level} color={current.color} size={220} />
          <p className="text-xs text-[var(--text-muted)] mt-3">Level {current.level}</p>
          <LevelNameEffect level={current.level} name={current.name} color={current.color} className="text-lg font-bold mt-1" />
          <div className="h-2 w-full rounded-full bg-[var(--surface-2)] overflow-hidden mt-4">
            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${current.color}, var(--accent))` }} />
          </div>
          <div className="w-full mt-4 pt-4 border-t border-[var(--border-subtle)] text-center">
            <p className="text-xs text-[var(--text-muted)] mb-1">Total XP Earned</p>
            {friendIsAscended ? (
              <span
                className="inline-block text-xl font-bold animate-pulse px-4 py-1.5 rounded-lg"
                style={{
                  color: "var(--accent)",
                  background: isCurrentThemeLight() ? "#fdf6d8" : "#000",
                  border: "2px solid var(--accent)",
                  boxShadow: "0 0 16px rgb(var(--accent-rgb) / 0.5), inset 0 0 12px rgb(var(--accent-rgb) / 0.15)",
                }}
              >
                {friendTotalXPEarned.toLocaleString()}
              </span>
            ) : (
              <p className={"text-xl font-bold " + friendXPColor}>{friendTotalXPEarned.toLocaleString()}</p>
            )}
          </div>
          {globalRank && (
            <div className="flex items-center gap-1.5 mt-4 bg-[rgb(var(--accent-rgb)/0.12)] border border-[rgb(var(--accent-rgb)/0.25)] rounded-full px-3 py-1.5">
              <Trophy size={13} className="text-[var(--accent-text)]" />
              <p className="text-xs font-semibold text-[var(--accent-text)]">Global Rank #{globalRank}</p>
            </div>
          )}
        </GlowCard>
      </div>
    </div>
  );
}

const GROUP_ICON_OPTIONS = ["📚", "🎯", "🔥", "⚡", "🚀", "🧠", "💡", "🏆", "🌙", "☕"];
const GROUP_CATEGORIES = ["General Study", "Exams", "Coding", "Reading", "Work", "Deep Work", "University", "School", "Personal Development", "Challenges"];

function GroupCard({ group, memberCount, totalMinutes, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-[var(--surface-2)]/40 hover:bg-[var(--surface-2)]/70 rounded-2xl p-4 transition-colors"
      style={{ border: `var(--card-border-width) solid var(--card-border)` }}
    >
      <div className="flex items-center gap-3">
        <div className="relative shrink-0">
          <div className="h-12 w-12 rounded-xl bg-[rgb(var(--accent-rgb)/0.2)] flex items-center justify-center text-2xl">{group.icon}</div>
          {group.goal_locked && (
            <span
              title="Waiting for the owner to start the next round"
              className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-[var(--surface-solid)] border border-[var(--card-border)] flex items-center justify-center"
            >
              <Lock size={11} className="text-amber-400" />
            </span>
          )}
          {group.pending_activation && (
            <span
              title="Scheduled to activate later"
              className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-[var(--surface-solid)] border border-[var(--card-border)] flex items-center justify-center"
            >
              <Calendar size={11} className="text-[var(--accent-text)]" />
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[var(--text-primary)] truncate flex items-center gap-1.5">
            {group.name}
            {group.goal_locked && <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 shrink-0">Locked</span>}
            {group.pending_activation && <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-[rgb(var(--accent-rgb)/0.15)] text-[var(--accent-text)] shrink-0">Scheduled</span>}
          </p>
          <p className="text-xs text-[var(--text-muted)] truncate">
            {group.goal_type === "total_hours" ? `Round ${group.round_number || 1} · ` : ""}
            {group.description || "No description"}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-[var(--text-muted)]">{memberCount}{group.max_members ? ` / ${group.max_members}` : ""} members</p>
          <p className="text-xs text-[var(--accent-text)] font-medium mt-0.5">{formatDuration((totalMinutes || 0) * 60)} focused</p>
        </div>
      </div>
    </button>
  );
}

function DiscoverGroupCard({ group, memberCount, totalMinutes, onJoin, joining }) {
  const isFull = group.max_members && memberCount >= group.max_members;
  return (
    <div className="bg-[var(--surface-2)]/40 rounded-2xl p-4" style={{ border: `var(--card-border-width) solid var(--card-border)` }}>
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-xl bg-[rgb(var(--accent-rgb)/0.2)] flex items-center justify-center text-2xl shrink-0">{group.icon}</div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{group.name}</p>
          <p className="text-xs text-[var(--text-muted)] truncate">{group.description || "No description"}</p>
          <p className="text-[10px] text-[var(--text-faint)] mt-1">
            {memberCount} / {group.max_members} seats · {formatDuration((totalMinutes || 0) * 60)} focused {group.category ? `· ${group.category}` : ""}
          </p>
        </div>
        <button
          onClick={onJoin}
          disabled={isFull || joining}
          className={
            "shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors " +
            (isFull ? "bg-[var(--surface-2)] text-[var(--text-faint)] cursor-not-allowed" : "bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white disabled:opacity-50")
          }
        >
          {isFull ? "Full" : joining ? "..." : "Join"}
        </button>
      </div>
    </div>
  );
}

function GroupDashboard({ groupId, myUserId, onBack, goTo }) {
  const [group, setGroup] = useState(null);
  const [members, setMembers] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [lifetimeByUserId, setLifetimeByUserId] = useState({});
  const [trueTotalMinutesByUserId, setTrueTotalMinutesByUserId] = useState({});
  const [period, setPeriod] = useState("week");
  const [loading, setLoading] = useState(true);
  const [autoCollectMessage, setAutoCollectMessage] = useState("");
  const [autoCollectMessageKey, setAutoCollectMessageKey] = useState(0);
  const [showInvite, setShowInvite] = useState(false);
  const [friendsForInvite, setFriendsForInvite] = useState([]);
  const [presenceByUserId, setPresenceByUserId] = useState({});
  const [nowTick, setNowTick] = useState(Date.now());
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteBlockedXP, setDeleteBlockedXP] = useState(0);
  const [myGroupLifetimeXP, setMyGroupLifetimeXP] = useState(0);
  const [confirmMemberAction, setConfirmMemberAction] = useState(null); // { type: "remove" | "demote", userId, name }
  const [inspectingMember, setInspectingMember] = useState(null);
  const [editingGoalHours, setEditingGoalHours] = useState(false);
  const [goalHoursInput, setGoalHoursInput] = useState("");
  const [goalUnit, setGoalUnit] = useState("minutes");
  const [goalSaving, setGoalSaving] = useState(false);
  const [restartHoursInput, setRestartHoursInput] = useState("");
  const [restartUnit, setRestartUnit] = useState("minutes");
  const [restartDeadline, setRestartDeadline] = useState(null);
  const [restarting, setRestarting] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [justClaimedXP, setJustClaimedXP] = useState(null);
  const [myUnclaimedXP, setMyUnclaimedXP] = useState(0);
  const [roundJustChanged, setRoundJustChanged] = useState(false);
  const prevRoundRef = useRef(null);

  useEffect(() => {
    const current = group?.round_number;
    if (current == null) return;
    if (prevRoundRef.current !== null && current !== prevRoundRef.current) {
      setRoundJustChanged(true);
      setTimeout(() => setRoundJustChanged(false), 2500);
    }
    prevRoundRef.current = current;
  }, [group?.round_number]);
  const [goalProgress, setGoalProgress] = useState(null);
  const [modeChanging, setModeChanging] = useState(false);
  const [restartMode, setRestartMode] = useState("manual"); // which mode the restart form shows — defaults to the group's current mode once loaded
  const [scheduleActivationAt, setScheduleActivationAt] = useState(null);
  const [scheduleTargetInput, setScheduleTargetInput] = useState("");
  const [scheduleTargetUnit, setScheduleTargetUnit] = useState("minutes");
  const [scheduling, setScheduling] = useState(false);
  const [targetEditError, setTargetEditError] = useState("");
  const [targetEditErrorVisible, setTargetEditErrorVisible] = useState(false);
  const [targetWarningShown, setTargetWarningShown] = useState(false);
  const [targetWarningVisible, setTargetWarningVisible] = useState(false);

  useEffect(() => {
    if (editingGoalHours) {
      setTargetWarningShown(true);
      setTargetWarningVisible(true);
      const fadeTimer = setTimeout(() => setTargetWarningVisible(false), 7000);
      const hideTimer = setTimeout(() => setTargetWarningShown(false), 7700);
      return () => {
        clearTimeout(fadeTimer);
        clearTimeout(hideTimer);
      };
    }
    setTargetWarningShown(false);
    setTargetWarningVisible(false);
  }, [editingGoalHours]);
  const [activity, setActivity] = useState([]);
  const [codeCopied, setCodeCopied] = useState(false);
  const [codeRevealed, setCodeRevealed] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    loadGroup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, period]);

  async function loadGroup() {
    setLoading(true);
    const [groupRes, membersRes, leaderboardRes, lifetimeRes] = await Promise.all([
      supabase.from("groups").select("*").eq("id", groupId).single(),
      supabase.from("group_members").select("user_id, role, joined_at").eq("group_id", groupId),
      supabase.rpc("get_group_leaderboard", { p_group_id: groupId, period }),
      supabase.rpc("get_group_leaderboard", { p_group_id: groupId, period: "lifetime" }),
    ]);

    if (groupRes.error) console.error("Failed to load group:", groupRes.error);
    setGroup(groupRes.data || null);
    supabase.rpc("get_my_unclaimed_group_xp", { p_group_id: groupId }).then(({ data }) => setMyUnclaimedXP(data || 0));
    supabase.rpc("get_my_group_lifetime_xp", { p_group_id: groupId }).then(({ data }) => setMyGroupLifetimeXP(data || 0));
    if (groupRes.data?.activation_mode) setRestartMode(groupRes.data.activation_mode);

    const memberRows = membersRes.data || [];
    const memberIds = memberRows.map((m) => m.user_id);
    let profileMap = {};
    if (memberIds.length > 0) {
      const [{ data: profilesData }, { data: presenceData }] = await Promise.all([
        supabase.from("profiles").select("user_id, username, display_name, bio, avatar_url, character_style, premium_tier, ever_been_premium").in("user_id", memberIds),
        supabase.from("user_presence").select("*").in("user_id", memberIds),
      ]);
      (profilesData || []).forEach((p) => {
        profileMap[p.user_id] = p;
      });
      const pMap = {};
      (presenceData || []).forEach((p) => {
        pMap[p.user_id] = p;
      });
      setPresenceByUserId(pMap);
    }
    setMembers(memberRows.map((m) => ({ ...m, profile: profileMap[m.user_id] })));

    if (leaderboardRes.error) console.error("Failed to load group leaderboard:", leaderboardRes.error);
    setLeaderboard(leaderboardRes.data || []);

    if (lifetimeRes.error) console.error("Failed to load lifetime contributions:", lifetimeRes.error);
    const lifetimeMap = {};
    (lifetimeRes.data || []).forEach((r) => {
      lifetimeMap[r.user_id] = r.focus_seconds || 0;
    });
    setLifetimeByUserId(lifetimeMap);

    // Level must reflect true overall lifetime focus (matching each
    // person's own Growth tab), not time contributed to just this group.
    supabase.rpc("get_group_members_true_totals", { p_group_id: groupId }).then(({ data, error: trueErr }) => {
      if (trueErr) {
        console.error("Failed to load true lifetime totals:", trueErr);
        return;
      }
      const trueMap = {};
      (data || []).forEach((r) => {
        trueMap[r.user_id] = r.total_minutes || 0;
      });
      setTrueTotalMinutesByUserId(trueMap);
    });

    setLoading(false);

    // Fire-and-forget: goal progress, streak check, and recent activity.
    // These are separate calls so a failure in one doesn't block the main
    // dashboard from rendering.
    supabase
      .rpc("get_group_goal_progress", { p_group_id: groupId })
      .then(({ data }) => setGoalProgress(data && data[0] ? data[0] : null));
    supabase.rpc("check_group_streak", { p_group_id: groupId }).then(() => {
      supabase
        .from("groups")
        .select("streak_count, streak_longest")
        .eq("id", groupId)
        .single()
        .then(({ data }) => {
          if (data) setGroup((g) => (g ? { ...g, ...data } : g));
        });
    });
    supabase.rpc("check_and_award_group_goal", { p_group_id: groupId }).then(({ data: justCompleted, error: goalCheckErr }) => {
      if (goalCheckErr) console.error("check_and_award_group_goal failed:", goalCheckErr);
      if (justCompleted) loadGroup(); // goal just completed + XP awarded — refresh everything
    });
    supabase.rpc("check_group_deadline_expiry", { p_group_id: groupId }).then(({ data: justExpired, error: deadlineCheckErr }) => {
      if (deadlineCheckErr) console.error("check_group_deadline_expiry failed:", deadlineCheckErr);
      if (justExpired) loadGroup(); // deadline passed, partial XP awarded, group now locked — refresh
    });
    supabase.rpc("activate_scheduled_group", { p_group_id: groupId }).then(({ data: justActivated, error: scheduleCheckErr }) => {
      if (scheduleCheckErr) console.error("activate_scheduled_group failed:", scheduleCheckErr);
      if (justActivated) loadGroup(); // scheduled activation time arrived — refresh so it shows as live
    });
    supabase.rpc("remove_inactive_group_members", { p_group_id: groupId }).then(({ data: removed, error: inactivityErr }) => {
      if (inactivityErr) console.error("remove_inactive_group_members failed:", inactivityErr);
      if (removed && removed.length > 0) {
        const names = removed.map((r) => r.removed_name).join(", ");
        setAutoCollectMessage(`${names} ${removed.length === 1 ? "was" : "were"} removed for 30+ days of inactivity — any unclaimed XP was automatically added to their account.`);
        loadGroup();
      }
    });
    supabase
      .from("group_activity")
      .select("*")
      .eq("group_id", groupId)
      .order("created_at", { ascending: false })
      .limit(15)
      .then(({ data }) => setActivity(data || []));
  }

  useEffect(() => {
    const channel = supabase
      .channel(`group-${groupId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "group_members", filter: `group_id=eq.${groupId}` }, () => loadGroup())
      .on("postgres_changes", { event: "*", schema: "public", table: "user_presence" }, (payload) => {
        const row = payload.new;
        if (row) setPresenceByUserId((m) => ({ ...m, [row.user_id]: row }));
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  const myRole = members.find((m) => m.user_id === myUserId)?.role;
  const isAdmin = myRole === "owner" || myRole === "admin";
  const isOwner = myRole === "owner";
  // Matches the backend RLS policy exactly: for public (official) groups,
  // only the hardcoded admin account can delete — regardless of
  // membership role, since official groups aren't necessarily something
  // the admin is even a member of. Private groups still just check
  // ownership as before.
  const canDeleteGroup = group?.is_public ? myUserId === "97f98bca-98b3-47f6-b2d1-0ac78bc2674f" : myUserId === group?.owner_id;

  const openInvite = async () => {
    setShowInvite(true);
    const { data: friendRows } = await supabase
      .from("friend_requests")
      .select("*")
      .eq("status", "accepted")
      .or(`sender_id.eq.${myUserId},receiver_id.eq.${myUserId}`);
    const friendIds = (friendRows || []).map((r) => (r.sender_id === myUserId ? r.receiver_id : r.sender_id));
    const memberIds = new Set(members.map((m) => m.user_id));
    const notMemberIds = friendIds.filter((id) => !memberIds.has(id));
    if (notMemberIds.length === 0) {
      setFriendsForInvite([]);
      return;
    }
    const { data: profilesData } = await supabase.from("profiles").select("user_id, username, display_name, bio, avatar_url, character_style, premium_tier, ever_been_premium").in("user_id", notMemberIds);
    setFriendsForInvite(profilesData || []);
  };

  const inviteFriend = async (friendProfile) => {
    const { error } = await supabase.from("group_invitations").insert({
      group_id: groupId,
      inviter_id: myUserId,
      invitee_id: friendProfile.user_id,
    });
    if (error) {
      console.error("Failed to invite:", error);
      return;
    }
    setFriendsForInvite((f) => f.filter((p) => p.user_id !== friendProfile.user_id));
  };

  const removeMember = async (userId) => {
    const { error } = await supabase.from("group_members").delete().eq("group_id", groupId).eq("user_id", userId);
    if (error) console.error("Failed to remove member:", error);
    else loadGroup();
  };

  const promoteToAdmin = async (userId) => {
    const { error } = await supabase.from("group_members").update({ role: "admin" }).eq("group_id", groupId).eq("user_id", userId);
    if (error) console.error("Failed to promote:", error);
    else loadGroup();
  };

  const demoteToMember = async (userId) => {
    const { error } = await supabase.from("group_members").update({ role: "member" }).eq("group_id", groupId).eq("user_id", userId);
    if (error) console.error("Failed to demote:", error);
    else loadGroup();
  };

  const saveGoalHours = async () => {
    const amount = parseFloat(goalHoursInput);
    if (!amount || amount <= 0) return;
    setGoalSaving(true);
    setTargetEditError("");
    const { error } = await supabase.rpc("update_group_target", {
      p_group_id: groupId,
      p_target_minutes: Math.round(amount * (goalUnit === "minutes" ? 1 : 60)),
    });
    setGoalSaving(false);
    if (error) {
      // The RPC's error message already says exactly how many hours are
      // left before the next change is allowed — just show it as-is.
      setTargetEditError(error.message || "Couldn't update the target — please try again.");
      setTargetEditErrorVisible(true);
      setTimeout(() => setTargetEditErrorVisible(false), 7000); // start fading out
      setTimeout(() => setTargetEditError(""), 7700); // fully gone once the fade finishes
      return;
    }
    setEditingGoalHours(false);
    loadGroup();
  };

  const restartGroupGoal = async () => {
    const amount = parseFloat(restartHoursInput);
    if (!amount || amount <= 0) return;
    setRestarting(true);
    const { error } = await supabase
      .from("groups")
      .update({
        goal_target_minutes: Math.round(amount * (restartUnit === "minutes" ? 1 : 60)),
        goal_deadline: restartDeadline ? restartDeadline.toISOString() : null,
        goal_started_at: new Date().toISOString(),
        goal_locked: false,
        activation_mode: restartMode === "loop" ? "loop" : "manual",
        pending_activation: false,
      })
      .eq("id", groupId);
    setRestarting(false);
    if (error) {
      console.error("Failed to restart group goal:", error);
      return;
    }
    setRestartHoursInput("");
    setRestartDeadline(null);
    loadGroup();
  };

  const changeActivationMode = async (mode) => {
    setModeChanging(true);
    const { error } = await supabase.rpc("update_group_activation_mode", { p_group_id: groupId, p_mode: mode });
    setModeChanging(false);
    if (error) {
      console.error("Failed to change activation mode:", error);
      return;
    }
    setRestartMode(mode);
    loadGroup();
  };

  const scheduleActivation = async () => {
    if (!scheduleActivationAt) return;
    const amount = parseFloat(scheduleTargetInput);
    if (!amount || amount <= 0) return;
    setScheduling(true);
    const { error } = await supabase.rpc("schedule_group_activation", {
      p_group_id: groupId,
      p_activation_at: scheduleActivationAt.toISOString(),
      p_target_minutes: Math.round(amount * (scheduleTargetUnit === "minutes" ? 1 : 60)),
    });
    setScheduling(false);
    if (error) {
      console.error("Failed to schedule activation:", error);
      return;
    }
    setScheduleActivationAt(null);
    setScheduleTargetInput("");
    loadGroup();
  };

  const claimCycleXP = async () => {
    setClaiming(true);
    const { data: xpAmount, error } = await supabase.rpc("claim_group_cycle_xp", { p_group_id: groupId });
    setClaiming(false);
    if (error) {
      console.error("Failed to claim group XP:", error);
      return;
    }
    if (xpAmount > 0) {
      setJustClaimedXP(xpAmount);
      setTimeout(() => setJustClaimedXP(null), 1200);
      setAutoCollectMessage(`Claimed +${xpAmount} XP`);
      setAutoCollectMessageKey((k) => k + 1);
      // Reflect the claim locally right away so the button updates instantly.
      setGroup((g) =>
        g
          ? {
              ...g,
              last_cycle_summary: (g.last_cycle_summary || []).map((m) => (m.user_id === myUserId ? { ...m, claimed: true } : m)),
            }
          : g
      );
      // The claim just changed this person's real XP total — refresh level
      // data immediately instead of showing a stale level until next load.
      supabase.rpc("get_group_members_true_totals", { p_group_id: groupId }).then(({ data }) => {
        if (!data) return;
        const trueMap = {};
        data.forEach((r) => {
          trueMap[r.user_id] = r.total_minutes || 0;
        });
        setTrueTotalMinutesByUserId(trueMap);
      });
    }
  };

  const leaveGroup = async () => {
    // Check for unclaimed group XP first — the database trigger auto-collects
    // it the moment the group_members row is deleted, but the person should
    // actually be told that happened and how much.
    const { data: unclaimedXP } = await supabase.rpc("get_my_unclaimed_group_xp", { p_group_id: groupId });

    if (isOwner && members.length > 1) {
      const nextOwner = members.filter((m) => m.user_id !== myUserId).sort((a, b) => new Date(a.joined_at) - new Date(b.joined_at))[0];
      if (nextOwner) {
        await supabase.from("group_members").update({ role: "owner" }).eq("group_id", groupId).eq("user_id", nextOwner.user_id);
      }
    }
    const { error } = await supabase.from("group_members").delete().eq("group_id", groupId).eq("user_id", myUserId);
    if (error) {
      console.error("Failed to leave group:", error);
      return;
    }
    if (unclaimedXP > 0) {
      setAutoCollectMessage(`You had ${unclaimedXP.toLocaleString()} unclaimed group XP — automatically added to your account.`);
      setTimeout(onBack, 1600);
    } else {
      onBack();
    }
  };

  const deleteGroup = async () => {
    // The owner doesn't get their own unclaimed XP silently swept up by
    // deleting — they have to hit Claim themselves first, same as anyone
    // else would. (Other members' unclaimed XP is still safely auto-collected
    // if the owner goes ahead and deletes — see the DB trigger — since they
    // have no control over that decision, but the owner's own share requires
    // the same manual claim everyone else uses.)
    const { data: unclaimedXP } = await supabase.rpc("get_my_unclaimed_group_xp", { p_group_id: groupId });
    if (unclaimedXP > 0) {
      setDeleteBlockedXP(unclaimedXP);
      return;
    }
    const { error } = await supabase.from("groups").delete().eq("id", groupId);
    if (error) {
      console.error("Failed to delete group:", error);
      return;
    }
    onBack();
  };

  if (inspectingMember) {
    return <InspectFriendPage profile={inspectingMember} onBack={() => setInspectingMember(null)} backLabel={`Back to ${group?.name || "Group"}`} />;
  }

  if (loading || !group) {
    return (
      <div className="py-16 flex flex-col items-center justify-center gap-3">
        <Loader2 size={22} className="text-[var(--accent-text)] animate-spin" />
        <p className="text-sm text-[var(--text-muted)]">Loading group...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <button onClick={onBack} className="text-sm text-[var(--accent-text)] hover:text-[var(--accent-text)] flex items-center gap-1">
        <ChevronLeft size={15} /> Back to Groups
      </button>

      <GlowCard glow>
        <div className="flex items-start gap-4">
          <div className="h-14 w-14 rounded-2xl bg-[rgb(var(--accent-rgb)/0.2)] flex items-center justify-center text-3xl shrink-0">{group.icon}</div>
          <div className="flex-1 min-w-0">
            <p className="text-lg font-semibold text-[var(--text-primary)] truncate">{group.name}</p>
            <p className="text-sm text-[var(--text-secondary)] mt-1 break-words">{group.description || "No description yet."}</p>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <p className="text-xs text-[var(--text-muted)]">
                {members.length} / {group.max_members} members
              </p>
              {group.category && <span className="text-[10px] bg-[var(--surface-2)] text-[var(--text-muted)] px-2 py-0.5 rounded-full">{group.category}</span>}
              <span className="text-[10px] bg-[var(--surface-2)] text-[var(--text-muted)] px-2 py-0.5 rounded-full">{group.is_public ? "Public" : "Private"}</span>
            </div>
          </div>
          {group.code && (
            <div className="shrink-0 bg-[var(--surface-2)] rounded-xl px-3 py-2 text-center">
              <p className="text-[9px] text-[var(--text-muted)] uppercase tracking-wide mb-0.5">Code</p>
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-mono font-bold text-[var(--text-primary)]">{codeRevealed ? group.code : "• • • • •"}</p>
                <button onClick={() => setCodeRevealed((v) => !v)} className="text-[var(--text-muted)] hover:text-[var(--text-secondary-strong)] transition-colors" title={codeRevealed ? "Hide code" : "Show code"}>
                  {codeRevealed ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
                {codeRevealed && (
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(group.code);
                      setCodeCopied(true);
                      setTimeout(() => setCodeCopied(false), 1500);
                    }}
                    className="text-[var(--accent-text)] hover:brightness-110 transition-all"
                    title="Copy code"
                  >
                    {codeCopied ? <Check size={13} /> : <Copy size={13} />}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </GlowCard>

      <div className="flex items-center justify-center gap-1.5 text-xs text-[var(--text-muted)]">
        <Trophy size={12} className="text-amber-400" />
        Total XP earned from this group: <span className="font-semibold text-[var(--text-secondary-strong)]">{myGroupLifetimeXP.toLocaleString()}</span>
      </div>

      {myUnclaimedXP > 0 && (
        <GlowCard glow>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-[var(--text-primary)]">You have unclaimed group XP</p>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                From a round that already completed — Loop mode restarts instantly, so it's easy to miss. It'll keep adding up if you don't claim it, never gets lost.
              </p>
            </div>
            <button
              onClick={async () => {
                const claimed = myUnclaimedXP;
                await claimCycleXP();
                setMyUnclaimedXP(0);
                setMyGroupLifetimeXP((x) => x + claimed);
              }}
              disabled={claiming}
              className="shrink-0 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors"
            >
              {claiming ? "..." : justClaimedXP ? `+${justClaimedXP} XP!` : `Claim +${myUnclaimedXP} XP`}
            </button>
          </div>
        </GlowCard>
      )}

      {group.pending_activation && group.scheduled_activation_at && (
        <GlowCard glow>
          <p className="text-sm font-medium text-[var(--text-primary)] mb-1 flex items-center gap-1.5">
            <Calendar size={14} className="text-[var(--accent-text)]" /> Scheduled to Activate
          </p>
          <p className="text-xs text-[var(--text-secondary)]">
            This group will activate on{" "}
            <span className="text-[var(--text-primary)] font-medium">
              {new Date(group.scheduled_activation_at).toLocaleString([], { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
            </span>{" "}
            with a target of{" "}
            <span className="text-[var(--accent-text)] font-medium">{formatGoalAmount(group.scheduled_target_minutes)}</span>.
          </p>
        </GlowCard>
      )}

      {group.goal_locked ? (
        <GlowCard glow>
          <p className="text-sm font-medium text-[var(--text-primary)] mb-1 flex items-center gap-1.5">
            <Lock size={14} className="text-[var(--text-muted)]" /> {group.last_cycle_reason === "completed" ? `Round ${(group.round_number || 2) - 1} Completed! 🎯` : `Round ${(group.round_number || 2) - 1} Ended`}
          </p>
          <p className="text-xs text-[var(--text-muted)] mb-4">
            {group.last_cycle_reason === "completed"
              ? "The target was reached and XP was awarded to everyone who contributed."
              : "The deadline passed before the target was reached. XP was still awarded for real contributions."}{" "}
            {isOwner
              ? "Choose how the next round starts below."
              : group.activation_mode === "schedule"
              ? "The owner hasn't scheduled the next round yet."
              : "The owner hasn't started the next round yet."}
          </p>

          {group.last_cycle_summary && group.last_cycle_summary.length > 0 && (
            <div className="bg-[var(--surface-2)]/40 rounded-xl p-3 mb-4 space-y-2">
              <p className="text-xs text-[var(--text-muted)] mb-1">
                Final result: {formatGoalAmount(group.last_cycle_total_minutes)} / {formatGoalAmount(group.last_cycle_target_minutes)}
              </p>
              {group.last_cycle_ended_at && (
                <p className="text-[10px] text-[var(--text-faint)] -mt-1 mb-2">
                  Ended {new Date(group.last_cycle_ended_at).toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
                </p>
              )}
              {[...group.last_cycle_summary]
                .sort((a, b) => b.xp - a.xp)
                .map((m) => (
                  <div key={m.user_id} className="relative flex items-center justify-between text-sm">
                    <p className="text-[var(--text-secondary-strong)] truncate">{m.name}</p>
                    <div className="flex items-center gap-3 shrink-0">
                      <p className="text-xs text-[var(--text-muted)]">{formatDuration((m.minutes || 0) * 60)}</p>
                      {m.user_id === myUserId && m.xp > 0 ? (
                        m.claimed ? (
                          <p className="text-xs font-semibold text-[var(--text-faint)]">✓ Claimed</p>
                        ) : (
                          <button
                            onClick={claimCycleXP}
                            disabled={claiming}
                            className="text-xs font-semibold bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white px-2.5 py-1 rounded-lg transition-colors"
                          >
                            {claiming ? "..." : `Claim +${m.xp} XP`}
                          </button>
                        )
                      ) : (
                        <p className="text-xs font-semibold text-[var(--accent-text)]">{m.xp} XP</p>
                      )}
                    </div>
                    {justClaimedXP && m.user_id === myUserId && (
                      <span
                        key={justClaimedXP + "-" + Date.now()}
                        className="absolute top-0 right-0 text-sm font-bold text-[var(--accent-text)] pointer-events-none"
                        style={{ animation: "floatUpFade 1.2s ease-out forwards" }}
                      >
                        +{justClaimedXP} XP
                      </span>
                    )}
                  </div>
                ))}
            </div>
          )}

          <style>{`
            @keyframes floatUpFade {
              0% { transform: translateY(0); opacity: 1; }
              100% { transform: translateY(-24px); opacity: 0; }
            }
          `}</style>

          {isOwner ? (
            <div className="space-y-3">
              <div className="flex rounded-xl overflow-hidden border border-[var(--border)]">
                {[
                  ["manual", "Manual"],
                  ["loop", "Loop"],
                  ["schedule", "Schedule"],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setRestartMode(key)}
                    className={"flex-1 text-xs font-medium px-3 py-2 transition-colors " + (restartMode === key ? "bg-[var(--accent)] text-white" : "bg-[var(--input-bg)] text-[var(--text-muted)] hover:text-[var(--text-secondary-strong)]")}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {restartMode === "loop" && (
                <p className="text-[11px] text-[var(--text-muted)]">
                  The next round starts immediately and repeats automatically after every completion, no clicking required — always with the target you set below.
                </p>
              )}

              {restartMode !== "schedule" ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      value={restartHoursInput}
                      onChange={(e) => setRestartHoursInput(e.target.value)}
                      placeholder={restartUnit === "minutes" ? "New target (minutes)" : "New target (hours)"}
                      className="flex-1 bg-[var(--input-bg)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)]"
                    />
                    <div className="flex rounded-xl overflow-hidden border border-[var(--border)] shrink-0">
                      <button
                        type="button"
                        onClick={() => setRestartUnit("hours")}
                        className={"text-xs font-medium px-3 py-2.5 transition-colors " + (restartUnit === "hours" ? "bg-[var(--accent)] text-white" : "bg-[var(--input-bg)] text-[var(--text-muted)]")}
                      >
                        Hrs
                      </button>
                      <button
                        type="button"
                        onClick={() => setRestartUnit("minutes")}
                        className={"text-xs font-medium px-3 py-2.5 transition-colors " + (restartUnit === "minutes" ? "bg-[var(--accent)] text-white" : "bg-[var(--input-bg)] text-[var(--text-muted)]")}
                      >
                        Min
                      </button>
                    </div>
                  </div>
                  {restartMode === "manual" && <DateTimePicker value={restartDeadline} onChange={setRestartDeadline} />}
                  <button
                    onClick={restartGroupGoal}
                    disabled={restarting || !restartHoursInput}
                    className="w-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 text-white text-sm font-medium py-2.5 rounded-xl transition-colors"
                  >
                    {restarting ? "Starting..." : restartMode === "loop" ? "Start Loop" : "Start New Round"}
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      value={scheduleTargetInput}
                      onChange={(e) => setScheduleTargetInput(e.target.value)}
                      placeholder={scheduleTargetUnit === "minutes" ? "Target (minutes)" : "Target (hours)"}
                      className="flex-1 bg-[var(--input-bg)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)]"
                    />
                    <div className="flex rounded-xl overflow-hidden border border-[var(--border)] shrink-0">
                      <button
                        type="button"
                        onClick={() => setScheduleTargetUnit("hours")}
                        className={"text-xs font-medium px-3 py-2.5 transition-colors " + (scheduleTargetUnit === "hours" ? "bg-[var(--accent)] text-white" : "bg-[var(--input-bg)] text-[var(--text-muted)]")}
                      >
                        Hrs
                      </button>
                      <button
                        type="button"
                        onClick={() => setScheduleTargetUnit("minutes")}
                        className={"text-xs font-medium px-3 py-2.5 transition-colors " + (scheduleTargetUnit === "minutes" ? "bg-[var(--accent)] text-white" : "bg-[var(--input-bg)] text-[var(--text-muted)]")}
                      >
                        Min
                      </button>
                    </div>
                  </div>
                  <DateTimePicker value={scheduleActivationAt} onChange={setScheduleActivationAt} />
                  <p className="text-[11px] text-[var(--text-muted)]">
                    Everyone in the group will see exactly when this activates and with what target — nothing counts toward it until then.
                  </p>
                  <button
                    onClick={scheduleActivation}
                    disabled={scheduling || !scheduleActivationAt || !scheduleTargetInput}
                    className="w-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 text-white text-sm font-medium py-2.5 rounded-xl transition-colors"
                  >
                    {scheduling ? "Scheduling..." : "Schedule Activation"}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => setConfirmLeave(true)}
              className="w-full bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-secondary-strong)] text-sm font-medium py-2.5 rounded-xl transition-colors"
            >
              Leave Group
            </button>
          )}
        </GlowCard>
      ) : (
        group.goal_type === "total_hours" && goalProgress && (
        <GlowCard glow>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-[var(--text-primary)] flex items-center gap-1.5">
              <span>🔥</span> Group Goal
              <span
                className={
                  "text-[10px] font-semibold px-2 py-0.5 rounded-full transition-all duration-500 " +
                  (roundJustChanged ? "bg-[var(--accent)] text-white scale-110" : "bg-[var(--surface-2)] text-[var(--text-muted)]")
                }
              >
                Round {group.round_number || 1}
              </span>
            </p>
            {isAdmin && !editingGoalHours && (
              <button
                onClick={() => {
                  const currentMin = group.goal_target_minutes || 0;
                  if (currentMin < 60) {
                    setGoalUnit("minutes");
                    setGoalHoursInput(String(currentMin));
                  } else {
                    setGoalUnit("hours");
                    setGoalHoursInput(String(Math.round(currentMin / 60)));
                  }
                  setTargetEditError("");
                  setEditingGoalHours(true);
                }}
                className="text-xs text-[var(--accent-text)] hover:brightness-110"
              >
                Edit target
              </button>
            )}
          </div>

          {editingGoalHours ? (
            <div className="flex items-center gap-2 mb-3">
              <input
                type="number"
                min="1"
                value={goalHoursInput}
                onChange={(e) => setGoalHoursInput(e.target.value)}
                autoFocus
                className="w-20 bg-[var(--input-bg)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl px-3 py-2 text-sm text-[var(--text-primary)] outline-none"
              />
              <div className="flex rounded-lg overflow-hidden border border-[var(--border)] shrink-0">
                <button
                  type="button"
                  onClick={() => setGoalUnit("hours")}
                  className={"text-xs font-medium px-2 py-2 transition-colors " + (goalUnit === "hours" ? "bg-[var(--accent)] text-white" : "bg-[var(--input-bg)] text-[var(--text-muted)]")}
                >
                  Hrs
                </button>
                <button
                  type="button"
                  onClick={() => setGoalUnit("minutes")}
                  className={"text-xs font-medium px-2 py-2 transition-colors " + (goalUnit === "minutes" ? "bg-[var(--accent)] text-white" : "bg-[var(--input-bg)] text-[var(--text-muted)]")}
                >
                  Min
                </button>
              </div>
              <button
                onClick={saveGoalHours}
                disabled={goalSaving || !goalHoursInput}
                className="ml-auto text-xs bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 text-white font-medium px-3 py-2 rounded-lg transition-colors"
              >
                {goalSaving ? "..." : "Save"}
              </button>
              <button onClick={() => setEditingGoalHours(false)} className="text-xs bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-secondary-strong)] font-medium px-3 py-2 rounded-lg transition-colors">
                Cancel
              </button>
            </div>
          ) : (
            <p className="text-2xl font-bold text-[var(--text-primary)]">
              {formatGoalAmount(goalProgress.total_minutes)} / {formatGoalAmount(group.goal_target_minutes)}
            </p>
          )}

          {targetWarningShown && (
            <p className={"text-[11px] text-amber-400/90 -mt-1 mb-3 transition-opacity duration-700 " + (targetWarningVisible ? "opacity-100" : "opacity-0")}>
              ⚠ The target can only be changed once every 24 hours.
              {group.target_last_changed_at && new Date(group.target_last_changed_at) > new Date(Date.now() - 24 * 60 * 60 * 1000) && (
                <> Last changed {formatSessionTime(group.target_last_changed_at)}.</>
              )}
            </p>
          )}
          {targetEditError && (
            <p className={"text-[11px] text-red-400 -mt-1 mb-3 transition-opacity duration-700 " + (targetEditErrorVisible ? "opacity-100" : "opacity-0")}>
              {targetEditError}
            </p>
          )}

          <div className="h-2.5 rounded-full bg-[var(--surface-2)] overflow-hidden my-3">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-hover)] transition-all duration-700"
              style={{ width: `${Math.min(100, Math.round(((goalProgress.total_minutes || 0) / group.goal_target_minutes) * 100))}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-sm text-[var(--text-secondary)]">
            <p>{Math.min(100, Math.round(((goalProgress.total_minutes || 0) / group.goal_target_minutes) * 100))}% complete</p>
            <p>{formatGoalAmount(Math.max(0, group.goal_target_minutes - (goalProgress.total_minutes || 0)))} remaining</p>
          </div>
          {group.goal_deadline && (
            <p className="text-xs text-[var(--text-muted)] mt-2">
              Deadline:{" "}
              <span className="text-[var(--text-secondary-strong)]">
                {new Date(group.goal_deadline).toLocaleString([], { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
              </span>
            </p>
          )}
          <div className="mt-4 pt-4 border-t border-[var(--border-subtle)]">
            <p className="text-sm text-[var(--text-secondary-strong)]">
              Your contribution: <span className="font-semibold text-[var(--text-primary)]">{formatDuration(((goalProgress.member_minutes || {})[myUserId] || 0) * 60)}</span>
            </p>
          </div>
          <p className="text-[10px] text-[var(--text-faint)] mt-3">
            When the group hits this target, everyone who contributed earns 50 XP per focused minute they put in (the group owner gets an extra 30% bonus) — worth less than solo focus XP since it's a bonus on top of what those same minutes already earned you. Unclaimed XP keeps adding up across rounds until you claim it, and is never lost if you leave or the group is deleted.{" "}
            {group.activation_mode === "loop"
              ? "The next round then starts automatically with the same target."
              : group.activation_mode === "schedule"
              ? "The group then locks until the owner schedules the next round."
              : "The group then locks until the owner starts a new round."}
          </p>

          {isOwner && (
            <div className="mt-4 pt-4 border-t border-[var(--border-subtle)]">
              <p className="text-xs text-[var(--text-muted)] mb-2">Activation mode</p>
              <div className="flex rounded-xl overflow-hidden border border-[var(--border)]">
                {[
                  ["manual", "Manual"],
                  ["loop", "Loop"],
                  ["schedule", "Schedule"],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    disabled={modeChanging}
                    onClick={() => changeActivationMode(key)}
                    className={"flex-1 text-xs font-medium px-3 py-2 transition-colors disabled:opacity-50 " + (group.activation_mode === key ? "bg-[var(--accent)] text-white" : "bg-[var(--input-bg)] text-[var(--text-muted)] hover:text-[var(--text-secondary-strong)]")}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-[var(--text-faint)] mt-1.5">
                {group.activation_mode === "loop"
                  ? "Rounds restart automatically forever, same target each time."
                  : group.activation_mode === "schedule"
                  ? "You'll pick a future date, time, and target for the next round once this one ends."
                  : "You'll need to manually start each new round after this one ends."}
              </p>
            </div>
          )}
        </GlowCard>
        )
      )}

      {(group.goal_type === "daily_hours" || group.goal_type === "weekly_hours" || group.streak_count > 0) && (
        <div className="grid sm:grid-cols-2 gap-3">
          {(group.goal_type === "daily_hours" || group.goal_type === "weekly_hours") && goalProgress && (
            <GlowCard>
              <p className="text-xs text-[var(--text-muted)] mb-1">{group.goal_type === "daily_hours" ? "Today's goal" : "This week's goal"}</p>
              <p className="text-sm font-semibold text-[var(--text-primary)] mb-2">
                {formatDuration((goalProgress.total_minutes || 0) * 60)} / {formatGoalAmount(group.goal_target_minutes)}
              </p>
              <div className="h-2 rounded-full bg-[var(--surface-2)] overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-hover)] transition-all duration-700"
                  style={{ width: `${Math.min(100, Math.round(((goalProgress.total_minutes || 0) / group.goal_target_minutes) * 100))}%` }}
                />
              </div>
            </GlowCard>
          )}
          {group.streak_count > 0 && (
            <GlowCard className="flex items-center gap-3">
              <span className="text-3xl">🔥</span>
              <div>
                <p className="text-lg font-bold text-[var(--text-primary)]">{group.streak_count} day streak</p>
                <p className="text-xs text-[var(--text-muted)]">Longest: {group.streak_longest} days</p>
              </div>
            </GlowCard>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {isAdmin && (
          <button onClick={openInvite} className="flex items-center gap-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors">
            <Plus size={15} /> Invite Friends
          </button>
        )}
        <button
          onClick={() => setConfirmLeave(true)}
          className="text-sm font-medium text-[var(--text-secondary-strong)] border border-[var(--border)] hover:border-red-400/50 hover:text-red-400 hover:bg-red-500/10 px-4 py-2 rounded-xl transition-colors"
        >
          Leave Group
        </button>
        {canDeleteGroup && (
          <button
            onClick={() => setConfirmDelete(true)}
            className="text-sm font-medium text-red-400 border border-red-500/30 hover:bg-red-500/10 px-4 py-2 rounded-xl transition-colors"
          >
            Delete Group
          </button>
        )}
      </div>

      {showInvite && (
        <GlowCard>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-[var(--text-primary)]">Invite Friends</p>
            <button onClick={() => setShowInvite(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
              <X size={16} />
            </button>
          </div>
          {friendsForInvite.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)]">All your friends are already in this group, or you don't have any friends yet.</p>
          ) : (
            <div className="space-y-2">
              {friendsForInvite.map((p) => (
                <div key={p.user_id} className="flex items-center gap-3 bg-[var(--surface-2)]/40 rounded-xl p-2.5">
                  <PersonAvatar name={p.display_name || p.username} size={32} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[var(--text-primary)] truncate">{p.display_name || p.username}</p>
                  </div>
                  <button onClick={() => inviteFriend(p)} className="text-xs bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-medium px-3 py-1.5 rounded-lg transition-colors">
                    Invite
                  </button>
                </div>
              ))}
            </div>
          )}
        </GlowCard>
      )}

      <GlowCard>
        <p className="text-sm font-medium text-[var(--text-primary)] mb-3">Group Leaderboard</p>
        <div className="flex items-center gap-2 mb-3">
          {[
            ["week", "Week"],
            ["month", "Month"],
            ["lifetime", "Lifetime"],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setPeriod(key)}
              className={
                "text-xs font-medium px-3 py-1.5 rounded-lg transition-colors " +
                (period === key ? "bg-[rgb(var(--accent-rgb)/0.2)] text-[var(--accent-text)] border border-[rgb(var(--accent-rgb)/0.3)]" : "text-[var(--text-muted)] hover:text-[var(--text-secondary-strong)]")
              }
            >
              {label}
            </button>
          ))}
        </div>
        <div className="space-y-1">
          {leaderboard.map((r) => {
            const isMe = r.user_id === myUserId;
            const medal = r.rank === 1 ? "🥇" : r.rank === 2 ? "🥈" : r.rank === 3 ? "🥉" : null;
            // Level always reflects true overall lifetime focus (matching
            // each person's own Growth tab), regardless of the leaderboard's
            // selected period or how much they've contributed to this
            // specific group — only the displayed time value should change.
            const { current } = computeGrowth(trueTotalMinutesByUserId[r.user_id] || 0);
            const eff = computeEffectiveStatus(presenceByUserId[r.user_id], nowTick);
            return (
              <div key={r.user_id} className={"flex items-center gap-3 rounded-xl px-3 py-2.5 " + (isMe ? "bg-[rgb(var(--accent-rgb)/0.1)] border border-[rgb(var(--accent-rgb)/0.3)]" : "")}>
                <span className="text-sm text-[var(--text-muted)] w-7 text-center shrink-0">{medal || r.rank}</span>
                <PersonAvatar
                  name={r.display_name || r.username}
                  size={32}
                  isActive={eff.status === "focusing" || eff.status === "break" || eff.status === "stopwatch"}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[var(--text-primary)] truncate">
                    {r.display_name || r.username} {isMe && <span className="text-xs text-[var(--accent-text)]">(you)</span>}
                    {r.user_id === "97f98bca-98b3-47f6-b2d1-0ac78bc2674f" && (
                      <span className="text-[10px] font-bold uppercase tracking-wide bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded ml-1">Admin</span>
                    )}
                  </p>
                  <p className="text-xs" style={{ color: current.color }}>
                    Level {current.level}
                  </p>
                </div>
                <p className="text-sm font-semibold text-[var(--text-primary)] shrink-0">{formatDuration(r.focus_seconds || 0)}</p>
              </div>
            );
          })}
        </div>
      </GlowCard>

      {activity.length > 0 && (
        <GlowCard>
          <p className="text-sm font-medium text-[var(--text-primary)] mb-3">Recent Activity</p>
          <div className="space-y-2.5">
            {activity.map((a) => (
              <div key={a.id} className="flex items-start gap-2">
                <span className="text-sm mt-0.5">{a.type === "streak_milestone" ? "🔥" : a.type === "goal_completed" ? "🎯" : a.type === "joined" ? "👋" : a.type === "left" ? "👋" : "•"}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-[var(--text-secondary-strong)]">{a.message}</p>
                  <p className="text-[10px] text-[var(--text-faint)] mt-0.5">{new Date(a.created_at).toLocaleDateString()}</p>
                </div>
              </div>
            ))}
          </div>
        </GlowCard>
      )}

      <GlowCard>
        <p className="text-sm font-medium text-[var(--text-primary)] mb-3">Members ({members.length})</p>
        <div className="space-y-2">
          {members.map((m) => {
            const p = m.profile;
            if (!p) return null;
            const eff = computeEffectiveStatus(presenceByUserId[m.user_id], nowTick);
            return (
              <div key={m.user_id} className="flex items-center gap-3 bg-[var(--surface-2)]/40 rounded-xl p-2.5">
                <button
                  onClick={() => (m.user_id === myUserId ? (goTo ? goTo("profile") : null) : setInspectingMember(p))}
                  className="flex items-center gap-3 flex-1 min-w-0 text-left hover:opacity-80 transition-opacity"
                >
                  <PersonAvatar
                    name={p.display_name || p.username}
                    size={36}
                    isActive={eff.status === "focusing" || eff.status === "break" || eff.status === "stopwatch"}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[var(--text-primary)] truncate">
                      {p.display_name || p.username}
                      {m.role !== "member" && <span className="text-[10px] text-[var(--accent-text)] uppercase tracking-wide ml-1.5">{m.role}</span>}
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">{eff.label}</p>
                  </div>
                </button>
                <p className="text-xs text-[var(--text-secondary-strong)] font-medium shrink-0">{formatDuration(lifetimeByUserId[m.user_id] || 0)}</p>
                {isOwner && m.user_id !== myUserId && (
                  <div className="flex gap-1.5 shrink-0">
                    {m.role === "member" ? (
                      <button
                        onClick={() => promoteToAdmin(m.user_id)}
                        className="text-xs font-medium text-[var(--accent-text)] border border-[rgb(var(--accent-rgb)/0.4)] hover:bg-[rgb(var(--accent-rgb)/0.12)] transition-colors px-2.5 py-1 rounded-lg"
                      >
                        Make Admin
                      </button>
                    ) : (
                      <button
                        onClick={() => setConfirmMemberAction({ type: "demote", userId: m.user_id, name: p.display_name || p.username })}
                        className="text-xs font-medium text-[var(--text-secondary-strong)] border border-[var(--border)] hover:bg-[var(--surface-2)] transition-colors px-2.5 py-1 rounded-lg"
                      >
                        Remove Admin
                      </button>
                    )}
                    <button
                      onClick={() => setConfirmMemberAction({ type: "remove", userId: m.user_id, name: p.display_name || p.username })}
                      className="text-xs font-medium text-[var(--text-muted)] border border-[var(--border)] hover:border-red-400/50 hover:text-red-400 hover:bg-red-500/10 transition-colors px-2.5 py-1 rounded-lg"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </GlowCard>

      {confirmLeave && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" onClick={() => setConfirmLeave(false)}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div onClick={(e) => e.stopPropagation()} className="relative bg-[var(--surface-solid)] border border-[var(--card-border)] rounded-3xl p-6 max-w-sm w-full text-center">
            <p className="text-sm text-[var(--text-primary)] font-medium mb-2">Leave this group?</p>
            <p className="text-xs text-[var(--text-muted)] mb-5">
              {isOwner && members.length > 1 ? "Ownership will transfer to another member automatically." : "You'll need a new invite to rejoin."}
            </p>
            <div className="flex gap-2">
              <button onClick={leaveGroup} className="flex-1 bg-red-500 hover:bg-red-400 text-white text-sm font-medium py-2.5 rounded-xl transition-colors">
                Leave
              </button>
              <button onClick={() => setConfirmLeave(false)} className="flex-1 bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-secondary-strong)] text-sm font-medium py-2.5 rounded-xl transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" onClick={() => { setConfirmDelete(false); setDeleteBlockedXP(0); }}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div onClick={(e) => e.stopPropagation()} className="relative bg-[var(--surface-solid)] border border-[var(--card-border)] rounded-3xl p-6 max-w-sm w-full text-center">
            {deleteBlockedXP > 0 ? (
              <>
                <p className="text-sm text-[var(--text-primary)] font-medium mb-2">Claim your XP first</p>
                <p className="text-xs text-[var(--text-muted)] mb-5">
                  You have <span className="text-[var(--accent-text)] font-semibold">{deleteBlockedXP.toLocaleString()} unclaimed XP</span> from this group. Deleting the group won't hand it to you automatically — claim it from the "Group Goal Completed" card below, then come back and delete.
                </p>
                <button
                  onClick={() => { setConfirmDelete(false); setDeleteBlockedXP(0); }}
                  className="w-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium py-2.5 rounded-xl transition-colors"
                >
                  Got it
                </button>
              </>
            ) : (
              <>
                <p className="text-sm text-[var(--text-primary)] font-medium mb-2">Delete this group?</p>
                <p className="text-xs text-[var(--text-muted)] mb-5">This removes it for everyone and can't be undone.</p>
                <div className="flex gap-2">
                  <button onClick={deleteGroup} className="flex-1 bg-red-500 hover:bg-red-400 text-white text-sm font-medium py-2.5 rounded-xl transition-colors">
                    Delete
                  </button>
                  <button onClick={() => setConfirmDelete(false)} className="flex-1 bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-secondary-strong)] text-sm font-medium py-2.5 rounded-xl transition-colors">
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {confirmMemberAction && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" onClick={() => setConfirmMemberAction(null)}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div onClick={(e) => e.stopPropagation()} className="relative bg-[var(--surface-solid)] border border-[var(--card-border)] rounded-3xl p-6 max-w-sm w-full text-center">
            <p className="text-sm text-[var(--text-primary)] font-medium mb-2">
              {confirmMemberAction.type === "remove" ? `Remove ${confirmMemberAction.name} from the group?` : `Remove admin from ${confirmMemberAction.name}?`}
            </p>
            <p className="text-xs text-[var(--text-muted)] mb-5">
              {confirmMemberAction.type === "remove" ? "They'll need a new invite or the join code to come back." : "They'll go back to a regular member."}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (confirmMemberAction.type === "remove") removeMember(confirmMemberAction.userId);
                  else demoteToMember(confirmMemberAction.userId);
                  setConfirmMemberAction(null);
                }}
                className="flex-1 bg-red-500 hover:bg-red-400 text-white text-sm font-medium py-2.5 rounded-xl transition-colors"
              >
                {confirmMemberAction.type === "remove" ? "Remove" : "Remove Admin"}
              </button>
              <button onClick={() => setConfirmMemberAction(null)} className="flex-1 bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-secondary-strong)] text-sm font-medium py-2.5 rounded-xl transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      <SavedToast key={autoCollectMessageKey} message={autoCollectMessage} />
    </div>
  );
}

function Groups({ refreshKey, goTo }) {
  const { requireAuth } = useRequireAuth();
  const [myUserId, setMyUserId] = useState(null);
  const [myGroups, setMyGroups] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [limitModalMessage, setLimitModalMessage] = useState("");
  const [myLimits, setMyLimits] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDesc, setNewGroupDesc] = useState("");
  const [newGroupIcon, setNewGroupIcon] = useState("📚");
  const [newGroupCategory, setNewGroupCategory] = useState(GROUP_CATEGORIES[0]);
  const [newGroupMaxMembers, setNewGroupMaxMembers] = useState(20);
  const [newGroupGoalType, setNewGroupGoalType] = useState(""); // "" | "total_hours" | "daily_hours" | "weekly_hours"
  const [newGroupGoalHours, setNewGroupGoalHours] = useState("");
  const [newGroupGoalUnit, setNewGroupGoalUnit] = useState("minutes"); // "hours" | "minutes" — minutes is for fast testing
  const [newGroupGoalDeadline, setNewGroupGoalDeadline] = useState("");
  const [newGroupActivationMode, setNewGroupActivationMode] = useState("manual"); // "manual" | "loop" | "schedule"
  const [newGroupScheduledAt, setNewGroupScheduledAt] = useState(null);
  const [activeGroupId, setActiveGroupId] = useState(null);
  const [createError, setCreateError] = useState("");
  const [showJoinCode, setShowJoinCode] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [joinCodeError, setJoinCodeError] = useState("");
  const [joinCodeLoading, setJoinCodeLoading] = useState(false);
  const [discoverGroups, setDiscoverGroups] = useState([]);
  const [joiningGroupId, setJoiningGroupId] = useState(null);

  useEffect(() => {
    supabase.rpc("get_my_entitlements").then(({ data }) => setMyLimits(data));
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  async function loadAll() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }
    setMyUserId(user.id);

    const { data: memberships, error: mErr } = await supabase.from("group_members").select("group_id, role, groups(*)").eq("user_id", user.id);
    if (mErr) console.error("Groups — failed to load memberships:", mErr);

    const groupsList = await Promise.all(
      (memberships || [])
        .filter((m) => m.groups)
        .map(async (m) => {
          const [{ count }, { data: progress }] = await Promise.all([
            supabase.from("group_members").select("id", { count: "exact", head: true }).eq("group_id", m.group_id),
            supabase.rpc("get_group_goal_progress", { p_group_id: m.group_id }),
          ]);
          return { group: m.groups, role: m.role, memberCount: count || 0, totalMinutes: progress?.[0]?.total_minutes || 0 };
        })
    );
    setMyGroups(groupsList);

    const { data: invites, error: iErr } = await supabase.from("group_invitations").select("*, groups(*)").eq("invitee_id", user.id).eq("status", "pending");
    if (iErr) console.error("Groups — failed to load invitations:", iErr);
    setInvitations(invites || []);

    const myGroupIds = groupsList.map((g) => g.group.id);
    const { data: publicGroups, error: dErr } = await supabase.from("groups").select("*").eq("is_public", true);
    if (dErr) console.error("Groups — failed to load discoverable groups:", dErr);
    const discoverable = (publicGroups || []).filter((g) => !myGroupIds.includes(g.id));
    const discoverWithCounts = await Promise.all(
      discoverable.map(async (g) => {
        const [{ count }, { data: progress }] = await Promise.all([
          supabase.from("group_members").select("id", { count: "exact", head: true }).eq("group_id", g.id),
          supabase.rpc("get_group_goal_progress", { p_group_id: g.id }),
        ]);
        return { group: g, memberCount: count || 0, totalMinutes: progress?.[0]?.total_minutes || 0 };
      })
    );
    setDiscoverGroups(discoverWithCounts);

    setLoading(false);
  }

  const joinPublicGroup = async (group) => {
    setJoiningGroupId(group.id);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setJoiningGroupId(null);
      return;
    }
    const { error } = await supabase.from("group_members").insert({ group_id: group.id, user_id: user.id, role: "member" });
    setJoiningGroupId(null);
    if (error) {
      console.error("Failed to join group:", error);
      if ((error.message || "").includes("GROUP_MEMBERSHIP_LIMIT")) {
        setLimitModalMessage("You've reached your plan's total group limit. Upgrade to join more groups.");
      } else {
        setCreateError("Couldn't join that group — please try again.");
      }
      return;
    }
    loadAll();
  };

  const createGroup = async () => {
    if (!newGroupName.trim()) return;
    setCreateError("");
    if (containsProfanity(newGroupName)) {
      setCreateError("That name violates our terms and isn't available.");
      return;
    }
    if (newGroupGoalType === "total_hours" && !newGroupGoalHours) {
      setCreateError("Enter a target time for the mandatory shared goal, or switch it to Optional.");
      return;
    }
    if (newGroupGoalType === "total_hours" && newGroupActivationMode === "schedule" && !newGroupScheduledAt) {
      setCreateError("Pick a date and time for the group to activate.");
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const payload = {
      name: newGroupName.trim(),
      description: newGroupDesc.trim(),
      icon: newGroupIcon,
      owner_id: user.id,
      category: newGroupCategory,
      max_members: newGroupMaxMembers,
      is_public: false, // user-created groups are always private — public groups are curated by the developer only, added directly via SQL
    };
    if (newGroupGoalType && newGroupGoalHours) {
      payload.goal_type = newGroupGoalType;
      if (newGroupGoalType === "total_hours" && newGroupActivationMode === "schedule") {
        // Deferred: don't start counting or set a live target until the
        // scheduled moment arrives — activate_scheduled_group() handles that.
        payload.activation_mode = "schedule";
        payload.pending_activation = true;
        payload.scheduled_activation_at = newGroupScheduledAt ? newGroupScheduledAt.toISOString() : null;
        payload.scheduled_target_minutes = Math.round(parseFloat(newGroupGoalHours) * (newGroupGoalUnit === "minutes" ? 1 : 60));
      } else {
        payload.goal_target_minutes = Math.round(parseFloat(newGroupGoalHours) * (newGroupGoalUnit === "minutes" ? 1 : 60));
        payload.goal_deadline = newGroupGoalDeadline || null;
        if (newGroupGoalType === "total_hours") {
          payload.activation_mode = newGroupActivationMode === "loop" ? "loop" : "manual";
        }
      }
    }

    const { data: group, error } = await supabase.from("groups").insert(payload).select().single();

    if (error) {
      console.error("Failed to create group:", error);
      const msg = error.message || "";
      if (msg.includes("GROUP_CREATE_LIMIT")) {
        setLimitModalMessage("You've reached your plan's limit on how many groups you can create. Upgrade to create more.");
      } else {
        setCreateError("Couldn't create the group — please try again.");
      }
      return;
    }

    const { error: joinError } = await supabase.from("group_members").insert({ group_id: group.id, user_id: user.id, role: "owner" });
    if (joinError) {
      console.error("Failed to add creator as owner:", joinError);
      const msg = joinError.message || "";
      if (msg.includes("GROUP_MEMBERSHIP_LIMIT")) {
        setLimitModalMessage("Group created, but you've reached your plan's total group limit, so you weren't added as a member. Upgrade to fix this.");
      } else {
        setCreateError("Group created, but something went wrong adding you as owner — please refresh.");
      }
      return;
    }

    setNewGroupName("");
    setNewGroupDesc("");
    setNewGroupIcon("📚");
    setNewGroupCategory(GROUP_CATEGORIES[0]);
    setNewGroupMaxMembers(20);
    setNewGroupGoalType("");
    setNewGroupGoalHours("");
    setNewGroupGoalDeadline("");
    setNewGroupActivationMode("manual");
    setNewGroupScheduledAt(null);
    setShowCreateForm(false);
    loadAll();
  };

  const joinWithCode = async () => {
    const code = joinCodeInput.trim().toUpperCase();
    if (!code) return;
    setJoinCodeError("");
    setJoinCodeLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setJoinCodeLoading(false);
      return;
    }

    const { data: matches, error: findError } = await supabase.rpc("find_group_by_code", { p_code: code });
    const group = matches && matches[0];
    if (findError || !group) {
      setJoinCodeError("No group found with that code.");
      setJoinCodeLoading(false);
      return;
    }

    if (group.max_members && group.current_members >= group.max_members) {
      setJoinCodeError("This group is full.");
      setJoinCodeLoading(false);
      return;
    }

    const { error: joinError } = await supabase.from("group_members").insert({ group_id: group.id, user_id: user.id, role: "member" });
    setJoinCodeLoading(false);
    if (joinError) {
      if ((joinError.message || "").includes("GROUP_MEMBERSHIP_LIMIT")) {
        setLimitModalMessage("You've reached your plan's total group limit. Upgrade to join more groups.");
      } else {
        setJoinCodeError(joinError.code === "23505" ? "You're already in this group." : "Couldn't join — please try again.");
      }
      return;
    }

    setJoinCodeInput("");
    setShowJoinCode(false);
    loadAll();
  };

  const respondInvite = async (invite, accept) => {
    const { error } = await supabase
      .from("group_invitations")
      .update({ status: accept ? "accepted" : "declined", responded_at: new Date().toISOString() })
      .eq("id", invite.id);
    if (error) {
      console.error("Failed to respond to invite:", error);
      return;
    }
    if (accept) {
      const { error: joinError } = await supabase.from("group_members").insert({ group_id: invite.group_id, user_id: myUserId, role: "member" });
      if (joinError) {
        console.error("Failed to join group:", joinError);
        if ((joinError.message || "").includes("GROUP_MEMBERSHIP_LIMIT")) {
          setLimitModalMessage("Invite accepted, but you've reached your plan's total group limit, so you weren't added. Upgrade to actually join.");
        } else {
          setCreateError("The invite was accepted, but something went wrong joining the group — please refresh.");
        }
      }
    }
    loadAll();
  };

  if (activeGroupId) {
    return (
      <GroupDashboard
        groupId={activeGroupId}
        myUserId={myUserId}
        goTo={goTo}
        onBack={() => {
          setActiveGroupId(null);
          loadAll();
        }}
      />
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {createError && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
          <p className="text-sm text-red-400">{createError}</p>
          <button onClick={() => setCreateError("")} className="text-red-400 hover:text-red-300 shrink-0">
            <X size={14} />
          </button>
        </div>
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-hover)] flex items-center justify-center glow-accent-30 shrink-0">
            <Users size={19} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-[var(--text-primary)]">Groups</h1>
            <p className="text-sm text-[var(--text-secondary)] mt-0.5">Study together, compete together, grow together.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() =>
              requireAuth(() => setShowJoinCode((s) => {
                if (!s) setShowCreateForm(false);
                return !s;
              }))
            }
            className="flex items-center gap-2 bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-secondary-strong)] text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
          >
            <Search size={15} /> Join with Code
          </button>
          <button
            onClick={() =>
              requireAuth(() => setShowCreateForm((s) => {
                if (!s) setShowJoinCode(false);
                return !s;
              }))
            }
            className="flex items-center gap-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-all duration-150 glow-accent-30 active:scale-95"
          >
            <Plus size={16} /> Create Group
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <LimitBadge label="Create group limit" current={myGroups.filter((g) => g.role === "owner").length} max={myLimits?.groups_create_max ?? null} goTo={goTo} />
        <LimitBadge label="Join group limit" current={myGroups.length} max={myLimits?.groups_join_max ?? null} goTo={goTo} />
      </div>

      {showJoinCode && (
        <GlowCard>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-[var(--text-primary)]">Join with code</p>
            <button
              onClick={() => {
                setShowJoinCode(false);
                setJoinCodeInput("");
                setJoinCodeError("");
              }}
              className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            >
              <X size={16} />
            </button>
          </div>
          <div className="flex gap-2">
            <input
              value={joinCodeInput}
              onChange={(e) => {
                setJoinCodeInput(e.target.value.toUpperCase().slice(0, 6));
                setJoinCodeError("");
              }}
              onKeyDown={(e) => e.key === "Enter" && joinWithCode()}
              placeholder="e.g. 7K4PX"
              className="flex-1 bg-[var(--input-bg)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)] tracking-widest font-mono"
            />
            <button
              onClick={joinWithCode}
              disabled={!joinCodeInput.trim() || joinCodeLoading}
              className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 text-white text-sm font-medium px-5 rounded-xl transition-colors"
            >
              {joinCodeLoading ? "..." : "Join"}
            </button>
          </div>
          {joinCodeError && <p className="text-xs text-red-400 mt-2">{joinCodeError}</p>}
        </GlowCard>
      )}

      {showCreateForm && (
        <GlowCard className="relative z-20">
          <p className="text-sm font-medium text-[var(--text-primary)] mb-3">New group</p>
          <div className="flex gap-2 mb-3 flex-wrap">
            {GROUP_ICON_OPTIONS.map((icon) => (
              <button
                key={icon}
                onClick={() => setNewGroupIcon(icon)}
                className={
                  "h-9 w-9 rounded-lg flex items-center justify-center text-lg transition-colors " +
                  (newGroupIcon === icon ? "bg-[rgb(var(--accent-rgb)/0.3)] border border-[var(--accent)]" : "bg-[var(--surface-2)] hover:bg-[var(--surface-3)]")
                }
              >
                {icon}
              </button>
            ))}
          </div>
          <label className="text-[11px] text-[var(--text-muted)] block mb-1">
            Group name <span className="text-red-400">*</span>
          </label>
          <input
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value.slice(0, 40))}
            placeholder="e.g. Deep Work"
            className="w-full mb-2 bg-[var(--input-bg)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)]"
          />
          <textarea
            value={newGroupDesc}
            onChange={(e) => setNewGroupDesc(e.target.value.slice(0, 150))}
            rows={4}
            placeholder="Short description (optional)"
            className="w-full mb-3 bg-[var(--input-bg)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)] resize-none overflow-hidden"
          />

          <label className="text-[11px] text-[var(--text-muted)] block mb-1">Category</label>
          <div className="mb-3">
            <ThemedSelect value={newGroupCategory} onChange={setNewGroupCategory} options={GROUP_CATEGORIES} />
          </div>

          <label className="text-[11px] text-[var(--text-muted)] block mb-1">Member cap</label>
          <div className="mb-3">
            <ThemedSelect
              value={newGroupMaxMembers}
              onChange={setNewGroupMaxMembers}
              options={[5, 10, 20, 30, 50, 100, 150, 200].map((n) => ({ value: n, label: `${n} members` }))}
            />
          </div>

          <p className="text-xs text-[var(--text-faint)] mb-3">
            This will be a private group — joinable only by invite or code. Public groups are curated separately and shown under Discover.
          </p>

          <label className="text-[11px] text-[var(--text-muted)] block mb-1">Shared goal</label>
          <div className="flex rounded-xl overflow-hidden border border-[var(--border)] mb-3">
            <button
              type="button"
              onClick={() => setNewGroupGoalType("")}
              className={"flex-1 text-xs font-medium px-3 py-2.5 transition-colors " + (newGroupGoalType !== "total_hours" ? "bg-[var(--accent)] text-white" : "bg-[var(--input-bg)] text-[var(--text-muted)] hover:text-[var(--text-secondary-strong)]")}
            >
              Optional
            </button>
            <button
              type="button"
              onClick={() => setNewGroupGoalType("total_hours")}
              className={"flex-1 text-xs font-medium px-3 py-2.5 transition-colors " + (newGroupGoalType === "total_hours" ? "bg-[var(--accent)] text-white" : "bg-[var(--input-bg)] text-[var(--text-muted)] hover:text-[var(--text-secondary-strong)]")}
            >
              Mandatory
            </button>
          </div>
          {newGroupGoalType === "total_hours" && (
            <div className="flex gap-2 mb-3">
              <input
                type="number"
                min="1"
                value={newGroupGoalHours}
                onChange={(e) => setNewGroupGoalHours(e.target.value)}
                placeholder={newGroupGoalUnit === "minutes" ? "Target (minutes)" : "Target (hours)"}
                className="flex-1 bg-[var(--input-bg)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)]"
              />
              <div className="flex rounded-xl overflow-hidden border border-[var(--border)] shrink-0">
                <button
                  type="button"
                  onClick={() => setNewGroupGoalUnit("hours")}
                  className={"text-xs font-medium px-3 transition-colors " + (newGroupGoalUnit === "hours" ? "bg-[var(--accent)] text-white" : "bg-[var(--input-bg)] text-[var(--text-muted)] hover:text-[var(--text-secondary-strong)]")}
                >
                  Hrs
                </button>
                <button
                  type="button"
                  onClick={() => setNewGroupGoalUnit("minutes")}
                  className={"text-xs font-medium px-3 transition-colors " + (newGroupGoalUnit === "minutes" ? "bg-[var(--accent)] text-white" : "bg-[var(--input-bg)] text-[var(--text-muted)] hover:text-[var(--text-secondary-strong)]")}
                >
                  Min
                </button>
              </div>
            </div>
          )}
          {newGroupGoalType === "total_hours" && (
            <div className="mb-3 space-y-2">
              <p className="text-xs text-[var(--text-muted)]">Activation</p>
              <div className="flex rounded-xl overflow-hidden border border-[var(--border)]">
                {[
                  ["manual", "Manual"],
                  ["loop", "Loop"],
                  ["schedule", "Schedule"],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setNewGroupActivationMode(key)}
                    className={"flex-1 text-xs font-medium px-3 py-2 transition-colors " + (newGroupActivationMode === key ? "bg-[var(--accent)] text-white" : "bg-[var(--input-bg)] text-[var(--text-muted)] hover:text-[var(--text-secondary-strong)]")}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {newGroupActivationMode === "schedule" ? (
                <>
                  <DateTimePicker value={newGroupScheduledAt} onChange={setNewGroupScheduledAt} />
                  <p className="text-[10px] text-[var(--text-faint)]">
                    The group won't count anything toward the goal until this exact date and time — everyone who joins beforehand will see when it activates and with what target.
                  </p>
                </>
              ) : (
                <>
                  <DateTimePicker
                    value={newGroupGoalDeadline || null}
                    onChange={(date) => setNewGroupGoalDeadline(date ? date.toISOString() : "")}
                  />
                  <p className="text-[10px] text-[var(--text-faint)]">
                    {newGroupActivationMode === "loop"
                      ? "Starts immediately and repeats automatically with the same target every time it completes."
                      : "Starts immediately. Once it completes, you'll need to manually start each next round."}
                  </p>
                </>
              )}
            </div>
          )}

          {createError && <p className="text-xs text-red-400 mb-3">{createError}</p>}
          <div className="flex gap-2">
            <button onClick={createGroup} disabled={!newGroupName.trim()} className="flex-1 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 text-white text-sm font-medium py-2.5 rounded-xl transition-colors">
              Create
            </button>
            <button onClick={() => setShowCreateForm(false)} className="flex-1 bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-secondary-strong)] text-sm font-medium py-2.5 rounded-xl transition-colors">
              Cancel
            </button>
          </div>
        </GlowCard>
      )}

      {invitations.length > 0 && (
        <GlowCard>
          <p className="text-sm font-medium text-[var(--text-primary)] mb-3">Group Invitations ({invitations.length})</p>
          <div className="space-y-2">
            {invitations.map((inv) => (
              <div key={inv.id} className="flex items-center gap-3 bg-[var(--surface-2)]/40 rounded-xl p-2.5">
                <div className="h-9 w-9 rounded-lg bg-[rgb(var(--accent-rgb)/0.2)] flex items-center justify-center text-lg shrink-0">{inv.groups?.icon || "📚"}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[var(--text-primary)] truncate">You've been invited to join {inv.groups?.name || "a group"}</p>
                </div>
                <button onClick={() => respondInvite(inv, true)} className="text-xs bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-medium px-3 py-1.5 rounded-lg transition-colors">
                  Accept
                </button>
                <button onClick={() => respondInvite(inv, false)} className="text-xs bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-secondary-strong)] font-medium px-3 py-1.5 rounded-lg transition-colors">
                  Decline
                </button>
              </div>
            ))}
          </div>
        </GlowCard>
      )}

      <GlowCard>
        <p className="text-sm font-medium text-[var(--text-primary)] mb-3">
          Private Groups {myGroups.filter((g) => !g.group.is_public).length > 0 && <span className="text-[var(--text-muted)]">({myGroups.filter((g) => !g.group.is_public).length})</span>}
        </p>
        {loading ? (
          <p className="text-xs text-[var(--text-muted)]">Loading...</p>
        ) : myGroups.filter((g) => !g.group.is_public).length === 0 ? (
          <p className="text-xs text-[var(--text-muted)] py-2">No private groups yet — create one, or wait for a friend to invite you.</p>
        ) : (
          <div className="space-y-2">
            {myGroups
              .filter((g) => !g.group.is_public)
              .map(({ group, memberCount, totalMinutes }) => (
                <GroupCard key={group.id} group={group} memberCount={memberCount} totalMinutes={totalMinutes} onClick={() => setActiveGroupId(group.id)} />
              ))}
          </div>
        )}
      </GlowCard>

      <GlowCard>
        <p className="text-sm font-medium text-[var(--text-primary)] mb-3">
          Public Groups {myGroups.filter((g) => g.group.is_public).length > 0 && <span className="text-[var(--text-muted)]">({myGroups.filter((g) => g.group.is_public).length})</span>}
        </p>
        {loading ? (
          <p className="text-xs text-[var(--text-muted)]">Loading...</p>
        ) : myGroups.filter((g) => g.group.is_public).length === 0 ? (
          <p className="text-xs text-[var(--text-muted)] py-2">You haven't joined any public groups yet.</p>
        ) : (
          <div className="space-y-2">
            {myGroups
              .filter((g) => g.group.is_public)
              .map(({ group, memberCount, totalMinutes }) => (
                <GroupCard key={group.id} group={group} memberCount={memberCount} totalMinutes={totalMinutes} onClick={() => setActiveGroupId(group.id)} />
              ))}
          </div>
        )}
      </GlowCard>

      <GlowCard>
        <p className="text-sm font-medium text-[var(--text-primary)] mb-1">
          Discover {discoverGroups.length > 0 && <span className="text-[var(--text-muted)]">({discoverGroups.length})</span>}
        </p>
        <p className="text-xs text-[var(--text-faint)] mb-3">Built-in public groups, open to everyone — limited seats.</p>
        {loading ? (
          <p className="text-xs text-[var(--text-muted)]">Loading...</p>
        ) : discoverGroups.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)] py-2">No public groups available to join right now.</p>
        ) : (
          <div className="space-y-2">
            {discoverGroups.map(({ group, memberCount, totalMinutes }) => (
              <DiscoverGroupCard key={group.id} group={group} memberCount={memberCount} totalMinutes={totalMinutes} joining={joiningGroupId === group.id} onJoin={() => joinPublicGroup(group)} />
            ))}
          </div>
        )}
      </GlowCard>
      <LimitReachedModal message={limitModalMessage} onClose={() => setLimitModalMessage("")} goTo={goTo} />
    </div>
  );
}


// Top-3 podium — classical pillar styling with gold/silver/bronze, matching
// the "winner's podium" look. Reused across every scope/period combination
// since the data shape (rank, name, focus_seconds) is always the same.
function LeaderboardPodium({ top3, myUserId }) {
  if (top3.length === 0) return null;
  const [first, second, third] = top3;

  const PILLAR = {
    1: { height: 128, gradient: "from-amber-300 to-amber-500", ring: "ring-amber-400", label: "1st", labelColor: "text-amber-400", avatarSize: 68 },
    2: { height: 92, gradient: "from-slate-300 to-slate-400", ring: "ring-slate-300", label: "2nd", labelColor: "text-slate-300", avatarSize: 56 },
    3: { height: 72, gradient: "from-orange-400 to-orange-600", ring: "ring-orange-400", label: "3rd", labelColor: "text-orange-400", avatarSize: 52 },
  };

  const Column = ({ person, place }) => {
    if (!person) return <div className="flex-1" />;
    const p = PILLAR[place];
    const isMe = person.user_id === myUserId;
    return (
      <div className="flex-1 flex flex-col items-center min-w-0">
        <div className={"rounded-full ring-2 ring-offset-2 ring-offset-[var(--surface)] " + p.ring}>
          <PersonAvatar name={person.display_name || person.username} size={p.avatarSize} />
        </div>
        <p className="text-sm font-medium text-[var(--text-primary)] mt-2 truncate max-w-full px-1">
          {person.display_name || person.username}
          {isMe && <span className="text-[var(--accent-text)]"> (you)</span>}
        </p>
        <p className={"text-sm font-bold " + p.labelColor}>{p.label}</p>
        <p className="text-xs text-[var(--text-muted)] mb-3">{formatDuration(person.focus_seconds || 0)}</p>
        <div className={"w-full max-w-[110px] rounded-t-xl bg-gradient-to-b shadow-lg flex items-start justify-center pt-2 " + p.gradient} style={{ height: p.height }}>
          {place === 1 && <Trophy size={20} className="text-amber-900/60" />}
        </div>
      </div>
    );
  };

  return (
    <div className="flex items-end justify-center gap-2 sm:gap-4 px-2 pb-2">
      <Column person={second} place={2} />
      <Column person={first} place={1} />
      <Column person={third} place={3} />
    </div>
  );
}

function Leaderboard({ refreshKey }) {
  const [scope, setScope] = useState("global"); // "global" | "friends"
  const [period, setPeriod] = useState("week"); // "week" | "month" | "lifetime"
  const [rows, setRows] = useState([]);
  const [myRank, setMyRank] = useState(null);
  const [myUserId, setMyUserId] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, scope, period]);

  async function loadData() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }
    setMyUserId(user.id);

    if (scope === "global") {
      // Uses a security-definer database function since the frontend's own
      // RLS access to study_sessions is limited to your own + friends' rows
      // (correct for privacy) — the function only ever returns an aggregated
      // total per user, never individual session rows.
      const [leaderboardRes, myRankRes] = await Promise.all([
        supabase.rpc("get_leaderboard", { period, limit_count: 200 }),
        supabase.rpc("get_my_rank", { period }),
      ]);
      if (!leaderboardRes.error) setRows(leaderboardRes.data || []);
      if (!myRankRes.error) setMyRank((myRankRes.data && myRankRes.data[0]) || null);
    } else {
      // Friends leaderboard: computed client-side from sessions we're already
      // allowed to read (own + accepted friends) — the group is naturally
      // small, so no need for a database function here.
      const { data: friendRows } = await supabase
        .from("friend_requests")
        .select("*")
        .eq("status", "accepted")
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`);

      const friendIds = (friendRows || []).map((r) => (r.sender_id === user.id ? r.receiver_id : r.sender_id));
      const allIds = [user.id, ...friendIds];

      const [sessionsRes, profilesRes] = await Promise.all([
        supabase.from("study_sessions").select("user_id, focused_seconds, completed_at").in("user_id", allIds),
        supabase.from("profiles").select("user_id, username, display_name, bio, avatar_url, character_style, premium_tier, ever_been_premium").in("user_id", allIds),
      ]);

      const now = new Date();
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay());
      startOfWeek.setHours(0, 0, 0, 0);
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const totals = {};
      allIds.forEach((id) => {
        totals[id] = 0;
      });
      (sessionsRes.data || []).forEach((s) => {
        const d = new Date(s.completed_at);
        if (period === "week" && d < startOfWeek) return;
        if (period === "month" && d < startOfMonth) return;
        totals[s.user_id] = (totals[s.user_id] || 0) + (s.focused_seconds || 0);
      });

      const profileMap = {};
      (profilesRes.data || []).forEach((p) => {
        profileMap[p.user_id] = p;
      });

      const combined = allIds
        .filter((id) => profileMap[id])
        .map((id) => ({
          user_id: id,
          username: profileMap[id].username,
          display_name: profileMap[id].display_name,
          focus_seconds: totals[id] || 0,
        }))
        .sort((a, b) => b.focus_seconds - a.focus_seconds)
        .slice(0, 200)
        .map((row, i) => ({ ...row, rank: i + 1 }));

      setRows(combined);
      setMyRank(combined.find((r) => r.user_id === user.id) || null);
    }

    setLoading(false);
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex flex-col items-center text-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-hover)] flex items-center justify-center glow-accent-30 shrink-0">
          <Trophy size={19} className="text-white" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">Leaderboard</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-0.5">See how your focus time stacks up.</p>
        </div>
      </div>

      <div className="flex items-center justify-center gap-2">
        {[
          ["global", "Global"],
          ["friends", "Friends"],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setScope(key)}
            className={
              "text-sm font-medium px-4 py-2 rounded-xl transition-colors " +
              (scope === key ? "bg-[var(--accent)] text-white" : "bg-[var(--surface-2)] text-[var(--text-secondary-strong)] hover:bg-[var(--surface-3)]")
            }
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-center gap-2">
        {[
          ["week", "Week"],
          ["month", "Month"],
          ["lifetime", "Lifetime"],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setPeriod(key)}
            className={
              "text-xs font-medium px-3 py-1.5 rounded-lg transition-colors " +
              (period === key ? "bg-[rgb(var(--accent-rgb)/0.2)] text-[var(--accent-text)] border border-[rgb(var(--accent-rgb)/0.3)]" : "text-[var(--text-muted)] hover:text-[var(--text-secondary-strong)]")
            }
          >
            {label}
          </button>
        ))}
      </div>

      {!loading && rows.length > 0 && (
        <GlowCard glow>
          <LeaderboardPodium top3={rows.slice(0, 3)} myUserId={myUserId} />
        </GlowCard>
      )}

      <GlowCard>
        {loading ? (
          <div className="py-10 flex flex-col items-center justify-center gap-3">
            <Loader2 size={22} className="text-[var(--accent-text)] animate-spin" />
            <p className="text-sm text-[var(--text-muted)]">Loading leaderboard...</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-sm text-[var(--text-muted)]">
              {scope === "friends" ? "None of your friends have focused time yet." : "Start focusing to appear on the leaderboard."}
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {rows.slice(3).map((r) => {
              const isMe = r.user_id === myUserId;
              const totalMinutes = Math.floor((r.focus_seconds || 0) / 60);
              const { current } = computeGrowth(totalMinutes * GROWTH_XP_PER_MINUTE);
              return (
                <div key={r.user_id} className={"flex items-center gap-3 rounded-xl px-3 py-2.5 " + (isMe ? "bg-[rgb(var(--accent-rgb)/0.1)] border border-[rgb(var(--accent-rgb)/0.3)]" : "")}>
                  <span className="text-sm text-[var(--text-muted)] w-7 text-center shrink-0">{r.rank}</span>
                  <PersonAvatar name={r.display_name || r.username} size={32} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[var(--text-primary)] truncate">
                      {r.display_name || r.username} {isMe && <span className="text-xs text-[var(--accent-text)]">(you)</span>}
                      {r.user_id === "97f98bca-98b3-47f6-b2d1-0ac78bc2674f" && (
                        <span className="text-[10px] font-bold uppercase tracking-wide bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded ml-1">Admin</span>
                      )}
                    </p>
                    <p className="text-xs" style={{ color: current.color }}>
                      Level {current.level}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-[var(--text-primary)] shrink-0">{formatDuration(r.focus_seconds || 0)}</p>
                </div>
              );
            })}
          </div>
        )}

        {!loading && myRank && !rows.some((r) => r.user_id === myUserId) && (
          <div className="mt-3 pt-3 border-t border-[var(--border-subtle)]">
            <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 bg-[rgb(var(--accent-rgb)/0.1)] border border-[rgb(var(--accent-rgb)/0.3)]">
              <span className="text-sm text-[var(--accent-text)] w-7 text-center shrink-0 font-semibold">#{myRank.rank}</span>
              <PersonAvatar name={myRank.display_name || myRank.username} size={32} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-[var(--text-primary)]">
                  {myRank.display_name || myRank.username} <span className="text-xs text-[var(--accent-text)]">(you)</span>
                </p>
              </div>
              <p className="text-sm font-semibold text-[var(--text-primary)] shrink-0">{formatDuration(myRank.focus_seconds || 0)}</p>
            </div>
          </div>
        )}
      </GlowCard>
    </div>
  );
}

// A small inline edit box that saves and closes itself when the person
// clicks anywhere outside it — same click-outside pattern as ThemedSelect.
function NicknameEditBox({ otherId, value, onChange, onSave, placeholder }) {
  const containerRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        onSave(otherId);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otherId]);

  return (
    <div ref={containerRef} className="flex items-center gap-1.5">
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onSave(otherId)}
        placeholder={placeholder}
        className="flex-1 min-w-0 bg-[var(--input-bg)] border border-[var(--accent)] rounded-lg px-2 py-1 text-sm text-[var(--text-primary)] outline-none"
      />
      <button onClick={() => onSave(otherId)} className="text-xs text-[var(--accent-text)] shrink-0">
        Save
      </button>
    </div>
  );
}

function Friends({ refreshKey, goTo }) {
  const { requireAuth } = useRequireAuth();
  const [myUserId, setMyUserId] = useState(null);
  const [hasOwnProfile, setHasOwnProfile] = useState(true); // assume yes until checked, avoids a flash of the warning
  const [requests, setRequests] = useState([]); // every row involving me, sent or received
  const [friendCount, setFriendCount] = useState(0);
  const [friendLimitError, setFriendLimitError] = useState("");
  const [profilesById, setProfilesById] = useState({});
  const [confirmedNoProfile, setConfirmedNoProfile] = useState({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showAllRequests, setShowAllRequests] = useState(false);
  const [inspecting, setInspecting] = useState(null); // profile object, or null
  const [presenceByUserId, setPresenceByUserId] = useState({});
  const [nowTick, setNowTick] = useState(Date.now()); // re-renders elapsed-time labels every 30s
  const [nicknames, setNicknames] = useState({}); // friend_id -> nickname, private to this viewer
  const [editingNicknameFor, setEditingNicknameFor] = useState(null);
  const [nicknameInput, setNicknameInput] = useState("");

  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  async function loadAll() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }
    setMyUserId(user.id);

    const { data: ownProfile } = await supabase.from("profiles").select("id").eq("user_id", user.id).maybeSingle();
    setHasOwnProfile(!!ownProfile);

    const { data: reqData, error } = await supabase
      .from("friend_requests")
      .select("*")
      .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`);

    if (!error) {
      setRequests(reqData || []);
      setFriendCount((reqData || []).filter((r) => r.status === "accepted").length);
      const otherIds = Array.from(new Set((reqData || []).map((r) => (r.sender_id === user.id ? r.receiver_id : r.sender_id))));
      if (otherIds.length > 0) {
        const { data: profilesData, error: profilesError } = await supabase.from("profiles").select("user_id, username, display_name, bio, avatar_url, character_style, premium_tier, ever_been_premium").in("user_id", otherIds);
        if (profilesError) console.error("Friends — failed to load profiles for requests:", profilesError);
        const map = {};
        (profilesData || []).forEach((p) => {
          map[p.user_id] = p;
        });
        setProfilesById(map);

        const { data: nickData } = await supabase.from("friend_nicknames").select("friend_id, nickname").eq("viewer_id", user.id).in("friend_id", otherIds);
        const nickMap = {};
        (nickData || []).forEach((n) => {
          nickMap[n.friend_id] = n.nickname;
        });
        setNicknames(nickMap);
      }
    }
    setLoading(false);
  }

  // Self-healing: if any request's profile didn't come through in the bulk
  // fetch above (for any reason), fetch it individually instead of letting
  // that request silently vanish from the list while still counting toward
  // the "(1)" badge. If the person genuinely has no profile at all (e.g. they
  // sent a request without ever finishing their own profile setup), this
  // marks them as confirmed-missing instead of retrying forever — that
  // infinite retry was exactly what caused the permanent "Loading request..."
  useEffect(() => {
    const missingIds = requests
      .map((r) => (r.sender_id === myUserId ? r.receiver_id : r.sender_id))
      .filter((id) => id && !profilesById[id] && !confirmedNoProfile[id]);
    if (missingIds.length === 0) return;

    supabase
      .from("profiles")
      .select("*")
      .in("user_id", missingIds)
      .then(({ data, error }) => {
        if (error) {
          console.error("Friends — backfill profile fetch failed:", error);
          return;
        }
        const found = data || [];
        if (found.length > 0) {
          setProfilesById((m) => {
            const next = { ...m };
            found.forEach((p) => {
              next[p.user_id] = p;
            });
            return next;
          });
        }
        const foundIds = new Set(found.map((p) => p.user_id));
        const stillMissing = missingIds.filter((id) => !foundIds.has(id));
        if (stillMissing.length > 0) {
          setConfirmedNoProfile((m) => {
            const next = { ...m };
            stillMissing.forEach((id) => {
              next[id] = true;
            });
            return next;
          });
        }
      });
  }, [requests, myUserId, profilesById, confirmedNoProfile]);

  // Debounced live search by username.
  useEffect(() => {
    if (!searchQuery.trim() || !myUserId) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .ilike("username", `%${searchQuery.trim()}%`)
        .neq("user_id", myUserId)
        .limit(15);
      setSearchResults(data || []);
      setSearching(false);
    }, 350);
    return () => clearTimeout(t);
  }, [searchQuery, myUserId]);

  function relationshipWith(otherId) {
    return requests.find((r) => r.sender_id === otherId || r.receiver_id === otherId) || null;
  }

  const sendRequest = async (otherProfile) => {
    if (!hasOwnProfile) return; // guarded in the UI too, but double-check here
    if (otherProfile.user_id === "97f98bca-98b3-47f6-b2d1-0ac78bc2674f" && myUserId !== "97f98bca-98b3-47f6-b2d1-0ac78bc2674f") {
      setFriendLimitError("This account isn't accepting friend requests.");
      return;
    }
    setFriendLimitError("");
    const { data, error } = await supabase
      .from("friend_requests")
      .insert({ sender_id: myUserId, receiver_id: otherProfile.user_id })
      .select()
      .single();
    if (error) {
      if (error.message && error.message.includes("FRIEND_LIMIT")) {
        setFriendLimitError(
          error.message.includes("FRIEND_LIMIT_RECEIVER") ? "This person's friend list is full." : "You already have 200 friends — the maximum allowed."
        );
      } else if (error.message && error.message.includes("not accepting friend requests")) {
        setFriendLimitError("This account isn't accepting friend requests.");
      }
      return;
    }
    setRequests((r) => [...r, data]);
    setProfilesById((m) => ({ ...m, [otherProfile.user_id]: otherProfile }));
  };

  const acceptRequest = async (req) => {
    setFriendLimitError("");
    const { data, error } = await supabase.from("friend_requests").update({ status: "accepted" }).eq("id", req.id).select().single();
    if (error) {
      if (error.message && error.message.includes("FRIEND_LIMIT")) {
        setFriendLimitError(
          error.message.includes("FRIEND_LIMIT_SENDER")
            ? "This person already has 200 friends — the maximum allowed."
            : "You already have 200 friends — the maximum allowed. Remove someone before adding more."
        );
      }
      return;
    }
    setRequests((r) => r.map((x) => (x.id === req.id ? data : x)));
    supabase.rpc("get_my_friend_count").then(({ data: count }) => setFriendCount(count || 0));
  };

  // Declining or removing a relationship deletes the row entirely (rather than
  // just marking it "declined") — this frees up the pair so a new request can
  // be sent later instead of getting permanently blocked by the old row.
  const saveNickname = async (friendId) => {
    const trimmed = nicknameInput.trim();
    if (!myUserId) return;
    if (!trimmed) {
      await supabase.from("friend_nicknames").delete().eq("viewer_id", myUserId).eq("friend_id", friendId);
      setNicknames((n) => {
        const next = { ...n };
        delete next[friendId];
        return next;
      });
    } else {
      await supabase.from("friend_nicknames").upsert({ viewer_id: myUserId, friend_id: friendId, nickname: trimmed.slice(0, 40) });
      setNicknames((n) => ({ ...n, [friendId]: trimmed.slice(0, 40) }));
    }
    setEditingNicknameFor(null);
  };

  const removeRelationship = async (req) => {
    const previous = requests;
    const wasAccepted = req.status === "accepted";
    setRequests((r) => r.filter((x) => x.id !== req.id));
    if (wasAccepted) setFriendCount((c) => Math.max(0, c - 1));
    const { error } = await supabase.from("friend_requests").delete().eq("id", req.id);
    if (error) {
      setRequests(previous);
      if (wasAccepted) setFriendCount((c) => c + 1);
    }
  };

  const incoming = requests.filter((r) => r.receiver_id === myUserId && r.status === "pending");
  const friends = requests.filter((r) => r.status === "accepted");
  const friendUserIds = friends.map((r) => (r.sender_id === myUserId ? r.receiver_id : r.sender_id));
  const friendIdsKey = friendUserIds.slice().sort().join(",");

  useEffect(() => {
    if (friendUserIds.length === 0) return;

    supabase
      .from("user_presence")
      .select("*")
      .in("user_id", friendUserIds)
      .then(({ data, error }) => {
        if (error) console.error("Friends — failed to load presence:", error);
        const map = {};
        (data || []).forEach((p) => {
          map[p.user_id] = p;
        });
        setPresenceByUserId(map);
      });

    // Realtime so status changes show up live instead of needing a refresh.
    const channel = supabase
      .channel("friends-presence")
      .on("postgres_changes", { event: "*", schema: "public", table: "user_presence" }, (payload) => {
        const row = payload.new;
        if (row && friendUserIds.includes(row.user_id)) {
          setPresenceByUserId((m) => ({ ...m, [row.user_id]: row }));
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [friendIdsKey]);


  function StatusButton({ otherProfile }) {
    const rel = relationshipWith(otherProfile.user_id);
    if (!rel) {
      return (
        <button
          onClick={() => requireAuth(() => sendRequest(otherProfile))}
          disabled={!hasOwnProfile}
          title={hasOwnProfile ? undefined : "Set up your own profile first"}
          className="text-xs bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium px-3 py-1.5 rounded-lg transition-colors"
        >
          + Add Friend
        </button>
      );
    }
    if (rel.status === "accepted") {
      return <span className="text-xs text-emerald-400 font-medium px-3 py-1.5">Friends</span>;
    }
    if (rel.sender_id === myUserId) {
      return <span className="text-xs text-[var(--text-muted)] font-medium px-3 py-1.5">Request Sent</span>;
    }
    return (
      <div className="flex gap-1.5">
        <button onClick={() => acceptRequest(rel)} className="text-xs bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-medium px-3 py-1.5 rounded-lg transition-colors">
          Accept
        </button>
        <button onClick={() => removeRelationship(rel)} className="text-xs bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-secondary-strong)] font-medium px-3 py-1.5 rounded-lg transition-colors">
          Decline
        </button>
      </div>
    );
  }

  if (!loading && !hasOwnProfile) {
    return (
      <div className="max-w-md mx-auto text-center py-16">
        <Users size={32} className="text-[var(--accent-text)] mx-auto mb-3" />
        <h1 className="text-xl font-semibold text-[var(--text-primary)] mb-2">Create your profile to send requests</h1>
        <p className="text-sm text-[var(--text-secondary)] mb-6">
          You'll need a username before you can find people, send friend requests, or be found by others.
        </p>
        <button onClick={() => goTo && goTo("profile")} className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-medium px-6 py-3 rounded-xl transition-colors">
          Go to Profile
        </button>
      </div>
    );
  }

  if (inspecting) {
    return (
      <InspectFriendPage
        profile={inspecting}
        onBack={() => setInspecting(null)}
        onRemoveFriend={async () => {
          const req = requests.find(
            (r) => r.status === "accepted" && (r.sender_id === inspecting.user_id || r.receiver_id === inspecting.user_id)
          );
          if (req) await removeRelationship(req);
          setInspecting(null);
        }}
      />
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-hover)] flex items-center justify-center glow-accent-30 shrink-0">
            <Users size={19} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-[var(--text-primary)]">Friends</h1>
            <p className="text-sm text-[var(--text-secondary)] mt-0.5">Find people, send requests, and keep track of who you know.</p>
          </div>
        </div>
        <p className="text-xs text-[var(--text-muted)] shrink-0">{friendCount}/200</p>
      </div>

      {friendLimitError && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-2.5 text-xs text-red-400">{friendLimitError}</div>
      )}

      <GlowCard>
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search Lytning Focus users by username..."
          className="w-full bg-[var(--input-bg)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)]"
        />
        {searchQuery.trim() && (
          <div className="mt-3 space-y-2">
            {searching ? (
              <p className="text-xs text-[var(--text-muted)]">Searching...</p>
            ) : searchResults.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)]">No users found.</p>
            ) : (
              searchResults.map((p) => (
                <div key={p.user_id} className="flex items-center gap-3 bg-[var(--surface-2)]/40 rounded-xl p-2.5">
                  <PersonAvatar name={p.display_name || p.username} size={36} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[var(--text-primary)] truncate">{p.display_name || p.username}</p>
                    <p className="text-xs text-[var(--accent-text)]">@{p.username}</p>
                  </div>
                  <StatusButton otherProfile={p} />
                </div>
              ))
            )}
          </div>
        )}
      </GlowCard>

      <GlowCard>
        <p className="text-sm font-medium text-[var(--text-primary)] mb-3">
          Friend Requests {incoming.length > 0 && <span className="text-[var(--accent-text)]">({incoming.length})</span>}
        </p>
        {loading ? (
          <p className="text-xs text-[var(--text-muted)]">Loading...</p>
        ) : incoming.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)]">No pending friend requests.</p>
        ) : (
          <div className="space-y-2">
            {(showAllRequests ? incoming : incoming.slice(0, 2)).map((r) => {
              const p = profilesById[r.sender_id];
              if (!p) {
                if (confirmedNoProfile[r.sender_id]) {
                  return (
                    <div key={r.id} className="flex items-center gap-3 bg-[var(--surface-2)]/40 rounded-xl p-2.5">
                      <PersonAvatar name="?" size={36} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-[var(--text-secondary-strong)]">Someone requested to be your friend</p>
                        <p className="text-xs text-[var(--text-muted)]">They haven't finished setting up their profile yet</p>
                      </div>
                      <div className="flex gap-1.5">
                        <button onClick={() => acceptRequest(r)} className="text-xs bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-medium px-3 py-1.5 rounded-lg transition-colors">
                          Accept
                        </button>
                        <button onClick={() => removeRelationship(r)} className="text-xs bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-secondary-strong)] font-medium px-3 py-1.5 rounded-lg transition-colors">
                          Decline
                        </button>
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={r.id} className="flex items-center gap-3 bg-[var(--surface-2)]/40 rounded-xl p-2.5 animate-pulse">
                    <div className="h-9 w-9 rounded-full bg-[var(--surface-3)]" />
                    <p className="text-xs text-[var(--text-muted)]">Loading request...</p>
                  </div>
                );
              }
              return (
                <div key={r.id} className="flex items-center gap-3 bg-[var(--surface-2)]/40 rounded-xl p-2.5">
                  <PersonAvatar name={p.display_name || p.username} size={36} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[var(--text-primary)] truncate">{p.display_name || p.username}</p>
                    <p className="text-xs text-[var(--accent-text)]">@{p.username}</p>
                  </div>
                  <StatusButton otherProfile={p} />
                </div>
              );
            })}
          </div>
        )}
        {!loading && incoming.length > 2 && (
          <button onClick={() => setShowAllRequests((s) => !s)} className="text-xs text-[var(--accent-text)] hover:text-[var(--accent-text)] mt-3">
            {showAllRequests ? "Show less" : `Show all ${incoming.length} requests`}
          </button>
        )}
      </GlowCard>

      <GlowCard>
        <p className="text-sm font-medium text-[var(--text-primary)] mb-3">Your Friends {friends.length > 0 && <span className="text-[var(--text-muted)]">({friends.length})</span>}</p>
        {loading ? (
          <p className="text-xs text-[var(--text-muted)]">Loading...</p>
        ) : friends.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-sm text-[var(--text-muted)]">You haven\'t added any friends yet.</p>
            <p className="text-xs text-[var(--text-faint)] mt-1">Search above to find people you know.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {friends.map((r) => {
              const otherId = r.sender_id === myUserId ? r.receiver_id : r.sender_id;
              const p = profilesById[otherId];
              if (!p) return null;
              const eff = computeEffectiveStatus(presenceByUserId[otherId], nowTick);
              return (
                <div key={r.id} className="flex items-center gap-3 bg-[var(--surface-2)]/40 rounded-xl p-2.5">
                  <PersonAvatar name={p.display_name || p.username} size={36} isActive={eff.status === "focusing" || eff.status === "break" || eff.status === "stopwatch"} />
                  <div className="flex-1 min-w-0">
                    {editingNicknameFor === otherId ? (
                      <NicknameEditBox otherId={otherId} value={nicknameInput} onChange={setNicknameInput} onSave={saveNickname} placeholder={p.display_name || p.username} />
                    ) : (
                      <button
                        onClick={() => {
                          setEditingNicknameFor(otherId);
                          setNicknameInput(nicknames[otherId] || "");
                        }}
                        className="text-left"
                      >
                        <p className="text-sm text-[var(--text-primary)] truncate">
                          {nicknames[otherId] || p.display_name || p.username}
                          <Pencil size={10} className="inline ml-1.5 mb-0.5 opacity-50" />
                        </p>
                      </button>
                    )}
                    <div className="flex items-center gap-1.5">
                      <span className={"h-1.5 w-1.5 rounded-full shrink-0 " + eff.dot} />
                      <p className="text-xs text-[var(--text-muted)] truncate">{eff.label}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setInspecting(p)}
                    className="text-xs font-medium text-[var(--accent-text)] border border-[rgb(var(--accent-rgb)/0.4)] hover:bg-[rgb(var(--accent-rgb)/0.12)] transition-colors px-3 py-1.5 rounded-lg"
                  >
                    Inspect
                  </button>
                  <button
                    onClick={() => removeRelationship(r)}
                    className="text-xs font-medium text-[var(--text-muted)] border border-[var(--border)] hover:border-red-400/50 hover:text-red-400 hover:bg-red-500/10 transition-colors px-3 py-1.5 rounded-lg"
                  >
                    Remove
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </GlowCard>
    </div>
  );
}

// Dummy starter set — real detection logic wired to data that already
// exists (streak, level, tasks, focus hours), so these genuinely unlock
// rather than being pure mockups. More can be added to this list later.
// 10 XP per focused minute is the base leveling currency; achievements add
// bonus XP on top of that when unlocked.
const ACHIEVEMENTS = [
  { key: "streak_7", category: "streak", title: "Good Consistent", description: "Study 7 days in a row", icon: "🔥", xp: 5250, check: (ctx) => ctx.streak >= 7, progress: (ctx) => ({ current: ctx.streak, target: 7 }) },
  { key: "streak_15", category: "streak", title: "Steady Momentum", description: "Study 15 days in a row", icon: "🔥", xp: 10500, check: (ctx) => ctx.streak >= 15, progress: (ctx) => ({ current: ctx.streak, target: 15 }) },
  { key: "streak_30", category: "streak", title: "Unbreakable Habit", description: "Study 30 days in a row", icon: "🔥", xp: 28000, check: (ctx) => ctx.streak >= 30, progress: (ctx) => ({ current: ctx.streak, target: 30 }) },
  { key: "streak_60", category: "streak", title: "Iron Routine", description: "Study 60 days in a row", icon: "🔥", xp: 52500, check: (ctx) => ctx.streak >= 60, progress: (ctx) => ({ current: ctx.streak, target: 60 }) },
  { key: "streak_100", category: "streak", title: "Centurion Focus", description: "Study 100 days in a row", icon: "🔥", xp: 87500, check: (ctx) => ctx.streak >= 100, progress: (ctx) => ({ current: ctx.streak, target: 100 }) },
  { key: "streak_200", category: "streak", title: "Relentless Grind", description: "Study 200 days in a row", icon: "🔥", xp: 175000, check: (ctx) => ctx.streak >= 200, progress: (ctx) => ({ current: ctx.streak, target: 200 }) },

  { key: "level_10", category: "level", title: "Level 10", description: "Reach level 10", icon: "🏆", xp: 5250, check: (ctx) => ctx.level >= 10, progress: (ctx) => ({ current: ctx.level, target: 10 }) },
  { key: "level_25", category: "level", title: "Level 25", description: "Reach level 25", icon: "🏆", xp: 10500, check: (ctx) => ctx.level >= 25, progress: (ctx) => ({ current: ctx.level, target: 25 }) },
  { key: "level_50", category: "level", title: "Level 50", description: "Reach level 50", icon: "👑", xp: 21000, check: (ctx) => ctx.level >= 50, progress: (ctx) => ({ current: ctx.level, target: 50 }) },
  { key: "level_75", category: "level", title: "Level 75", description: "Reach level 75", icon: "👑", xp: 35000, check: (ctx) => ctx.level >= 75, progress: (ctx) => ({ current: ctx.level, target: 75 }) },
  { key: "level_100", category: "level", title: "Level 100", description: "Reach level 100", icon: "👑", xp: 56000, check: (ctx) => ctx.level >= 100, progress: (ctx) => ({ current: ctx.level, target: 100 }) },
  { key: "level_150", category: "level", title: "Level 150", description: "Reach level 150", icon: "💎", xp: 87500, check: (ctx) => ctx.level >= 150, progress: (ctx) => ({ current: ctx.level, target: 150 }) },
  { key: "level_199", category: "level", title: "Level 199", description: "Reach level 199 — one step from the top", icon: "💎", xp: 140000, check: (ctx) => ctx.level >= 199, progress: (ctx) => ({ current: ctx.level, target: 199 }) },
  { key: "level_200", category: "level", title: "Ascended", description: "Reach level 200 — the very top", icon: "👑", xp: 700000, check: (ctx) => ctx.level >= 200, progress: (ctx) => ({ current: ctx.level, target: 200 }) },

  { key: "tasks_10", category: "tasks", title: "10 Tasks Completed", description: "Complete 10 tasks", icon: "📚", xp: 3500, check: (ctx) => ctx.tasksCompleted >= 10, progress: (ctx) => ({ current: ctx.tasksCompleted, target: 10 }) },
  { key: "tasks_50", category: "tasks", title: "50 Tasks Completed", description: "Complete 50 tasks", icon: "📚", xp: 8750, check: (ctx) => ctx.tasksCompleted >= 50, progress: (ctx) => ({ current: ctx.tasksCompleted, target: 50 }) },
  { key: "tasks_100", category: "tasks", title: "100 Tasks Completed", description: "Complete 100 tasks", icon: "📚", xp: 17500, check: (ctx) => ctx.tasksCompleted >= 100, progress: (ctx) => ({ current: ctx.tasksCompleted, target: 100 }) },
  { key: "tasks_250", category: "tasks", title: "250 Tasks Completed", description: "Complete 250 tasks", icon: "📚", xp: 35000, check: (ctx) => ctx.tasksCompleted >= 250, progress: (ctx) => ({ current: ctx.tasksCompleted, target: 250 }) },
  { key: "tasks_500", category: "tasks", title: "500 Tasks Completed", description: "Complete 500 tasks", icon: "📚", xp: 70000, check: (ctx) => ctx.tasksCompleted >= 500, progress: (ctx) => ({ current: ctx.tasksCompleted, target: 500 }) },
  { key: "tasks_1000", category: "tasks", title: "1000 Tasks Completed", description: "Complete 1,000 tasks", icon: "📚", xp: 140000, check: (ctx) => ctx.tasksCompleted >= 1000, progress: (ctx) => ({ current: ctx.tasksCompleted, target: 1000 }) },

  { key: "focus_10h", category: "focus", title: "10 Hour Focus", description: "Accumulate 10 hours of focused time", icon: "⏱️", xp: 7000, check: (ctx) => ctx.totalMinutes >= 600, progress: (ctx) => ({ current: Math.floor(ctx.totalMinutes / 60), target: 10 }) },
  { key: "focus_60h", category: "focus", title: "60 Hour Focus", description: "Accumulate 60 hours of focused time", icon: "⏱️", xp: 21000, check: (ctx) => ctx.totalMinutes >= 3600, progress: (ctx) => ({ current: Math.floor(ctx.totalMinutes / 60), target: 60 }) },
  { key: "focus_180h", category: "focus", title: "180 Hour Focus", description: "Accumulate 180 hours of focused time", icon: "⏱️", xp: 52500, check: (ctx) => ctx.totalMinutes >= 10800, progress: (ctx) => ({ current: Math.floor(ctx.totalMinutes / 60), target: 180 }) },
  { key: "focus_260h", category: "focus", title: "260 Hour Focus", description: "Accumulate 260 hours of focused time", icon: "⏱️", xp: 77000, check: (ctx) => ctx.totalMinutes >= 15600, progress: (ctx) => ({ current: Math.floor(ctx.totalMinutes / 60), target: 260 }) },
  { key: "focus_550h", category: "focus", title: "550 Hour Focus", description: "Accumulate 550 hours of focused time", icon: "⏱️", xp: 157500, check: (ctx) => ctx.totalMinutes >= 33000, progress: (ctx) => ({ current: Math.floor(ctx.totalMinutes / 60), target: 550 }) },
  { key: "focus_720h", category: "focus", title: "720 Hour Focus", description: "Accumulate 720 hours of focused time", icon: "⏱️", xp: 210000, check: (ctx) => ctx.totalMinutes >= 43200, progress: (ctx) => ({ current: Math.floor(ctx.totalMinutes / 60), target: 720 }) },
  { key: "focus_1000h", category: "focus", title: "1000 Hour Focus", description: "Accumulate 1,000 hours of focused time", icon: "⏱️", xp: 297500, check: (ctx) => ctx.totalMinutes >= 60000, progress: (ctx) => ({ current: Math.floor(ctx.totalMinutes / 60), target: 1000 }) },

  { key: "friends_5", category: "friends", title: "5 Friends", description: "Add 5 friends", icon: "🤝", xp: 4200, check: (ctx) => ctx.friendCount >= 5, progress: (ctx) => ({ current: ctx.friendCount, target: 5 }) },
  { key: "friends_10", category: "friends", title: "10 Friends", description: "Add 10 friends", icon: "🤝", xp: 8750, check: (ctx) => ctx.friendCount >= 10, progress: (ctx) => ({ current: ctx.friendCount, target: 10 }) },
  { key: "friends_15", category: "friends", title: "15 Friends", description: "Add 15 friends", icon: "🤝", xp: 14000, check: (ctx) => ctx.friendCount >= 15, progress: (ctx) => ({ current: ctx.friendCount, target: 15 }) },
  { key: "friends_20", category: "friends", title: "20 Friends", description: "Add 20 friends", icon: "🤝", xp: 21000, check: (ctx) => ctx.friendCount >= 20, progress: (ctx) => ({ current: ctx.friendCount, target: 20 }) },

  { key: "share_1", category: "share", title: "First Share", description: "Share Lytning Focus for the first time", icon: "📤", xp: 700, check: (ctx) => ctx.shareCount >= 1, progress: (ctx) => ({ current: ctx.shareCount, target: 1 }) },
  { key: "share_10", category: "share", title: "10 Shares", description: "Share Lytning Focus 10 times", icon: "📤", xp: 2800, check: (ctx) => ctx.shareCount >= 10, progress: (ctx) => ({ current: ctx.shareCount, target: 10 }) },
  { key: "share_15", category: "share", title: "15 Shares", description: "Share Lytning Focus 15 times", icon: "📤", xp: 4900, check: (ctx) => ctx.shareCount >= 15, progress: (ctx) => ({ current: ctx.shareCount, target: 15 }) },
  { key: "share_20", category: "share", title: "20 Shares", description: "Share Lytning Focus 20 times", icon: "📤", xp: 7700, check: (ctx) => ctx.shareCount >= 20, progress: (ctx) => ({ current: ctx.shareCount, target: 20 }) },
  { key: "share_25", category: "share", title: "25 Shares", description: "Share Lytning Focus 25 times", icon: "📤", xp: 11200, check: (ctx) => ctx.shareCount >= 25, progress: (ctx) => ({ current: ctx.shareCount, target: 25 }) },
  { key: "share_30", category: "share", title: "30 Shares", description: "Share Lytning Focus 30 times", icon: "📤", xp: 15750, check: (ctx) => ctx.shareCount >= 30, progress: (ctx) => ({ current: ctx.shareCount, target: 30 }) },

  { key: "veteran_1", category: "veteran", title: "Day One", description: "Be a member of the same group for 1 day", icon: "🎖️", xp: 350, check: (ctx) => ctx.longestGroupMembershipDays >= 1, progress: (ctx) => ({ current: ctx.longestGroupMembershipDays, target: 1 }) },
  { key: "veteran_7", category: "veteran", title: "1 Week Strong", description: "Stay in the same group for 7 days straight", icon: "🎖️", xp: 1750, check: (ctx) => ctx.longestGroupMembershipDays >= 7, progress: (ctx) => ({ current: ctx.longestGroupMembershipDays, target: 7 }) },
  { key: "veteran_25", category: "veteran", title: "25 Day Veteran", description: "Stay in the same group for 25 days straight", icon: "🎖️", xp: 5250, check: (ctx) => ctx.longestGroupMembershipDays >= 25, progress: (ctx) => ({ current: ctx.longestGroupMembershipDays, target: 25 }) },
  { key: "veteran_32", category: "veteran", title: "32 Day Veteran", description: "Stay in the same group for 32 days straight", icon: "🎖️", xp: 7000, check: (ctx) => ctx.longestGroupMembershipDays >= 32, progress: (ctx) => ({ current: ctx.longestGroupMembershipDays, target: 32 }) },
  { key: "veteran_56", category: "veteran", title: "56 Day Veteran", description: "Stay in the same group for 56 days straight", icon: "🎖️", xp: 11200, check: (ctx) => ctx.longestGroupMembershipDays >= 56, progress: (ctx) => ({ current: ctx.longestGroupMembershipDays, target: 56 }) },
  { key: "veteran_67", category: "veteran", title: "67 Day Veteran", description: "Stay in the same group for 67 days straight", icon: "🎖️", xp: 14700, check: (ctx) => ctx.longestGroupMembershipDays >= 67, progress: (ctx) => ({ current: ctx.longestGroupMembershipDays, target: 67 }) },
  { key: "veteran_79", category: "veteran", title: "79 Day Veteran", description: "Stay in the same group for 79 days straight", icon: "🎖️", xp: 18200, check: (ctx) => ctx.longestGroupMembershipDays >= 79, progress: (ctx) => ({ current: ctx.longestGroupMembershipDays, target: 79 }) },
  { key: "veteran_90", category: "veteran", title: "90 Day Veteran", description: "Stay in the same group for 90 days straight", icon: "🎖️", xp: 22750, check: (ctx) => ctx.longestGroupMembershipDays >= 90, progress: (ctx) => ({ current: ctx.longestGroupMembershipDays, target: 90 }) },

  { key: "top200_day", category: "leaderboard", title: "Top 200 Today", description: "Rank in the top 200 on today's leaderboard", icon: "📊", xp: 2800, check: (ctx) => ctx.dayRank !== null && ctx.dayRank <= 200, progress: null },
  { key: "top200_week", category: "leaderboard", title: "Top 200 This Week", description: "Rank in the top 200 on this week's leaderboard", icon: "📊", xp: 8750, check: (ctx) => ctx.weekRank !== null && ctx.weekRank <= 200, progress: null },
  { key: "top200_month", category: "leaderboard", title: "Top 200 This Month", description: "Rank in the top 200 on this month's leaderboard — hard to sustain a whole month", icon: "📊", xp: 21000, check: (ctx) => ctx.monthRank !== null && ctx.monthRank <= 200, progress: null },

  { key: "premium_activated", category: "premium", title: "Premium Member", description: "Activate any Premium plan at least once — Basic, Pro, or Lifetime", icon: "👑", xp: 35000, check: (ctx) => ctx.everBeenPremium === true, progress: null },

  {
    key: "completion_1",
    category: "completion",
    title: "First Full Session",
    description: "Run a Focus Timer or Pomodoro session to 100% completion",
    icon: "✅",
    xp: 700,
    check: (ctx) => ctx.fullCompletionCount >= 1,
    progress: (ctx) => ({ current: ctx.fullCompletionCount, target: 1 }),
  },
  {
    key: "completion_10",
    category: "completion",
    title: "10 Full Sessions",
    description: "Complete 10 sessions to 100% without saving early",
    icon: "✅",
    xp: 2800,
    check: (ctx) => ctx.fullCompletionCount >= 10,
    progress: (ctx) => ({ current: ctx.fullCompletionCount, target: 10 }),
  },
  {
    key: "completion_50",
    category: "completion",
    title: "50 Full Sessions",
    description: "Complete 50 sessions to 100% without saving early",
    icon: "✅",
    xp: 10500,
    check: (ctx) => ctx.fullCompletionCount >= 50,
    progress: (ctx) => ({ current: ctx.fullCompletionCount, target: 50 }),
  },
  {
    key: "completion_100",
    category: "completion",
    title: "100 Full Sessions",
    description: "Complete 100 sessions to 100% without saving early",
    icon: "✅",
    xp: 21000,
    check: (ctx) => ctx.fullCompletionCount >= 100,
    progress: (ctx) => ({ current: ctx.fullCompletionCount, target: 100 }),
  },
  {
    key: "completion_200",
    category: "completion",
    title: "200 Full Sessions",
    description: "Complete 200 sessions to 100% without saving early",
    icon: "✅",
    xp: 42000,
    check: (ctx) => ctx.fullCompletionCount >= 200,
    progress: (ctx) => ({ current: ctx.fullCompletionCount, target: 200 }),
  },
  {
    key: "completion_300",
    category: "completion",
    title: "300 Full Sessions",
    description: "Complete 300 sessions to 100% without saving early",
    icon: "✅",
    xp: 70000,
    check: (ctx) => ctx.fullCompletionCount >= 300,
    progress: (ctx) => ({ current: ctx.fullCompletionCount, target: 300 }),
  },
  {
    key: "completion_400",
    category: "completion",
    title: "400 Full Sessions",
    description: "Complete 400 sessions to 100% without saving early",
    icon: "✅",
    xp: 105000,
    check: (ctx) => ctx.fullCompletionCount >= 400,
    progress: (ctx) => ({ current: ctx.fullCompletionCount, target: 400 }),
  },
  {
    key: "completion_500",
    category: "completion",
    title: "500 Full Sessions",
    description: "Complete 500 sessions to 100% without saving early",
    icon: "✅",
    xp: 157500,
    check: (ctx) => ctx.fullCompletionCount >= 500,
    progress: (ctx) => ({ current: ctx.fullCompletionCount, target: 500 }),
  },

  {
    key: "group_contrib_2h",
    category: "group",
    title: "Group Contributor",
    description: "Contribute 2 hours to a single group",
    icon: "👥",
    xp: 3500,
    check: (ctx) => ctx.maxGroupContribMinutes >= 120,
    progress: (ctx) => ({ current: Math.floor(ctx.maxGroupContribMinutes / 60), target: 2 }),
  },
  {
    key: "group_contrib_5h",
    category: "group",
    title: "Team Player",
    description: "Contribute 5 hours to a single group",
    icon: "👥",
    xp: 8750,
    check: (ctx) => ctx.maxGroupContribMinutes >= 300,
    progress: (ctx) => ({ current: Math.floor(ctx.maxGroupContribMinutes / 60), target: 5 }),
  },
  {
    key: "group_contrib_10h",
    category: "group",
    title: "Dedicated Member",
    description: "Contribute 10 hours to a single group",
    icon: "👥",
    xp: 17500,
    check: (ctx) => ctx.maxGroupContribMinutes >= 600,
    progress: (ctx) => ({ current: Math.floor(ctx.maxGroupContribMinutes / 60), target: 10 }),
  },
  {
    key: "group_contrib_25h",
    category: "group",
    title: "Group Pillar",
    description: "Contribute 25 hours to a single group",
    icon: "👥",
    xp: 42000,
    check: (ctx) => ctx.maxGroupContribMinutes >= 1500,
    progress: (ctx) => ({ current: Math.floor(ctx.maxGroupContribMinutes / 60), target: 25 }),
  },
  {
    key: "group_contrib_50h",
    category: "group",
    title: "Backbone of the Group",
    description: "Contribute 50 hours to a single group",
    icon: "👥",
    xp: 87500,
    check: (ctx) => ctx.maxGroupContribMinutes >= 3000,
    progress: (ctx) => ({ current: Math.floor(ctx.maxGroupContribMinutes / 60), target: 50 }),
  },

  // Impossible tier — deliberately absurd targets, its own separate section
  // in the UI, not just another category mixed into the normal grid.
  {
    key: "streak_365",
    category: "impossible",
    title: "Impossible Discipline",
    description: "Study 365 days in a row without missing one",
    icon: "🔥",
    xp: 15000000,
    check: (ctx) => ctx.streak >= 365,
    progress: (ctx) => ({ current: ctx.streak, target: 365 }),
  },
  {
    key: "focus_10000h",
    category: "impossible",
    title: "Impossible Focus",
    description: "Accumulate 10,000 hours of focused time",
    icon: "⏱️",
    xp: 15000000,
    check: (ctx) => ctx.totalMinutes >= 600000,
    progress: (ctx) => ({ current: Math.floor(ctx.totalMinutes / 60), target: 10000 }),
  },
  {
    key: "tasks_10000",
    category: "impossible",
    title: "Impossible Grind",
    description: "Complete 10,000 tasks",
    icon: "📚",
    xp: 15000000,
    check: (ctx) => ctx.tasksCompleted >= 10000,
    progress: (ctx) => ({ current: ctx.tasksCompleted, target: 10000 }),
  },
  {
    key: "group_contrib_8000h",
    category: "impossible",
    title: "Impossible Contribution",
    description: "Contribute 8,000 hours to a single group",
    icon: "👥",
    xp: 15000000,
    check: (ctx) => ctx.maxGroupContribMinutes >= 480000,
    progress: (ctx) => ({ current: Math.floor(ctx.maxGroupContribMinutes / 60), target: 8000 }),
  },
  {
    key: "completion_999",
    category: "impossible",
    title: "Impossible Precision",
    description: "Complete 3,000 sessions to 100% without ever saving early",
    icon: "✅",
    xp: 15000000,
    check: (ctx) => ctx.fullCompletionCount >= 3000,
    progress: (ctx) => ({ current: ctx.fullCompletionCount, target: 3000 }),
  },
  {
    key: "impossible_all",
    category: "impossible",
    title: "Beyond Impossible",
    description: "Complete every other Impossible achievement",
    icon: "🏅",
    xp: 1750000,
    check: (ctx) =>
      ["streak_365", "focus_10000h", "tasks_10000", "group_contrib_8000h", "completion_999"].every((k) => ctx.earnedKeys && ctx.earnedKeys.has(k)),
    progress: (ctx) => ({
      current: ["streak_365", "focus_10000h", "tasks_10000", "group_contrib_8000h", "completion_999"].filter((k) => ctx.earnedKeys && ctx.earnedKeys.has(k)).length,
      target: 5,
    }),
  },
];

// The secret achievement lives in its own list, rendered as its own section
// below Impossible — not mixed into it, and not the same entry as "Beyond
// Impossible" above. Its CARD is always visible (so people know a secret
// challenge exists and what the reward is), but `secret: true` keeps the
// actual requirement — and any progress toward it — hidden until earned.
const SECRET_ACHIEVEMENTS = [
  {
    key: "secret_lifetime_premium",
    category: "secret",
    secret: true,
    title: "Secret Level",
    description: "A hidden challenge — no hints. Reward: Lifetime Premium.",
    revealedDescription: "You reached Level 500 — The Beyond.",
    icon: "🔒",
    xp: 0,
    specialReward: "Lifetime Premium",
    check: (ctx) => (ctx.level || 0) >= 500,
    progress: null,
  },
];
ACHIEVEMENTS.push(...SECRET_ACHIEVEMENTS);

const ACHIEVEMENT_SECTIONS = [
  { key: "streak", label: "Focus Days Streak" },
  { key: "level", label: "Level" },
  { key: "tasks", label: "Tasks" },
  { key: "focus", label: "Focus Timer" },
  { key: "completion", label: "Full Completions" },
  { key: "friends", label: "Friends" },
  { key: "share", label: "Share" },
  { key: "veteran", label: "Group Veteran" },
  { key: "leaderboard", label: "Leaderboard" },
  { key: "group", label: "Group Contribution" },
  { key: "premium", label: "Premium" },
];

// 1 focused minute = 10 XP. Achievement XP adds directly on top, converted
function AchievementsTab({ refreshKey, onLevelUp }) {
  const [sessions, setSessions] = useState([]);
  const [tasksCompleted, setTasksCompleted] = useState(0);
  const [earned, setEarned] = useState({}); // key -> user_achievements row
  const [loading, setLoading] = useState(true);
  const [ctx, setCtx] = useState(null);
  const [claimingKey, setClaimingKey] = useState(null);
  const [floatingXP, setFloatingXP] = useState(null); // { key, xp }
  const [xpToastMessage, setXpToastMessage] = useState("");
  const [xpToastKey, setXpToastKey] = useState(0);

  useEffect(() => {
    loadAndCheck();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  async function loadAndCheck() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    const [sessionsRes, statsRes, earnedRes, friendsRes, groupContribRes, fullCompletionRes, shareRes, veteranRes, dayRankRes, weekRankRes, monthRankRes, premiumRes, tierRes, cappedFocusXPRes] =
      await Promise.all([
        supabase.from("study_sessions").select("focused_seconds, completed_at"),
        supabase.from("user_task_stats").select("lifetime_tasks_completed, lifetime_task_xp, lifetime_group_xp").eq("user_id", user.id).maybeSingle(),
        supabase.from("user_achievements").select("*").eq("user_id", user.id),
        supabase.from("friend_requests").select("id", { count: "exact", head: true }).eq("status", "accepted").or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`),
        supabase.rpc("get_my_max_group_contribution_minutes"),
        supabase.rpc("get_my_full_completion_count"),
        supabase.rpc("get_my_share_count"),
        supabase.rpc("get_my_longest_group_membership_days"),
        supabase.rpc("get_my_leaderboard_rank", { p_period: "day" }),
        supabase.rpc("get_my_leaderboard_rank", { p_period: "week" }),
        supabase.rpc("get_my_leaderboard_rank", { p_period: "month" }),
        supabase.rpc("get_my_ever_been_premium"),
        supabase.from("profiles").select("premium_tier").eq("user_id", user.id).maybeSingle(),
        supabase.rpc("get_my_capped_focus_xp"),
      ]);

    const sess = sessionsRes.data || [];
    const tasksDone = statsRes.data?.lifetime_tasks_completed || 0;
    const taskXP = statsRes.data?.lifetime_task_xp || 0;
    const groupXP = statsRes.data?.lifetime_group_xp || 0;
    setSessions(sess);
    setTasksCompleted(tasksDone);

    const earnedMap = {};
    (earnedRes.data || []).forEach((r) => {
      earnedMap[r.achievement_key] = r;
    });

    const stats = computeStudyStats(sess);
    const totalMinutes = Math.floor(stats.totalSeconds / 60);
    const cappedFocusXP = cappedFocusXPRes.data || 0;
    const level = computeGrowth(cappedFocusXP + taskXP + groupXP + totalXPFromMap(earnedMap)).current.level;
    const friendCount = friendsRes.count || 0;
    const maxGroupContribMinutes = groupContribRes.data || 0;
    const fullCompletionCount = fullCompletionRes.data || 0;
    const shareCount = shareRes.data || 0;
    const longestGroupMembershipDays = veteranRes.data || 0;
    const dayRank = dayRankRes.data ?? null;
    const weekRank = weekRankRes.data ?? null;
    const monthRank = monthRankRes.data ?? null;
    const everBeenPremium = premiumRes.data || false;
    const earnedKeys = new Set(Object.keys(earnedMap));
    setCtx({
      streak: stats.streak,
      level,
      tasksCompleted: tasksDone,
      taskXP,
      groupXP,
      totalMinutes,
      cappedFocusXP,
      totalXPRaw: cappedFocusXP + taskXP + groupXP + totalXPFromMap(earnedMap),
      friendCount,
      maxGroupContribMinutes,
      fullCompletionCount,
      shareCount,
      longestGroupMembershipDays,
      dayRank,
      weekRank,
      monthRank,
      everBeenPremium,
      earnedKeys,
    });

    setEarned(earnedMap);
    setLoading(false);
  }

  function totalXPFromMap(map) {
    return Object.values(map).reduce((sum, r) => sum + (r.xp_awarded || 0), 0);
  }

  // Meeting the condition no longer auto-awards XP — it just makes the
  // achievement claimable. The person has to actually tap it to collect.
  async function claimAchievement(a) {
    if (claimingKey) return; // guard against double-clicks mid-claim
    setClaimingKey(a.key);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setClaimingKey(null);
      return;
    }

    const beforeXP = totalXPFromMap(earned);
    const taskXP = ctx?.taskXP || 0;
    const groupXP = ctx?.groupXP || 0;
    const cappedFocusXP = ctx?.cappedFocusXP || 0;
    const beforeLevel = computeGrowth(cappedFocusXP + taskXP + groupXP + beforeXP).current;

    const { data, error } = await supabase
      .from("user_achievements")
      .insert({ user_id: user.id, achievement_key: a.key, xp_awarded: a.xp })
      .select()
      .single();

    setClaimingKey(null);
    if (error) {
      console.error("Failed to claim achievement:", error);
      return;
    }

    const newEarned = { ...earned, [a.key]: data };
    setEarned(newEarned);

    if (a.specialReward) {
      // Not an XP reward — actually grant the real thing (permanent premium
      // access), not just record a claim. Uses the same premium_tier column
      // the tiered-focus-cap system already reads from.
      const { error: premiumErr } = await supabase.from("profiles").update({ premium_tier: "premium" }).eq("user_id", user.id);
      if (premiumErr) console.error("Failed to grant lifetime premium:", premiumErr);
      setXpToastMessage(`${a.title} unlocked — ${a.specialReward} granted!`);
      setXpToastKey((k) => k + 1);
      return; // no XP/level math for a non-XP reward
    }

    // Floating "+XP" animation right on the card that was claimed.
    setFloatingXP({ key: a.key, xp: a.xp });
    setTimeout(() => setFloatingXP(null), 1200);

    setXpToastMessage(`Achievement unlocked — +${a.xp} XP`);
    setXpToastKey((k) => k + 1);

    // If this claim actually crosses a level threshold, celebrate it with
    // the same level-up modal used for timer sessions — real tie-in to Growth.
    const afterXP = totalXPFromMap(newEarned);
    const afterLevel = computeGrowth(cappedFocusXP + taskXP + groupXP + afterXP).current;
    if (afterLevel.level > beforeLevel.level && onLevelUp) {
      onLevelUp({ from: beforeLevel, to: afterLevel });
    }
  }

  const earnedCount = Object.keys(earned).length;
  const totalXPEarned = totalXPFromMap(earned);

  // Sort within a group: claimed first, then ready-to-claim, then
  // still locked/in-progress — original order preserved within each rank.
  function sortGroup(list) {
    if (!ctx) return list;
    return [...list].sort((a, b) => {
      const rank = (x) => (earned[x.key] ? 0 : x.check(ctx) ? 1 : 2);
      return rank(a) - rank(b);
    });
  }

  function renderCard(a) {
    const isEarned = !!earned[a.key];
    const isClaimable = !isEarned && ctx && a.check(ctx);
    const prog = !isEarned && !isClaimable && ctx && a.progress ? a.progress(ctx) : null;
    const pct = prog ? Math.max(0, Math.min(100, Math.round((prog.current / prog.target) * 100))) : null;
    const isClaiming = claimingKey === a.key;
    const showFloat = floatingXP && floatingXP.key === a.key;

    const cardInner = (
      <div className="flex items-start gap-3">
        <div
          className={
            "h-11 w-11 rounded-xl flex items-center justify-center text-xl shrink-0 " +
            (isEarned ? "bg-[rgb(var(--accent-rgb)/0.2)]" : isClaimable ? "bg-[var(--accent)]" : "bg-[var(--surface-2)]")
          }
        >
          {isEarned || isClaimable ? a.icon : <Lock size={16} className="text-[var(--text-faint)]" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[var(--text-primary)]">{a.title}</p>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">{isEarned && a.revealedDescription ? a.revealedDescription : a.description}</p>
          <p
            className={
              "text-xs font-medium mt-1.5 " +
              (isEarned ? "text-[var(--accent-text)]" : isClaimable ? "text-[var(--accent-text)] animate-pulse" : "text-[var(--text-faint)]")
            }
          >
            {a.specialReward
              ? isEarned
                ? `✓ Earned · ${a.specialReward}`
                : isClaimable
                ? isClaiming
                  ? "Claiming..."
                  : `Tap to claim — ${a.specialReward}`
                : a.specialReward
              : isEarned
              ? `✓ Earned · +${a.xp} XP`
              : isClaimable
              ? isClaiming
                ? "Claiming..."
                : `Tap to claim +${a.xp} XP`
              : `+${a.xp} XP`}
          </p>
          {prog && (
            <div className="mt-2">
              <div className="h-1.5 rounded-full bg-[var(--surface-2)] overflow-hidden">
                <div className="h-full rounded-full bg-[var(--accent)] transition-all duration-500" style={{ width: `${pct}%` }} />
              </div>
              <p className="text-[10px] text-[var(--text-faint)] mt-1">
                {prog.current.toLocaleString()} / {prog.target.toLocaleString()} ({pct}%)
              </p>
            </div>
          )}
        </div>
      </div>
    );

    if (isClaimable) {
      return (
        <button
          key={a.key}
          onClick={() => claimAchievement(a)}
          disabled={isClaiming}
          className="relative text-left rounded-2xl bg-[var(--surface)] backdrop-blur-sm p-5 transition-all duration-150 hover:-translate-y-0.5 disabled:cursor-wait"
          style={{ border: `var(--card-border-width) solid rgb(var(--accent-rgb) / 0.5)`, boxShadow: "0 0 24px -8px rgb(var(--accent-rgb) / 0.5)" }}
        >
          {cardInner}
          {showFloat && (
            <span
              key={floatingXP.xp + "-" + Date.now()}
              className="absolute top-2 right-4 text-sm font-bold text-[var(--accent-text)] pointer-events-none"
              style={{ animation: "floatUpFade 1.2s ease-out forwards" }}
            >
              +{floatingXP.xp} XP
            </span>
          )}
        </button>
      );
    }

    return (
      <GlowCard key={a.key} className={isEarned ? "" : "opacity-80"}>
        {cardInner}
      </GlowCard>
    );
  }

  const impossibleAchievements = sortGroup(ACHIEVEMENTS.filter((a) => a.category === "impossible"));
  const secretAchievements = sortGroup(ACHIEVEMENTS.filter((a) => a.category === "secret"));

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-hover)] flex items-center justify-center glow-accent-30 shrink-0">
          <Trophy size={19} className="text-white" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">Achievements</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-0.5">
            {loading ? "…" : `${earnedCount} / ${ACHIEVEMENTS.length} unlocked · ${totalXPEarned.toLocaleString()} bonus XP earned`}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="py-16 flex flex-col items-center justify-center gap-3">
          <Loader2 size={22} className="text-[var(--accent-text)] animate-spin" />
          <p className="text-sm text-[var(--text-muted)]">Loading achievements...</p>
        </div>
      ) : (
        <>
          {ACHIEVEMENT_SECTIONS.map((section) => {
            const items = sortGroup(ACHIEVEMENTS.filter((a) => a.category === section.key));
            if (items.length === 0) return null;
            return (
              <div key={section.key}>
                <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-3">{section.label}</h2>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">{items.map((a) => renderCard(a))}</div>
              </div>
            );
          })}

          {/* Impossible achievements — a fully separate, visually distinct
              section, not just another category folded into the normal grid. */}
          {impossibleAchievements.length > 0 && (
            <div className="rounded-3xl p-5 bg-gradient-to-br from-red-950/30 via-[var(--surface)] to-amber-950/20" style={{ border: "1px solid rgb(248 113 113 / 0.25)" }}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">💀</span>
                <h2 className="text-sm font-bold text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-amber-400">Impossible Achievements</h2>
              </div>
              <p className="text-xs text-[var(--text-faint)] mb-4">Deliberately absurd targets. Almost no one will ever finish these.</p>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">{impossibleAchievements.map((a) => renderCard(a))}</div>
            </div>
          )}

          {/* Secret achievement(s) — its own section below Impossible, not
              merged into it. The card itself is always visible so people
              know a hidden challenge and its reward exist; only the actual
              requirement stays a mystery (no progress bar, vague description). */}
          {secretAchievements.length > 0 && (
            <div className="rounded-3xl p-5 bg-gradient-to-br from-violet-950/30 via-[var(--surface)] to-indigo-950/20" style={{ border: "1px solid rgb(167 139 250 / 0.25)" }}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">🔒</span>
                <h2 className="text-sm font-bold text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-indigo-400">Secret</h2>
              </div>
              <p className="text-xs text-[var(--text-faint)] mb-4">Something's hidden here. No hints on how to unlock it.</p>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">{secretAchievements.map((a) => renderCard(a))}</div>
            </div>
          )}
        </>
      )}

      <style>{`
        @keyframes floatUpFade {
          0% { transform: translateY(0); opacity: 1; }
          100% { transform: translateY(-28px); opacity: 0; }
        }
      `}</style>
      <SavedToast key={xpToastKey} message={xpToastMessage} />
    </div>
  );
}





// Real circular crop tool: drag to reposition, slider to zoom, and a visible
// circular guide showing exactly what will be kept vs cropped away. Exports
// the final circular crop as a PNG blob via canvas.
function AvatarCropModal({ file, onCancel, onSave }) {
  const [imageUrl, setImageUrl] = useState(null);
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 });
  const [displaySize, setDisplaySize] = useState({ w: 0, h: 0 });
  const [box, setBox] = useState({ x: 0, y: 0, size: 100 });
  const dragRef = useRef(null); // { mode, startX, startY, startBox }
  const [saving, setSaving] = useState(false);

  const MAX_DISPLAY = 300;
  const MIN_BOX = 40;
  const HANDLE = 14;
  const OUTPUT_SIZE = 320;

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const clampBox = (b, dW = displaySize.w, dH = displaySize.h) => {
    let { x, y, size } = b;
    size = Math.max(MIN_BOX, Math.min(size, Math.min(dW, dH)));
    x = Math.max(0, Math.min(x, dW - size));
    y = Math.max(0, Math.min(y, dH - size));
    return { x, y, size };
  };

  const handleImgLoad = (e) => {
    const { naturalWidth, naturalHeight } = e.target;
    const scale = Math.min(MAX_DISPLAY / naturalWidth, MAX_DISPLAY / naturalHeight, 1);
    const dW = naturalWidth * scale;
    const dH = naturalHeight * scale;
    setNaturalSize({ w: naturalWidth, h: naturalHeight });
    setDisplaySize({ w: dW, h: dH });
    const boxSize = Math.min(dW, dH) * 0.75;
    setBox(clampBox({ x: (dW - boxSize) / 2, y: (dH - boxSize) / 2, size: boxSize }, dW, dH));
  };

  const startDrag = (mode) => (e) => {
    e.stopPropagation();
    e.preventDefault();
    const point = e.touches ? e.touches[0] : e;
    dragRef.current = { mode, startX: point.clientX, startY: point.clientY, startBox: { ...box } };
  };

  const onMove = (e) => {
    if (!dragRef.current) return;
    const point = e.touches ? e.touches[0] : e;
    const dx = point.clientX - dragRef.current.startX;
    const dy = point.clientY - dragRef.current.startY;
    const { mode, startBox } = dragRef.current;

    if (mode === "move") {
      setBox(clampBox({ x: startBox.x + dx, y: startBox.y + dy, size: startBox.size }));
      return;
    }

    // Corner resize — the opposite corner stays anchored in place.
    let next;
    if (mode === "br") {
      const d = Math.max(dx, dy);
      next = { x: startBox.x, y: startBox.y, size: startBox.size + d };
    } else if (mode === "tl") {
      const d = Math.max(-dx, -dy);
      next = { x: startBox.x - d, y: startBox.y - d, size: startBox.size + d };
    } else if (mode === "tr") {
      const d = Math.max(dx, -dy);
      next = { x: startBox.x, y: startBox.y - d, size: startBox.size + d };
    } else {
      const d = Math.max(-dx, dy);
      next = { x: startBox.x - d, y: startBox.y, size: startBox.size + d };
    }
    setBox(clampBox(next));
  };

  const onUp = () => {
    dragRef.current = null;
  };

  const handleSave = async () => {
    setSaving(true);
    const img = new window.Image();
    img.src = imageUrl;
    await new Promise((resolve) => {
      img.onload = resolve;
    });

    const scaleToNatural = naturalSize.w / displaySize.w;
    const sx = box.x * scaleToNatural;
    const sy = box.y * scaleToNatural;
    const sSize = box.size * scaleToNatural;

    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext("2d");
    ctx.beginPath();
    ctx.arc(OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(img, sx, sy, sSize, sSize, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

    canvas.toBlob(
      (blob) => {
        setSaving(false);
        onSave(blob);
      },
      "image/png",
      0.92
    );
  };

  const corners = ["tl", "tr", "bl", "br"];
  const cornerCursor = { tl: "nwse-resize", br: "nwse-resize", tr: "nesw-resize", bl: "nesw-resize" };

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-4" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
      <div onClick={(e) => e.stopPropagation()} className="relative bg-[var(--surface-solid)] border border-[var(--card-border)] rounded-3xl p-6 max-w-sm w-full">
        <p className="text-base font-semibold text-[var(--text-primary)] mb-1">Adjust your photo</p>
        <p className="text-xs text-[var(--text-muted)] mb-4">Drag a corner to resize the crop area, or drag inside the circle to move it.</p>

        <div
          className="relative mx-auto select-none touch-none overflow-hidden rounded-xl bg-black"
          style={{ width: displaySize.w || MAX_DISPLAY, height: displaySize.h || MAX_DISPLAY }}
          onMouseMove={onMove}
          onMouseUp={onUp}
          onMouseLeave={onUp}
          onTouchMove={onMove}
          onTouchEnd={onUp}
        >
          {imageUrl && <img src={imageUrl} onLoad={handleImgLoad} draggable={false} alt="" className="block w-full h-full object-contain" />}

          {displaySize.w > 0 && (
            <div
              onMouseDown={startDrag("move")}
              onTouchStart={startDrag("move")}
              className="absolute cursor-move"
              style={{ left: box.x, top: box.y, width: box.size, height: box.size }}
            >
              {/* Circular crop guide — everything outside is dimmed, showing exactly what will be kept */}
              <div className="absolute inset-0 rounded-full border-2 border-white pointer-events-none" style={{ boxShadow: "0 0 0 9999px rgba(0,0,0,0.6)" }} />

              {/* Draggable corner handles — resize the box */}
              {corners.map((corner) => (
                <div
                  key={corner}
                  onMouseDown={startDrag(corner)}
                  onTouchStart={startDrag(corner)}
                  className="absolute bg-white border-2 border-[var(--accent)] rounded-sm z-10"
                  style={{
                    width: HANDLE,
                    height: HANDLE,
                    cursor: cornerCursor[corner],
                    top: corner.includes("t") ? -HANDLE / 2 : undefined,
                    bottom: corner.includes("b") ? -HANDLE / 2 : undefined,
                    left: corner.includes("l") ? -HANDLE / 2 : undefined,
                    right: corner.includes("r") ? -HANDLE / 2 : undefined,
                  }}
                />
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-2 mt-5">
          <button onClick={handleSave} disabled={saving || !imageUrl} className="flex-1 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-xl transition-colors">
            {saving ? "Saving..." : "Save"}
          </button>
          <button onClick={onCancel} className="flex-1 bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-secondary-strong)] text-sm font-medium py-2.5 rounded-xl transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// Avatar picker — built-in gallery of illustrated avatars, or upload your own
// (which opens the crop tool above before saving).
function AvatarPickerModal({ onSelectBuiltin, onUploadCropped, onClose }) {
  const [cropFile, setCropFile] = useState(null);
  const [avatars, setAvatars] = useState(null); // null = still loading the asset chunk
  const fileInputRef = useRef(null);

  useEffect(() => {
    import("./characterAssets").then((mod) => setAvatars(mod.BUILTIN_AVATARS));
  }, []);

  const handleFileChange = (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert("That image is too large — please choose one under 5MB.");
        e.target.value = "";
        return;
      }
      setCropFile(file);
    }
    e.target.value = "";
  };

  if (cropFile) {
    return (
      <AvatarCropModal
        file={cropFile}
        onCancel={() => setCropFile(null)}
        onSave={(blob) => {
          setCropFile(null);
          onUploadCropped(blob);
        }}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div onClick={(e) => e.stopPropagation()} className="relative bg-[var(--surface-solid)] border border-[var(--card-border)] rounded-3xl p-6 max-w-sm w-full max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <p className="text-base font-semibold text-[var(--text-primary)]">Choose an avatar</p>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            <X size={18} />
          </button>
        </div>

        <button
          onClick={() => fileInputRef.current && fileInputRef.current.click()}
          className="w-full flex items-center justify-center gap-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium py-2.5 rounded-xl transition-colors mb-4"
        >
          <ImageIcon size={15} /> Upload from your device
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />

        <p className="text-xs text-[var(--text-muted)] mb-2">Or pick a built-in avatar</p>
        {!avatars ? (
          <div className="py-8 flex justify-center">
            <Loader2 size={18} className="text-[var(--accent-text)] animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {avatars.map((src, i) => (
              <button key={i} onClick={() => onSelectBuiltin(src)} className="rounded-full overflow-hidden border-2 border-transparent hover:border-[var(--accent)] transition-colors aspect-square">
                <img src={src} alt={`Avatar option ${i + 1}`} className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Looks up someone's exact position on the global leaderboard by scanning
// the same ranked rows the Leaderboard page itself uses — returns null if
// they're not in the top 200 (rather than a fake/estimated rank).
async function fetchGlobalRank(userId) {
  if (!userId) return null;
  const { data, error } = await supabase.rpc("get_leaderboard", { period: "lifetime", limit_count: 200 });
  if (error || !data) return null;
  const row = data.find((r) => r.user_id === userId);
  return row ? row.rank : null;
}

function Profile({ refreshKey, onProfileReady, goToAccountSettings }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState([]);
  const [tasksCompletedCount, setTasksCompletedCount] = useState(0);
  const [taskXP, setTaskXP] = useState(0);
  const [groupXP, setGroupXP] = useState(0);
  const [achievementCount, setAchievementCount] = useState(0);
  const [achievementXP, setAchievementXP] = useState(0);
  const [myAchievements, setMyAchievements] = useState([]);
  const [friendCount, setFriendCount] = useState(0);
  const [cappedFocusXP, setCappedFocusXP] = useState(0);
  const [globalRank, setGlobalRank] = useState(null);

  const [editing, setEditing] = useState(false);
  const [draftUsername, setDraftUsername] = useState("");
  const [draftDisplayName, setDraftDisplayName] = useState("");
  const [draftBio, setDraftBio] = useState("");
  const [usernameStatus, setUsernameStatus] = useState(null); // null | "checking" | "available" | "taken" | "invalid" | "current"
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [avatarSaving, setAvatarSaving] = useState(false);

  const selectBuiltinAvatar = async (src) => {
    setShowAvatarPicker(false);
    setAvatarSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setAvatarSaving(false);
      return;
    }
    const { error } = await supabase.from("profiles").update({ avatar_url: src }).eq("user_id", user.id);
    setAvatarSaving(false);
    if (error) {
      console.error("Failed to set avatar:", error);
      return;
    }
    setProfile((p) => (p ? { ...p, avatar_url: src } : p));
  };

  const uploadCustomAvatar = async (blob) => {
    setShowAvatarPicker(false);
    setAvatarSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setAvatarSaving(false);
      return;
    }
    const path = `${user.id}/avatar.png`;
    const { error: uploadError } = await supabase.storage.from("avatars").upload(path, blob, { upsert: true, contentType: "image/png" });
    if (uploadError) {
      console.error("Failed to upload avatar:", uploadError);
      setAvatarSaving(false);
      return;
    }
    const { data: publicUrlData } = supabase.storage.from("avatars").getPublicUrl(path);
    // Cache-bust so the new image shows immediately instead of a stale cached version.
    const freshUrl = `${publicUrlData.publicUrl}?t=${Date.now()}`;
    const { error: dbError } = await supabase.from("profiles").update({ avatar_url: freshUrl }).eq("user_id", user.id);
    setAvatarSaving(false);
    if (dbError) {
      console.error("Failed to save avatar URL:", dbError);
      return;
    }
    setProfile((p) => (p ? { ...p, avatar_url: freshUrl } : p));
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  async function loadAll() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    const [profileRes, sessionsRes, statsRes, achievementsRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("study_sessions").select("focused_seconds, completed_at"),
      supabase.from("user_task_stats").select("lifetime_tasks_completed, lifetime_task_xp, lifetime_group_xp").eq("user_id", user.id).maybeSingle(),
      supabase.from("user_achievements").select("achievement_key, xp_awarded").eq("user_id", user.id),
    ]);

    setProfile(profileRes.data || null);
    setSessions(sessionsRes.data || []);
    setTasksCompletedCount(statsRes.data?.lifetime_tasks_completed || 0);
    setTaskXP(statsRes.data?.lifetime_task_xp || 0);
    setGroupXP(statsRes.data?.lifetime_group_xp || 0);
    setAchievementCount((achievementsRes.data || []).length);
    setAchievementXP((achievementsRes.data || []).reduce((sum, r) => sum + (r.xp_awarded || 0), 0));
    supabase.rpc("get_my_capped_focus_xp").then(({ data }) => setCappedFocusXP(data || 0));
    setMyAchievements(achievementsRes.data || []);
    setLoading(false);
    fetchGlobalRank(user.id).then(setGlobalRank);
    supabase.rpc("get_my_friend_count").then(({ data }) => setFriendCount(data || 0));
  }

  // Live, debounced username availability check while editing.
  useEffect(() => {
    if (!editing || profile) return;
    if (!draftUsername) {
      setUsernameStatus(null);
      return;
    }
    if (!usernameValid(draftUsername)) {
      setUsernameStatus("invalid");
      return;
    }
    if (profile && draftUsername.toLowerCase() === profile.username.toLowerCase()) {
      setUsernameStatus("current");
      return;
    }
    setUsernameStatus("checking");
    const t = setTimeout(async () => {
      const { data } = await supabase.from("profiles").select("id").ilike("username", draftUsername).maybeSingle();
      setUsernameStatus(data ? "taken" : "available");
    }, 400);
    return () => clearTimeout(t);
  }, [draftUsername, editing, profile]);

  const startEditing = () => {
    setDraftUsername(profile?.username || "");
    setDraftDisplayName(profile?.display_name || "");
    setDraftBio(profile?.bio || "");
    setSaveError("");
    setEditing(true);
  };

  const saveProfile = async () => {
    if (!profile && (!usernameValid(draftUsername) || usernameStatus === "taken")) return;

    setSaving(true);
    setSaveError("");

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      return;
    }

    const payload = profile
      ? { display_name: draftDisplayName.trim(), bio: draftBio.trim().slice(0, 150) }
      : { user_id: user.id, username: draftUsername.toLowerCase(), display_name: draftDisplayName.trim(), bio: draftBio.trim().slice(0, 150) };

    const { data, error } = profile
      ? await supabase.from("profiles").update(payload).eq("user_id", user.id).select().single()
      : await supabase.from("profiles").insert(payload).select().single();

    setSaving(false);

    if (error) {
      // Postgres unique_violation — the DB-level safety net catching a race
      // condition the live check above might have missed by a few hundred ms.
      setSaveError(error.code === "23505" ? "That username was just taken — try another." : error.message || "Couldn't save your profile.");
      return;
    }

    setProfile(data);
    setEditing(false);
    if (!profile && onProfileReady) onProfileReady();
  };

  const stats = computeStudyStats(sessions);
  const longestStreak = computeLongestStreak(sessions);
  const totalXPEarned = cappedFocusXP + taskXP + groupXP + achievementXP; // capped daily focus + everything else
  const { current, pct } = computeGrowth(totalXPEarned);
  // Once someone has earned more XP than level 200 actually needs, that
  // extra effort still deserves to be visible — orange for the first
  // 1,000,000 XP past the cap, red beyond that as the top tier.
  const myLevel200Threshold = GROWTH_LEVELS[GROWTH_NORMAL_LEVEL_COUNT - 1].threshold; // 7,000,000
  const myIsAscended = totalXPEarned >= GROWTH_MAX_XP;
  const xpDisplayColor = myIsAscended
    ? "text-red-600 animate-pulse"
    : totalXPEarned >= myLevel200Threshold
    ? "text-orange-400"
    : "text-[var(--text-primary)]";

  if (loading) {
    return <p className="text-[var(--text-secondary)] text-sm">Loading profile...</p>;
  }

  if (!profile && !editing) {
    return (
      <div className="max-w-md mx-auto text-center py-16">
        <h1 className="text-xl font-semibold text-[var(--text-primary)] mb-2">Set up your profile</h1>
        <p className="text-sm text-[var(--text-secondary)] mb-6">Pick a username to get started.</p>
        <button onClick={startEditing} className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-medium px-6 py-3 rounded-xl transition-colors">
          Create profile
        </button>
      </div>
    );
  }

  if (editing) {
    return (
      <div className="max-w-md mx-auto space-y-4">
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">{profile ? "Edit profile" : "Set up your profile"}</h1>
        <GlowCard>
          {profile ? (
            <>
              <label className="text-[11px] text-[var(--text-muted)] block mb-1">Username</label>
              <div className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-secondary)] flex items-center justify-between">
                <span>@{profile.username}</span>
                <button onClick={goToAccountSettings} className="text-xs text-[var(--accent-text)] hover:brightness-110 underline underline-offset-2">
                  Change in Settings → Account
                </button>
              </div>
            </>
          ) : (
            <>
              <label className="text-[11px] text-[var(--text-muted)] block mb-1">
                Username <span className="text-[var(--accent-text)]">*</span>
              </label>
              <input
                value={draftUsername}
                onChange={(e) => setDraftUsername(e.target.value.toLowerCase().replace(/\s/g, ""))}
                maxLength={20}
                placeholder="e.g. xyz_123"
                className="w-full bg-[var(--input-bg)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)]"
              />
              <div className="mt-1.5 text-xs min-h-[16px]">
                {usernameStatus === "invalid" && <span className="text-red-400">3-20 characters: lowercase letters, numbers, underscore only.</span>}
                {usernameStatus === "checking" && <span className="text-[var(--text-muted)]">Checking availability...</span>}
                {usernameStatus === "available" && <span className="text-emerald-400">✓ Username available</span>}
                {usernameStatus === "taken" && <span className="text-red-400">✕ Username already taken</span>}
              </div>
            </>
          )}

          <label className="text-[11px] text-[var(--text-muted)] block mb-1 mt-4">Display name</label>
          <input
            value={draftDisplayName}
            onChange={(e) => setDraftDisplayName(e.target.value.slice(0, 40))}
            maxLength={40}
            placeholder="e.g. Your Name"
            className="w-full bg-[var(--input-bg)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)]"
          />

          <label className="text-[11px] text-[var(--text-muted)] block mb-1 mt-4">Bio</label>
          <textarea
            value={draftBio}
            onChange={(e) => setDraftBio(e.target.value.slice(0, 150))}
            maxLength={150}
            rows={5}
            placeholder="A short line about you..."
            className="w-full bg-[var(--input-bg)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)] resize-none overflow-hidden"
          />
          <p className="text-[10px] text-[var(--text-faint)] mt-1 text-right">{draftBio.length}/150</p>

          {saveError && <p className="text-xs text-red-400 mt-3">{saveError}</p>}

          <div className="flex items-center gap-2 mt-5">
            <button
              onClick={saveProfile}
              disabled={saving || (!profile && (!draftUsername.trim() || usernameStatus === "taken" || usernameStatus === "invalid" || usernameStatus === "checking"))}
              className="flex-1 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl px-4 py-2.5 transition-colors"
            >
              {saving ? "Saving..." : "Save profile"}
            </button>
            {profile && (
              <button onClick={() => setEditing(false)} className="flex-1 bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-secondary-strong)] text-sm font-medium rounded-xl px-4 py-2.5 transition-colors">
                Cancel
              </button>
            )}
          </div>
        </GlowCard>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="grid md:grid-cols-3 gap-4 items-start">
        <div className="md:col-span-2 space-y-6">
          <GlowCard glow>
            <div className="flex items-start gap-4">
              <button onClick={() => setShowAvatarPicker(true)} className="relative shrink-0 group" disabled={avatarSaving}>
                {profile.avatar_url ? (
                  <img src={profile.avatar_url} alt="Your avatar" className="h-16 w-16 rounded-full object-cover" />
                ) : (
                  <div className="h-16 w-16 rounded-full bg-gradient-to-br from-[var(--accent)] to-[var(--accent-hover)] flex items-center justify-center text-xl font-bold text-white">
                    {initialsFor(profile.display_name || profile.username)}
                  </div>
                )}
                <span className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-[var(--accent)] border-2 border-[var(--surface)] flex items-center justify-center text-white group-hover:bg-[var(--accent-hover)] transition-colors">
                  {avatarSaving ? <Loader2 size={11} className="animate-spin" /> : <Pencil size={11} />}
                </span>
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-lg font-semibold text-[var(--text-primary)] truncate flex items-center gap-1.5">
                  {profile.display_name || profile.username}
                  {profile.is_premium && <Crown size={16} className="text-amber-400 shrink-0" />}
                  {profile.user_id === "97f98bca-98b3-47f6-b2d1-0ac78bc2674f" && (
                    <span className="text-[10px] font-bold uppercase tracking-wide bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded shrink-0">Admin</span>
                  )}
                </p>
                <p className="text-sm text-[var(--accent-text)]">@{profile.username}</p>
                {profile.bio && <p className="text-sm text-[var(--text-secondary)] mt-2 break-words">{profile.bio}</p>}
              </div>
              <button onClick={startEditing} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary-strong)] shrink-0">
                Edit
              </button>
            </div>
          </GlowCard>

          {showAvatarPicker && <AvatarPickerModal onSelectBuiltin={selectBuiltinAvatar} onUploadCropped={uploadCustomAvatar} onClose={() => setShowAvatarPicker(false)} />}

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              ["Focus time", formatDuration(stats.totalSeconds)],
              ["Sessions", stats.sessionCount],
              ["Current streak", `🔥 ${stats.streak}`],
              ["Longest streak", `🏆 ${longestStreak}`],
              ["Tasks completed", tasksCompletedCount],
              ["Friends", `${friendCount}/200`],
            ].map(([label, value, colorClass]) => (
              <GlowCard key={label}>
                <p className="text-xs text-[var(--text-muted)] mb-1">{label}</p>
                <p className={"text-lg font-semibold " + (colorClass || "text-[var(--text-primary)]")}>{value}</p>
              </GlowCard>
            ))}
          </div>

          <GlowCard>
            <p className="text-sm font-medium text-[var(--text-primary)] mb-3">
              Achievements ({myAchievements.length} / {ACHIEVEMENTS.length})
            </p>
            {myAchievements.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)]">No achievements earned yet.</p>
            ) : (
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                {myAchievements.map((r) => {
                  const def = ACHIEVEMENTS.find((a) => a.key === r.achievement_key);
                  if (!def) return null;
                  return (
                    <div key={r.achievement_key} className="flex flex-col items-center gap-1" title={def.title}>
                      <div className="h-11 w-11 rounded-xl bg-[rgb(var(--accent-rgb)/0.2)] flex items-center justify-center text-xl">{def.icon}</div>
                      <p className="text-[9px] text-[var(--text-muted)] text-center leading-tight truncate w-full">{def.title}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </GlowCard>
        </div>

        <GlowCard className="flex flex-col items-center py-10 px-6 md:sticky md:top-4">
          <CompactCharacterPreview styleKey={profile.character_style} level={current.level} color={current.color} size={220} />
          <p className="text-xs text-[var(--text-muted)] mt-3">Level {current.level}</p>
          <LevelNameEffect level={current.level} name={current.name} color={current.color} className="text-lg font-bold mt-1" />
          <div className="h-2 w-full rounded-full bg-[var(--surface-2)] overflow-hidden mt-4">
            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${current.color}, var(--accent))` }} />
          </div>
          <div className="w-full mt-4 pt-4 border-t border-[var(--border-subtle)] text-center">
            <p className="text-xs text-[var(--text-muted)] mb-1">Total XP Earned</p>
            {myIsAscended ? (
              <span
                className="inline-block text-xl font-bold animate-pulse px-4 py-1.5 rounded-lg"
                style={{
                  color: "var(--accent)",
                  background: isCurrentThemeLight() ? "#fdf6d8" : "#000",
                  border: "2px solid var(--accent)",
                  boxShadow: "0 0 16px rgb(var(--accent-rgb) / 0.5), inset 0 0 12px rgb(var(--accent-rgb) / 0.15)",
                }}
              >
                {totalXPEarned.toLocaleString()}
              </span>
            ) : (
              <p className={"text-xl font-bold " + xpDisplayColor}>{totalXPEarned.toLocaleString()}</p>
            )}
          </div>
          {globalRank && (
            <div className="flex items-center gap-1.5 mt-4 bg-[rgb(var(--accent-rgb)/0.12)] border border-[rgb(var(--accent-rgb)/0.25)] rounded-full px-3 py-1.5">
              <Trophy size={13} className="text-[var(--accent-text)]" />
              <p className="text-xs font-semibold text-[var(--accent-text)]">Global Rank #{globalRank}</p>
            </div>
          )}
        </GlowCard>
      </div>
    </div>
  );
}

function Insights({ refreshKey, goTo }) {
  const { requireAuth } = useRequireAuth();
  const [sessions, setSessions] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [lifetimeTasksCompleted, setLifetimeTasksCompleted] = useState(0);
  const [loading, setLoading] = useState(true);
  const [accountCreatedAt, setAccountCreatedAt] = useState(null);
  const [habits, setHabits] = useState([]);
  const [exportMonth, setExportMonth] = useState(() => new Date().toISOString().slice(0, 7)); // "YYYY-MM"
  const [exportingHabits, setExportingHabits] = useState(false);
  const [exportError, setExportError] = useState("");
  const [myTier, setMyTier] = useState(null); // null while loading — avoids a flash of the paywall before we know
  // Off-screen snapshot of the REAL Habit Tracker, mounted only while an
  // export is in progress, so the PDF is an authentic screenshot of the
  // actual app rather than a redrawn approximation.
  const [snapshotParams, setSnapshotParams] = useState(null); // { year, month(1-indexed) } | null
  const snapshotReadyResolveRef = useRef(null);
  const snapshotRootRef = useRef(null);
  const sectionRefsRef = useRef(null); // { rowA, rowB } — set by HabitTracker's onSectionRefs

  useEffect(() => {
    loadAll();
    (async () => {
      const { data: { session: authSession } } = await supabase.auth.getSession();
      const user = authSession?.user;
      if (!user) {
        setMyTier("free");
        return;
      }
      const { data } = await supabase.from("profiles").select("premium_tier").eq("user_id", user.id).maybeSingle();
      setMyTier(data?.premium_tier || "free");
    })();
  }, [refreshKey]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user?.created_at) setAccountCreatedAt(data.user.created_at);
    });
  }, []);

  async function loadAll() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();

    const [sessionsRes, tasksRes, statsRes, habitsRes] = await Promise.all([
      supabase.from("study_sessions").select("*").order("completed_at", { ascending: false }),
      supabase.from("tasks").select("done, deadline, completed_at"),
      user ? supabase.from("user_task_stats").select("lifetime_tasks_completed").eq("user_id", user.id).maybeSingle() : Promise.resolve({ data: null }),
      supabase.from("habits").select("id, name, created_at").order("created_at", { ascending: true }),
    ]);

    if (!sessionsRes.error) setSessions(sessionsRes.data || []);
    if (!tasksRes.error) setTasks(tasksRes.data || []);
    setLifetimeTasksCompleted(statsRes?.data?.lifetime_tasks_completed || 0);
    if (!habitsRes.error) setHabits(habitsRes.data || []);
    setLoading(false);
  }

  const habitMonthOptions = (() => {
    if (habits.length === 0) return [];
    const earliest = new Date(Math.min(...habits.map((h) => new Date(h.created_at).getTime())));
    const options = [];
    let cursor = new Date(earliest.getFullYear(), earliest.getMonth(), 1);
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth(), 1);
    while (cursor <= end) {
      const value = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
      const label = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
      options.push({ value, label });
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }
    return options.reverse();
  })();

  const handleExportHabits = async () => {
    if (habits.length === 0) return;
    setExportingHabits(true);
    setExportError("");
    // Fresh server check, not just trusting whatever tier state the client
    // already has in memory — this is a real backend call, not a frontend
    // gate, since PDF generation itself runs entirely client-side.
    const { data: canExport, error: eligibilityError } = await supabase.rpc("can_export_habit_pdf");
    if (eligibilityError || !canExport) {
      setExportError("Habit Tracker PDF export requires Pro — upgrade to unlock it.");
      setExportingHabits(false);
      return;
    }
    try {
      const [year, month] = exportMonth.split("-").map(Number);
      const monthLabel = new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });

      const readyPromise = new Promise((resolve) => { snapshotReadyResolveRef.current = resolve; });
      const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 8000));
      setSnapshotParams({ year, month });
      await Promise.race([readyPromise, timeoutPromise]);
      // Charts are captured with isAnimationActive={!readOnly}, so there's no
      // animation left to wait out here — this just gives the final paint a
      // moment to settle, not a full second of dead time like before.
      await new Promise((r) => setTimeout(r, 250));
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

      const sectionRefs = sectionRefsRef.current;
      const rowANode = sectionRefs?.rowA?.current;
      const rowBNode = sectionRefs?.rowB?.current;
      if (!rowANode || !rowBNode) throw new Error("Section nodes not found");

      const rootStyle = getComputedStyle(document.documentElement);

      // jsPDF only accepts hex or separate r,g,b integers — NOT rgba(), CSS
      // variables, or any other format. We resolve every CSS variable through
      // the browser's own color engine (getComputedStyle on a temp element)
      // so we always get the real RGB values regardless of which theme is
      // active, then convert to a plain [r,g,b] triple that jsPDF can use.
      const resolveColor = (cssValue, fallbackHex) => {
        const val = (cssValue || fallbackHex).trim();
        // Already a plain hex — parse directly.
        const hex6 = val.match(/^#([0-9a-f]{6})$/i);
        if (hex6) {
          const n = parseInt(hex6[1], 16);
          return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
        }
        const hex3 = val.match(/^#([0-9a-f]{3})$/i);
        if (hex3) {
          const [r,g,b] = hex3[1].split("").map(c => parseInt(c+c, 16));
          return [r, g, b];
        }
        // rgb() / rgba() — extract the numbers.
        const rgba = val.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
        if (rgba) return [+rgba[1], +rgba[2], +rgba[3]];
        // Anything else (oklab, var(), etc.) — resolve via a hidden element.
        const tmp = document.createElement("div");
        tmp.style.cssText = `position:fixed;left:-9999px;width:1px;height:1px;background:${val};`;
        document.body.appendChild(tmp);
        const computed = getComputedStyle(tmp).backgroundColor;
        document.body.removeChild(tmp);
        const m = computed.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
        return m ? [+m[1], +m[2], +m[3]] : [24, 24, 27]; // safe dark fallback
      };

      const bgRgb       = resolveColor(rootStyle.getPropertyValue("--bg"),            "#0a0a0f");
      const accentRgb   = resolveColor(rootStyle.getPropertyValue("--accent"),         "#a855f7");
      const surfaceRgb  = resolveColor(rootStyle.getPropertyValue("--surface-solid"),  "#141419");
      const surface2Rgb = resolveColor(rootStyle.getPropertyValue("--surface-2"),      "#1c1c22");
      const textPriRgb  = resolveColor(rootStyle.getPropertyValue("--text-primary"),   "#f5f5f5");
      const textMutRgb  = resolveColor(rootStyle.getPropertyValue("--text-muted"),     "#8a8a94");
      const borderRgb   = resolveColor(rootStyle.getPropertyValue("--border"),         "#2a2a32");
      const accentTxtRgb= resolveColor(rootStyle.getPropertyValue("--accent-text"),    "#c084fc");

      // Plain hex for html2canvas (it can parse hex fine).
      const toHex = ([r,g,b]) => "#" + [r,g,b].map(x => x.toString(16).padStart(2,"0")).join("");
      const bg = toHex(bgRgb);

      // A 1x1 canvas forces the browser to resolve ANY valid CSS color —
      // oklab(), oklch(), color-mix(), anything — down to concrete sRGB
      // bytes, since Canvas 2D always rasterizes in sRGB regardless of the
      // color function used to describe it. This is what lets us keep the
      // real color (e.g. the semi-transparent card backgrounds Tailwind's
      // opacity modifiers like bg-[var(--surface-2)]/40 generate via
      // oklab under the hood) instead of the old fix, which just deleted
      // the color entirely and left cards with no visible background.
      const oklabToRgba = (val) => {
        try {
          const c = document.createElement("canvas");
          c.width = 1; c.height = 1;
          const ctx = c.getContext("2d");
          ctx.clearRect(0, 0, 1, 1);
          ctx.fillStyle = val;
          ctx.fillRect(0, 0, 1, 1);
          const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
          return `rgba(${r},${g},${b},${(a / 255).toFixed(3)})`;
        } catch {
          return null;
        }
      };

      const patchOklabColors = (root) => {
        const els = [root, ...root.querySelectorAll("*")];
        const SIMPLE_COLOR_PROPS = ["color", "background-color", "border-color", "border-top-color",
          "border-right-color", "border-bottom-color", "border-left-color",
          "outline-color", "text-decoration-color", "fill", "stroke"];
        const OKLAB_RE = /oklab[(][^)]*[)]|oklch[(][^)]*[)]/gi;
        els.forEach((el) => {
          const cs = getComputedStyle(el);
          SIMPLE_COLOR_PROPS.forEach((prop) => {
            const val = cs.getPropertyValue(prop);
            if (!val) return;
            OKLAB_RE.lastIndex = 0;
            if (OKLAB_RE.test(val)) {
              const resolved = oklabToRgba(val);
              el.style.setProperty(prop, resolved || "transparent", "important");
            }
          });
          // box-shadow is a compound value (offsets + blur + color all in
          // one string) — replace just the color portion in place instead
          // of overwriting the whole shadow.
          const shadow = cs.getPropertyValue("box-shadow");
          if (shadow && OKLAB_RE.test(shadow)) {
            OKLAB_RE.lastIndex = 0;
            const patchedShadow = shadow.replace(OKLAB_RE, (m) => oklabToRgba(m) || "transparent");
            el.style.setProperty("box-shadow", patchedShadow, "important");
          }
        });
      };
      patchOklabColors(rowANode);
      patchOklabColors(rowBNode);
      await new Promise((r) => requestAnimationFrame(r));

      const h2cOpts = (node) => ({
        backgroundColor: bg, scale: 3, useCORS: true, logging: false,
        width: node.scrollWidth, height: node.scrollHeight,
        windowWidth: node.scrollWidth, windowHeight: node.scrollHeight,
        scrollX: 0, scrollY: 0,
      });

      const daysInMonth = new Date(year, month, 0).getDate();
      const dateStrFor = (d) => `${year}-${String(month).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
      const start = `${year}-${String(month).padStart(2,"0")}-01`;
      const end = dateStrFor(daysInMonth);

      // The Supabase fetch and the two screenshots don't depend on each
      // other at all, so run them together instead of one after the other —
      // this alone cuts a real chunk of the total export time.
      const [canvasA, canvasB, { data: monthLogs }, { data: allHabits }] = await Promise.all([
        html2canvas(rowANode, h2cOpts(rowANode)),
        html2canvas(rowBNode, h2cOpts(rowBNode)),
        supabase.from("habit_logs").select("habit_id, log_date").gte("log_date", start).lte("log_date", end),
        supabase.from("habits").select("id, name").order("created_at", { ascending: true }),
      ]);
      if (!canvasA?.width || !canvasB?.width) throw new Error("Screenshot came back empty");

      const logsArr = monthLogs || [];
      const habitsArr = allHabits || [];
      const checkedSet = new Set(logsArr.map((l) => `${l.habit_id}_${l.log_date}`));
      const totalPossible = habitsArr.length * daysInMonth;
      const overallPct = totalPossible > 0 ? Math.round((logsArr.length / totalPossible) * 100) : 0;

      const daysDone = Array.from(new Set(logsArr.map((l) => l.log_date))).sort();
      let longestStreak = 0, currentStreak = 0, lastDate = null;
      daysDone.forEach((dateStr) => {
        if (!lastDate) { currentStreak = 1; }
        else { const diff = (new Date(dateStr) - new Date(lastDate)) / 86400000; currentStreak = diff === 1 ? currentStreak + 1 : 1; }
        longestStreak = Math.max(longestStreak, currentStreak);
        lastDate = dateStr;
      });

      const dowTotals = Array(7).fill(0);
      logsArr.forEach((l) => { dowTotals[new Date(l.log_date + "T00:00:00").getDay()]++; });
      const DOW = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
      const bestDow = dowTotals.indexOf(Math.max(...dowTotals));
      const bestDowLabel = dowTotals[bestDow] > 0 ? DOW[bestDow] : null;

      // Full per-habit tick counts, including habits that got zero ticks
      // this month — needed so "worst habit" can actually be a real habit,
      // not just skipped because it never showed up in the logs table.
      const habitTickCounts = {};
      habitsArr.forEach((h) => { habitTickCounts[h.id] = 0; });
      logsArr.forEach((l) => { habitTickCounts[l.habit_id] = (habitTickCounts[l.habit_id] || 0) + 1; });
      const rankedHabits = habitsArr
        .map((h) => ({ ...h, ticks: habitTickCounts[h.id] || 0, pct: daysInMonth > 0 ? Math.round(((habitTickCounts[h.id] || 0) / daysInMonth) * 100) : 0 }))
        .sort((a, b) => b.pct - a.pct);
      const bestHabit = rankedHabits[0] || null;
      const bestHabitPct = bestHabit ? bestHabit.pct : 0;
      const worstHabit = rankedHabits.length > 0 ? rankedHabits[rankedHabits.length - 1] : null;
      const worstHabitPct = worstHabit ? worstHabit.pct : 0;
      // Consistency rate: what fraction of the month's days had at least
      // one habit ticked — a different, genuinely useful read on the month
      // than raw completion % (which rewards having fewer habits).
      const consistencyPct = daysInMonth > 0 ? Math.round((daysDone.length / daysInMonth) * 100) : 0;

      const perfectDays = Array.from({ length: daysInMonth }, (_, i) => {
        const d = dateStrFor(i + 1);
        return habitsArr.length > 0 && habitsArr.every((h) => checkedSet.has(`${h.id}_${d}`));
      }).filter(Boolean).length;

      // ---- Build the REAL "Monthly Insights" panel in the live DOM so it ----
      // picks up the exact same font-family and CSS-variable colors as the
      // rest of the app (Row A/B are screenshots too). Kept deliberately
      // simple — plain block-level divs with explicit pixel heights (no
      // flexbox, no SVG, no gradients) since those are what html2canvas
      // renders reliably; anything fancier previously broke.
      const panelW = rowANode.scrollWidth;
      const PAD = 22;
      const contentW = panelW - PAD * 2;
      const TILE_GAP = 12;
      const tileW = Math.floor((contentW - TILE_GAP * 2) / 3);

      // Fixed, known-good pixel height per tile — deliberately NOT derived
      // from any page-geometry/pt-to-px conversion. That calculation was
      // the actual source of the overlap: a bad number produced an
      // effectively invalid tile height, so the boxes fell back to their
      // natural (larger) content size and started overlapping the row
      // below. A plain constant can't have that failure mode.
      const TILE_ROW_H = 110;
      const TITLE_H = 48;
      const panelInnerH = TITLE_H + TILE_ROW_H * 2 + TILE_GAP;
      const targetPanelCssH = PAD * 2 + panelInnerH;

      // Every tile gets an exact, explicit left/top/width/height in pixels —
      // position:absolute means content can NEVER push a tile out of place,
      // wrap it onto a different row, or make it grow past its box.
      // overflow:hidden clips anything that doesn't fit instead of resizing.
      const statTilesHtml = [
        { label: "OVERALL COMPLETION", value: `${overallPct}%`, sub: `${logsArr.length}/${totalPossible} ticks` },
        { label: "CONSISTENCY", value: `${consistencyPct}%`, sub: `${daysDone.length}/${daysInMonth} days active` },
        { label: "BEST STREAK", value: longestStreak > 0 ? `${longestStreak}` : "—", sub: longestStreak > 0 ? `day${longestStreak === 1 ? "" : "s"} in a row` : "no streak yet" },
        { label: "PERFECT DAYS", value: perfectDays > 0 ? `${perfectDays}` : "—", sub: "all habits done" },
        { label: "MOST CONSISTENT", value: bestHabit ? bestHabit.name.slice(0, 20) : "—", sub: bestHabit ? `${bestHabitPct}% completion` : "no data yet" },
        { label: "NEEDS ATTENTION", value: worstHabit ? worstHabit.name.slice(0, 20) : "—", sub: worstHabit ? `${worstHabitPct}% completion` : "no data yet" },
      ].map((s, i) => {
        const col = i % 3;
        const row = Math.floor(i / 3);
        const x = col * (tileW + TILE_GAP);
        const y = TITLE_H + row * (TILE_ROW_H + TILE_GAP);
        return `
        <div style="position:absolute; left:${x}px; top:${y}px; width:${tileW}px; height:${TILE_ROW_H}px; background:var(--surface); border:1px solid var(--border); border-radius:14px; box-sizing:border-box; overflow:hidden; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:6px 12px;">
          <p style="margin:0 0 8px; font-size:10px; letter-spacing:0.06em; color:var(--text-muted); text-transform:uppercase; word-wrap:break-word; overflow-wrap:break-word; max-width:100%;">${s.label}</p>
          <p style="margin:0 0 6px; font-size:20px; font-weight:700; color:var(--accent-text); word-wrap:break-word; overflow-wrap:break-word; max-width:100%; line-height:1.15;">${s.value}</p>
          <p style="margin:0; font-size:10px; color:var(--text-muted); word-wrap:break-word; overflow-wrap:break-word; max-width:100%;">${s.sub}</p>
        </div>`;
      }).join("");

      const insightsNode = document.createElement("div");
      insightsNode.style.cssText = `position:absolute; top:0; left:-20000px; width:${panelW}px; height:${targetPanelCssH}px; background:var(--bg); border:1px solid var(--card-border); border-radius:16px; padding:${PAD}px; box-sizing:border-box; overflow:hidden;`;
      insightsNode.innerHTML = `
        <p style="position:absolute; top:${PAD}px; left:0; right:0; margin:0; text-align:center; font-size:15px; font-weight:600; color:var(--text-primary);">Monthly Insights</p>
        <div style="position:absolute; top:${PAD}px; left:${PAD}px; width:${contentW}px; height:${panelInnerH}px;">${statTilesHtml}</div>
      `;
      document.body.appendChild(insightsNode);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      patchOklabColors(insightsNode);
      await new Promise((r) => requestAnimationFrame(r));

      let canvasC;
      try {
        canvasC = await html2canvas(insightsNode, h2cOpts(insightsNode));
      } finally {
        document.body.removeChild(insightsNode);
      }
      if (!canvasC?.width) throw new Error("Insights panel screenshot came back empty");

      await buildTwoPageHabitPDF({
        canvasA, canvasB, canvasC, monthLabel, bg, bgRgb, accentRgb, borderRgb, textMutRgb,
      });
    } catch (e) {
      console.error("Failed to generate PDF:", e);
      setExportError(e?.message ? `Couldn't export: ${e.message}` : "Couldn't export — please try again.");
    } finally {
      setSnapshotParams(null);
      snapshotReadyResolveRef.current = null;
      sectionRefsRef.current = null;
      setExportingHabits(false);
    }
  };
  const monthlyData = computeMonthlyTrend(sessions);
  const compareStats = computeCompareStats(sessions);
  const dailyPatterns = computeDailyPatterns(sessions);
  const routineChange = computeRoutineChange(sessions);
  const { focusedDays, totalDays } = computeDaysFocused(sessions, accountCreatedAt);
  const daysFocusedPct = totalDays > 0 ? Math.round((focusedDays / totalDays) * 100) : 0;
  const timerUsage = computeTimerUsageStats(sessions);
  const totalFocusedSeconds = sessions.reduce((sum, s) => sum + (s.focused_seconds || 0), 0);
  const stats = computeStudyStats(sessions);
  const productivityScore = computeProductivityScore(timerUsage.completionPct, sessions, daysFocusedPct);
  const peakHours = computePeakHours(sessions);
  const studyPatterns = computeStudyPatterns(sessions);
  const prediction = computeMilestonePrediction(sessions, totalFocusedSeconds);
  const weekOverWeek = computeWeekOverWeek(sessions);
  const taskTimeliness = computeTaskTimeliness(tasks);
  const overdueTasks = tasks.filter((t) => !t.done && t.deadline && new Date(t.deadline) < new Date()).length;

  if (myTier !== null && myTier !== "premium") {
    return (
      <>
        <div className="pointer-events-none select-none blur-md opacity-60 space-y-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-hover)] flex items-center justify-center shrink-0">
              <TrendingUp size={19} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-[var(--text-primary)]">Insights</h1>
              <p className="text-sm text-[var(--text-secondary)] mt-0.5">Your study trends, month by month and over your whole lifetime.</p>
            </div>
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            {["Today", "This week", "This month"].map((label) => (
              <GlowCard key={label}>
                <p className="text-xs text-[var(--text-muted)] mb-2">{label}</p>
                <p className="text-lg font-bold text-[var(--text-primary)]">••h ••m</p>
              </GlowCard>
            ))}
          </div>
          <GlowCard>
            <p className="text-sm font-medium text-[var(--text-primary)] mb-3">Daily Breakdown</p>
            <div className="space-y-2.5">
              {["Mon", "Tue", "Wed", "Thu", "Fri"].map((day) => (
                <div key={day} className="flex items-center gap-3">
                  <span className="text-xs text-[var(--text-muted)] w-8">{day}</span>
                  <div className="flex-1 h-2.5 rounded-full bg-[var(--surface-2)] overflow-hidden">
                    <div className="h-full rounded-full bg-blue-600/50" style={{ width: `${40 + Math.random() * 50}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </GlowCard>
          <div className="grid sm:grid-cols-3 gap-3">
            {["Peak Hours", "Productivity Score", "Study Patterns"].map((label) => (
              <GlowCard key={label}>
                <p className="text-xs text-[var(--text-muted)] mb-2">{label}</p>
                <p className="text-2xl font-bold text-[var(--text-primary)]">••</p>
              </GlowCard>
            ))}
          </div>
          <GlowCard>
            <p className="text-sm font-medium text-[var(--text-primary)] mb-3">Monthly trend</p>
            <div className="flex items-end gap-2 h-24">
              {[40, 65, 30, 80, 55, 70, 45, 60, 35, 75, 50, 65].map((h, i) => (
                <div key={i} className="flex-1 bg-[var(--accent)]/40 rounded-t" style={{ height: `${h}%` }} />
              ))}
            </div>
          </GlowCard>
          <GlowCard>
            <p className="text-sm font-medium text-[var(--text-primary)] mb-3">Smart Insights</p>
            <p className="text-sm text-[var(--text-secondary)]">At your current pace, you'll reach •• hours in about •• days.</p>
          </GlowCard>
          <GlowCard>
            <p className="text-sm font-medium text-[var(--text-primary)] mb-3">Task completion</p>
            <div className="grid grid-cols-3 gap-3">
              {["Lifetime completed", "Overdue", "Deadlines met"].map((label) => (
                <div key={label} className="bg-[var(--surface-2)]/40 rounded-xl p-3 text-center">
                  <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)] mb-1">{label}</p>
                  <p className="text-lg font-bold text-[var(--text-primary)]">••</p>
                </div>
              ))}
            </div>
          </GlowCard>
          <GlowCard>
            <p className="text-sm font-medium text-[var(--text-primary)] mb-4">Peak Study Hours</p>
            <div className="text-center mb-5">
              <p className="text-3xl font-bold text-amber-400">••AM</p>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">Your most productive hour</p>
            </div>
            <div className="space-y-2.5">
              {["Morning", "Afternoon", "Evening", "Night"].map((b) => (
                <div key={b} className="flex items-center gap-3">
                  <span className="text-xs text-[var(--text-muted)] w-16 shrink-0">{b}</span>
                  <div className="flex-1 h-2.5 rounded-full bg-[var(--surface-2)] overflow-hidden">
                    <div className="h-full rounded-full bg-amber-500" style={{ width: `${30 + Math.random() * 60}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </GlowCard>
          <GlowCard>
            <p className="text-sm font-medium text-[var(--text-primary)] mb-1">Routine changes</p>
            <p className="text-xs text-[var(--text-secondary)]">You used to study mostly in the •• but the last two weeks have shifted to ••.</p>
          </GlowCard>
          <GlowCard>
            <p className="text-sm font-medium text-[var(--text-primary)] mb-1">Days focused</p>
            <div className="flex items-center gap-4 mt-3">
              <p className="text-2xl font-bold text-[var(--text-primary)]">••%</p>
              <div className="flex-1 h-2.5 rounded-full bg-[var(--surface-2)] overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-hover)]" style={{ width: "68%" }} />
              </div>
            </div>
          </GlowCard>
          <GlowCard>
            <p className="text-sm font-medium text-[var(--text-primary)] mb-3">Timer habits</p>
            <div className="grid grid-cols-3 gap-3">
              {["Most used", "Completed fully", "Break time"].map((label) => (
                <div key={label} className="bg-[var(--surface-2)]/40 rounded-xl p-3 text-center">
                  <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)] mb-1">{label}</p>
                  <p className="text-base font-bold text-[var(--text-primary)]">••</p>
                </div>
              ))}
            </div>
          </GlowCard>
          <GlowCard>
            <p className="text-sm font-medium text-[var(--text-primary)] mb-4">Productivity Score</p>
            <div className="flex items-center gap-6">
              <div className="h-24 w-24 rounded-full border-8 border-[var(--surface-2)] flex items-center justify-center shrink-0">
                <p className="text-2xl font-bold text-emerald-400">••</p>
              </div>
              <div className="flex-1 space-y-3">
                {["Completion Rate", "Session Quality", "Consistency"].map((label) => (
                  <div key={label}>
                    <p className="text-xs text-[var(--text-secondary)] mb-1">{label}</p>
                    <div className="h-1.5 rounded-full bg-[var(--surface-2)] overflow-hidden">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${40 + Math.random() * 50}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </GlowCard>
          <GlowCard>
            <p className="text-sm font-medium text-[var(--text-primary)] mb-3">Study Patterns</p>
            <div className="grid grid-cols-2 gap-3">
              {["Longest Session", "Avg Session", "Total Sessions", "Focus Score"].map((label) => (
                <div key={label} className="bg-[var(--surface-2)]/40 rounded-xl p-3">
                  <p className="text-lg font-bold text-[var(--accent-text)]">••</p>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">{label}</p>
                </div>
              ))}
            </div>
          </GlowCard>
          <GlowCard>
            <p className="text-sm font-medium text-[var(--text-primary)] mb-1">Export Habit Tracker</p>
            <p className="text-xs text-[var(--text-muted)] mb-3">Export your habit tracking as a polished PDF, any month.</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-9 rounded-xl bg-[var(--surface-2)]" />
              <div className="h-9 w-28 rounded-xl bg-[var(--accent)]/50" />
            </div>
          </GlowCard>
        </div>
        <div className="fixed inset-0 md:left-60 lg:left-64 z-[200] flex items-center justify-center p-4 pointer-events-none">
          <div className="bg-[var(--surface-solid)] border border-[rgb(var(--accent-rgb)/0.4)] rounded-3xl p-6 max-w-sm w-full text-center shadow-[0_0_60px_-10px_rgb(var(--accent-rgb)/0.5)] pointer-events-auto">
            <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-hover)] flex items-center justify-center glow-accent-30 mx-auto mb-4">
              <Lock size={22} className="text-white" />
            </div>
            <p className="text-base font-semibold text-[var(--text-primary)] mb-2">Insights is a Pro feature</p>
            <p className="text-sm text-[var(--text-muted)] mb-6">
              Deep study patterns, peak-hour analysis, milestone predictions, and PDF export of your Habit Tracker are all included with Pro.
            </p>
            <button
              onClick={() => requireAuth(() => goTo && goTo("pricing"))}
              className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-medium px-6 py-3 rounded-xl transition-colors glow-accent-40 w-full"
            >
              Upgrade to Unlock
            </button>
          </div>
        </div>
      </>
    );
  }
  if (myTier === null) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={20} className="text-[var(--accent-text)] animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-hover)] flex items-center justify-center glow-accent-30 shrink-0">
          <TrendingUp size={19} className="text-white" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">Insights</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-0.5">Your study trends, month by month and over your whole lifetime.</p>
        </div>
      </div>

      {/* Compare: today vs this week vs this month */}
      <GlowCard>
        <div className="flex items-center justify-between mb-3">
          <p className="text-[var(--text-primary)] font-medium text-sm">Compare</p>
          {!loading && !weekOverWeek.isNew && weekOverWeek.pct !== null && weekOverWeek.pct !== 0 && (
            <span className={"flex items-center gap-1 text-xs font-medium " + (weekOverWeek.pct > 0 ? "text-emerald-400" : "text-red-400")}>
              <TrendingUp size={13} className={weekOverWeek.pct < 0 ? "rotate-180" : ""} />
              {weekOverWeek.pct > 0 ? "+" : ""}
              {weekOverWeek.pct}% from last week
            </span>
          )}
          {!loading && weekOverWeek.isNew && (
            <span className="text-xs text-[var(--accent-text)] font-medium">First week logged 🎉</span>
          )}
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            ["Today", compareStats.today, compareStats.todayCount],
            ["This week", compareStats.week, compareStats.weekCount],
            ["This month", compareStats.month, compareStats.monthCount],
          ].map(([label, seconds, count]) => (
            <div key={label} className="bg-[var(--surface-2)]/40 rounded-xl p-3 text-center">
              <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)] mb-1">{label}</p>
              <p className="text-lg font-bold text-[var(--text-primary)]">{loading ? "…" : formatDuration(seconds)}</p>
              <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{loading ? "" : `${count} session${count === 1 ? "" : "s"}`}</p>
            </div>
          ))}
        </div>
      </GlowCard>

      {/* Task completion: on-time vs late, and a lifetime count that survives deletion */}
      <GlowCard>
        <p className="text-[var(--text-primary)] font-medium text-sm mb-3">Task completion</p>
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div className="bg-[var(--surface-2)]/40 rounded-xl p-3 text-center">
            <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)] mb-1">Lifetime completed</p>
            <p className="text-lg font-bold text-[var(--text-primary)]">{loading ? "…" : lifetimeTasksCompleted}</p>
            <p className="text-[10px] text-[var(--text-muted)] mt-0.5">Includes deleted tasks</p>
          </div>
          <div className="bg-[var(--surface-2)]/40 rounded-xl p-3 text-center">
            <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)] mb-1">Overdue</p>
            <p className={"text-lg font-bold " + (overdueTasks > 0 ? "text-red-400" : "text-[var(--text-primary)]")}>
              {loading ? "…" : overdueTasks}
            </p>
            <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{overdueTasks > 0 ? "Need attention" : "All caught up"}</p>
          </div>
          <div className="bg-[var(--surface-2)]/40 rounded-xl p-3 text-center">
            <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)] mb-1">Deadlines met</p>
            <p className="text-lg font-bold text-[var(--text-primary)]">
              {loading ? "…" : taskTimeliness ? `${taskTimeliness.onTimePct}%` : "—"}
            </p>
            <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
              {loading ? "" : taskTimeliness ? `${taskTimeliness.onTime}/${taskTimeliness.total} decided` : "Nothing decided yet"}
            </p>
          </div>
        </div>
        {!loading && taskTimeliness && (
          <div className="h-2 rounded-full bg-[var(--surface-2)] overflow-hidden flex">
            <div className="h-full bg-emerald-500" style={{ width: `${taskTimeliness.onTimePct}%` }} />
            <div className="h-full bg-red-500/70" style={{ width: `${100 - taskTimeliness.onTimePct}%` }} />
          </div>
        )}
      </GlowCard>

      {/* Daily Breakdown: same weekday data as before, shown as horizontal bars with duration labels */}
      <GlowCard>
        <p className="text-[var(--text-primary)] font-medium text-sm mb-3">Daily Breakdown</p>
        <div className="space-y-2.5">
          {(() => {
            const orderedMonFirst = [1, 2, 3, 4, 5, 6, 0].map((i) => dailyPatterns.data[i]); // Mon -> Sun
            const maxMinutes = Math.max(...orderedMonFirst.map((d) => d.minutes), 1);
            return orderedMonFirst.map((d) => (
              <div key={d.day} className="flex items-center gap-3">
                <span className="text-xs text-[var(--text-muted)] w-8 shrink-0">{d.day}</span>
                <div className="flex-1 h-2.5 rounded-full bg-[var(--surface-2)] overflow-hidden">
                  <div
                    className={"h-full rounded-full transition-all duration-500 " + (d.day === dailyPatterns.strongestDay ? "bg-[var(--accent-hover)]" : "bg-blue-600/70")}
                    style={{ width: `${(d.minutes / maxMinutes) * 100}%` }}
                  />
                </div>
                <span className="text-xs text-[var(--text-secondary-strong)] w-16 text-center shrink-0">{d.minutes > 0 ? formatDuration(d.minutes * 60) : "—"}</span>
              </div>
            ));
          })()}
        </div>
      </GlowCard>

      {/* Peak Study Hours: best single hour, plus a morning/afternoon/evening/night breakdown */}
      <GlowCard>
        <p className="text-[var(--text-primary)] font-medium text-sm mb-4">Peak Study Hours</p>
        {!loading && peakHours ? (
          <>
            <div className="text-center mb-5">
              <p className="text-3xl font-bold text-amber-400">{peakHours.bestHourLabel}</p>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">Your most productive hour</p>
            </div>
            <div className="space-y-2.5">
              {peakHours.buckets.map((b) => (
                <div key={b.label} className="flex items-center gap-3">
                  <span className="text-xs text-[var(--text-muted)] w-16 shrink-0">{b.label}</span>
                  <div className="flex-1 h-2.5 rounded-full bg-[var(--surface-2)] overflow-hidden">
                    <div className="h-full rounded-full bg-amber-500 transition-all duration-500" style={{ width: `${b.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-xs text-[var(--text-muted)] py-6 text-center">{loading ? "…" : "Save a few sessions to see your peak hours."}</p>
        )}
      </GlowCard>

      {/* Routine changes */}
      <GlowCard>
        <p className="text-[var(--text-primary)] font-medium text-sm mb-1">Routine changes</p>
        <p className="text-xs text-[var(--text-secondary)]">
          {loading
            ? "…"
            : !routineChange.hasEnoughData
            ? "Keep studying — once you have a few weeks of sessions, we'll flag any shifts in your routine here."
            : routineChange.changed
            ? `Your routine has shifted — you used to study mostly in the ${routineChange.previousBucket.toLowerCase()}, but the last two weeks have mostly been in the ${routineChange.recentBucket.toLowerCase()}.`
            : `Your routine has stayed consistent — you're still mostly studying in the ${routineChange.recentBucket.toLowerCase()}, same as the two weeks before.`}
        </p>
      </GlowCard>

      <GlowCard>
        <p className="text-[var(--text-primary)] font-medium text-sm mb-3">Monthly trend — {new Date().getFullYear()}</p>
        <div style={{ width: "100%", height: 220 }}>
          <ResponsiveContainer>
            <BarChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="month" stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} width={28} />
              <Tooltip
                contentStyle={{ background: "var(--surface-solid)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, color: "var(--text-primary)" }}
                cursor={{ fill: "rgba(168,85,247,0.08)" }}
              />
              <Bar dataKey="hours" fill="var(--accent)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </GlowCard>

      {/* Days focused since the account was created */}
      <GlowCard>
        <p className="text-[var(--text-primary)] font-medium text-sm mb-1">Days focused</p>
        <p className="text-xs text-[var(--text-muted)] mb-3">
          {loading || !accountCreatedAt
            ? "…"
            : `You've focused on ${focusedDays} out of ${totalDays} day${totalDays === 1 ? "" : "s"} since you joined.`}
        </p>
        <div className="flex items-center gap-4">
          <p className="text-2xl font-bold text-[var(--text-primary)]">{loading ? "…" : `${daysFocusedPct}%`}</p>
          <div className="flex-1 h-2.5 rounded-full bg-[var(--surface-2)] overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-hover)] transition-all duration-700 ease-out"
              style={{ width: `${daysFocusedPct}%` }}
            />
          </div>
        </div>
      </GlowCard>

      {/* Which timer gets used most, how often sessions are actually completed, and break time */}
      <GlowCard>
        <p className="text-[var(--text-primary)] font-medium text-sm mb-3">Timer habits</p>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-[var(--surface-2)]/40 rounded-xl p-3 text-center">
            <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)] mb-1">Most used</p>
            <p className="text-base font-bold text-[var(--text-primary)]">
              {loading ? "…" : timerUsage.mostUsedLabel || "—"}
            </p>
            <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
              {loading ? "" : timerUsage.mostUsedCount > 0 ? `${timerUsage.mostUsedCount} sessions` : "No sessions yet"}
            </p>
          </div>
          <div className="bg-[var(--surface-2)]/40 rounded-xl p-3 text-center">
            <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)] mb-1">Completed fully</p>
            <p className="text-base font-bold text-[var(--text-primary)]">{loading ? "…" : `${timerUsage.completionPct}%`}</p>
            <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
              {loading ? "" : `${timerUsage.completableFinished}/${timerUsage.completableTotal} timer + pomodoro`}
            </p>
          </div>
          <div className="bg-[var(--surface-2)]/40 rounded-xl p-3 text-center">
            <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)] mb-1">Break time</p>
            <p className="text-base font-bold text-[var(--text-primary)]">{loading ? "…" : formatDuration(timerUsage.totalBreakSeconds)}</p>
            <p className="text-[10px] text-[var(--text-muted)] mt-0.5">Across all Pomodoro sessions</p>
          </div>
        </div>
      </GlowCard>

      {/* Productivity Score — overall letter grade plus three distinct sub-metrics */}
      <GlowCard>
        <p className="text-[var(--text-primary)] font-medium text-sm mb-4">Productivity Score</p>
        <div className="flex items-center gap-6 flex-wrap">
          <div className="relative h-24 w-24 shrink-0">
            <svg viewBox="0 0 100 100" className="h-24 w-24 -rotate-90">
              <circle cx="50" cy="50" r="42" fill="none" stroke="var(--surface-2)" strokeWidth="8" />
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                stroke="#22c55e"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={`${(productivityScore.score / 100) * 264} 264`}
                className="transition-all duration-700"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <p className="text-2xl font-bold text-emerald-400">{loading ? "…" : productivityScore.grade}</p>
              <p className="text-[10px] text-[var(--text-muted)]">{loading ? "" : `${productivityScore.score}/100`}</p>
            </div>
          </div>
          <div className="flex-1 min-w-[180px] space-y-3">
            {[
              ["Completion Rate", productivityScore.completionRate, "bg-emerald-500"],
              ["Session Quality", productivityScore.sessionQuality, "bg-blue-500"],
              ["Consistency", productivityScore.consistency, "bg-[var(--accent-hover)]"],
            ].map(([label, pct, color]) => (
              <div key={label}>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-[var(--text-secondary)]">{label}</p>
                  <p className="text-xs text-[var(--text-secondary-strong)]">{loading ? "…" : `${pct}%`}</p>
                </div>
                <div className="h-1.5 rounded-full bg-[var(--surface-2)] overflow-hidden">
                  <div className={"h-full rounded-full transition-all duration-500 " + color} style={{ width: `${pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </GlowCard>

      {/* Study Patterns: session-shape stats at a glance */}
      <GlowCard>
        <p className="text-[var(--text-primary)] font-medium text-sm mb-3">Study Patterns</p>
        <div className="grid grid-cols-2 gap-3">
          {[
            ["Longest Session", loading ? "…" : formatDuration(studyPatterns.longestSession), "text-pink-400"],
            ["Avg Session Length", loading ? "…" : formatDuration(Math.round(studyPatterns.avgSession)), "text-blue-400"],
            ["Completion Rate", loading ? "…" : `${timerUsage.completionPct}%`, "text-emerald-400"],
            ["Days Active (30d)", loading ? "…" : `${studyPatterns.activeDays30}/30`, "text-amber-400"],
            ["Total Sessions", loading ? "…" : stats.sessionCount, "text-[var(--accent-text)]"],
            ["Focus Score", loading ? "…" : `${productivityScore.score}%`, "text-cyan-400"],
          ].map(([label, value, color]) => (
            <div key={label} className="bg-[var(--surface-2)]/40 rounded-xl p-3">
              <p className={"text-lg font-bold " + color}>{value}</p>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      </GlowCard>

      {habits.length > 0 && (
        <GlowCard className="relative z-20">
          <p className="text-[var(--text-primary)] font-medium text-sm mb-1">Export Habit Tracker</p>
          <p className="text-xs text-[var(--text-muted)] mb-3">Pick a month and export your habit tracking as a PDF.</p>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <ThemedSelect value={exportMonth} onChange={setExportMonth} options={habitMonthOptions} />
            </div>
            <button
              onClick={handleExportHabits}
              disabled={exportingHabits}
              className="flex items-center gap-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors shrink-0"
            >
              <Download size={15} /> {exportingHabits ? "Exporting..." : "Export PDF"}
            </button>
          </div>
          {exportError && <p className="text-xs text-red-400 mt-2">{exportError}</p>}
        </GlowCard>
      )}

      {/* Smart Insights — real computed patterns from your own session history,
          not a live AI model (worth being upfront about that). */}
      <GlowCard>
        <p className="text-[var(--text-primary)] font-medium text-sm mb-3">Smart Insights</p>
        <div className="space-y-3">
          <div className="flex items-start gap-2">
            <TrendingUp size={15} className="text-[var(--accent-text)] mt-0.5 shrink-0" />
            <p className="text-sm text-[var(--text-secondary)]">
              {loading
                ? "…"
                : prediction
                ? `At your current pace, you'll reach ${prediction.milestone}h in about ${prediction.days} day${prediction.days === 1 ? "" : "s"}.`
                : "Keep logging sessions to unlock a pace-based projection toward your next milestone."}
            </p>
          </div>
        </div>
      </GlowCard>

      {/* Off-screen mount of the REAL Habit Tracker for the requested month —
          this is what gets screenshotted for the PDF export, so the export
          is an authentic capture of the actual app, not a redrawn copy.
          Positioned off-canvas (not display:none) so it still lays out and
          renders normally; unmounted again as soon as the export finishes. */}
      {snapshotParams && (
        <div
          ref={snapshotRootRef}
          style={{
            position: "absolute",
            top: 0,
            left: -20000,
            width: 1440,
            background: "var(--bg)",
            padding: 24,
            pointerEvents: "none",
            zIndex: -1,
          }}
          aria-hidden="true"
        >
          <HabitTracker
            refreshKey={0}
            goTo={() => {}}
            initialYear={snapshotParams.year}
            initialMonth={snapshotParams.month - 1}
            readOnly
            onSectionRefs={(refs) => { sectionRefsRef.current = refs; }}
            onReady={() => snapshotReadyResolveRef.current && snapshotReadyResolveRef.current()}
          />
        </div>
      )}
    </div>
  );
}

/* ---------------------------- Habit Tracker ---------------------------- */

const WEEKDAY_LETTERS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function pad2(n) {
  return String(n).padStart(2, "0");
}

function dateStrFor(year, monthIndex, day) {
  return `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`;
}

function HabitTracker({ refreshKey, goTo, initialYear, initialMonth, readOnly, onReady, onSectionRefs }) {
  const { requireAuth } = useRequireAuth();
  const now = new Date();
  // initialYear/initialMonth/readOnly/onReady are only ever passed when this
  // component is mounted off-screen for a PDF export snapshot (see Insights'
  // handleExportHabits) — normal in-app usage passes none of these and
  // behaves exactly as before.
  const [viewYear, setViewYear] = useState(initialYear ?? now.getFullYear());
  const [viewMonth, setViewMonth] = useState(initialMonth ?? now.getMonth()); // 0-11
  const [habits, setHabits] = useState([]);
  const [logs, setLogs] = useState([]); // { habit_id, log_date } — only for the viewed month
  const [streakLogs, setStreakLogs] = useState([]); // { habit_id, log_date } — last 90 real days, for streaks
  const [loading, setLoading] = useState(true);
  const [newHabitName, setNewHabitName] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [boundaryMsgTrigger, setBoundaryMsgTrigger] = useState(0);
  const theadRef = useRef(null);
  const titleRef = useRef(null);
  const [theadHeight, setTheadHeight] = useState(52);
  const [titleHeight, setTitleHeight] = useState(32);
  const [isPremium, setIsPremium] = useState(false);
  const [limitError, setLimitError] = useState("");
  // Section refs used by the export snapshot to capture Row A (charts/weekly
  // breakdown) and Row B (daily habits table) as separate screenshots, so
  // the daily habits section always starts cleanly on page 2 with no breaks.
  const rowARef = useRef(null);
  const rowBRef = useRef(null);


  const isCurrentMonth = viewYear === now.getFullYear() && viewMonth === now.getMonth();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString([], { month: "long", year: "numeric" });

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, viewYear, viewMonth]);

  useEffect(() => {
    loadStreakLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  // Fires exactly once, after loading finishes AND the habits data has
  // actually landed and rendered — the export flow waits on this before
  // it's safe to screenshot. No-op for normal in-app usage, since onReady
  // is only ever passed by the off-screen export snapshot. Guarded by a ref
  // so a later re-load (e.g. month change) can't fire it a second time.
  const onReadyFiredRef = useRef(false);
  useEffect(() => {
    if (loading || !onReady || onReadyFiredRef.current) return;
    onReadyFiredRef.current = true;
    if (onSectionRefs) onSectionRefs({ rowA: rowARef, rowB: rowBRef });
    onReady();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, habits]);

  async function loadStreakLogs() {
    const windowStart = new Date(now);
    windowStart.setDate(windowStart.getDate() - 90);
    const startStr = dateStrFor(windowStart.getFullYear(), windowStart.getMonth(), windowStart.getDate());
    const todayStr = dateStrFor(now.getFullYear(), now.getMonth(), now.getDate());
    const { data, error } = await supabase
      .from("habit_logs")
      .select("habit_id, log_date")
      .gte("log_date", startStr)
      .lte("log_date", todayStr);
    if (!error) setStreakLogs(data || []);
  }

  async function loadAll() {
    setLoading(true);
    const start = dateStrFor(viewYear, viewMonth, 1);
    const end = dateStrFor(viewYear, viewMonth, daysInMonth);

    // Fetch habits, this month's logs, and premium status at the same time
    // instead of one after the other — this was the actual cause of the
    // slow/laggy load before.
    const { data: { session: authSession } } = await supabase.auth.getSession();
    const user = authSession?.user;
    const [habitsRes, logsRes, profileRes] = await Promise.all([
      supabase.from("habits").select("*").order("created_at", { ascending: true }),
      supabase.from("habit_logs").select("habit_id, log_date").gte("log_date", start).lte("log_date", end),
      user ? supabase.from("profiles").select("premium_tier").eq("user_id", user.id).maybeSingle() : Promise.resolve({ data: null }),
    ]);

    if (!habitsRes.error) setHabits(habitsRes.data || []);
    if (!logsRes.error) setLogs(logsRes.data || []);
    setIsPremium((profileRes?.data?.premium_tier || "free") === "premium");
    setLoading(false);
  }

  async function loadLogs() {
    const start = dateStrFor(viewYear, viewMonth, 1);
    const end = dateStrFor(viewYear, viewMonth, daysInMonth);
    const { data, error } = await supabase
      .from("habit_logs")
      .select("habit_id, log_date")
      .gte("log_date", start)
      .lte("log_date", end);
    if (!error) setLogs(data || []);
  }

  const checkedSet = new Set(logs.map((l) => `${l.habit_id}_${l.log_date}`));

  async function addHabit() {
    if (!newHabitName.trim()) return;
    if (containsProfanity(newHabitName)) {
      setLimitError("That name violates our terms and isn't available.");
      return;
    }
    setLimitError("");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data, error } = await supabase
      .from("habits")
      .insert({ user_id: user.id, name: newHabitName.trim() })
      .select()
      .single();
    if (error) {
      setLimitError(
        (error.message || "").includes("HABIT_LIMIT")
          ? "You've reached your plan's habit limit — upgrade to add more."
          : "Couldn't add that habit — please try again."
      );
      return;
    }
    setHabits((h) => [...h, data]);
    setNewHabitName("");
    setShowAddForm(false);
  }

  async function removeHabit(id) {
    const previous = habits;
    setHabits((h) => h.filter((x) => x.id !== id));
    const { error } = await supabase.from("habits").delete().eq("id", id);
    if (error) setHabits(previous);
  }

  async function toggleDay(habitId, day) {
    const dateStr = dateStrFor(viewYear, viewMonth, day);
    const key = `${habitId}_${dateStr}`;
    const isChecked = checkedSet.has(key);

    if (isChecked) {
      setLogs((l) => l.filter((x) => !(x.habit_id === habitId && x.log_date === dateStr)));
      setStreakLogs((l) => l.filter((x) => !(x.habit_id === habitId && x.log_date === dateStr)));
      const { error } = await supabase.from("habit_logs").delete().eq("habit_id", habitId).eq("log_date", dateStr);
      if (error) {
        loadLogs();
        loadStreakLogs();
      }
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setLogs((l) => [...l, { habit_id: habitId, log_date: dateStr }]);
      setStreakLogs((l) => [...l, { habit_id: habitId, log_date: dateStr }]);
      const { error } = await supabase.from("habit_logs").insert({ user_id: user.id, habit_id: habitId, log_date: dateStr });
      if (error) {
        loadLogs();
        loadStreakLogs();
      }
    }
  }

  function completedCountFor(habitId) {
    return logs.filter((l) => l.habit_id === habitId).length;
  }

  const totalPossible = habits.length * daysInMonth;
  const totalCompleted = habits.reduce((sum, h) => sum + completedCountFor(h.id), 0);
  const overallPct = totalPossible > 0 ? Math.round((totalCompleted / totalPossible) * 100) : 0;

  // Current streak: real consecutive calendar days ending today, using the
  // dedicated streakLogs history (not the month currently being viewed) so it
  // correctly continues across month boundaries instead of stopping dead at
  // day 1 of whatever month happens to be on screen. A missed day naturally
  // ends the count here — the walk stops at the first gap — so the streak
  // shown is always "the most recent unbroken run," exactly as intended.
  const streakCheckedSet = new Set(streakLogs.map((l) => `${l.habit_id}_${l.log_date}`));

  function currentStreakFor(habitId) {
    let streak = 0;
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    for (;;) {
      const dateStr = dateStrFor(d.getFullYear(), d.getMonth(), d.getDate());
      if (streakCheckedSet.has(`${habitId}_${dateStr}`)) {
        streak++;
        d.setDate(d.getDate() - 1);
      } else {
        break;
      }
    }
    return streak;
  }

  // Only allow going back as far as the month the first habit was actually
  // created — there's no data before that, so there's nothing to show.
  let minYear = now.getFullYear();
  let minMonth = now.getMonth();
  if (habits.length > 0) {
    const earliest = habits.reduce((min, h) => {
      const d = new Date(h.created_at);
      return d < min ? d : min;
    }, new Date(habits[0].created_at));
    minYear = earliest.getFullYear();
    minMonth = earliest.getMonth();
  }

  const goPrevMonth = () => {
    // Would this move land before the earliest recorded month?
    const targetMonth = viewMonth === 0 ? 11 : viewMonth - 1;
    const targetYear = viewMonth === 0 ? viewYear - 1 : viewYear;
    const targetIsBeforeMin = targetYear < minYear || (targetYear === minYear && targetMonth < minMonth);

    if (targetIsBeforeMin) {
      setBoundaryMsgTrigger((p) => p + 1);
      return;
    }
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };
  const goNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const dayNumbers = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  // ---------- Derived data for charts / summaries ----------

  // Daily completion % trend across the whole month (habits checked that day / total habits)
  const dailyTrend = dayNumbers.map((d) => {
    if (habits.length === 0) return { day: d, pct: 0 };
    const dateStr = dateStrFor(viewYear, viewMonth, d);
    const checkedCount = habits.filter((h) => checkedSet.has(`${h.id}_${dateStr}`)).length;
    return { day: d, pct: Math.round((checkedCount / habits.length) * 100) };
  });

  // Weekly breakdown: real calendar weeks, Monday through Sunday. The first and/or
  // last week of the month may be partial if the month doesn't start on a Monday
  // or end on a Sunday.
  const weeks = [];
  let currentWeekDays = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(viewYear, viewMonth, d).getDay(); // 0=Sun, 1=Mon, ... 6=Sat
    currentWeekDays.push(d);
    if (dow === 0 || d === daysInMonth) {
      const weekDays = currentWeekDays;
      let completed = 0;
      weekDays.forEach((wd) => {
        const dateStr = dateStrFor(viewYear, viewMonth, wd);
        completed += habits.filter((h) => checkedSet.has(`${h.id}_${dateStr}`)).length;
      });
      const goal = habits.length * weekDays.length;
      weeks.push({
        label: `Week ${weeks.length + 1}`,
        days: weekDays,
        completed,
        goal,
        left: Math.max(0, goal - completed),
        pct: goal > 0 ? Math.round((completed / goal) * 100) : 0,
      });
      currentWeekDays = [];
    }
  }
  const weekEndDays = new Set(weeks.map((w) => w.days[w.days.length - 1]));

  useEffect(() => {
    if (theadRef.current) {
      setTheadHeight(theadRef.current.offsetHeight);
    }
    if (titleRef.current) {
      setTitleHeight(titleRef.current.offsetHeight + 12); // +12 for its mb-3 margin
    }
  }, [daysInMonth, weeks.length, loading]);

  // Top habits ranked by completion %
  const topHabits = [...habits]
    .map((h) => {
      const completed = completedCountFor(h.id);
      const pct = daysInMonth > 0 ? Math.round((completed / daysInMonth) * 100) : 0;
      const streak = currentStreakFor(h.id);
      return { ...h, completed, pct, streak };
    })
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 10);

  const [donutReady, setDonutReady] = useState(false);
  useEffect(() => {
    if (!loading) {
      setDonutReady(false);
      const t = setTimeout(() => setDonutReady(true), 60);
      return () => clearTimeout(t);
    }
  }, [loading, viewYear, viewMonth]);

  const donutData = donutReady
    ? [
        { name: "Completed", value: totalCompleted },
        { name: "Left", value: Math.max(0, totalPossible - totalCompleted) },
      ]
    : [
        { name: "Completed", value: 0 },
        { name: "Left", value: Math.max(1, totalPossible) },
      ];
  const DONUT_COLORS = ["var(--accent)", "var(--surface-2)"];

  if (!readOnly && !loading && !isPremium) {
    return (
      <>
        <div className="pointer-events-none select-none blur-md opacity-60 space-y-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-hover)] flex items-center justify-center shrink-0">
              <Layers size={19} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-[var(--text-primary)]">Habit Tracker</h1>
              <p className="text-sm text-[var(--text-secondary)] mt-0.5">Every checkbox is a promise kept to yourself.</p>
            </div>
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            {["Daily completion", "Current streaks", "Monthly progress"].map((label) => (
              <GlowCard key={label}>
                <p className="text-xs text-[var(--text-muted)] mb-2">{label}</p>
                <p className="text-2xl font-bold text-[var(--text-primary)]">••%</p>
              </GlowCard>
            ))}
          </div>
          <GlowCard>
            <p className="text-sm font-medium text-[var(--text-primary)] mb-3 text-center">Daily habits</p>
            <div className="space-y-2">
              {["Morning workout", "Read 20 pages", "Drink 2L water", "No phone after 10pm", "Sleep before midnight", "Meditate 10 min"].map((name) => (
                <div key={name} className="flex items-center gap-3 bg-[var(--surface-2)]/40 rounded-xl p-3">
                  <div className="h-4 w-4 rounded border border-[var(--border-strong)]" />
                  <span className="text-sm text-[var(--text-secondary-strong)]">{name}</span>
                  <div className="ml-auto flex gap-1">
                    {Array.from({ length: 7 }).map((_, i) => (
                      <div key={i} className="h-3 w-3 rounded-sm bg-[var(--accent)]/40" />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </GlowCard>
          <GlowCard>
            <p className="text-sm font-medium text-[var(--text-primary)] mb-3 text-center">Monthly trend</p>
            <div className="flex items-end gap-2 h-24">
              {[40, 65, 30, 80, 55, 70, 45, 60, 35, 75].map((h, i) => (
                <div key={i} className="flex-1 bg-[var(--accent)]/40 rounded-t" style={{ height: `${h}%` }} />
              ))}
            </div>
          </GlowCard>
          <GlowCard>
            <p className="text-sm font-medium text-[var(--text-primary)] mb-3 text-center">Top habits</p>
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="text-[var(--text-secondary-strong)]">Habit {i}</span>
                  <span className="text-[var(--text-muted)]">••%</span>
                </div>
              ))}
            </div>
          </GlowCard>
        </div>
        <div className="fixed inset-0 md:left-60 lg:left-64 z-[200] flex items-center justify-center p-4 pointer-events-none">
          <div className="bg-[var(--surface-solid)] border border-[rgb(var(--accent-rgb)/0.4)] rounded-3xl p-6 max-w-sm w-full text-center shadow-[0_0_60px_-10px_rgb(var(--accent-rgb)/0.5)] pointer-events-auto">
            <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-hover)] flex items-center justify-center glow-accent-30 mx-auto mb-4">
              <Lock size={22} className="text-white" />
            </div>
            <p className="text-base font-semibold text-[var(--text-primary)] mb-2">Habit Tracker is a Pro feature</p>
            <p className="text-sm text-[var(--text-muted)] mb-6">Daily habit tracking, streaks, and monthly insights are included with Pro. Need recurring checklists instead? Try the To-Do List under Tasks — that's included with Basic.</p>
            <button
              onClick={() => requireAuth(() => goTo && goTo("pricing"))}
              className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-medium px-6 py-3 rounded-xl transition-colors glow-accent-40 w-full"
            >
              Upgrade to Unlock
            </button>
          </div>
        </div>
      </>
    );
  }
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-hover)] flex items-center justify-center glow-accent-30 shrink-0">
            <Layers size={19} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-[var(--text-primary)]">Habit Tracker</h1>
            <p className="text-sm text-[var(--text-secondary)] mt-0.5">Every checkbox is a promise kept to yourself.</p>
          </div>
        </div>
        {!readOnly && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => requireAuth(() => {
                setShowAddForm((s) => !s);
                setLimitError("");
              })}
              className="flex items-center gap-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
            >
              <Plus size={16} /> Add habit
            </button>
          </div>
        )}
      </div>

      {!readOnly && showAddForm && (
        <GlowCard>
          <div className="flex gap-3">
            <input
              value={newHabitName}
              onChange={(e) => {
                setNewHabitName(e.target.value);
                setLimitError("");
              }}
              onKeyDown={(e) => e.key === "Enter" && addHabit()}
              placeholder="Habit name (e.g. Wake up at 6am)"
              className="flex-1 bg-[var(--input-bg)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)]"
            />
            <button onClick={addHabit} className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium rounded-xl px-4 py-2.5 transition-colors">
              Add
            </button>
          </div>
          {limitError && (
            <div className="mt-3 flex items-center justify-between gap-3 bg-[rgb(var(--accent-rgb)/0.1)] border border-[rgb(var(--accent-rgb)/0.3)] rounded-xl px-4 py-2.5">
              <p className="text-xs text-[var(--text-secondary-strong)]">{limitError}</p>
              <button onClick={() => goTo && goTo("pricing")} className="text-xs bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-medium px-3 py-1.5 rounded-lg transition-colors shrink-0">
                Upgrade
              </button>
            </div>
          )}
        </GlowCard>
      )}

      <div className="flex flex-col md:relative md:flex-row md:items-center md:justify-between gap-3">
        <p className="hidden md:block text-xs text-[var(--text-muted)] shrink-0"></p>
        <div className="flex items-center justify-center gap-3 md:absolute md:left-1/2 md:-translate-x-1/2">
          {!readOnly && (
            <button onClick={goPrevMonth} className="h-8 w-8 rounded-lg bg-[var(--surface-2)] border border-[var(--card-border)] text-[var(--text-secondary-strong)] hover:bg-[var(--surface-3)] flex items-center justify-center transition-all duration-150 active:scale-90">
              <ChevronLeft size={15} />
            </button>
          )}
          <p className="text-[var(--text-primary)] font-medium text-sm w-40 text-center">{monthLabel}</p>
          {!readOnly && (
            <button
              onClick={goNextMonth}
              className="h-8 w-8 rounded-lg bg-[var(--surface-2)] border border-[var(--card-border)] text-[var(--text-secondary-strong)] hover:bg-[var(--surface-3)] flex items-center justify-center transition-all duration-150 active:scale-90"
            >
              <ChevronRight size={15} />
            </button>
          )}
          {!readOnly && <FadeMessage trigger={boundaryMsgTrigger} text="No records before this month — that's when you started tracking." />}
        </div>
        <div className="shrink-0 flex justify-center md:block">
          <LimitBadge label="Habit limit" current={habits.length} max={null} goTo={goTo} />
        </div>
      </div>

      {habits.length === 0 && !loading ? (
        <GlowCard className="text-center py-10 text-[var(--text-muted)] text-sm">
          No habits yet. Add your first habit to start tracking.
        </GlowCard>
      ) : (
        <div className="space-y-4">
        <>
          {/* Row A: [Trend+Donut, then Weekly breakdown] on the left, stacked —
              Top habits on the right, stretched to match that combined height. */}
          <div ref={rowARef} className="grid md:grid-cols-4 gap-4">
            <div className="md:col-span-3 space-y-4">
              <div className="grid md:grid-cols-3 gap-4">
                <GlowCard className="md:col-span-2">
                  <p className="text-sm font-medium text-[var(--text-primary)] mb-3 text-center">Daily completion trend</p>
                  <div style={{ width: "100%", height: 180 }}>
                    <ResponsiveContainer>
                      <AreaChart data={dailyTrend}>
                        <defs>
                          <linearGradient id="habitTrendGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.5} />
                            <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                        <XAxis dataKey="day" stroke="var(--text-muted)" fontSize={10} tickLine={false} axisLine={false} interval={Math.ceil(daysInMonth / 10)} />
                        <YAxis stroke="var(--text-muted)" fontSize={10} tickLine={false} axisLine={false} width={30} domain={[0, 100]} unit="%" />
                        <Tooltip
                          contentStyle={{ background: "var(--surface-solid)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, color: "var(--text-primary)" }}
                          formatter={(v) => (v === null ? "—" : `${v}%`)}
                        />
                        <Area type="monotone" dataKey="pct" stroke="var(--accent)" strokeWidth={2} fill="url(#habitTrendGrad)" connectNulls={false} isAnimationActive={!readOnly} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </GlowCard>

                <GlowCard className="flex flex-col items-center justify-center">
                  <p className="text-sm font-medium text-[var(--text-primary)] mb-2 text-center">Monthly progress</p>
                  <div className="relative" style={{ width: "100%", height: 160 }}>
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie
                          data={donutData}
                          dataKey="value"
                          innerRadius="65%"
                          outerRadius="90%"
                          startAngle={90}
                          endAngle={-270}
                          stroke="none"
                          isAnimationActive={!readOnly && donutReady}
                          animationDuration={700}
                          animationEasing="ease-out"
                        >
                          {donutData.map((entry, i) => (
                            <Cell key={i} fill={DONUT_COLORS[i]} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className="text-2xl font-bold text-[var(--text-primary)] transition-opacity duration-300" style={{ opacity: donutReady ? 1 : 0.3 }}>
                        {donutReady ? overallPct : 0}%
                      </span>
                      <span className="text-[10px] text-[var(--text-muted)]">{totalCompleted}/{totalPossible}</span>
                    </div>
                  </div>
                </GlowCard>
              </div>

              <GlowCard>
                <p className="text-sm font-medium text-[var(--text-primary)] mb-3 text-center">Weekly breakdown</p>
                <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }}>
                  {weeks.map((w) => (
                    <div key={w.label} className="bg-[var(--surface-2)]/40 rounded-xl p-3 text-center">
                      <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)] mb-1">{w.label}</p>
                      <p className="text-sm font-bold text-[var(--text-primary)] text-center tabular-nums">{w.completed}/{w.goal}</p>
                      <p className="text-[10px] text-[var(--text-muted)] mb-2">{w.pct}%</p>
                      <div className="h-1.5 rounded-full bg-[var(--surface-3)] overflow-hidden">
                        <div className="h-full bg-[var(--accent-hover)] transition-all duration-500" style={{ width: `${w.pct}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </GlowCard>
            </div>

            <div className="md:col-span-1">
              <GlowCard className="h-full flex flex-col">
                <p className="text-sm font-medium text-[var(--text-primary)] mb-3 text-center">Top 10 Habits</p>
                <div className="flex-1 flex flex-col justify-between">
                  {topHabits.map((h, i) => (
                    <div key={h.id} className="flex items-center justify-between text-sm gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[var(--text-faint)] text-xs w-4 shrink-0">{i + 1}</span>
                        <span className={"text-[var(--text-primary)] " + (readOnly ? "break-words leading-snug" : "truncate")}>{h.name}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {h.streak >= 2 && (
                          <span className="flex items-center gap-0.5 text-[10px] text-orange-400">
                            <Flame size={11} /> {h.streak}
                          </span>
                        )}
                        <span className="text-[var(--text-muted)] text-xs">{h.pct}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </GlowCard>
            </div>
          </div>

          {/* Row B: Daily habits table on the left, Progress stretched to exactly match on the right. */}
          <div ref={rowBRef} className="grid md:grid-cols-4 gap-4 min-w-0">
            <div className="md:col-span-3 min-w-0">
              <GlowCard>
                <p ref={titleRef} className="text-sm font-medium text-[var(--text-primary)] mb-3 text-center">Daily habits</p>
                <div className="overflow-x-auto -mx-1 px-1">
                <table className="border-collapse text-[10px] w-full min-w-[640px] md:min-w-0 md:table-fixed">
                  <thead ref={theadRef}>
                    <tr>
                      <th rowSpan={2} className="sticky left-0 z-10 bg-[var(--surface-solid)] text-center px-2 py-2 text-[var(--text-primary)] font-bold uppercase tracking-wide text-xs border border-[rgb(var(--accent-rgb)/0.3)] border-b-2 border-b-[rgb(var(--accent-rgb)/0.6)]" style={{ width: "18%" }}>
                        Habit
                      </th>
                        {weeks.map((w, wi) => (
                        <th
                          key={wi}
                          colSpan={w.days.length}
                          className="bg-[rgb(var(--accent-rgb)/0.2)] text-center py-1.5 text-[var(--text-primary)] font-semibold uppercase tracking-tight border border-[rgb(var(--accent-rgb)/0.3)] overflow-hidden"
                          style={{ fontSize: w.days.length <= 2 ? "7px" : "9px" }}
                        >
                          {w.days.length <= 2 ? `W${wi + 1}` : w.label}
                        </th>
                      ))}
                      <th rowSpan={2} className="bg-[rgb(var(--accent-rgb)/0.2)] text-center px-1 py-1.5 text-[var(--text-primary)] font-semibold border border-[rgb(var(--accent-rgb)/0.3)]" style={{ width: "5%" }}>
                        %
                      </th>
                      <th rowSpan={2} className="bg-[rgb(var(--accent-rgb)/0.2)] border border-[rgb(var(--accent-rgb)/0.3)]" style={{ width: "3%" }}></th>
                    </tr>
                    <tr>
                      {dayNumbers.map((d) => {
                        const isWeekEnd = weekEndDays.has(d);
                        const isToday = isCurrentMonth && d === now.getDate();
                        return (
                          <th
                            key={d}
                            className={
                              "px-0.5 py-1 text-center font-normal border border-[var(--border-subtle)] border-b-2 border-b-[var(--border)] " +
                              (isToday ? "bg-[rgb(var(--accent-rgb)/0.25)] text-[var(--text-primary)] " : "text-[var(--text-muted)] ") +
                              (isWeekEnd ? "border-r-2 border-r-[var(--border)]" : "")
                            }
                          >
                            <div className="text-[7px] uppercase">{WEEKDAY_LETTERS[new Date(viewYear, viewMonth, d).getDay()]}</div>
                            <div className={isToday ? "font-bold" : "text-[var(--text-secondary-strong)] font-medium"}>{d}</div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {habits.map((h) => {
                      const completed = completedCountFor(h.id);
                      const pct = daysInMonth > 0 ? Math.round((completed / daysInMonth) * 100) : 0;
                      return (
                        <tr key={h.id} style={{ height: 26 }}>
                          <td className="sticky left-0 z-10 bg-[var(--surface-solid)] px-2 py-1.5 text-[var(--text-primary)] text-center truncate border border-[var(--border-subtle)]">
                            {h.name}
                          </td>
                          {dayNumbers.map((d) => {
                            const dateStr = dateStrFor(viewYear, viewMonth, d);
                            const checked = checkedSet.has(`${h.id}_${dateStr}`);
                            const isWeekEnd = weekEndDays.has(d);
                            return (
                              <td
                                key={d}
                                className={
                                  "text-center p-0.5 border border-[var(--border-subtle)] " +
                                  (isWeekEnd ? "border-r-2 border-r-[var(--border)]" : "")
                                }
                              >
                                <button
                                  onClick={() => requireAuth(() => toggleDay(h.id, d))}
                                  className={
                                    "h-3.5 w-3.5 rounded-[3px] border flex items-center justify-center mx-auto transition-all duration-150 active:scale-90 " +
                                    (checked
                                      ? "bg-[var(--accent)] border-[var(--accent)]"
                                      : "border-[var(--border-strong)] hover:border-[var(--accent)]")
                                  }
                                >
                                  {checked && <Check size={8} className="text-white" />}
                                </button>
                              </td>
                            );
                          })}
                          <td className="text-center text-[var(--text-secondary)] border border-[var(--border-subtle)]">{pct}%</td>
                          <td className="text-center border border-[var(--border-subtle)]">
                            {!readOnly && <DeleteConfirmButton onConfirm={() => removeHabit(h.id)} itemLabel={h.name} />}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
              </GlowCard>
            </div>

            <div className="md:col-span-1 min-w-0">
              <GlowCard className="h-full flex flex-col overflow-hidden">
                <div className="flex flex-col items-center justify-start gap-1 pt-4" style={{ height: theadHeight + titleHeight }}>
                  <p className="text-sm font-medium text-[var(--text-primary)] text-center">Progress</p>
                  <div className="flex items-center gap-1.5 text-[var(--text-muted)] mt-4">
                    <TrendingUp size={12} className="text-[var(--accent-text)]" />
                    <span className="text-xs">
                      <span className="text-[var(--text-secondary-strong)] font-semibold">{overallPct}%</span> avg completion
                    </span>
                  </div>
                </div>
                <table className="border-collapse w-full flex-1">
                  <tbody>
                    {habits.map((h) => {
                      const completed = completedCountFor(h.id);
                      const pct = daysInMonth > 0 ? Math.round((completed / daysInMonth) * 100) : 0;
                      return (
                        <tr key={h.id} style={{ height: 26 }}>
                          <td className="pr-2 text-[var(--text-secondary-strong)] text-[10px] truncate" style={{ width: "35%" }}>
                            {h.name}
                          </td>
                          <td className="pr-2" style={{ width: "50%" }}>
                            <div className="h-1.5 rounded-full bg-[var(--surface-2)] overflow-hidden">
                              <div className="h-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-hover)] transition-all duration-500" style={{ width: `${pct}%` }} />
                            </div>
                          </td>
                          <td className="text-[var(--text-muted)] text-[9px] text-right whitespace-nowrap">{pct}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </GlowCard>
            </div>
          </div>
        </>
        </div>
      )}
      <div className="h-16" aria-hidden="true" />
    </div>
  );
}

/* ---------------------------- Growth (leveling character) ---------------------------- */
/* An original stylized silhouette character that gains visual "power" — aura rings,   */
/* a weapon, a cape, a crown — as the person's real lifetime focused minutes grow.     */
/* This is not a depiction of any existing show's character or artwork.                */

// Tier 0 stays neutral grey (character hasn't awakened any power yet);
// every tier after that uses the active theme's accent color at increasing
// opacity, so the growth progression now follows whichever theme is active
// instead of always being hardcoded purple.
// True per-level color interpolation — smoothly blends from a neutral grey
// (level 1, "hasn't awakened yet") to the full theme accent (level 100),
// using the browser's own color-mix() rather than stepping between a fixed
// palette of 10 colors. Every single level looks a little different from
// the one before it, not just every 10th level.
function growthColorForLevel(level) {
  if (level <= GROWTH_NORMAL_LEVEL_COUNT) {
    // Floor of 40% keeps the theme's accent clearly present even at low
    // levels, instead of starting almost entirely grey and only really
    // reading as "theme-colored" once someone's near level 200.
    const pct = 40 + Math.round(((level - 1) / (GROWTH_NORMAL_LEVEL_COUNT - 1)) * 60);
    return `color-mix(in srgb, var(--accent) ${pct}%, #52525b)`;
  }
  // Secret levels (201-500) shift toward a distinct violet "beyond" tone,
  // but CAPPED at 65% — at exactly level 500 this used to hit 100% violet,
  // completely overriding the theme's own accent color with zero trace of
  // it left. Capping keeps the theme visibly present even at max level.
  const pct = Math.min(65, Math.round(((level - GROWTH_NORMAL_LEVEL_COUNT) / (GROWTH_LEVEL_COUNT - GROWTH_NORMAL_LEVEL_COUNT)) * 100));
  return `color-mix(in srgb, #a855f7 ${pct}%, var(--accent))`;
}
// TESTING VALUE — set back to 10000 once you've confirmed leveling up works correctly.
// At 10000, each level takes 100 minutes (10000 / 100 levels). Right now it's set to
// 100, so each level only takes 1 minute — fast enough to actually test with real
// short sessions instead of waiting for real study time to build up.
const GROWTH_XP_PER_MINUTE = 100; // 1 min focus = 100 XP

// Daily cap on how many focus MINUTES count toward XP, tiered by premium
// plan. Deliberately tuned so that someone maxing out task XP + focus XP
// every single day, plus collecting all normal achievements along the way,
// reaches level 200 (now 7,000,000 XP) in roughly: Free ~9.6 months,
// Basic ~6.8 months, Premium ~4.9 months. These are genuinely generous
// caps (2h/4h/7h) — nobody doing normal daily study bumps into them; the
// only thing they actually block is the original abuse case of leaving a
// timer running unattended for many hours. Premium isn't purchasable yet
// (still "Coming soon"), so premium_tier is assigned manually until real
// payment processing exists.
const FOCUS_DAILY_CAP_MINUTES = { free: 120, basic: 240, premium: 420 }; // 2h / 4h / 7h

// Sessions are stored individually with no running daily total anywhere, so
// the cap has to be applied by grouping all of a person's sessions by their
// LOCAL calendar day, capping each day's minutes at the tier limit, then
// summing the (now-capped) XP across every day — rather than just capping
// the grand total, which would let someone "bank" a huge total from the
// past and ignore the cap entirely for whichever single day they check.
//
// DEPRECATED: no longer called anywhere. The actual capped XP used for
// Growth/Profile/Leaderboard/AchievementsTab/InspectFriendPage now comes
// from the get_my_capped_focus_xp() / get_capped_focus_xp() database
// functions instead, so the cap can't be bypassed by a modified frontend
// build. Left here only for reference.
function computeCappedFocusXP(sessions, tierCapMinutes) {
  const minutesByDay = {};
  (sessions || []).forEach((s) => {
    if (!s.completed_at) return;
    const d = new Date(s.completed_at);
    const dayKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    minutesByDay[dayKey] = (minutesByDay[dayKey] || 0) + (s.focused_seconds || 0) / 60;
  });
  let totalCappedMinutes = 0;
  Object.values(minutesByDay).forEach((mins) => {
    totalCappedMinutes += Math.min(mins, tierCapMinutes);
  });
  return Math.floor(totalCappedMinutes) * GROWTH_XP_PER_MINUTE;
}
const TASK_XP_PER_COMPLETION = 150; // 1 completed task = 150 XP toward Growth
const DAILY_TASK_XP_CAP = 750; // max task XP per calendar day (5 tasks worth) — keeps task-spamming from out-earning real focus time

// Levels 1-200 are the "normal" ladder everyone actually plays through —
// unchanged from before, still 35,000 XP apart, still capping at 7,000,000
// for Level 200. Levels 201-500 are the hidden continuation tied to the
// Secret achievement: a much steeper 300,000 XP/level climb (except the
// very last, which is deliberately set to land exactly on 100,000,000
// rather than the formulaic value, same "stretch goal" treatment Level 200
// itself used to get). Nothing about the 1-200 range changes at all.
const GROWTH_NORMAL_LEVEL_COUNT = 200;
const GROWTH_LEVEL_COUNT = 500;
const GROWTH_XP_PER_LEVEL = 35000; // levels 1-200
const GROWTH_MAX_XP = 100000000; // Level 500, the true final cap

const GROWTH_RANK_NAMES = [
  "Awakened", "Initiate", "Novice", "Beginner", "Learner", "Seeker", "Disciple", "Adept", "Scholar", "Rising Star",
  "Iron Will", "Steel Resolve", "Focused Soul", "Mindforged", "Knowledge Seeker", "Focus Hunter", "Disciplined Mind", "Determined Soul", "Unyielding Spirit", "Rising Warrior",
  "Focus Warrior", "Mind Warrior", "Study Warrior", "Knowledge Warrior", "Iron Scholar", "Steel Scholar", "Elite Scholar", "Elite Mind", "Grinding Adept", "Persistent Mind",
  "Tenacious Scholar", "Relentless Seeker", "Sharp Mind", "Keen Scholar", "Vigilant Adept", "Watchful Mind", "Diligent Warrior", "Steady Hand", "Firm Resolve", "Bold Apprentice",
  "Master Learner", "Master Scholar", "Grand Scholar", "Grand Apprentice", "Sage Apprentice", "Young Sage", "Budding Sage", "Wise Initiate", "Clever Scholar", "Bright Mind",
  "Sharp Scholar", "Focused Master", "Adept Warrior", "Skilled Hand", "Practiced Mind", "Trained Scholar", "Honed Mind", "Refined Scholar", "Polished Adept", "Accomplished Seeker",
  "Veteran Scholar", "Seasoned Adept", "Expert Mind", "Proficient Sage", "Capable Master", "Talented Scholar", "Gifted Mind", "Prodigy Adept", "Faaahhh", "Radiant Mind",
  "Luminous Scholar", "Shining Adept", "Vivid Mind", "Dynamic Scholar", "Fierce Adept", "Intense Mind", "Blazing Scholar", "Ardent Sage", "Passionate Master", "Resolute Champion",
  "Elite Sage", "High Sage", "Arcane Sage", "Master of Focus", "Master of Will", "Master of Discipline", "Grand Sage", "Sage King", "Sage Lord", "Sage Emperor",
  "Legendary Scholar", "Legendary Mind", "Legendary Master", "Legendary Sage", "Legendary King", "Mythic King", "Mythic Sovereign", "Eternal Monarch", "Void Emperor", "Celestial Emperor",
  "Supreme Emperor", "Divine Emperor", "God-King", "Eternal God-King", "Celestial God", "Divine Sovereign", "Sovereign of Eternity", "Lord of the Heavens", "Ruler of Realms", "Conqueror of Worlds",
  "World Sovereign", "Realm Breaker", "Heaven Breaker", "Star Destroyer", "Cosmic Overlord", "Eternal Overlord", "Lord of Infinity", "Infinite Sovereign", "Transcendent King", "King Beyond Realms",
  "Supreme Transcendent", "Absolute Sovereign", "The Undying King", "The Eternal King", "The Celestial King", "Emperor of Eternity", "Emperor Beyond Heaven", "Divine Overlord", "God of Knowledge", "God of Focus",
  "God of Wisdom", "God of Will", "God of Discipline", "God of Wrath", "God of Eternity", "Supreme God", "Supreme Deity", "Eternal Deity", "Celestial Deity", "Divine Ascendant",
  "Beyond the Divine", "Absolute Being", "Eternal Being", "The One Beyond All", "God of All Knowledge", "Astral Sovereign", "Astral Emperor", "Nebula King", "Nebula Sovereign", "Galactic Overlord",
  "Galactic Emperor", "Starforged King", "Starforged Sovereign", "Solar Emperor", "Lunar Sovereign", "Twilight King", "Dawnbringer", "Duskbringer", "Voidwalker King", "Voidwalker Sovereign",
  "Timeless King", "Timeless Sovereign", "Ageless Emperor", "Boundless King", "Boundless Sovereign", "Limitless Emperor", "Endless King", "Endless Sovereign", "Infinite Emperor", "Omniscient King",
  "Omnipotent Sovereign", "All-Seeing Emperor", "All-Knowing King", "First of the Ancients", "Last of the Ancients", "Primordial King", "Primordial Sovereign", "Genesis Emperor", "Genesis King", "Origin Sovereign",
  "Origin Emperor", "Apex King", "Apex Sovereign", "Zenith Emperor", "Zenith King", "Pinnacle Sovereign", "Pinnacle Emperor", "Summit King", "Ultimate Sovereign", "Ultimate Emperor",
  "Paramount King", "Paramount Sovereign", "Supreme Ascendant", "Highest Throne", "Grand Throne", "Eternal Throne", "Celestial Throne", "Divine Throne", "Throne Bearer", "King of the Throne",
  "The Beyond",
];

// No gradual climb through 201-499 at all — you stay at Level 200 (the
// normal ladder's real max) until you cross 100,000,000 XP, at which point
// you jump straight to Level 500. Nothing in between exists.
//
// Level 200 itself is a special case: every other level is a uniform
// 35,000 XP step, but 199 -> 200 is deliberately DOUBLE that (70,000),
// landing exactly on 7,000,000 rather than the formulaic 6,965,000 a
// perfectly uniform ladder would give it.
const GROWTH_LEVELS = [
  ...Array.from({ length: GROWTH_NORMAL_LEVEL_COUNT }, (_, i) => {
    const level = i + 1;
    return {
      level,
      name: GROWTH_RANK_NAMES[i],
      color: growthColorForLevel(level),
      threshold: level === GROWTH_NORMAL_LEVEL_COUNT ? GROWTH_NORMAL_LEVEL_COUNT * GROWTH_XP_PER_LEVEL : (level - 1) * GROWTH_XP_PER_LEVEL,
    };
  }),
  {
    level: GROWTH_LEVEL_COUNT, // 500
    name: GROWTH_RANK_NAMES[GROWTH_NORMAL_LEVEL_COUNT], // "The Beyond"
    color: growthColorForLevel(GROWTH_LEVEL_COUNT),
    threshold: GROWTH_MAX_XP, // 100,000,000, exactly
  },
];

// Takes total XP directly (focus minutes already converted at 10 XP/min,
// plus any achievement XP added on top — both are the same unit now, no
// separate minutes<->XP conversion needed at the call site).
function computeGrowth(totalXP) {
  const capped = Math.min(totalXP, GROWTH_MAX_XP);
  let current = GROWTH_LEVELS[0];
  let next = GROWTH_LEVELS[1];
  for (let i = 0; i < GROWTH_LEVELS.length; i++) {
    if (capped >= GROWTH_LEVELS[i].threshold) {
      current = GROWTH_LEVELS[i];
      next = GROWTH_LEVELS[i + 1] || null;
    }
  }
  const bandStart = current.threshold;
  const bandEnd = next ? next.threshold : GROWTH_MAX_XP;
  const pct = next ? Math.min(100, ((capped - bandStart) / (bandEnd - bandStart)) * 100) : 100;
  return { current, next, pct, capped };
}

// Rank name display — plain, solid color, no blur/glow of any kind. Only
// font weight and size scale up at real milestones, so distinction comes
// from typography, not visual noise.
function LevelNameEffect({ level, name, color, className = "text-2xl font-bold" }) {
  const weightClass = level >= 150 ? "font-extrabold" : level >= 100 ? "font-bold" : level >= 50 ? "font-semibold" : "";
  return (
    <p className={className + " " + weightClass + " inline-flex items-center gap-1.5 justify-center"} style={{ color }}>
      {name}
      {level >= 200 && <Crown size={18} className="text-amber-400 shrink-0" />}
    </p>
  );
}

function GrowthCharacter({ level, color }) {
  const progress = Math.max(0, Math.min(1, (Math.min(level, GROWTH_NORMAL_LEVEL_COUNT) - 1) / (GROWTH_NORMAL_LEVEL_COUNT - 1)));

  // Continuous — the base silhouette still grows and broadens smoothly.
  const bodyScale = 0.92 + progress * 0.2;
  const bodyWidth = 54 + progress * 18;
  const bodyX = 120 - bodyWidth / 2;
  const armGap = 18 + progress * 8;
  const auraGlow = 60 + progress * 30;

  // Discrete — each of these is a genuinely NEW feature that appears fully
  // formed the moment its level is reached, rather than the same handful of
  // things slowly fading in via opacity. Thresholds are spread widely across
  // all 200 levels so something new keeps showing up the whole way through.
  const hasRing1 = level >= 20;
  const hasPauldrons = level >= 45;
  const hasRing2 = level >= 70;
  const hasCape = level >= 95;
  const hasWeapon = level >= 120;
  const hasRing3 = level >= 145;
  const hasCrown = level >= 170;
  const hasBurst = level >= 200;
  const hasSecretAura = level >= 500; // "The Beyond" — a distinct violet ascension ring, layered on top of the fully-maxed level-200 form rather than replacing it

  return (
    <svg viewBox="0 0 240 280" className="h-64 w-64 mx-auto">
      <defs>
        <radialGradient id="auraGrad" cx="50%" cy="55%" r="55%">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </radialGradient>
        <linearGradient id="bodyGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={color} />
          <stop offset="100%" stopColor="#18181b" />
        </linearGradient>
      </defs>

      <circle cx="120" cy="150" r={auraGlow} fill="url(#auraGrad)" />

      {/* Three distinct rings, each unlocking on its own — well spaced apart,
          not stacked close together — instead of one growing pile. */}
      {hasRing1 && (
        <circle cx="120" cy="150" r="82" fill="none" stroke={color} strokeOpacity="0.28" strokeWidth="1.5">
          <animate attributeName="r" values="82;88;82" dur="3s" repeatCount="indefinite" />
        </circle>
      )}
      {hasRing2 && (
        <circle cx="120" cy="150" r="100" fill="none" stroke={color} strokeOpacity="0.22" strokeWidth="1.5">
          <animate attributeName="r" values="100;107;100" dur="4s" repeatCount="indefinite" />
        </circle>
      )}
      {hasRing3 && (
        <circle cx="120" cy="150" r="115" fill="none" stroke={color} strokeOpacity="0.18" strokeWidth="1.5">
          <animate attributeName="r" values="115;123;115" dur="5s" repeatCount="indefinite" />
        </circle>
      )}

      {/* Halo — a new flourish at max level, distinct from the burst rays */}
      {hasBurst && <ellipse cx="120" cy="78" rx="26" ry="7" fill="none" stroke={color} strokeWidth="2" opacity="0.8" />}

      {/* Full-power burst rays at max level */}
      {hasBurst && (
        <g opacity="0.6">
          {Array.from({ length: 10 }).map((_, i) => {
            const angle = (i / 10) * Math.PI * 2;
            const x2 = 120 + Math.cos(angle) * 108;
            const y2 = 150 + Math.sin(angle) * 108;
            return <line key={i} x1="120" y1="150" x2={x2} y2={y2} stroke={color} strokeWidth="2" strokeLinecap="round" />;
          })}
        </g>
      )}

      <g transform={`translate(120 150) scale(${bodyScale}) translate(-120 -150)`}>
        {/* Cape — appears fully formed, not faded in */}
        {hasCape && <path d="M 90 130 Q 60 210 85 260 L 120 235 L 155 260 Q 180 210 150 130 Z" fill="#0f0f12" opacity="0.85" />}

        {/* Legs */}
        <rect x="103" y="205" width="14" height="55" rx="6" fill="#18181b" />
        <rect x="123" y="205" width="14" height="55" rx="6" fill="#18181b" />

        {/* Body */}
        <rect x={bodyX} y="140" width={bodyWidth} height="75" rx="16" fill="url(#bodyGrad)" />

        {/* Arms */}
        <rect x={bodyX - armGap} y="150" width="16" height="55" rx="8" fill="#18181b" />
        <rect x={bodyX + bodyWidth + armGap - 16} y="150" width="16" height="55" rx="8" fill="#18181b" />

        {/* Pauldrons — a new armor detail, not a recolor of anything existing */}
        {hasPauldrons && (
          <>
            <path d={`M ${bodyX - armGap - 4} 148 L ${bodyX + 6} 148 L ${bodyX + 2} 168 L ${bodyX - armGap} 168 Z`} fill={color} opacity="0.9" />
            <path
              d={`M ${bodyX + bodyWidth + armGap + 4} 148 L ${bodyX + bodyWidth - 6} 148 L ${bodyX + bodyWidth - 2} 168 L ${bodyX + bodyWidth + armGap} 168 Z`}
              fill={color}
              opacity="0.9"
            />
          </>
        )}

        {/* Weapon glint — a small energy blade in hand, new at this threshold */}
        {hasWeapon && (
          <path
            d={`M ${bodyX + bodyWidth + armGap - 8} 205 L ${bodyX + bodyWidth + armGap + 2} 175 L ${bodyX + bodyWidth + armGap + 6} 177 L ${bodyX + bodyWidth + armGap - 4} 208 Z`}
            fill={color}
            opacity="0.95"
          />
        )}

        {/* Head */}
        <circle cx="120" cy="112" r="30" fill="url(#bodyGrad)" />

        {/* Eyes */}
        <circle cx="110" cy="110" r="3.5" fill={color}>
          <animate attributeName="opacity" values="0.6;1;0.6" dur="2.2s" repeatCount="indefinite" />
        </circle>
        <circle cx="130" cy="110" r="3.5" fill={color}>
          <animate attributeName="opacity" values="0.6;1;0.6" dur="2.2s" repeatCount="indefinite" />
        </circle>

        {/* Crown — appears fully formed */}
        {hasCrown && (
          <path d="M 98 88 L 104 72 L 112 86 L 120 68 L 128 86 L 136 72 L 142 88 Z" fill={color} stroke="#18181b" strokeWidth="1.5" />
        )}
      </g>

      {/* Level 500 — "The Beyond". A distinct violet double ring and outer
          glow, drawn on top of the entire maxed-out level-200 form rather
          than replacing any of it — the secret tier is additive, not a
          different character. */}
      {hasSecretAura && (
        <g>
          <circle cx="120" cy="150" r={auraGlow + 20} fill="none" stroke={color} strokeOpacity="0.5" strokeWidth="2">
            <animate attributeName="r" values={`${auraGlow + 20};${auraGlow + 30};${auraGlow + 20}`} dur="3.5s" repeatCount="indefinite" />
          </circle>
          <circle cx="120" cy="150" r={auraGlow + 34} fill="none" stroke={color} strokeOpacity="0.25" strokeWidth="1.5">
            <animate attributeName="r" values={`${auraGlow + 34};${auraGlow + 44};${auraGlow + 34}`} dur="4.5s" repeatCount="indefinite" />
          </circle>
          <ellipse cx="120" cy="72" rx="34" ry="9" fill="none" stroke={color} strokeWidth="2" opacity="0.9" />
        </g>
      )}
    </svg>
  );
}

// Second, original character — an abstract faceted crystal being, entirely
// geometric rather than humanoid. Grows a brighter core, more radiating
// shards, and a slow rotation as level increases. Not based on or evocative
// of any existing character design.
// Second character option: an original growing spirit tree, thematically
// tied to the app's own Growth concept. A small sapling gradually becomes a
// tall, wide tree with more branches, glowing leaf-orbs, and spreading
// roots — nothing about this design is based on or evocative of any
// existing character or IP.
function GrowthCharacterTree({ level, color }) {
  const progress = Math.max(0, Math.min(1, (Math.min(level, GROWTH_NORMAL_LEVEL_COUNT) - 1) / (GROWTH_NORMAL_LEVEL_COUNT - 1)));

  const trunkHeight = 55 + progress * 85;
  const trunkWidth = 12 + progress * 11;
  const trunkTop = 225 - trunkHeight;
  const branchCount = 2 + Math.round(progress * 8); // 2 to 10
  const rootSpread = 22 + progress * 28;
  const auraRadius = 55 + progress * 35;

  // Deterministic pseudo-random spread so leaves/branches look organic but
  // never jump around between re-renders.
  function seeded(i, salt) {
    const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
    return x - Math.floor(x);
  }

  const branches = Array.from({ length: branchCount }, (_, i) => {
    const t = branchCount === 1 ? 0.5 : i / (branchCount - 1);
    const side = i % 2 === 0 ? -1 : 1;
    const heightFrac = 0.25 + t * 0.65; // spread branches along the upper trunk
    const length = 22 + progress * 30 + seeded(i, 1) * 10;
    const startY = trunkTop + trunkHeight * (1 - heightFrac);
    const angle = (35 + seeded(i, 2) * 25) * side;
    const rad = (angle * Math.PI) / 180;
    const endX = 120 + Math.sin(rad) * length;
    const endY = startY - Math.cos(rad) * length * 0.6;
    return { startY, endX, endY, side };
  });

  // A wide, banyan-style canopy that fills the tree evenly — extra room at
  // the top so it doesn't look thin up there, extending down just enough to
  // cover the lowest branch attachment without sprawling toward the roots.
  const canopyHalfWidth = 55 + progress * 55; // up to ~110, close to the safe frame edge
  const canopyTop = Math.max(10, trunkTop - (26 + progress * 20));
  const canopyBottom = trunkTop + trunkHeight * 0.72;
  const canopyCenterY = (canopyTop + canopyBottom) / 2;
  const canopyHalfHeight = (canopyBottom - canopyTop) / 2;
  const canopyLeafCount = 140 + Math.round(progress * 320); // 140 to 460 — dense top to bottom

  const leaves = [];
  for (let i = 0; i < canopyLeafCount; i++) {
    const angle = seeded(i, 3) * Math.PI * 2;
    const radiusFrac = Math.sqrt(seeded(i, 4)); // uniform density across the disk
    const x = 120 + Math.cos(angle) * radiusFrac * canopyHalfWidth;
    const y = canopyCenterY + Math.sin(angle) * radiusFrac * canopyHalfHeight;
    const size = 1.8 + seeded(i, 5) * 2.4;
    leaves.push({ x, y, size, delay: seeded(i, 6) * 3 });
  }

  // Level 500 — "The Beyond". Growth normally plateaus once the canopy
  // hits its max density at level 200 (that's the "leaves stop appearing"
  // point) — this packs in a genuinely denser batch of violet leaves,
  // strictly within the SAME canopy bounds as the base leaves (not
  // expanded outward), so nothing risks clipping at the frame edge or
  // looking uneven — just visibly fuller.
  const hasSecretAura = level >= 500;
  const secretLeaves = [];
  if (hasSecretAura) {
    for (let i = 0; i < 420; i++) {
      const angle = seeded(i, 11) * Math.PI * 2;
      const radiusFrac = Math.sqrt(seeded(i, 12));
      const x = 120 + Math.cos(angle) * radiusFrac * canopyHalfWidth;
      const y = canopyCenterY + Math.sin(angle) * radiusFrac * canopyHalfHeight;
      const size = 1.5 + seeded(i, 13) * 2.0;
      secretLeaves.push({ x, y, size, delay: seeded(i, 14) * 3 });
    }
  }

  return (
    <svg viewBox="0 0 240 280" className="h-64 w-64 mx-auto">
      <defs>
        <radialGradient id="treeAura" cx="50%" cy="60%" r="55%">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </radialGradient>
        <linearGradient id="trunkGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#5c3a21" />
          <stop offset="50%" stopColor="#7a5233" />
          <stop offset="100%" stopColor="#4a2e18" />
        </linearGradient>
      </defs>

      <circle cx="120" cy="200" r={auraRadius} fill="url(#treeAura)" />

      {/* Roots — spread wider at higher levels */}
      <path
        d={`M 120 225 Q ${120 - rootSpread} 235 ${120 - rootSpread * 1.4} 250 M 120 225 Q ${120 + rootSpread} 235 ${120 + rootSpread * 1.4} 250 M 120 225 L 120 252`}
        fill="none"
        stroke="#4a2e18"
        strokeWidth={3 + progress * 2}
        strokeLinecap="round"
        opacity="0.85"
      />

      {/* Ground glow ring */}
      <ellipse cx="120" cy="228" rx={rootSpread * 1.6} ry="6" fill={color} opacity="0.15" />

      {/* Trunk */}
      <path
        d={`M ${120 - trunkWidth / 2} 225 L ${120 - trunkWidth / 2.6} ${trunkTop} Q 120 ${trunkTop - 6} ${120 + trunkWidth / 2.6} ${trunkTop} L ${120 + trunkWidth / 2} 225 Z`}
        fill="url(#trunkGrad)"
      />

      {/* Branches — count grows continuously with level */}
      {branches.map((b, i) => (
        <path key={i} d={`M 120 ${b.startY} Q ${(120 + b.endX) / 2} ${b.startY - 8} ${b.endX} ${b.endY}`} fill="none" stroke="#5c3a21" strokeWidth={2.5} strokeLinecap="round" opacity="0.9" />
      ))}

      {/* Canopy glow behind the leaves */}
      <ellipse cx="120" cy={canopyCenterY} rx={canopyHalfWidth * 0.95} ry={canopyHalfHeight * 0.95} fill={color} opacity="0.08" />

      {/* Glowing leaf-orbs — dense, wide, even coverage across the whole canopy */}
      {leaves.map((leaf, i) => (
        <circle key={i} cx={leaf.x} cy={leaf.y} r={leaf.size} fill={color} opacity="0.85">
          <animate attributeName="opacity" values="0.5;0.95;0.5" dur={`${2.5 + leaf.delay}s`} begin={`${leaf.delay}s`} repeatCount="indefinite" />
        </circle>
      ))}

      {/* Level 500 — "The Beyond". No rings — a real second wave of violet
          leaves filling in on top of the already-maxed canopy, so it keeps
          visibly growing instead of looking frozen past level 200. */}
      {hasSecretAura &&
        secretLeaves.map((leaf, i) => (
          <circle key={`secret-${i}`} cx={leaf.x} cy={leaf.y} r={leaf.size} fill={color} opacity="0.9">
            <animate attributeName="opacity" values="0.55;1;0.55" dur={`${2.2 + leaf.delay}s`} begin={`${leaf.delay}s`} repeatCount="indefinite" />
          </circle>
        ))}
    </svg>
  );
}




// Third character option: illustrated portrait images across 18 tiers.
// Level 200 is reserved exclusively for the final image; the other 17
// split levels 1-199 as evenly as possible (199 isn't divisible by 17, so
// it's twelve groups of 12 levels followed by five groups of 11) — swapped
// in as the level crosses each threshold rather than a continuously
// generated SVG like the other two styles.
function GrowthCharacterPortrait({ level }) {
  const [images, setImages] = useState(null); // null = still loading the asset chunk
  useEffect(() => {
    import("./characterAssets").then((mod) => setImages(mod.GROWTH_PORTRAIT_IMAGES));
  }, []);

  if (!images) {
    return (
      <div className="h-64 w-64 mx-auto flex items-center justify-center rounded-2xl bg-[var(--surface-2)]/40">
        <Loader2 size={20} className="text-[var(--accent-text)] animate-spin" />
      </div>
    );
  }

  // Image 18 covers level 200 through level 499 (the max-level reward);
  // image 19 is reserved exclusively for level 500 (the secret Beyond
  // tier). Images 1-17 split levels 1-199 as evenly as possible.
  const thresholds = [0, 13, 25, 37, 49, 61, 73, 85, 97, 109, 121, 133, 145, 156, 167, 178, 189, 200, 500];
  let src = images[0];
  for (const t of thresholds) {
    // Only overwrite if that image actually exists — a missing/misnamed
    // file (like level-500.jpg not being where growthPortraits.js expects)
    // should fall back to the last valid image instead of leaving src
    // pointing at something undefined and showing a broken image icon.
    if (level >= t && images[t]) src = images[t];
  }
  const isMaxLevelImage = level >= 200;
  return (
    <div className={"relative h-64 w-64 mx-auto flex items-center justify-center rounded-2xl overflow-hidden " + (isMaxLevelImage ? "" : "bg-black")}>
      <img
        src={src}
        alt="Character portrait"
        className={isMaxLevelImage ? "w-full h-full object-cover object-[50%_20%]" : "max-w-full max-h-full object-contain"}
        style={{ filter: "saturate(1.08) contrast(1.03)" }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: "var(--accent)", mixBlendMode: "color", opacity: 0.22 }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: "var(--accent)", mixBlendMode: "overlay", opacity: 0.1 }}
      />
    </div>
  );
}

// Matches the database's tier_rank() exactly — used for client-side
// display logic (showing a lock icon, disabling a button) only. The
// actual enforcement lives in set_my_character_style() server-side; this
// never grants anything by itself.
function tierRank(tier) {
  return tier === "premium" ? 2 : tier === "basic" ? 1 : 0;
}

const GROWTH_CHARACTER_STYLES = [
  { key: "default", label: "Default", requiredTier: "free", render: (level, color) => <GrowthCharacter level={level} color={color} /> },
  { key: "tree", label: "Spirit Tree", requiredTier: "basic", render: (level, color) => <GrowthCharacterTree level={level} color={color} /> },
  { key: "portrait", label: "Character", requiredTier: "premium", render: (level, color) => <GrowthCharacterPortrait level={level} /> },
];

// Shows whichever character style someone has actually chosen, shrunk down
// to fit compactly into existing space (Profile header, Inspect page) rather
// than the full 256px size the Growth tab itself uses.
function CompactCharacterPreview({ styleKey, level, color, size = 64 }) {
  const style = GROWTH_CHARACTER_STYLES.find((s) => s.key === styleKey) || GROWTH_CHARACTER_STYLES[0];
  const scale = size / 256;
  return (
    <div style={{ width: size, height: size, overflow: "hidden" }} className="shrink-0">
      <div style={{ transform: `scale(${scale})`, transformOrigin: "top left", width: 256, height: 256 }}>{style.render(level, color)}</div>
    </div>
  );
}

function Growth({ refreshKey, goTo }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [cappedFocusXP, setCappedFocusXP] = useState(0);

  useEffect(() => {
    loadSessions();
  }, [refreshKey]);

  useEffect(() => {
    function handleScroll() {
      const pageHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (pageHeight <= 0) {
        setShowScrollTop(false);
        return;
      }
      setShowScrollTop(window.scrollY > 100);
    }
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToTop = () => {
    const startY = window.scrollY;
    const duration = 400;
    const startTime = performance.now();

    function easeOutCubic(t) {
      return 1 - Math.pow(1 - t, 3);
    }

    function step(now) {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      const eased = easeOutCubic(progress);
      window.scrollTo(0, startY * (1 - eased));
      if (progress < 1) requestAnimationFrame(step);
    }

    requestAnimationFrame(step);
  };

  const [previewLevel, setPreviewLevel] = useState(null); // null = showing current level
  const [showAllLevels, setShowAllLevels] = useState(false);
  const currentLevelRowRef = useRef(null);

  useEffect(() => {
    if (!showAllLevels) return;
    // Wait a tick for the full list to actually render before scrolling,
    // otherwise the target row doesn't exist yet.
    const id = requestAnimationFrame(() => {
      currentLevelRowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return () => cancelAnimationFrame(id);
  }, [showAllLevels]);
  const [characterStyleIndex, setCharacterStyleIndex] = useState(0); // which style is currently being BROWSED (swipe), not necessarily equipped
  const [equippedStyleKey, setEquippedStyleKey] = useState("default"); // the style actually saved/active
  const [equipping, setEquipping] = useState(false);
  const [limitModalMessage, setLimitModalMessage] = useState("");
  const [achievementXP, setAchievementXP] = useState(0);
  const [taskXP, setTaskXP] = useState(0);
  const [groupXP, setGroupXP] = useState(0);
  const [myTier, setMyTier] = useState("free");

  async function loadSessions() {
    setLoading(true);
    try {
      const { data: { session: authSession } } = await supabase.auth.getSession();
      const user = authSession?.user;
      const [sessionsRes, achievementsRes, profileRes, taskStatsRes] = await Promise.all([
        supabase.from("study_sessions").select("*").order("completed_at", { ascending: false }),
        user ? supabase.from("user_achievements").select("xp_awarded").eq("user_id", user.id) : Promise.resolve({ data: [] }),
        user ? supabase.from("profiles").select("character_style, premium_tier").eq("user_id", user.id).maybeSingle() : Promise.resolve({ data: null }),
        user ? supabase.from("user_task_stats").select("lifetime_task_xp, lifetime_group_xp").eq("user_id", user.id).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      if (!sessionsRes.error) setSessions(sessionsRes.data || []);
      setAchievementXP((achievementsRes.data || []).reduce((sum, r) => sum + (r.xp_awarded || 0), 0));
      setTaskXP(taskStatsRes.data?.lifetime_task_xp || 0);
      setGroupXP(taskStatsRes.data?.lifetime_group_xp || 0);
      const savedStyleKey = profileRes.data?.character_style || "default";
      setMyTier(profileRes.data?.premium_tier || "free");
      setEquippedStyleKey(savedStyleKey);
      const savedIndex = GROWTH_CHARACTER_STYLES.findIndex((s) => s.key === savedStyleKey);
      if (savedIndex >= 0) setCharacterStyleIndex(savedIndex);
      if (user) supabase.rpc("get_my_capped_focus_xp").then(({ data }) => setCappedFocusXP(data || 0));
    } catch (e) {
      console.error("Failed to load growth data:", e);
    } finally {
      setLoading(false);
    }
  }

  // Swiping just browses — it never auto-saves anymore. Equipping is a
  // separate, explicit action below.
  function browseCharacterStyle(index) {
    setCharacterStyleIndex(index);
  }

  async function equipCharacterStyle() {
    const style = GROWTH_CHARACTER_STYLES[characterStyleIndex];
    if (style.key === equippedStyleKey) return; // already equipped, nothing to do
    setEquipping(true);
    const { error } = await supabase.rpc("set_my_character_style", { p_style_key: style.key });
    setEquipping(false);
    if (error) {
      setLimitModalMessage(`${style.label} requires ${style.requiredTier === "basic" ? "Basic" : "Pro"}. Upgrade to unlock it.`);
      return;
    }
    setEquippedStyleKey(style.key);
  }

  const stats = computeStudyStats(sessions);
  const totalMinutes = Math.floor(stats.totalSeconds / 60);
  const totalXP = cappedFocusXP + taskXP + groupXP + achievementXP;
  const { current, next, pct, capped } = computeGrowth(totalXP);
  const secretRevealed = current.level >= GROWTH_LEVEL_COUNT;
  // GROWTH_LEVELS is no longer dense (Level 500 sits right after Level 200,
  // not at index 499) — and the "next level" entry right after 200 IS the
  // secret one, so showing it here would leak its existence and exact XP
  // requirement to every Level-200 user. Treat 200 as the visible max
  // until the secret's actually been found some other way.
  const visibleNext = current.level === GROWTH_NORMAL_LEVEL_COUNT && !secretRevealed ? null : next;
  const xpToNext = visibleNext ? Math.max(0, visibleNext.threshold - totalXP) : 0;
  const displayMaxXP = secretRevealed ? GROWTH_MAX_XP : GROWTH_NORMAL_LEVEL_COUNT * GROWTH_XP_PER_LEVEL;

  // Only levels already reached can be previewed — clamp to [1, current.level].
  const displayedLevelNum = previewLevel === null ? current.level : Math.min(current.level, Math.max(1, previewLevel));
  const displayed = GROWTH_LEVELS.find((l) => l.level === displayedLevelNum) || current;
  const isPreviewingCurrent = displayedLevelNum === current.level;

  // GROWTH_LEVELS isn't dense — Level 500 sits right after Level 200 with
  // nothing in between, so stepping by ±1 would need 300 clicks to cross
  // that gap and would just show the same info the whole way. Step between
  // actual entries in the array instead.
  const goPreviewPrev = () => {
    const idx = GROWTH_LEVELS.findIndex((l) => l.level === displayedLevelNum);
    const prevLevel = idx > 0 ? GROWTH_LEVELS[idx - 1].level : displayedLevelNum;
    setPreviewLevel(Math.max(1, prevLevel));
  };
  const goPreviewNext = () => {
    const idx = GROWTH_LEVELS.findIndex((l) => l.level === displayedLevelNum);
    const nextLevel = idx >= 0 && idx < GROWTH_LEVELS.length - 1 ? GROWTH_LEVELS[idx + 1].level : displayedLevelNum;
    setPreviewLevel(Math.min(current.level, nextLevel));
  };

  return (
    <div className="max-w-2xl mx-auto pb-24 md:pb-0">
      <div className="text-center mb-2">
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">Growth</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-0.5">Every focused minute makes you stronger.</p>
      </div>

      <GlowCard glow className="mt-6">
        <div className="flex items-center justify-center gap-2 mb-1">
          <button
            onClick={() => browseCharacterStyle((characterStyleIndex - 1 + GROWTH_CHARACTER_STYLES.length) % GROWTH_CHARACTER_STYLES.length)}
            className="h-6 w-6 rounded-md bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--text-primary)] flex items-center justify-center transition-colors"
            title="Previous character"
          >
            <ChevronLeft size={13} />
          </button>
          <p className="text-xs text-[var(--text-muted)] w-24 text-center flex items-center justify-center gap-1">
            {GROWTH_CHARACTER_STYLES[characterStyleIndex].label}
            {tierRank(myTier) < tierRank(GROWTH_CHARACTER_STYLES[characterStyleIndex].requiredTier) && <Lock size={10} className="text-amber-400" />}
          </p>
          <button
            onClick={() => browseCharacterStyle((characterStyleIndex + 1) % GROWTH_CHARACTER_STYLES.length)}
            className="h-6 w-6 rounded-md bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--text-primary)] flex items-center justify-center transition-colors"
            title="Next character"
          >
            <ChevronRight size={13} />
          </button>
        </div>

        <div className="flex justify-center mb-3">
          {(() => {
            const browsedStyle = GROWTH_CHARACTER_STYLES[characterStyleIndex];
            const isEquipped = browsedStyle.key === equippedStyleKey;
            const isLocked = tierRank(myTier) < tierRank(browsedStyle.requiredTier);
            if (isEquipped) {
              return <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-400 flex items-center gap-1"><Check size={11} /> Equipped</span>;
            }
            if (isLocked) {
              return (
                <button
                  onClick={() => setLimitModalMessage(`${browsedStyle.label} requires ${browsedStyle.requiredTier === "basic" ? "Basic" : "Pro"}. Upgrade to unlock it.`)}
                  className="text-[10px] font-semibold uppercase tracking-wide flex items-center gap-1 text-amber-400 border border-amber-500/30 hover:bg-amber-500/10 px-2.5 py-1 rounded-full transition-colors"
                >
                  <Lock size={10} /> Locked — Tap to Unlock
                </button>
              );
            }
            return (
              <button
                onClick={equipCharacterStyle}
                disabled={equipping}
                className="text-[10px] font-semibold uppercase tracking-wide text-[var(--accent-text)] border border-[rgb(var(--accent-rgb)/0.3)] hover:bg-[rgb(var(--accent-rgb)/0.1)] disabled:opacity-50 px-2.5 py-1 rounded-full transition-colors"
              >
                {equipping ? "Equipping..." : "Equip"}
              </button>
            );
          })()}
        </div>

        <div className="flex items-center justify-center gap-3">
          <button
            onClick={goPreviewPrev}
            disabled={displayedLevelNum <= 1}
            className="h-8 w-8 rounded-lg bg-[var(--surface-2)] border border-[var(--card-border)] text-[var(--text-secondary-strong)] hover:bg-[var(--surface-3)] disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-all duration-150 active:scale-90"
            title="Previous level"
          >
            <ChevronLeft size={16} />
          </button>
          <div className="flex-1">{GROWTH_CHARACTER_STYLES[characterStyleIndex].render(displayed.level, displayed.color)}</div>
          <button
            onClick={goPreviewNext}
            disabled={displayedLevelNum >= current.level}
            className="h-8 w-8 rounded-lg bg-[var(--surface-2)] border border-[var(--card-border)] text-[var(--text-secondary-strong)] hover:bg-[var(--surface-3)] disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-all duration-150 active:scale-90"
            title="Next level"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="text-center mt-2">
          <p className="text-xs uppercase tracking-widest text-[var(--text-muted)]">Level {displayed.level} / {GROWTH_LEVEL_COUNT}</p>
          <LevelNameEffect level={displayed.level} name={displayed.name} color={displayed.color} />
          {!isPreviewingCurrent && (
            <button onClick={() => setPreviewLevel(null)} className="block mx-auto text-xs text-[var(--accent-text)] hover:text-[var(--accent-text)] mt-2">
              Back to current level
            </button>
          )}
          {isPreviewingCurrent && (
            <p className="text-xs text-[var(--text-muted)] mt-1">
              {loading ? "…" : `${totalXP.toLocaleString()} / ${displayMaxXP.toLocaleString()} XP`}
            </p>
          )}
        </div>

        {isPreviewingCurrent && (
          <div className="mt-5">
            <div className="h-2.5 rounded-full bg-[var(--surface-2)] overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700 ease-out"
                style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${current.color}, var(--accent))` }}
              />
            </div>
            <p className="text-center text-xs text-[var(--text-muted)] mt-2">
              {visibleNext ? `${xpToNext.toLocaleString()} XP to reach Level ${visibleNext.level} — ${visibleNext.name}` : "Max level reached — you're fully Ascended."}
            </p>
          </div>
        )}
      </GlowCard>

      <GlowCard className="mt-4 -mb-16 md:-mb-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium text-[var(--text-primary)]">{showAllLevels ? `All ${GROWTH_LEVELS.length} levels` : "Current level"}</p>
          <button onClick={() => setShowAllLevels((v) => !v)} className="flex items-center gap-1 text-xs text-[var(--accent-text)] hover:brightness-110">
            Show all
            <ChevronDown size={14} className={"transition-transform duration-200 " + (showAllLevels ? "rotate-180" : "")} />
          </button>
        </div>
        <div className="space-y-1.5">
          {(showAllLevels
            ? GROWTH_LEVELS.filter((lvl) => lvl.level !== GROWTH_LEVEL_COUNT || secretRevealed)
            : GROWTH_LEVELS.filter((lvl) => lvl.level === current.level)
          ).map((lvl) => {
            const unlocked = totalXP >= lvl.threshold;
            const isCurrent = lvl.level === current.level;
            return (
              <button
                key={lvl.level}
                ref={isCurrent ? currentLevelRowRef : null}
                onClick={() => {
                  if (!unlocked) return;
                  setPreviewLevel(lvl.level);
                  scrollToTop();
                }}
                disabled={!unlocked}
                className={
                  "w-full flex items-center justify-between text-sm rounded-lg px-3 py-2 transition-colors text-left " +
                  (isCurrent
                    ? "bg-[rgb(var(--accent-rgb)/0.1)] border border-[rgb(var(--accent-rgb)/0.3)]"
                    : unlocked
                    ? "hover:bg-[var(--surface-2)] cursor-pointer"
                    : "cursor-not-allowed")
                }
              >
                <div className="flex items-center gap-2">
                  {unlocked ? (
                    <Check size={14} className="text-emerald-400" />
                  ) : (
                    <Lock size={12} className="text-[var(--text-faint)]" />
                  )}
                  <span className={unlocked ? "text-[var(--text-primary)]" : "text-[var(--text-faint)]"}>
                    Level {lvl.level} — {lvl.name}
                  </span>
                </div>
                <span className="text-xs text-[var(--text-muted)]">{lvl.threshold.toLocaleString()} XP</span>
              </button>
            );
          })}
        </div>
      </GlowCard>

      <button
        onClick={scrollToTop}
        aria-hidden={!showScrollTop}
        className={
          "fixed z-40 bottom-16 md:bottom-6 left-1/2 -translate-x-1/2 h-11 w-20 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] glow-accent-50 flex items-center justify-center transition-all duration-300 active:scale-90 " +
          (showScrollTop ? "opacity-100 pointer-events-auto translate-y-0" : "opacity-0 pointer-events-none translate-y-3")
        }
        title="Back to top"
      >
        <ChevronUp size={20} className="text-white" />
      </button>
      <LimitReachedModal message={limitModalMessage} onClose={() => setLimitModalMessage("")} goTo={goTo} />
    </div>
  );
}

function Toggle({ checked, onChange }) {
  const trackWidth = 44;
  const trackHeight = 24;
  const knobSize = 18;
  const knobMargin = 3;

  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      style={{
        position: "relative",
        flexShrink: 0,
        display: "inline-block",
        width: trackWidth,
        height: trackHeight,
        borderRadius: trackHeight,
        backgroundColor: checked ? "var(--accent)" : "var(--surface-3)",
        transition: "background-color 0.2s ease",
        border: "none",
        padding: 0,
        cursor: "pointer",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: knobMargin,
          left: knobMargin,
          width: knobSize,
          height: knobSize,
          borderRadius: "9999px",
          backgroundColor: "#ffffff",
          boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
          transform: checked ? `translateX(${trackWidth - knobSize - knobMargin * 2}px)` : "translateX(0)",
          transition: "transform 0.2s ease",
        }}
      />
    </button>
  );
}

const PRICING_FREE_FEATURES = [
  { text: "Focus Timer", sub: "2 hr daily XP cap" },
  "Tasks — up to 7",
  "Statistics — 2 weeks",
  "Growth — Default",
  "Leaderboard & Achievements",
  "Join up to 2 groups",
  "Contribute Session — 1 group",
  "Free themes & sound effects",
  "Low limit",
];

const PRICING_BASIC_FEATURES = [
  { text: "Focus Timer", sub: "4 hr daily XP cap" },
  "Ad-free study space",
  "Tasks — up to 14",
  "To-Do List — up to 5 lists, 10 tasks each",
  "Events — up to 5/month",
  "Statistics — last 4 weeks",
  "Growth — Spirit Tree",
  "Create up to 3 groups & join up to 5",
  "Contribute Session — up to 2 groups",
  "Medium limit",
];

const PRICING_PREMIUM_FEATURES = [
  { text: "Focus Timer", sub: "7 hr daily XP cap" },
  "Habit Tracker",
  "Tasks — unlimited",
  "Statistics — full history",
  "Insights — deep study patterns, peak hours & predictions",
  "Events — unlimited",
  "Unlimited To-Do Lists & tasks",
  "Habit Tracker PDF export",
  "Growth — Character",
  "Premium themes & sound effects",
  "Unlimited groups — create & join",
  "Contribute Session — up to 5 groups",
  "High limit",
];

// Yearly Pro gets everything monthly Pro gets, plus Streak Restore — which
// is genuinely exclusive to yearly billing specifically (checked against
// billing_interval server-side), not just premium_tier. So this can't
// reuse PRICING_PREMIUM_FEATURES as-is without implying monthly Pro also
// gets it.
const PRICING_YEARLY_FEATURES = [...PRICING_PREMIUM_FEATURES, { text: "Streak Restore — 6 per year", exclusive: true }];

function Pricing({ goToLegal }) {
  const { requireAuth } = useRequireAuth();
  const [myTier, setMyTier] = useState(null); // null while loading — avoids Free wrongly flashing as "current" before the real tier loads
  const [myBillingInterval, setMyBillingInterval] = useState(null); // "monthly" | "yearly" | null — only meaningful when myTier === "premium"
  const [proBilling, setProBilling] = useState("monthly"); // "monthly" | "yearly" — toggle inside the single Pro card
  const [checkoutLoadingPlan, setCheckoutLoadingPlan] = useState(null); // which plan key is currently mid-checkout, or null
  const [checkoutError, setCheckoutError] = useState("");
  const [checkoutErrorKey, setCheckoutErrorKey] = useState(0);
  const [lifetimeLoading, setLifetimeLoading] = useState(false);

  async function handleLifetimePurchase() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      requireAuth(() => {});
      return;
    }
    if (subStatus?.is_lifetime) {
      alert("You already have Lytning Focus Premium for life — nothing more to do!");
      return;
    }
    setLifetimeLoading(true);
    setCheckoutError("");

    const [scriptLoaded, { data: orderData, error: orderError }] = await Promise.all([
      loadRazorpayScript(),
      supabase.functions.invoke("create-lifetime-order", { body: {} }),
    ]);

    if (!scriptLoaded || orderError || !orderData) {
      setCheckoutError(orderData?.error || "Couldn't start checkout — please try again.");
      setCheckoutErrorKey((k) => k + 1);
      setLifetimeLoading(false);
      return;
    }

    const rzp = new window.Razorpay({
      key: orderData.key_id,
      amount: orderData.amount,
      currency: orderData.currency,
      order_id: orderData.order_id,
      name: "LytningFocus",
      description: "Premium — Lifetime (one-time payment, never expires)",
      theme: { color: "#8b5cf6" },
      handler: function () {
        // Same principle as every other checkout here — the frontend
        // never grants access itself. This just tells the person to
        // expect it, and refreshes once the webhook actually confirms
        // the payment server-side.
        setLifetimeLoading(false);
        alert("You got premium for life! 🎉 Refreshing now.");
        setTimeout(() => window.location.reload(), 1500);
      },
      modal: {
        ondismiss: function () {
          setLifetimeLoading(false);
        },
      },
    });

    rzp.on("payment.failed", function (response) {
      setCheckoutError(`Payment failed: ${response.error.description || "please try again."}`);
      setCheckoutErrorKey((k) => k + 1);
      setLifetimeLoading(false);
    });

    rzp.open();
  }

  const [subStatus, setSubStatus] = useState(null); // { plan, billing_interval, status, current_period_end, cancelled_at, will_renew } | null
  const [subActionLoading, setSubActionLoading] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  useEffect(() => {
    supabase.rpc("get_my_subscription_status").then(({ data }) => setSubStatus(data));
    loadRazorpayScript(); // preload now, so it's already ready by the time someone clicks Upgrade
  }, []);

  async function handleCancelSubscription() {
    setSubActionLoading(true);
    const { error } = await supabase.functions.invoke("cancel-razorpay-subscription");
    setSubActionLoading(false);
    setShowCancelConfirm(false);
    if (!error) {
      const { data } = await supabase.rpc("get_my_subscription_status");
      setSubStatus(data);
    }
  }

  async function loadRazorpayScript() {
    if (document.getElementById("razorpay-checkout-script")) return true;
    return new Promise((resolve) => {
      const script = document.createElement("script");
      script.id = "razorpay-checkout-script";
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  }

  async function handleUpgradeClick(planKey, billingInterval) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      requireAuth(() => {}); // opens the sign-in prompt; nothing to do after, they'll just click Upgrade again once logged in
      return;
    }
    setCheckoutError("");
    setCheckoutLoadingPlan(planKey);

    // If they already have an active (or past_due) subscription to a
    // DIFFERENT plan, this is a plan change, not a brand-new subscriber —
    // route through Razorpay's real "update subscription" API instead of
    // creating a second, separate subscription that would double-bill them.
    if (subStatus && (subStatus.status === "active" || subStatus.status === "past_due")) {
      const { data: changeData, error: changeError } = await supabase.functions.invoke("change-razorpay-subscription-plan", {
        body: { plan: planKey, billing_interval: billingInterval },
      });
      setCheckoutLoadingPlan(null);
      if (changeError || !changeData?.success) {
        setCheckoutError(changeData?.error || "Couldn't change your plan — please try again.");
        setCheckoutErrorKey((k) => k + 1);
        return;
      }
      if (changeData.is_upgrade) {
        alert("Plan upgraded! Refreshing now.");
        window.location.reload();
      } else {
        alert(`Got it — you'll move to this plan at the end of your current billing period (${new Date(subStatus.current_period_end).toLocaleDateString()}). You keep your current plan's access until then.`);
        const { data } = await supabase.rpc("get_my_subscription_status");
        setSubStatus(data);
      }
      return;
    }

    const [scriptLoaded, { data: subData, error: subError }] = await Promise.all([
      loadRazorpayScript(),
      supabase.functions.invoke("create-razorpay-subscription", {
        body: { plan: planKey, billing_interval: billingInterval },
      }),
    ]);

    if (!scriptLoaded) {
      setCheckoutError("Couldn't load the payment window — please check your connection and try again.");
      setCheckoutErrorKey((k) => k + 1);
      setCheckoutLoadingPlan(null);
      return;
    }

    if (subError || !subData) {
      setCheckoutError(subData?.error || "Couldn't start checkout — please try again.");
      setCheckoutErrorKey((k) => k + 1);
      setCheckoutLoadingPlan(null);
      return;
    }

    const rzp = new window.Razorpay({
      key: subData.key_id,
      subscription_id: subData.razorpay_subscription_id,
      name: "LytningFocus",
      description: `${planKey === "premium" ? "Pro" : "Basic"} — ${billingInterval === "yearly" ? "Yearly" : "Monthly"} (auto-renews until cancelled)`,
      theme: { color: "#8b5cf6" },
      handler: function () {
        // The frontend NEVER grants premium itself on this callback — it
        // only means the checkout popup completed successfully from the
        // user's side. The actual account upgrade only happens once
        // Razorpay's webhook independently confirms the payment
        // server-side, which is the only thing that calls
        // grant_subscription_plan(). This just tells the person to expect
        // it shortly, and refreshes to pick it up once it lands.
        setCheckoutLoadingPlan(null);
        alert("Payment received! Your plan will update within a few seconds — refreshing now.");
        setTimeout(() => window.location.reload(), 1500);
      },
      modal: {
        ondismiss: function () {
          setCheckoutLoadingPlan(null);
        },
      },
    });

    rzp.on("payment.failed", function (response) {
      setCheckoutError(`Payment failed: ${response.error.description || "please try again."}`);
      setCheckoutErrorKey((k) => k + 1);
      setCheckoutLoadingPlan(null);
    });

    rzp.open();
  }

  useEffect(() => {
    (async () => {
      const { data: { session: authSession } } = await supabase.auth.getSession();
      const user = authSession?.user;
      if (!user) {
        setMyTier("free");
        return;
      }
      const { data, error } = await supabase.from("profiles").select("premium_tier").eq("user_id", user.id).maybeSingle();
      if (error) {
        console.error("Failed to load current plan:", error);
        return; // stays null — no plan shown as "current" rather than wrongly defaulting to Free
      }
      setMyTier(data?.premium_tier || "free");
      if ((data?.premium_tier || "free") === "premium") {
        const { data: sub } = await supabase
          .from("subscriptions")
          .select("billing_interval")
          .eq("user_id", user.id)
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (sub?.billing_interval) {
          setMyBillingInterval(sub.billing_interval);
          setProBilling(sub.billing_interval); // show the toggle on whichever cycle they're actually on, by default
        } else {
          // Premium with no subscription record — a manually-granted/test
          // account. Assume monthly rather than leaving this ambiguous,
          // so the badge matches exactly one toggle position, not both.
          setMyBillingInterval("monthly");
        }
      }
    })();
  }, []);

  const proMonthlyBasic = 99;
  const proMonthly = 299;
  const proYearly = 2999;
  const proYearlyReference = proMonthly * 12; // ₹3,588 — the actual math reference, not a separate marketing number
  const proYearlyEquivalentMonthly = Math.round(proYearly / 12); // ≈ ₹250
  const proYearlySavingsPct = Math.round((1 - proYearly / proYearlyReference) * 100); // rounds to 16, per spec — never shown with a decimal

  const isYearly = proBilling === "yearly";

  const plans = [
    { key: "free", label: "Free", positioning: "Try Lytning Focus", price: "\u20b90", period: "/ forever", features: PRICING_FREE_FEATURES, icon: null, headerLabel: "Includes" },
    { key: "basic", label: "Basic", positioning: "For regular students", tagline: "Student Pack", price: `\u20b9${proMonthlyBasic}`, period: "/ month", features: PRICING_BASIC_FEATURES, icon: Sparkles, headerLabel: "Everything in Free, plus", cta: "Upgrade to Basic" },
    {
      key: "pro",
      label: "Pro",
      positioning: isYearly ? "Best value for committed students" : "For serious daily study",
      tagline: "Full Access",
      price: isYearly ? `\u20b9${proYearly}` : `\u20b9${proMonthly}`,
      strikePrice: isYearly ? `\u20b9${proYearlyReference}` : undefined,
      period: isYearly ? "/ year" : "/ month",
      sub: isYearly ? `\u2248 \u20b9${proYearlyEquivalentMonthly}/month \u2014 save ${proYearlySavingsPct}%` : undefined,
      features: isYearly ? PRICING_YEARLY_FEATURES : PRICING_PREMIUM_FEATURES,
      icon: Crown,
      highlight: true,
      badge: isYearly ? `\u2b50 BEST VALUE` : undefined,
      headerLabel: "Everything in Basic, plus",
      cta: isYearly ? "Upgrade to Yearly Pro" : "Upgrade to Pro",
      hasBillingToggle: true,
    },
  ];

  // The full row-by-row comparison table, same shape as a typical
  // competitor pricing page — one row per feature, one column per plan.
  const COMPARISON_ROWS = [
    { label: "Focus Timer (Stopwatch, Timer, Pomodoro)", values: [true, true, true] },
    { label: "Tasks", values: ["7", "14", "Unlimited"] },
    { label: "Growth levels & streaks", values: [true, true, true] },
    { label: "Friends", values: [true, true, true] },
    { label: "Leaderboard & Achievements", values: [true, true, true] },
    { label: "Habit Tracker", values: [false, false, "Unlimited"] },
    { label: "Events", values: [false, "Up to 5/month", "Unlimited"] },
    { label: "To-Do Lists", values: [false, "Up to 5 lists", "Unlimited"] },
    { label: "Tasks per To-Do List", values: [false, "Up to 10", "Unlimited"] },
    { label: "Daily focus timer cap", values: ["2 hours", "4 hours", "7 hours"] },
    { label: "Statistics history", values: ["2 weeks", "4 weeks", "Full history"] },
    { label: "Recent sessions shown", values: ["Last 5", "Last 10", "All sessions"] },
    { label: "Ads", values: ["Yes", "No", "No"] },
    { label: "Create study groups", values: [false, "3", "Unlimited"] },
    { label: "Join study groups (total)", values: ["2", "5", "Unlimited"] },
    { label: "Contribute Session", values: ["1 group", "2 groups", "5 groups"] },
    { label: "Insights (deep analytics)", values: [false, false, true] },
    { label: "Habit Tracker PDF export", values: [false, false, true] },
    { label: "Streak restores / year", values: [false, false, "6 (Yearly only)"] },
    { label: "Growth character style", values: ["Default", "Spirit Tree", "Character"] },
    { label: "Themes & Sound Effects", values: ["Free", "Free", "Premium"] },
    { label: "Usage limit", values: ["Low", "Medium", "High"] },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-10">
      <ErrorToast key={checkoutErrorKey} message={checkoutError} />
      <div className="text-center">
        <h1 className="text-3xl font-bold text-[var(--text-primary)]">Simple pricing</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">Everything you need to study is free. Upgrade when you need more.</p>
        <p className="text-xs text-[var(--text-muted)] mt-2 flex items-center justify-center gap-1.5">
          <Check size={13} className="text-emerald-400" /> Auto-renews until you cancel — cancel anytime, keep access until your period ends
        </p>
        <p className="text-xs text-[var(--text-faint)] mt-1.5">
          By upgrading, you agree to our{" "}
          <button onClick={() => goToLegal && goToLegal()} className="text-[var(--accent-text)] hover:underline font-medium">
            Privacy, Terms & Refund Policy
          </button>
          .
        </p>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        {plans.map((plan) => {
          const isCurrent = plan.key === myTier || (plan.key === "pro" && myTier === "premium" && proBilling === myBillingInterval);
          return (
          <GlowCard
            key={plan.key}
            glow={plan.highlight || isCurrent}
            borderColor={isCurrent ? "rgb(52 211 153 / 0.6)" : plan.highlight ? `rgb(var(--accent-rgb) / 0.9)` : undefined}
            className={"relative h-full flex flex-col " + (isCurrent ? "shadow-[0_0_30px_-8px_rgba(52,211,153,0.4)]" : "")}
          >
            {isCurrent && (
              <span className="absolute -top-2.5 left-4 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500 text-white whitespace-nowrap">
                YOUR PLAN
              </span>
            )}
            {plan.badge && (
              <span className="absolute -top-2.5 right-4 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500 text-white whitespace-nowrap">
                {plan.badge}
              </span>
            )}
            <div className="flex items-center gap-2 mb-1 mt-2">
              {plan.icon && <plan.icon size={14} className="text-[var(--accent-text)] shrink-0" />}
              <p className={"text-sm font-medium uppercase tracking-wide " + (plan.highlight ? "text-[var(--accent-text)]" : "text-[var(--text-muted)]")}>{plan.label}</p>
              {plan.tagline && (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text-muted)] whitespace-nowrap ml-auto">
                  {plan.tagline}
                </span>
              )}
            </div>
            {plan.positioning && <p className="text-xs text-[var(--text-secondary)] mb-2">{plan.positioning}</p>}
            {plan.hasBillingToggle && (
              <div className="flex gap-1 bg-[var(--surface-2)] rounded-lg p-1 mb-3 w-fit">
                <button
                  onClick={() => setProBilling("monthly")}
                  className={"px-3 py-1 rounded-md text-xs font-medium transition-colors " + (!isYearly ? "bg-[var(--accent)] text-white" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]")}
                >
                  Monthly
                </button>
                <button
                  onClick={() => setProBilling("yearly")}
                  className={"px-3 py-1 rounded-md text-xs font-medium transition-colors " + (isYearly ? "bg-[var(--accent)] text-white" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]")}
                >
                  Yearly
                </button>
              </div>
            )}
            <p className="text-3xl font-bold text-[var(--text-primary)] mb-0.5">
              {plan.price}
              <span className="text-sm font-normal text-[var(--text-muted)]"> {plan.period}</span>
              {plan.strikePrice && <span className="text-lg font-medium text-[var(--text-secondary)] line-through ml-2">{plan.strikePrice}</span>}
            </p>
            {plan.sub && <p className="text-xs text-emerald-400 mb-3">{plan.sub}</p>}
            <p className={"text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide mb-2 " + (plan.sub ? "" : "mt-4")}>{plan.headerLabel}</p>
            <ul className="space-y-2.5 flex-1">
              {plan.features.map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                  <Check size={14} className="text-emerald-400 mt-0.5 shrink-0" />
                  {typeof f === "string" ? (
                    f
                  ) : f.exclusive ? (
                    <span className="flex flex-col items-start gap-1">
                      <span>{f.text}</span>
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide bg-amber-500/15 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded-full">
                        <Star size={9} className="fill-amber-400" /> Exclusive
                      </span>
                    </span>
                  ) : (
                    <span>
                      {f.text}
                      <span className="block text-xs text-[var(--text-faint)]">({f.sub})</span>
                    </span>
                  )}
                </li>
              ))}
            </ul>
            {plan.cta && plan.key !== "free" && (
              <button
                onClick={() => {
                  if (subStatus?.is_lifetime) {
                    alert("You have Lytning Focus Premium for life — no need to upgrade anything!");
                    return;
                  }
                  if (!isCurrent) handleUpgradeClick(plan.key === "pro" ? "premium" : plan.key, plan.key === "pro" ? proBilling : "monthly");
                }}
                disabled={isCurrent || checkoutLoadingPlan === plan.key || subStatus?.is_lifetime}
                className={
                  "w-full text-sm font-medium py-2.5 rounded-xl mt-5 transition-colors flex items-center justify-center gap-2 " +
                  (isCurrent || subStatus?.is_lifetime
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 cursor-default"
                    : "bg-[var(--accent)] hover:bg-[var(--accent-hover)] active:scale-[0.98] text-white disabled:opacity-60 disabled:cursor-wait")
                }
              >
                {checkoutLoadingPlan === plan.key && <Loader2 size={15} className="animate-spin" />}
                {subStatus?.is_lifetime ? "Lifetime Active" : isCurrent ? "Current Plan" : checkoutLoadingPlan === plan.key ? "Opening checkout..." : plan.cta}
              </button>
            )}
            {isCurrent && subStatus && subStatus.plan === (plan.key === "pro" ? "premium" : plan.key) && (
              <div className="mt-3 pt-3 border-t border-[var(--border-subtle)]">
                {subStatus.status === "past_due" && (
                  <p className="text-xs bg-red-500/15 text-red-400 px-2 py-1.5 rounded-lg mb-2 text-center font-medium">⚠️ Renewal payment failed — Razorpay is retrying automatically. Update your card if this continues.</p>
                )}
                {subStatus.status === "halted" && (
                  <p className="text-xs bg-red-500/15 text-red-400 px-2 py-1.5 rounded-lg mb-2 text-center font-medium">Payment retries exhausted — access removed.</p>
                )}
                {!subStatus.will_renew && subStatus.status === "cancelled" && (
                  <p className="text-xs bg-amber-500/15 text-amber-400 px-2 py-1 rounded-lg mb-2 text-center font-medium">Cancelled — active until period end</p>
                )}
                <p className="text-[11px] text-[var(--text-faint)] text-center mb-2">
                  {subStatus.will_renew
                    ? `Renews automatically on ${new Date(subStatus.current_period_end).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
                    : `Your usage ends on ${new Date(subStatus.current_period_end).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`}
                </p>
                {subStatus.will_renew && (
                  <button
                    onClick={() => setShowCancelConfirm(true)}
                    className="w-full text-xs font-medium py-2 rounded-lg border border-red-900/40 text-red-400 hover:bg-red-500/5 transition-colors"
                  >
                    Cancel subscription
                  </button>
                )}
              </div>
            )}
          </GlowCard>
          );
        })}
      </div>

      <div className="relative">
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
          <span className="bg-gradient-to-r from-amber-400 to-amber-500 text-black text-xs font-bold px-4 py-1 rounded-full shadow-lg shadow-amber-500/30 flex items-center gap-1">
            <Sparkles size={12} /> ULTIMATE CHOICE
          </span>
        </div>
        <GlowCard
          glow
          borderColor="rgb(var(--accent-rgb) / 0.7)"
          className="!p-6 sm:!p-8 bg-gradient-to-r from-[rgb(var(--accent-rgb)/0.18)] via-[rgb(var(--accent-rgb)/0.08)] to-transparent shadow-[0_0_50px_-10px_rgb(var(--accent-rgb)/0.5)]"
        >
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="flex-1 text-center sm:text-left">
              <div className="flex items-center justify-center sm:justify-start gap-2 mb-1">
                <Crown size={20} className="text-amber-400" />
                <p className="text-xl font-bold text-[var(--text-primary)]">Lifetime Premium</p>
              </div>
              <p className="text-sm text-[var(--text-secondary)]">The ultimate choice — full access, forever. Pay once, never think about billing again.</p>
            </div>
            <div className="text-center shrink-0">
              <p className="text-3xl font-bold text-[var(--text-primary)]">Just ₹14,999</p>
              <p className="text-xs text-[var(--text-faint)]">one-time payment</p>
            </div>
            <button
              onClick={handleLifetimePurchase}
              disabled={lifetimeLoading || subStatus?.is_lifetime}
              className={
                "shrink-0 text-sm font-semibold px-8 py-3 rounded-xl transition-colors flex items-center justify-center gap-2 " +
                (subStatus?.is_lifetime
                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 cursor-default"
                  : "bg-gradient-to-r from-[var(--accent)] to-[var(--accent-hover)] hover:brightness-110 text-white disabled:opacity-60 disabled:cursor-wait active:scale-[0.98] shadow-lg shadow-[rgb(var(--accent-rgb)/0.4)]")
              }
            >
              {lifetimeLoading && <Loader2 size={15} className="animate-spin" />}
              {subStatus?.is_lifetime ? "You have this" : lifetimeLoading ? "Opening checkout..." : "Get Lifetime Access"}
            </button>
          </div>
        </GlowCard>
      </div>

      {showCancelConfirm && (
        <div className="fixed inset-0 md:left-60 lg:left-64 z-[400] flex items-center justify-center p-4" onClick={() => setShowCancelConfirm(false)}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div onClick={(e) => e.stopPropagation()} className="relative bg-[var(--surface-solid)] border border-[var(--border)] rounded-3xl p-6 max-w-sm w-full text-center shadow-xl">
            <p className="text-base font-semibold text-[var(--text-primary)] mb-2">Cancel your subscription?</p>
            <p className="text-sm text-[var(--text-muted)] mb-6">
              You'll keep full access until {subStatus && new Date(subStatus.current_period_end).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })} — nothing is lost right away, and you can reactivate anytime before then.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowCancelConfirm(false)}
                className="flex-1 bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-secondary-strong)] text-sm font-medium py-2.5 rounded-xl transition-colors"
              >
                Never mind
              </button>
              <button
                onClick={handleCancelSubscription}
                disabled={subActionLoading}
                className="flex-1 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-xl transition-colors"
              >
                {subActionLoading ? "Cancelling..." : "Yes, cancel"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full feature-by-feature comparison table, same layout pattern as
          a typical competitor pricing page — every plan's exact numbers
          side by side, row by row. */}
      <div>
        <h2 className="text-lg font-semibold text-[var(--text-primary)] text-center mb-4">Compare plans</h2>
        <GlowCard className="overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="border-b border-[var(--border-subtle)]">
                <th className="text-left font-medium text-[var(--text-muted)] pb-3 pr-4">Feature</th>
                <th className="text-center font-medium text-[var(--text-muted)] pb-3 px-3">Free</th>
                <th className="text-center font-medium text-[var(--text-muted)] pb-3 px-3">Basic</th>
                <th className="text-center font-medium text-[var(--accent-text)] pb-3 pl-3">Pro</th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON_ROWS.map((row) => (
                <tr key={row.label} className="border-b border-[var(--border-subtle)] last:border-0">
                  <td className="py-3 pr-4 text-[var(--text-secondary)]">{row.label}</td>
                  {row.values.map((v, i) => (
                    <td key={i} className={"py-3 px-3 text-center " + (i >= 2 ? "font-medium text-[var(--text-primary)]" : "text-[var(--text-muted)]")}>
                      {typeof v === "boolean" ? (
                        v ? <Check size={15} className="text-emerald-400 mx-auto" /> : <X size={15} className="text-[var(--text-faint)] mx-auto" />
                      ) : (
                        v
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </GlowCard>
      </div>
    </div>
  );
}

// Android-style circular clock-face time picker: click a number on the dial
// to select it, hour selection auto-advances to minute selection (matching
// the real Android TimePickerDialog flow), confirm with OK.
const WHEEL_ITEM_HEIGHT = 40;
const WHEEL_VISIBLE_ROWS = 3;
const WHEEL_HEIGHT = WHEEL_ITEM_HEIGHT * WHEEL_VISIBLE_ROWS;

// A single scrolling wheel column: the selection slot stays fixed in the
// middle, and the numbers scroll past it — same interaction as a native
// mobile spinner/wheel picker, not a dropdown list and not a clock dial.
function WheelColumn({ options, value, onChange }) {
  const scrollRef = useRef(null);
  const skipNextScroll = useRef(false);
  const settleTimer = useRef(null);
  const selectedIndex = Math.max(0, options.findIndex((o) => o.value === value));

  useEffect(() => {
    if (scrollRef.current) {
      skipNextScroll.current = true;
      scrollRef.current.scrollTop = selectedIndex * WHEEL_ITEM_HEIGHT;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleScroll = () => {
    if (skipNextScroll.current) {
      skipNextScroll.current = false;
      return;
    }
    clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      if (!scrollRef.current) return;
      const idx = Math.round(scrollRef.current.scrollTop / WHEEL_ITEM_HEIGHT);
      const clamped = Math.max(0, Math.min(options.length - 1, idx));
      scrollRef.current.scrollTo({ top: clamped * WHEEL_ITEM_HEIGHT, behavior: "smooth" });
      if (options[clamped] && options[clamped].value !== value) onChange(options[clamped].value);
    }, 120);
  };

  return (
    <div className="relative" style={{ height: WHEEL_HEIGHT, width: 64 }}>
      {/* Fixed selection slot — numbers scroll past this, it never moves */}
      <div
        className="absolute inset-x-0 top-1/2 -translate-y-1/2 bg-[rgb(var(--accent-rgb)/0.1)] border-y border-[rgb(var(--accent-rgb)/0.4)] pointer-events-none rounded"
        style={{ height: WHEEL_ITEM_HEIGHT }}
      />
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="h-full overflow-y-scroll snap-y snap-mandatory"
        style={{ paddingTop: WHEEL_ITEM_HEIGHT, paddingBottom: WHEEL_ITEM_HEIGHT, scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {options.map((o) => (
          <div
            key={o.value}
            className={"snap-center flex items-center justify-center text-base font-semibold transition-colors " + (o.value === value ? "text-[var(--text-primary)]" : "text-[var(--text-faint)]")}
            style={{ height: WHEEL_ITEM_HEIGHT }}
          >
            {o.label}
          </div>
        ))}
      </div>
    </div>
  );
}

const WHEEL_HOURS = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }));
const WHEEL_MINUTES = Array.from({ length: 60 }, (_, i) => ({ value: String(i).padStart(2, "0"), label: String(i).padStart(2, "0") }));
const WHEEL_PERIODS = [
  { value: "AM", label: "AM" },
  { value: "PM", label: "PM" },
];

function TimePicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const label = minutesToTimeLabel(timeStringToMinutes(value));

  const [h24, m] = value.split(":").map(Number);
  const hour12 = String(h24 % 12 === 0 ? 12 : h24 % 12);
  const minuteStr = String(m).padStart(2, "0");
  const period = h24 >= 12 ? "PM" : "AM";

  const containerRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const commit = (nextHour12, nextMinute, nextPeriod) => {
    let h = Number(nextHour12) % 12;
    if (nextPeriod === "PM") h += 12;
    onChange(`${String(h).padStart(2, "0")}:${nextMinute}`);
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between bg-[var(--input-bg)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] outline-none transition-colors"
      >
        <span>{label}</span>
        <Clock size={15} className="text-[var(--text-muted)]" />
      </button>
      {open && (
        <div className="absolute z-30 mt-2 bg-[var(--surface-solid)] border border-[var(--card-border)] rounded-xl shadow-xl shadow-black/40 p-3">
          <div className="flex items-center gap-1">
            <WheelColumn options={WHEEL_HOURS} value={hour12} onChange={(h) => commit(h, minuteStr, period)} />
            <span className="text-lg font-bold text-[var(--text-muted)]">:</span>
            <WheelColumn options={WHEEL_MINUTES} value={minuteStr} onChange={(mn) => commit(hour12, mn, period)} />
            <WheelColumn options={WHEEL_PERIODS} value={period} onChange={(p) => commit(hour12, minuteStr, p)} />
          </div>
          <button onClick={() => setOpen(false)} className="w-full mt-2 text-xs bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-medium py-2 rounded-lg transition-colors">
            Done
          </button>
        </div>
      )}
    </div>
  );
}

// Marks a feature as a Premium preview — everyone can actually use it for
// now (no real billing exists yet), this just shows what will eventually
// be gated so the paywall UI can be reviewed ahead of time. Clicking it
// takes you straight to the Premium tab.
function PremiumBadge({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 text-[10px] font-semibold text-[var(--accent-text)] bg-[rgb(var(--accent-rgb)/0.15)] border border-[rgb(var(--accent-rgb)/0.3)] px-1.5 py-0.5 rounded-full hover:bg-[rgb(var(--accent-rgb)/0.25)] hover:border-[rgb(var(--accent-rgb)/0.5)] transition-colors"
    >
      <Crown size={9} /> Premium
    </button>
  );
}

const EVENT_COLORS = [
  { name: "Blue", hex: "#3b82f6" },
  { name: "Purple", hex: "#a855f7" },
  { name: "Green", hex: "#22c55e" },
  { name: "Red", hex: "#ef4444" },
  { name: "Orange", hex: "#f97316" },
  { name: "Yellow", hex: "#eab308" },
  { name: "Pink", hex: "#ec4899" },
  { name: "Cyan", hex: "#06b6d4" },
];

const EVENT_CATEGORIES = ["Study", "Exam", "Assignment", "Personal", "Meeting", "Other"];

function timeStringToMinutes(t) {
  if (!t) return 0;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

function minutesToTimeLabel(mins) {
  const h24 = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  const period = h24 < 12 ? "AM" : "PM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

function addMinutesToTimeString(timeStr, minutesToAdd) {
  const mins = timeStringToMinutes(timeStr) + minutesToAdd;
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function dateToLocalISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Generates a fixed set of occurrence dates rather than a true infinite
// recurrence rule — simpler and predictable, and 12 occurrences covers
// 12 days/weeks/months depending on frequency, which is plenty for a
// study planner's actual use cases (a semester of weekly classes, etc).
function generateRecurrenceDates(startDateStr, recurrence, count) {
  const dates = [];
  let d = new Date(startDateStr + "T00:00:00");
  for (let i = 0; i < count; i++) {
    dates.push(dateToLocalISO(d));
    if (recurrence === "daily") d.setDate(d.getDate() + 1);
    else if (recurrence === "weekly") d.setDate(d.getDate() + 7);
    else if (recurrence === "monthly") d.setMonth(d.getMonth() + 1);
  }
  return dates;
}

// PDF export via the browser's built-in print-to-PDF — avoids adding a PDF
// library as a dependency. Builds a clean, temporary full-page printable
// view of the events list, opens the print dialog (user picks "Save as
// PDF" as the destination), then removes itself once printing is done.
function exportEventsAsPDF(events) {
  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time));

  const rows = sorted
    .map((ev) => {
      const dateLabel = new Date(ev.date + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
      const timeLabel = `${minutesToTimeLabel(timeStringToMinutes(ev.start_time))} – ${minutesToTimeLabel(timeStringToMinutes(ev.end_time))}`;
      return `
        <div style="display:flex; align-items:flex-start; gap:10px; padding:10px 0; border-bottom:1px solid #eee;">
          <div style="width:10px; height:10px; border-radius:50%; background:${ev.color}; margin-top:5px; flex-shrink:0;"></div>
          <div>
            <div style="font-weight:600; font-size:14px;">${ev.title}</div>
            <div style="font-size:12px; color:#666;">${dateLabel} · ${timeLabel}</div>
            ${ev.description ? `<div style="font-size:12px; color:#888; margin-top:2px;">${ev.description}</div>` : ""}
          </div>
        </div>`;
    })
    .join("");

  const printRoot = document.createElement("div");
  printRoot.id = "studyflow-print-root";
  printRoot.style.cssText = "position:fixed; inset:0; background:#fff; z-index:99999; padding:32px; font-family:sans-serif; color:#111; overflow:auto;";
  printRoot.innerHTML = `
    <h1 style="font-size:22px; margin-bottom:4px;">Lytning Focus — Events</h1>
    <p style="font-size:12px; color:#888; margin-bottom:20px;">Exported ${new Date().toLocaleDateString()}</p>
    ${rows || '<p style="color:#888;">No events to export.</p>'}
  `;
  document.body.appendChild(printRoot);

  const cleanup = () => {
    if (printRoot.parentNode) document.body.removeChild(printRoot);
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  window.print();
}


// Builds a clean, properly structured two-page A4 landscape PDF from three
// separately-captured screenshot canvases of the real live app:
//   Page 1 — Row A (charts + weekly breakdown + Top 10 Habits) on top, and
//            the Monthly Insights panel (also a real screenshot, so its font
//            and colors match the rest of the app exactly) stretched to
//            fill every bit of the remaining space below it — no gap.
//   Page 2 — Row B (daily habits table) — always starts on a fresh page so
//             it is never broken mid-row by an arbitrary page boundary.
async function buildTwoPageHabitPDF({ canvasA, canvasB, canvasC, monthLabel, bg, bgRgb, accentRgb, borderRgb, textMutRgb }) {
  const generatedAt = new Date().toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 20;
  const headerH = 28;
  const footerH = 18;
  const usableW = pageW - margin * 2;
  const usableH = pageH - margin * 2 - headerH - footerH;

  const fill = ([r, g, b]) => doc.setFillColor(r, g, b);
  const stroke = ([r, g, b]) => doc.setDrawColor(r, g, b);
  const text = ([r, g, b]) => doc.setTextColor(r, g, b);

  const fillPageBg = () => {
    fill(bgRgb);
    doc.rect(0, 0, pageW, pageH, "F");
  };

  const drawHeader = (pageLabel) => {
    fill(accentRgb);
    doc.rect(0, 0, pageW, 4, "F");
    doc.setFontSize(8);
    text(textMutRgb);
    doc.text(`Lytning Focus  —  Habit Tracker  —  ${monthLabel}`, margin, margin + 12);
    doc.text(pageLabel, pageW - margin, margin + 12, { align: "right" });
    stroke(borderRgb);
    doc.setLineWidth(0.4);
    doc.line(margin, margin + 17, pageW - margin, margin + 17);
  };

  const drawFooter = () => {
    doc.setFontSize(7);
    text(textMutRgb);
    doc.text(`Generated ${generatedAt}`, margin, pageH - 8);
    doc.text("Lytning Focus · Build better habits, one day at a time.", pageW - margin, pageH - 8, { align: "right" });
  };

  // ============================================================
  // PAGE 1: Row A + Monthly Insights, centered as a group in the
  //         available vertical space instead of glued to the top.
  // ============================================================
  fillPageBg();
  drawHeader("Page 1 of 2");
  drawFooter();

  const scaleA = usableW / canvasA.width;
  const imgAH = Math.min(canvasA.height * scaleA, usableH * 0.58);

  const scaleC = usableW / canvasC.width;
  const gapAC = 10;
  const imgCH = Math.min(canvasC.height * scaleC, usableH - imgAH - gapAC);

  const totalContentH = imgAH + gapAC + imgCH;
  const contentTop = margin + headerH + Math.max(0, (usableH - totalContentH) / 2);

  doc.addImage(canvasA.toDataURL("image/png"), "PNG", margin, contentTop, usableW, imgAH, undefined, "FAST");
  doc.addImage(canvasC.toDataURL("image/png"), "PNG", margin, contentTop + imgAH + gapAC, usableW, imgCH, undefined, "FAST");

  // ============================================================
  // PAGE 2: Row B (daily habits table + progress) — own fresh page.
  // ============================================================
  doc.addPage();
  fillPageBg();
  drawHeader("Page 2 of 2");
  drawFooter();

  const scaleB = usableW / canvasB.width;
  const sliceSourceH = Math.ceil(usableH / scaleB);
  const extraPages = Math.max(1, Math.ceil((canvasB.height * scaleB) / usableH));

  for (let p = 0; p < extraPages; p++) {
    if (p > 0) {
      doc.addPage();
      fillPageBg();
      fill(accentRgb);
      doc.rect(0, 0, pageW, 4, "F");
      doc.setFontSize(8);
      text(textMutRgb);
      doc.text(`Lytning Focus  —  Habit Tracker  —  ${monthLabel} (continued)`, margin, margin + 12);
      doc.text(`Page ${2 + p} of ${1 + extraPages}`, pageW - margin, margin + 12, { align: "right" });
      stroke(borderRgb);
      doc.setLineWidth(0.4);
      doc.line(margin, margin + 17, pageW - margin, margin + 17);
      drawFooter();
    }
    const sy = p * sliceSourceH;
    const sh = Math.min(sliceSourceH, canvasB.height - sy);
    if (sh <= 0) break;
    const sliceCanvas = document.createElement("canvas");
    sliceCanvas.width = canvasB.width;
    sliceCanvas.height = sh;
    sliceCanvas.getContext("2d").drawImage(canvasB, 0, sy, canvasB.width, sh, 0, 0, canvasB.width, sh);
    doc.addImage(sliceCanvas.toDataURL("image/png"), "PNG", margin, margin + headerH, usableW, sh * scaleB, undefined, "FAST");
  }

  const safeMonth = monthLabel.replace(/\s+/g, "_");
  doc.save(`Lytning Focus_Habit_Tracker_${safeMonth}.pdf`);
}
function layoutEventsForDay(dayEvents) {
  const withMinutes = dayEvents.map((ev) => ({
    ...ev,
    startMinutes: timeStringToMinutes(ev.start_time),
    endMinutes: timeStringToMinutes(ev.end_time),
  }));
  const sorted = [...withMinutes].sort((a, b) => a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes);

  const columns = [];
  const positioned = [];

  sorted.forEach((ev) => {
    let placed = false;
    for (let i = 0; i < columns.length; i++) {
      const col = columns[i];
      const last = col[col.length - 1];
      if (ev.startMinutes >= last.endMinutes) {
        col.push(ev);
        positioned.push({ ...ev, col: i });
        placed = true;
        break;
      }
    }
    if (!placed) {
      columns.push([ev]);
      positioned.push({ ...ev, col: columns.length - 1 });
    }
  });

  return positioned.map((ev) => {
    const overlapping = positioned.filter((other) => other.startMinutes < ev.endMinutes && other.endMinutes > ev.startMinutes);
    const totalCols = Math.max(...overlapping.map((o) => o.col)) + 1;
    return { ...ev, totalCols };
  });
}

// Create/edit modal — validates title, date, and that end time is after start time.
function EventModal({ initial, onClose, onSave, onDelete, goTo }) {
  const isEditing = !!initial?.id;
  const [title, setTitle] = useState(initial?.title || "");
  const [date, setDate] = useState(initial?.date || dateToLocalISO(new Date()));
  const [startTime, setStartTime] = useState(initial?.start_time?.slice(0, 5) || "09:00");
  const [endTime, setEndTime] = useState(initial?.end_time?.slice(0, 5) || "10:00");
  const [description, setDescription] = useState(initial?.description || "");
  const [color, setColor] = useState(initial?.color || EVENT_COLORS[1].hex);
  const [category, setCategory] = useState(initial?.category ? initial.category[0].toUpperCase() + initial.category.slice(1) : "Other");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [visible, setVisible] = useState(false);
  const [recurrence, setRecurrence] = useState(initial?.recurrence || "none");

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const requestClose = () => {
    setVisible(false);
    setTimeout(onClose, 150);
  };

  const save = async () => {
    setError("");
    if (!title.trim()) {
      setError("Title can't be empty.");
      return;
    }
    if (!date) {
      setError("Pick a valid date.");
      return;
    }
    if (timeStringToMinutes(endTime) <= timeStringToMinutes(startTime)) {
      setError("End time must be after start time.");
      return;
    }
    setSaving(true);
    const ok = await onSave({
      title: title.trim(),
      date,
      start_time: startTime,
      end_time: endTime,
      description: description.trim(),
      color,
      category: category.toLowerCase(),
      recurrence,
    });
    setSaving(false);
    if (!ok) setError("Couldn't save — please try again.");
  };

  return (
    <div className={"fixed inset-0 z-[300] flex items-center justify-center p-4 transition-opacity duration-150 " + (visible ? "opacity-100" : "opacity-0")} onClick={requestClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        onClick={(e) => e.stopPropagation()}
        className={
          "relative bg-[var(--surface-solid)] border border-[var(--card-border)] rounded-3xl p-5 max-w-md w-full shadow-2xl shadow-black/50 transition-all duration-200 " +
          (visible ? "scale-100 opacity-100" : "scale-95 opacity-0")
        }
      >
        <div className="flex items-center justify-between mb-3">
          <p className="text-base font-semibold text-[var(--text-primary)]">{isEditing ? "Edit event" : "New event"}</p>
          <div className="flex items-center gap-1">
            {isEditing && (
              <button onClick={() => setConfirmDelete(true)} className="text-[var(--text-muted)] hover:text-red-400 transition-colors p-1" title="Delete event">
                <Trash2 size={16} />
              </button>
            )}
            <button onClick={requestClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors p-1">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="space-y-2.5">
          <div>
            <label className="text-[11px] text-[var(--text-muted)] block mb-1">
              Title <span className="text-[var(--accent-text)]">*</span>
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, 100))}
              placeholder="e.g. Mathematics exam"
              className="w-full bg-[var(--input-bg)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl px-4 py-2 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)]"
            />
          </div>

          <div>
            <label className="text-[11px] text-[var(--text-muted)] block mb-1">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full bg-[var(--input-bg)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl px-4 py-2 text-sm text-[var(--text-primary)] outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-[var(--text-muted)] block mb-1">Start time</label>
              <TimePicker value={startTime} onChange={setStartTime} />
            </div>
            <div>
              <label className="text-[11px] text-[var(--text-muted)] block mb-1">End time</label>
              <TimePicker value={endTime} onChange={setEndTime} />
            </div>
          </div>

          {!isEditing && (
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <label className="text-[11px] text-[var(--text-muted)]">Repeat</label>
                <PremiumBadge onClick={() => goTo && goTo("pricing")} />
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {[
                  ["none", "Doesn't repeat"],
                  ["daily", "Daily"],
                  ["weekly", "Weekly"],
                  ["monthly", "Monthly"],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setRecurrence(key)}
                    className={
                      "text-xs font-medium px-2.5 py-1 rounded-lg transition-colors " +
                      (recurrence === key ? "bg-[rgb(var(--accent-rgb)/0.2)] text-[var(--accent-text)] border border-[rgb(var(--accent-rgb)/0.3)]" : "bg-[var(--surface-2)] text-[var(--text-secondary-strong)] hover:bg-[var(--surface-3)]")
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
              {recurrence !== "none" && <p className="text-[10px] text-[var(--text-faint)] mt-1">Creates 12 occurrences, {recurrence}.</p>}
            </div>
          )}

          <div>
            <label className="text-[11px] text-[var(--text-muted)] block mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 500))}
              rows={2}
              placeholder="Optional notes..."
              className="w-full bg-[var(--input-bg)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl px-4 py-2 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)] resize-none"
            />
          </div>

          <div>
            <label className="text-[11px] text-[var(--text-muted)] block mb-1">Category</label>
            <div className="flex flex-wrap gap-1.5">
              {EVENT_CATEGORIES.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={
                    "text-xs font-medium px-2.5 py-1 rounded-lg transition-colors " +
                    (category === c ? "bg-[rgb(var(--accent-rgb)/0.2)] text-[var(--accent-text)] border border-[rgb(var(--accent-rgb)/0.3)]" : "bg-[var(--surface-2)] text-[var(--text-secondary-strong)] hover:bg-[var(--surface-3)]")
                  }
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[11px] text-[var(--text-muted)] block mb-1">Color</label>
            <div className="flex gap-1.5 flex-wrap">
              {EVENT_COLORS.map((c) => (
                <button
                  key={c.hex}
                  onClick={() => setColor(c.hex)}
                  title={c.name}
                  className={
                    "h-7 w-7 rounded-full transition-all duration-150 flex items-center justify-center hover:scale-110 " +
                    (color === c.hex ? "ring-2 ring-offset-2 ring-offset-[var(--surface-solid)] ring-[var(--text-primary)] scale-110" : "")
                  }
                  style={{ backgroundColor: c.hex }}
                >
                  {color === c.hex && <Check size={13} className="text-white drop-shadow" />}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button onClick={save} disabled={saving} className="flex-1 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-xl transition-colors">
              {saving ? "Saving..." : isEditing ? "Save changes" : "Create event"}
            </button>
            <button onClick={requestClose} className="flex-1 bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-secondary-strong)] text-sm font-medium py-2.5 rounded-xl transition-colors">
              Cancel
            </button>
          </div>
        </div>

        {/* Delete confirmation — overlays on top of the modal content
            instead of expanding inline and pushing everything else down. */}
        {confirmDelete && (
          <div className="absolute inset-0 rounded-3xl bg-[var(--surface-solid)]/95 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center">
            <p className="text-sm text-[var(--text-primary)] font-medium mb-1">Delete this event?</p>
            <p className="text-xs text-[var(--text-muted)] mb-5">This can't be undone.</p>
            <div className="flex gap-2 w-full max-w-[240px]">
              <button onClick={() => onDelete(initial.id)} className="flex-1 bg-red-500 hover:bg-red-400 text-white text-sm font-medium py-2.5 rounded-xl transition-colors">
                Delete
              </button>
              <button onClick={() => setConfirmDelete(false)} className="flex-1 bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-secondary-strong)] text-sm font-medium py-2.5 rounded-xl transition-colors">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Month grid — always renders a full 6-week grid so layout never jumps
// between months, with events shown as colored bars, capped at 3 visible
// per day with a "+N more" overflow indicator.
function MonthView({ viewDate, events, onSelectDay, onEventClick }) {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startOffset = firstOfMonth.getDay();
  const gridStart = new Date(year, month, 1 - startOffset);

  const days = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return d;
  });

  const todayISO = dateToLocalISO(new Date());
  const eventsByDate = {};
  events.forEach((ev) => {
    (eventsByDate[ev.date] = eventsByDate[ev.date] || []).push(ev);
  });

  return (
    <div>
      <div className="grid grid-cols-7 mb-1">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <p key={d} className="text-center text-[11px] font-medium text-[var(--text-muted)] py-2">
            {d}
          </p>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const iso = dateToLocalISO(d);
          const isCurrentMonth = d.getMonth() === month;
          const isToday = iso === todayISO;
          const dayEvents = (eventsByDate[iso] || []).sort((a, b) => timeStringToMinutes(a.start_time) - timeStringToMinutes(b.start_time));
          const visible = dayEvents.slice(0, 2);
          const overflow = dayEvents.length - visible.length;

          return (
            <button
              key={iso}
              onClick={() => onSelectDay(d)}
              className={
                "text-left rounded-lg p-1.5 min-h-[52px] md:min-h-[84px] transition-all duration-150 border hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/20 " +
                (isCurrentMonth ? "bg-[var(--surface-2)]/30 border-[var(--border-subtle)]" : "bg-transparent border-transparent opacity-40") +
                " hover:border-[rgb(var(--accent-rgb)/0.4)]"
              }
            >
              <span
                className={
                  "text-xs inline-flex items-center justify-center h-5 w-5 rounded-full transition-all " +
                  (isToday ? "bg-[var(--accent)] text-white font-semibold ring-2 ring-[rgb(var(--accent-rgb)/0.3)] ring-offset-1 ring-offset-[var(--surface-solid)]" : "text-[var(--text-secondary)]")
                }
              >
                {d.getDate()}
              </span>
              <div className="mt-1 space-y-1">
                {visible.map((ev) => (
                  <div
                    key={ev.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onEventClick(ev);
                    }}
                    className="flex items-center gap-1 text-[10px] truncate rounded-sm pl-1.5 pr-1 py-0.5 font-medium border-l-2 hover:brightness-125 transition-all"
                    style={{ backgroundColor: `${ev.color}22`, borderColor: ev.color, color: ev.color }}
                  >
                    {ev.title}
                  </div>
                ))}
                {overflow > 0 && <p className="text-[10px] text-[var(--text-muted)] px-1">+{overflow} more</p>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const SCHEDULE_START_HOUR = 0; // 12 AM
const SCHEDULE_END_HOUR = 24; // midnight the next day — the full 24-hour day, not just the morning
const HOUR_HEIGHT = 44; // px per hour — change this to adjust the whole timeline's scale

// Hourly vertical timeline for a single day, with events positioned and
// sized by their actual start/end time (not snapped to hour blocks), a live
// current-time indicator when viewing today, and click-to-create.
function ScheduleView({ viewDate, events, onCreateAt, onEventClick }) {
  const [nowTick, setNowTick] = useState(Date.now());
  const scrollMarkerRef = useRef(null);
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  const iso = dateToLocalISO(viewDate);
  const dayEvents = events.filter((ev) => ev.date === iso);
  const laidOut = layoutEventsForDay(dayEvents);

  const rangeStartMin = SCHEDULE_START_HOUR * 60;
  const rangeEndMin = SCHEDULE_END_HOUR * 60;
  const totalHeight = ((rangeEndMin - rangeStartMin) / 60) * HOUR_HEIGHT;

  const now = new Date();
  const isToday = dateToLocalISO(now) === iso;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const nowTop = ((nowMinutes - rangeStartMin) / 60) * HOUR_HEIGHT;

  const hours = Array.from({ length: SCHEDULE_END_HOUR - SCHEDULE_START_HOUR + 1 }, (_, i) => SCHEDULE_START_HOUR + i);

  // Opens scrolled to something actually useful instead of always starting
  // at midnight — the current time if viewing today, otherwise a little
  // before the day's earliest event, or a reasonable 7am default if there
  // are no events yet.
  useEffect(() => {
    const earliestEventMin = dayEvents.length > 0 ? Math.min(...dayEvents.map((ev) => timeStringToMinutes(ev.start_time))) : null;
    const targetMin = isToday ? nowMinutes : earliestEventMin !== null ? Math.max(0, earliestEventMin - 60) : 7 * 60;
    scrollMarkerRef.current?.scrollIntoView({ block: "start" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iso]);

  const handleTrackClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const clickedMinutes = rangeStartMin + Math.round((y / HOUR_HEIGHT) * 60);
    const snapped = Math.round(clickedMinutes / 15) * 15; // snap to nearest 15 min
    const h = Math.floor(snapped / 60);
    const m = snapped % 60;
    onCreateAt(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  };

  const earliestEventMin = dayEvents.length > 0 ? Math.min(...dayEvents.map((ev) => timeStringToMinutes(ev.start_time))) : null;
  const scrollTargetMin = isToday ? nowMinutes : earliestEventMin !== null ? Math.max(0, earliestEventMin - 60) : 7 * 60;
  const scrollTargetTop = ((scrollTargetMin - rangeStartMin) / 60) * HOUR_HEIGHT;

  return (
    <div className="relative flex" style={{ height: totalHeight }}>
      <div ref={scrollMarkerRef} className="absolute left-0 right-0 pointer-events-none" style={{ top: Math.max(0, scrollTargetTop) }} />
      {/* Time label column — fixed width, clearly separated from events by a visible divider */}
      <div className="relative w-14 shrink-0 border-r border-[var(--border-subtle)]">
        {hours.map((h, i) => (
          <span key={h} className="absolute right-2 text-[10px] text-[var(--text-muted)] -mt-1.5" style={{ top: i * HOUR_HEIGHT }}>
            {minutesToTimeLabel(h * 60)}
          </span>
        ))}
      </div>

      {/* Events track — its own width is the percentage basis for event
          left/width below, so overlapping events divide evenly across
          real columns instead of coinciding. */}
      <div className="relative flex-1" onClick={handleTrackClick}>
        {hours.map((h, i) => (
          <div key={h} className="absolute left-0 right-0 border-t border-[var(--border-subtle)]" style={{ top: i * HOUR_HEIGHT }} />
        ))}

        {isToday && nowMinutes >= rangeStartMin && nowMinutes <= rangeEndMin && (
          <div className="absolute left-0 right-0 flex items-center gap-1.5 z-20 pointer-events-none" style={{ top: nowTop }}>
            <span className="relative flex h-2 w-2 shrink-0 -ml-1">
              <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-60 animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
            </span>
            <div className="flex-1 h-px bg-red-500/70" />
          </div>
        )}

        {laidOut.map((ev) => {
          const rawTop = ((ev.startMinutes - rangeStartMin) / 60) * HOUR_HEIGHT;
          const rawHeight = ((ev.endMinutes - ev.startMinutes) / 60) * HOUR_HEIGHT;
          const top = Math.max(0, Math.min(totalHeight, rawTop));
          const height = Math.max(16, Math.min(totalHeight - top, rawHeight));
          const widthPct = 100 / ev.totalCols;
          const leftPct = ev.col * widthPct;
          // A single, non-overlapping event doesn't need to stretch across
          // the whole track — cap it to a natural card width instead.
          // Always cap the actual rendered width, regardless of how many
          // columns it's sharing space with — a column being wide (e.g. only
          // 2 overlapping events) shouldn't mean the card itself gets huge.
          const widthStyle = `min(calc(${widthPct}% - 4px), 96px)`;
          return (
            <div
              key={ev.id}
              onClick={(e) => {
                e.stopPropagation();
                onEventClick(ev);
              }}
              className="absolute rounded-md px-1.5 py-0.5 text-white overflow-hidden cursor-pointer hover:brightness-110 hover:shadow-lg hover:z-20 hover:scale-[1.03] transition-all duration-150 z-10 shadow-sm"
              style={{
                top,
                height,
                left: `${leftPct}%`,
                width: widthStyle,
                backgroundColor: ev.color,
              }}
            >
              <p className="text-[10px] font-semibold truncate leading-tight">{ev.title}</p>
              {height > 26 && (
                <p className="text-[9px] opacity-90 truncate leading-tight">
                  {minutesToTimeLabel(ev.startMinutes)} – {minutesToTimeLabel(ev.endMinutes)}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EventsPage({ goTo }) {
  const { requireAuth } = useRequireAuth();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [limitModalMessage, setLimitModalMessage] = useState("");
  const [view, setView] = useState("month"); // "month" | "schedule"
  const [viewDate, setViewDate] = useState(new Date());
  const [modalEvent, setModalEvent] = useState(undefined); // undefined = closed, null = new, object = editing
  const [prefillTime, setPrefillTime] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSearchQuery, setActiveSearchQuery] = useState(""); // only updated when search is actually applied (Basic/Pro pressing Enter)
  const [eventError, setEventError] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [filterCategory, setFilterCategory] = useState("all");
  const [myLimits, setMyLimits] = useState(null); // full entitlements object from the backend

  useEffect(() => {
    loadEvents();
    supabase.rpc("get_my_entitlements").then(({ data }) => setMyLimits(data));
  }, []);

  async function loadEvents() {
    setLoading(true);
    const { data, error } = await supabase.from("events").select("*").order("date", { ascending: true });
    if (error) console.error("Failed to load events:", error);
    setEvents(data || []);
    setLoading(false);
  }

  const saveEvent = async (fields) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    setEventError("");

    const { recurrence, ...baseFields } = fields;

    if (modalEvent?.id) {
      const { data, error } = await supabase.from("events").update(baseFields).eq("id", modalEvent.id).select().single();
      if (error) {
        console.error("Failed to update event:", error);
        return false;
      }
      setEvents((evs) => evs.map((e) => (e.id === data.id ? data : e)));
    } else if (recurrence && recurrence !== "none") {
      const groupId = crypto.randomUUID();
      const dates = generateRecurrenceDates(baseFields.date, recurrence, 12);
      const rows = dates.map((d) => ({ ...baseFields, date: d, user_id: user.id, recurrence, recurrence_group_id: groupId }));
      const { data, error } = await supabase.from("events").insert(rows).select();
      if (error) {
        console.error("Failed to create recurring events:", error);
        if ((error.message || "").includes("EVENT_LIMIT")) {
          setLimitModalMessage("This would exceed your plan's monthly event limit. Upgrade to add more, or create fewer recurrences.");
        } else {
          setEventError("Couldn't create the recurring events — please try again.");
        }
        return false;
      }
      setEvents((evs) => [...evs, ...(data || [])]);
    } else {
      const { data, error } = await supabase.from("events").insert({ ...baseFields, user_id: user.id, recurrence: "none" }).select().single();
      if (error) {
        console.error("Failed to create event:", error);
        if ((error.message || "").includes("EVENT_LIMIT")) {
          setLimitModalMessage("You've reached your plan's monthly event limit. Upgrade to create more.");
        } else {
          setEventError("Couldn't create the event — please try again.");
        }
        return false;
      }
      setEvents((evs) => [...evs, data]);
    }
    setModalEvent(undefined);
    setPrefillTime(null);
    return true;
  };

  const deleteEvent = async (id) => {
    const previous = events;
    setEvents((evs) => evs.filter((e) => e.id !== id));
    setModalEvent(undefined);
    const { error } = await supabase.from("events").delete().eq("id", id);
    if (error) {
      console.error("Failed to delete event:", error);
      setEvents(previous);
    }
  };

  const goPrev = () => {
    const d = new Date(viewDate);
    if (view === "month") d.setMonth(d.getMonth() - 1);
    else d.setDate(d.getDate() - 1);
    setViewDate(d);
  };
  const goNext = () => {
    const d = new Date(viewDate);
    if (view === "month") d.setMonth(d.getMonth() + 1);
    else d.setDate(d.getDate() + 1);
    setViewDate(d);
  };
  const goToday = () => setViewDate(new Date());

  const headerLabel =
    view === "month"
      ? viewDate.toLocaleDateString([], { month: "long", year: "numeric" })
      : viewDate.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });

  const hasAnyEvents = events.length > 0;
  const filteredEvents = events.filter((ev) => {
    const matchesSearch = !activeSearchQuery.trim() || ev.title.toLowerCase().includes(activeSearchQuery.trim().toLowerCase());
    const matchesCategory = filterCategory === "all" || ev.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  if (!loading && myLimits === null) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={20} className="text-[var(--accent-text)] animate-spin" />
      </div>
    );
  }

  if (!loading && myLimits?.plan === "free") {
    return (
      <>
        <div className="pointer-events-none select-none blur-md opacity-60 space-y-6 max-w-4xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-hover)] flex items-center justify-center shrink-0">
              <Calendar size={19} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-[var(--text-primary)]">Events</h1>
              <p className="text-sm text-[var(--text-secondary)] mt-0.5">Deadlines, classes, and exams — all in one calendar.</p>
            </div>
          </div>
          <GlowCard>
            <div className="grid grid-cols-7 mb-1">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <p key={d} className="text-center text-[11px] font-medium text-[var(--text-muted)] py-2">{d}</p>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: 35 }).map((_, i) => {
                const dayNum = i - 2; // offsets so the month doesn't start exactly on Sunday, like a real one wouldn't
                const inMonth = dayNum >= 1 && dayNum <= 30;
                const isToday = dayNum === 14;
                const sampleEvents = { 3: [{ title: "Physics HW", color: "#8b5cf6" }], 8: [{ title: "Chem Lab", color: "#06b6d4" }, { title: "Study Group", color: "#f59e0b" }], 14: [{ title: "Midterm", color: "#ef4444" }], 22: [{ title: "Essay Due", color: "#22c55e" }] };
                const events = inMonth ? sampleEvents[dayNum] || [] : [];
                return (
                  <div key={i} className={"text-left rounded-lg p-1.5 min-h-[64px] border " + (inMonth ? "bg-[var(--surface-2)]/30 border-[var(--border-subtle)]" : "bg-transparent border-transparent opacity-30")}>
                    {inMonth && (
                      <>
                        <span className={"text-xs inline-flex items-center justify-center h-5 w-5 rounded-full " + (isToday ? "bg-[var(--accent)] text-white font-semibold" : "text-[var(--text-secondary)]")}>
                          {dayNum}
                        </span>
                        <div className="mt-1 space-y-1">
                          {events.map((ev, j) => (
                            <div key={j} className="text-[9px] truncate rounded-sm pl-1 py-0.5 font-medium border-l-2" style={{ backgroundColor: `${ev.color}22`, borderColor: ev.color, color: ev.color }}>
                              {ev.title}
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </GlowCard>
          <GlowCard>
            <p className="text-sm font-medium text-[var(--text-primary)] mb-3">Upcoming</p>
            <div className="space-y-2">
              {["Physics Midterm", "Submit essay draft", "Study group — Chemistry"].map((name) => (
                <div key={name} className="flex items-center gap-3 bg-[var(--surface-2)]/40 rounded-xl p-3">
                  <div className="h-2 w-2 rounded-full bg-[var(--accent)]" />
                  <span className="text-sm text-[var(--text-secondary-strong)]">{name}</span>
                </div>
              ))}
            </div>
          </GlowCard>
        </div>
        <div className="fixed inset-0 md:left-60 lg:left-64 z-[200] flex items-center justify-center p-4 pointer-events-none">
          <div className="bg-[var(--surface-solid)] border border-[rgb(var(--accent-rgb)/0.4)] rounded-3xl p-6 max-w-sm w-full text-center shadow-[0_0_60px_-10px_rgb(var(--accent-rgb)/0.5)] pointer-events-auto">
            <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-hover)] flex items-center justify-center glow-accent-30 mx-auto mb-4">
              <Lock size={22} className="text-white" />
            </div>
            <p className="text-base font-semibold text-[var(--text-primary)] mb-2">Events is a Basic feature</p>
            <p className="text-sm text-[var(--text-muted)] mb-6">Keep track of deadlines, classes, and exams with a full calendar view — included with Basic and Pro.</p>
            <button
              onClick={() => requireAuth(() => goTo && goTo("pricing"))}
              className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-medium px-6 py-3 rounded-xl transition-colors glow-accent-40 w-full"
            >
              Upgrade to Unlock
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {eventError && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
          <p className="text-sm text-red-400">{eventError}</p>
          <button onClick={() => setEventError("")} className="text-red-400 hover:text-red-300 shrink-0">
            <X size={14} />
          </button>
        </div>
      )}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-hover)] flex items-center justify-center glow-accent-30 shrink-0">
            <Calendar size={19} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-[var(--text-primary)]">Events</h1>
            <p className="text-sm text-[var(--text-secondary)] mt-0.5">Keep track of exams, deadlines, and everything else.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSearch((s) => !s)}
            className={"h-10 w-10 rounded-xl flex items-center justify-center transition-colors " + (showSearch ? "bg-[rgb(var(--accent-rgb)/0.2)] text-[var(--accent-text)] border border-[rgb(var(--accent-rgb)/0.3)]" : "bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-secondary-strong)]")}
            title="Search & filter"
          >
            <Search size={16} />
          </button>
          <button
            onClick={() => requireAuth(() => {
              setModalEvent(null);
              setPrefillTime(null);
            })}
            className="flex items-center gap-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-all duration-150 glow-accent-30 active:scale-95"
          >
            <Plus size={16} /> Add Event
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <LimitBadge
          label="Event limit"
          current={events.filter((e) => {
            const d = new Date(e.created_at || e.date);
            const now = new Date();
            return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
          }).length}
          max={myLimits?.events_per_month_max ?? null}
          goTo={goTo}
        />
      </div>

      {showSearch && (
        <GlowCard>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-[var(--text-primary)]">Search & filter</p>
            <button onClick={() => setShowSearch(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
              <X size={15} />
            </button>
          </div>
          <div className="flex gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[160px]">
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  if (myLimits?.plan === "free") {
                    setLimitModalMessage("Search is included with Basic and Pro. Upgrade to search your events.");
                  } else {
                    setActiveSearchQuery(searchQuery);
                  }
                }}
                placeholder="Search event titles..."
                className="w-full bg-[var(--input-bg)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl pl-4 pr-9 py-2 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)]"
              />
              {searchQuery && (
                <button
                  onClick={() => {
                    setSearchQuery("");
                    setActiveSearchQuery("");
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-faint)] hover:text-[var(--text-primary)] transition-colors"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {["all", ...EVENT_CATEGORIES.map((c) => c.toLowerCase())].map((c) => (
                <button
                  key={c}
                  onClick={() => {
                    if (myLimits?.plan === "free") {
                      setLimitModalMessage("Filtering by category is included with Basic and Pro. Upgrade to use it.");
                    } else {
                      setFilterCategory(c);
                    }
                  }}
                  className={
                    "text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors capitalize " +
                    (filterCategory === c ? "bg-[rgb(var(--accent-rgb)/0.2)] text-[var(--accent-text)] border border-[rgb(var(--accent-rgb)/0.3)]" : "bg-[var(--surface-2)] text-[var(--text-secondary-strong)] hover:bg-[var(--surface-3)]")
                  }
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        </GlowCard>
      )}

      <GlowCard glow>
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div className="flex items-center gap-2">
            <button onClick={goPrev} className="h-8 w-8 rounded-lg bg-[var(--surface-2)] hover:bg-[var(--surface-3)] flex items-center justify-center text-[var(--text-secondary-strong)] transition-all duration-150 active:scale-90">
              <ChevronLeft size={16} />
            </button>
            <button onClick={goNext} className="h-8 w-8 rounded-lg bg-[var(--surface-2)] hover:bg-[var(--surface-3)] flex items-center justify-center text-[var(--text-secondary-strong)] transition-all duration-150 active:scale-90">
              <ChevronRight size={16} />
            </button>
            <button onClick={goToday} className="text-xs font-medium px-3 py-1.5 rounded-lg bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-secondary-strong)] transition-colors">
              Today
            </button>
            <p className="text-sm font-medium text-[var(--text-primary)] ml-1">{headerLabel}</p>
          </div>
          <div className="relative flex items-center gap-1 bg-[var(--surface-2)] rounded-lg p-1">
            <div
              className="absolute top-1 bottom-1 rounded-md bg-[var(--accent)] transition-all duration-200 ease-out"
              style={{ width: "calc(50% - 4px)", left: view === "month" ? 4 : "calc(50% + 0px)" }}
            />
            {[
              ["month", "Month"],
              ["schedule", "Schedule"],
            ].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setView(key)}
                className={"relative z-10 text-xs font-medium px-3 py-1.5 rounded-md transition-colors " + (view === key ? "text-white" : "text-[var(--text-secondary-strong)] hover:text-[var(--text-primary)]")}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="py-16 flex flex-col items-center justify-center gap-3">
            <Loader2 size={22} className="text-[var(--accent-text)] animate-spin" />
            <p className="text-sm text-[var(--text-muted)]">Loading events...</p>
          </div>
        ) : !hasAnyEvents ? (
          <div className="py-16 flex flex-col items-center justify-center text-center px-6">
            <div className="h-14 w-14 rounded-2xl bg-[rgb(var(--accent-rgb)/0.1)] flex items-center justify-center mb-4">
              <Calendar size={24} className="text-[var(--accent-text)]" />
            </div>
            <p className="text-sm font-medium text-[var(--text-primary)] mb-1">No events yet</p>
            <p className="text-xs text-[var(--text-muted)] mb-5 max-w-[260px]">Add exams, deadlines, or study sessions to see them here.</p>
            <button
              onClick={() => {
                setModalEvent(null);
                setPrefillTime(null);
              }}
              className="flex items-center gap-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors"
            >
              <Plus size={15} /> Add your first event
            </button>
          </div>
        ) : view === "month" ? (
          <MonthView
            viewDate={viewDate}
            events={filteredEvents}
            onSelectDay={(d) => {
              setViewDate(d);
              setView("schedule");
            }}
            onEventClick={(ev) => setModalEvent(ev)}
          />
        ) : (
          <div className="max-h-[70vh] overflow-y-auto">
            <ScheduleView
              viewDate={viewDate}
              events={filteredEvents}
              onCreateAt={(time) => {
                setPrefillTime(time);
                setModalEvent(null);
              }}
              onEventClick={(ev) => setModalEvent(ev)}
            />
          </div>
        )}
      </GlowCard>

      {modalEvent !== undefined && (
        <EventModal
          initial={
            modalEvent || {
              date: dateToLocalISO(viewDate),
              start_time: prefillTime || "09:00",
              end_time: prefillTime ? addMinutesToTimeString(prefillTime, 60) : "10:00",
            }
          }
          onClose={() => {
            setModalEvent(undefined);
            setPrefillTime(null);
          }}
          onSave={saveEvent}
          onDelete={deleteEvent}
          goTo={goTo}
        />
      )}
      <LimitReachedModal message={limitModalMessage} onClose={() => setLimitModalMessage("")} goTo={goTo} />
    </div>
  );
}


function ThemeCard({ theme, active, locked, previewing, onClick }) {
  return (
    <button
      onClick={onClick}
      className={
        "relative text-left rounded-2xl border p-3 transition-all duration-200 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/20 " +
        (previewing
          ? "border-amber-400/60 bg-amber-500/5 ring-1 ring-amber-400/40"
          : active
          ? "border-[rgb(var(--accent-rgb)/0.6)] bg-[rgb(var(--accent-rgb)/0.05)] glow-accent-20 ring-1 ring-[rgb(var(--accent-rgb)/0.3)]"
          : "border-[var(--border)] hover:border-[rgb(var(--accent-rgb)/0.3)]")
      }
    >
      <span
        className={
          "absolute top-2 right-2 z-10 text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide shadow-sm flex items-center gap-1 " +
          (theme.tier === "free" ? "bg-emerald-500 text-white" : "bg-gradient-to-r from-purple-600 to-violet-600 text-white")
        }
      >
        {locked && <Lock size={8} />}
        {theme.tier}
      </span>
      <div className="h-20 rounded-xl mb-3 border border-white/5 shadow-inner relative overflow-hidden" style={{ background: theme.preview }}>
        {locked && !previewing && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <Eye size={18} className="text-white/80" />
          </div>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <p className="text-sm font-semibold text-[var(--text-primary)]">{theme.name}</p>
        {active && (
          <span className="flex items-center gap-0.5 text-[10px] font-semibold text-[var(--accent-text)] bg-[rgb(var(--accent-rgb)/0.2)] px-1.5 py-0.5 rounded-full">
            <Check size={10} /> Active
          </span>
        )}
        {previewing && (
          <span className="flex items-center gap-0.5 text-[10px] font-semibold text-amber-400 bg-amber-500/15 px-1.5 py-0.5 rounded-full">
            <Eye size={10} /> Previewing
          </span>
        )}
      </div>
      <p className="text-xs text-[var(--text-muted)] mt-0.5 leading-snug">{locked ? `${theme.description} — tap to preview` : theme.description}</p>
    </button>
  );
}

// Dedicated Appearance/Themes page — reached from Settings, with its own
// back button rather than living inline on the main Settings page.
function AppearancePage({ theme, onSelectTheme, error, onBack, goTo }) {
  const { requireAuth } = useRequireAuth();
  const [themeFilter, setThemeFilter] = useState("all"); // "all" | "free" | "premium"
  const [myTier, setMyTier] = useState("free");
  const [previewingKey, setPreviewingKey] = useState(null);
  const [previewSecondsLeft, setPreviewSecondsLeft] = useState(0);
  const previewTimeoutRef = useRef(null);
  const previewIntervalRef = useRef(null);
  const PREVIEW_DURATION = 4; // seconds — long enough to actually see it, short enough to feel like a taste, not the real thing

  useEffect(() => {
    (async () => {
      const { data: { session: authSession } } = await supabase.auth.getSession();
      const user = authSession?.user;
      if (!user) return;
      const { data } = await supabase.from("profiles").select("premium_tier").eq("user_id", user.id).maybeSingle();
      setMyTier(data?.premium_tier || "free");
    })();
    // Always leave the real theme applied when navigating away mid-preview.
    return () => {
      clearTimeout(previewTimeoutRef.current);
      clearInterval(previewIntervalRef.current);
      applyTheme(theme);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function isLocked(t) {
    return t.tier === "premium" && myTier !== "premium";
  }

  function previewThemeTemporarily(key) {
    clearTimeout(previewTimeoutRef.current);
    clearInterval(previewIntervalRef.current);
    applyTheme(key);
    setPreviewingKey(key);
    setPreviewSecondsLeft(PREVIEW_DURATION);
    previewIntervalRef.current = setInterval(() => {
      setPreviewSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    previewTimeoutRef.current = setTimeout(() => {
      applyTheme(theme); // revert to the real, saved theme
      setPreviewingKey(null);
      clearInterval(previewIntervalRef.current);
    }, PREVIEW_DURATION * 1000);
  }

  function handleThemeClick(t) {
    if (isLocked(t)) {
      previewThemeTemporarily(t.key);
    } else {
      clearTimeout(previewTimeoutRef.current);
      clearInterval(previewIntervalRef.current);
      setPreviewingKey(null);
      onSelectTheme(t.key);
    }
  }

  const activeIndex = ["all", "free", "premium"].indexOf(themeFilter);
  const filterOptions = [
    ["all", "All"],
    ["free", "Free"],
    ["premium", "Premium"],
  ];

  return (
    <div className="max-w-4xl space-y-5">
      {error && <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-400">{error}</div>}
      <button onClick={onBack} className="text-sm text-[var(--accent-text)] hover:brightness-110 flex items-center gap-1">
        <ChevronLeft size={15} /> Back to Settings
      </button>

      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-hover)] flex items-center justify-center glow-accent-30 shrink-0">
          <Sparkles size={19} className="text-white" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">Appearance</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-0.5">{THEMES.length} themes — pick a free one instantly, or tap a Premium one for a quick preview.</p>
        </div>
      </div>

      {previewingKey && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[300] flex items-center gap-3 bg-[var(--surface-solid)] border border-[rgb(var(--accent-rgb)/0.4)] rounded-2xl px-4 py-3 shadow-[0_0_40px_-8px_rgb(var(--accent-rgb)/0.5)]">
          <Eye size={16} className="text-[var(--accent-text)] shrink-0" />
          <p className="text-sm text-[var(--text-primary)]">
            Previewing <span className="font-semibold">{THEMES.find((t) => t.key === previewingKey)?.name}</span> — reverts in {previewSecondsLeft}s
          </p>
          <button
            onClick={() => requireAuth(() => goTo && goTo("pricing"))}
            className="text-xs font-semibold bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
          >
            Upgrade to Unlock
          </button>
        </div>
      )}

      <GlowCard glow>
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs text-[var(--text-faint)]">Premium themes are locked, but you can preview any of them for {PREVIEW_DURATION} seconds.</p>
          {/* Sliding filter pill — width/position calculated from the highlight's
              OWN box (via transform), so it stays correctly aligned regardless
              of container padding, unlike a naive percentage-based left/width. */}
          <div className="relative flex bg-[var(--surface-2)] rounded-lg p-1 w-[220px]">
            <div
              className="absolute top-1 bottom-1 left-1 rounded-md bg-[var(--accent)] transition-transform duration-200 ease-out"
              style={{ width: "calc((100% - 8px) / 3)", transform: `translateX(${activeIndex * 100}%)` }}
            />
            {filterOptions.map(([key, label]) => (
              <button
                key={key}
                onClick={() => setThemeFilter(key)}
                className={"relative z-10 flex-1 text-xs font-medium py-1 rounded-md text-center transition-colors " + (themeFilter === key ? "text-white" : "text-[var(--text-secondary-strong)] hover:text-[var(--text-primary)]")}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          {THEMES.filter((t) => themeFilter === "all" || t.tier === themeFilter)
            .slice()
            .sort((a, b) => (a.tier === b.tier ? 0 : a.tier === "free" ? -1 : 1))
            .map((t) => (
            <ThemeCard key={t.key} theme={t} active={theme === t.key && previewingKey !== t.key} locked={isLocked(t)} previewing={previewingKey === t.key} onClick={() => handleThemeClick(t)} />
          ))}
        </div>
      </GlowCard>
    </div>
  );
}

// Dedicated sound-selection page — reached from Settings, matching the same
// pattern as Appearance. Each sound can be previewed with Test before picking it.
function SoundPage({ selectedSound, onSelectSound, error, onBack, goTo }) {
  const [myTier, setMyTier] = useState("free");

  useEffect(() => {
    (async () => {
      const { data: { session: authSession } } = await supabase.auth.getSession();
      const user = authSession?.user;
      if (!user) return;
      const { data } = await supabase.from("profiles").select("premium_tier").eq("user_id", user.id).maybeSingle();
      setMyTier(data?.premium_tier || "free");
    })();
  }, []);

  return (
    <div className="max-w-2xl space-y-5">
      {error && <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-400">{error}</div>}
      <button onClick={onBack} className="text-sm text-[var(--accent-text)] hover:brightness-110 flex items-center gap-1">
        <ChevronLeft size={15} /> Back to Settings
      </button>

      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-hover)] flex items-center justify-center glow-accent-30 shrink-0">
          <Bell size={19} className="text-white" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">Completion Sound</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-0.5">Plays when a timer finishes or you save a session.</p>
        </div>
      </div>

      <GlowCard glow>
        <p className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide mb-2">Free</p>
        <div className="space-y-2 mb-5">
          {SOUND_OPTIONS.filter((s) => s.tier === "free").map((s) => (
            <SoundRow key={s.key} sound={s} active={selectedSound === s.key} onSelect={() => onSelectSound(s.key)} locked={false} goTo={goTo} />
          ))}
        </div>

        <p className="text-xs font-medium text-[var(--accent-text)] uppercase tracking-wide mb-2 flex items-center gap-1">
          <Crown size={12} /> Premium
        </p>
        <div className="space-y-2">
          {SOUND_OPTIONS.filter((s) => s.tier === "premium").map((s) => (
            <SoundRow key={s.key} sound={s} active={selectedSound === s.key} onSelect={() => onSelectSound(s.key)} locked={myTier !== "premium"} goTo={goTo} />
          ))}
        </div>
      </GlowCard>
    </div>
  );
}

function SoundRow({ sound, active, onSelect, locked, goTo }) {
  const { requireAuth } = useRequireAuth();
  const [playing, setPlaying] = useState(false);
  const testSound = (e) => {
    e.stopPropagation();
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      sound.play(ctx);
    } catch (err) {
      console.error("Sound preview failed:", err);
    }
    setPlaying(true);
    setTimeout(() => setPlaying(false), 400);
  };

  return (
    <div
      className={
        "w-full flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-all duration-150 border " +
        (active ? "border-[rgb(var(--accent-rgb)/0.5)] bg-[rgb(var(--accent-rgb)/0.08)]" : "border-[var(--border)] hover:border-[rgb(var(--accent-rgb)/0.3)]")
      }
    >
      <div className={"h-9 w-9 rounded-full flex items-center justify-center shrink-0 transition-transform " + (playing ? "scale-110" : "")} style={{ background: active ? "var(--accent)" : "var(--surface-2)" }}>
        {active ? <Check size={15} className="text-white" /> : locked ? <Lock size={13} className="text-amber-400" /> : <Bell size={14} className="text-[var(--text-muted)]" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[var(--text-primary)]">{sound.name}</p>
        <p className="text-xs text-[var(--text-muted)]">{sound.description}</p>
      </div>
      <button onClick={testSound} className="text-xs bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-secondary-strong)] font-medium px-3 py-1.5 rounded-lg transition-colors shrink-0">
        {playing ? "Playing..." : "Preview"}
      </button>
      {locked ? (
        <button
          onClick={() => requireAuth(() => goTo && goTo("pricing"))}
          className="text-xs font-semibold text-amber-400 border border-amber-500/40 hover:bg-amber-500/10 px-3 py-1.5 rounded-lg transition-colors shrink-0 whitespace-nowrap"
        >
          Upgrade to Pro
        </button>
      ) : (
        <button
          onClick={onSelect}
          className="text-xs font-medium bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white px-3 py-1.5 rounded-lg transition-colors shrink-0"
        >
          {active ? "Selected" : "Select"}
        </button>
      )}
    </div>
  );
}

const ABOUT_TOPICS = [
  {
    icon: Timer,
    emoji: "\u23f1\ufe0f",
    title: "Focus Timer",
    content:
      "This is where you actually study! Pick your style \u2014 Stopwatch if you just wanna go, Timer if you want a countdown, or Pomodoro if you like short focus bursts with little breaks in between. When you're done, hit Save to actually log the session \u2014 it won't save on its own, so don't forget! \ud83d\udcaa Heads up: each plan has a daily XP cap on studying \u2014 Free gets 2 hours worth, Basic gets 4, Pro gets 7. You can keep studying past that (it still counts!), you just stop earning Growth XP for the day. Fresh cap every midnight.",
  },
  {
    icon: CheckSquare,
    emoji: "\u2705",
    title: "Tasks",
    content:
      "Your simple one-time to-do list. Add something, do it, check it off \u2014 and boom, +150 XP \ud83c\udf89 Free accounts can hold 7 tasks at a time (even finished ones count, so clear some out if you're full), Basic gets 14, and Pro doesn't have to think about it at all \u2014 unlimited.",
  },
  {
    icon: Layers,
    emoji: "\ud83d\udd01",
    title: "To-Do Lists",
    content:
      "Like Tasks, but for stuff you do again and again \u2014 think \"Morning Routine\" with items that repeat daily or on whatever days you pick. This one's Basic+ only, sorry Free folks \ud83d\ude05 Basic gets 5 lists with 10 items each, Pro gets unlimited. Checking things off here earns XP too, from the same pool as Tasks.",
  },
  {
    icon: Sparkles,
    emoji: "\u26a1",
    title: "Daily Task XP Cap",
    content:
      "Tasks and To-Do Lists share ONE daily XP bucket (this is separate from your Focus Timer cap, don't worry). Free: 750 XP/day. Basic: 1,200. Pro: 1,800. Still finish stuff after you hit the cap \u2014 it marks as done just fine, it just won't pay out extra XP that day. Resets at midnight, same as everything else \ud83c\udf19",
  },
  {
    icon: Layers,
    emoji: "\u2705",
    title: "Habit Tracker",
    content:
      "A monthly grid for building daily habits \u2014 add a habit, then check it off each day you actually do it. You get a visual calendar of the whole month per habit, so you can see your consistency at a glance, plus your streak for each one. This is a Pro-exclusive feature \u2014 other plans get an upgrade prompt instead of the real thing. Pro also unlocks exporting any month of your habit tracker as a clean PDF, if you want a record you can keep or print.",
  },
  {
    icon: BarChart3,
    emoji: "\ud83d\udcca",
    title: "Statistics",
    content:
      "Your whole study history, laid out nicely \u2014 today, this week, totals, recent sessions, all of it. How far back you can look depends on your plan: Free sees the last 2 weeks, Basic sees 4, Pro sees literally everything, forever. Good news either way \u2014 nothing ever actually gets deleted, so if you upgrade later, your full history just... appears. Like magic \u2728 (it's not magic, we just kept it safe the whole time)",
  },
  {
    icon: Flame,
    emoji: "\ud83d\udd25",
    title: "Growth & Levels",
    content:
      "This is your big-picture progress bar, combining XP from studying, tasks, groups, and achievements all together. You'll level up from 1 all the way to 200 on the normal path \ud83d\udcc8 But here's a secret \ud83e\udd2b if you somehow push WAY past that... something else happens. A hidden stage called \"The Beyond\" opens up. Nobody really talks about how far it actually goes, or what it takes to truly finish it. Some say it's basically endless. Guess you'll have to find out yourself \ud83d\udc40 Oh, and your Growth character has 3 looks \u2014 Default (everyone), Spirit Tree (Basic+), and a full Character portrait (Pro only, but you can preview it for free before you commit).",
  },
  {
    icon: Calendar,
    emoji: "\ud83d\uddd3\ufe0f",
    title: "Events",
    content:
      "Your calendar for exams, deadlines, classes \u2014 whatever you need to remember. You can look around for free, but actually adding events needs Basic or higher. Basic gets 5 events a month, Pro gets unlimited. Search and filtering here also need Basic+.",
  },
  {
    icon: Users,
    emoji: "\ud83e\udd1d",
    title: "Groups",
    content:
      "Team up and study together toward a shared goal! Groups can run three ways: Manual (the owner starts/stops rounds themselves), Loop (auto-restarts the moment the goal's hit \u2014 no clicking needed), or Schedule (kicks off automatically at a set date, even if nobody's around). Hit the goal and everyone who contributed splits some XP (the owner gets a little bonus \ud83d\udc51). You'll see it as \"unclaimed\" until you tap to grab it \u2014 and each group keeps its own lifetime XP total, so you always know exactly how much any one group has earned you. Free: join 2 groups, can't create any. Basic: create 3, join 5. Pro: unlimited both ways. One more thing \u2014 each session can only feed XP into a few groups at once (1 for Free, 2 for Basic, 5 for Pro).",
  },
  {
    icon: TrendingUp,
    emoji: "\ud83d\udd0d",
    title: "Insights",
    content:
      "The deep-dive stuff \u2014 your peak study hour, daily/weekly patterns, a productivity score, and smart predictions about where you're headed. This one's Pro-only \ud83d\udc51 Everyone else gets an upgrade prompt instead.",
  },
  {
    icon: Trophy,
    emoji: "\ud83c\udfc6",
    title: "Leaderboard",
    content: "See how you stack up against everyone else \u2014 by day, week, month, or all-time. Bragging rights, basically \ud83d\ude0e",
  },
  {
    icon: Trophy,
    emoji: "\ud83c\udf96\ufe0f",
    title: "Achievements",
    content: "One-time badges for hitting milestones \u2014 your first session, a streak length, a big study total, stuff like that. Each one's a nice little XP bonus, and once you've got it, it's yours forever.",
  },
  {
    icon: Flame,
    emoji: "\ud83d\udd25",
    title: "Streaks & Streak Restore",
    content:
      "Study at least once a day and your streak keeps climbing. Miss a day, it resets \u2014 ouch \ud83d\ude2c But if you're on Yearly Pro specifically (not the monthly plan), you get 6 Streak Restores a year to save yourself if you slip up, as long as you catch it in time. We'll even warn you about 2 hours before a streak's about to break if you haven't studied yet that day.",
  },
  {
    icon: Users,
    emoji: "\ud83d\udc65",
    title: "Friends",
    content: "Add friends to see their profile, stats, and level \u2014 and maybe get a little friendly competitive motivation \ud83d\udc40",
  },
  {
    icon: Sparkles,
    emoji: "\ud83c\udfa8",
    title: "Themes & Sounds",
    content:
      "Make the app feel like yours \u2014 pick a color theme and a timer completion sound. Most are totally free. A few fancy ones are Pro-only, but you can tap any locked one for a quick full-app preview before deciding if it's worth it \ud83d\udc40",
  },
  {
    icon: MessageSquare,
    emoji: "\ud83d\udcac",
    title: "Feedback",
    content:
      "Got a suggestion or something you want to say? Each account gets one message, ever \u2014 so take a second and make it count \ud83d\udcdd The team can reply directly to what you send, and you'll see that reply right below your original message whenever you check back, so nothing gets lost.",
  },
  {
    icon: Gift,
    emoji: "\ud83c\udf81",
    title: "Birthday Gift",
    content:
      "Pop in your birthday once in Account Settings (you can update it once a year if you mess it up). Then on your actual birthday, the app throws you a little celebration and drops a gift box on your Dashboard \ud83c\udf82 Open it for a surprise XP bonus \u2014 anywhere between 200,000 and 700,000. Smaller amounts happen way more often than the huge ones, so hitting the big number is a genuinely special moment \u2728",
  },
];

const LEGAL_SECTIONS = [
  {
    id: "privacy",
    title: "Privacy Policy",
    content: `Last updated: September 2026

This explains what information Lytning Focus collects, why, and what you can do about it.

**What we collect**
- **Account info**: your email, username, display name, bio, and avatar (if you set one)
- **Study data**: your tasks, habits, focus sessions, streaks, groups, and achievements — this is the actual content of using the app
- **Optional info**: your date of birth, only if you choose to add it (used solely for a birthday greeting and gift — never shown on your public profile)
- **Payment records**: your subscription plan, billing interval, and payment status — we never see or store your actual card/UPI details, Razorpay handles that entirely on their own secure systems
- **Basic technical data**: standard things like IP address and browser type, collected automatically by our hosting infrastructure (Vercel/Supabase) for security and reliability, not for tracking you individually

**How we use it**
To run the app — save your progress, show your stats, process payments, send you the emails you'd expect (like refund confirmations), and prevent abuse (like fake accounts or payment fraud).

**Who we share it with**
- **Razorpay**: processes your payments; they receive what's needed to charge you, we don't see your card details in return
- **Supabase**: hosts our database and authentication — industry-standard infrastructure, not a separate company we're handing your data to for their own purposes
- We do not sell your data to anyone, ever, for any reason

**Your data, your control**
You can delete your account entirely at any time from Account Settings — this permanently removes your data with no way to restore it, including your study history, subscription records, and profile. If you'd rather just stop using the app without deleting anything, that's fine too — nothing forces continued use.

**Data retention**
We keep your data as long as your account exists. If you delete your account, it's gone — we don't keep hidden backups floating around indefinitely.

**Children's privacy**
Lytning Focus isn't intended for children under 13. If you believe a child has created an account, contact us and we'll remove it.

**Changes to this policy**
If this ever changes meaningfully, we'll update the date at the top. Continued use after changes means you accept the updated policy.

**Contact**
Questions about your data can be sent through the Feedback page in Settings, or to ryanlighton7business@gmail.com.`,
  },
  {
    id: "terms",
    title: "Terms of Service",
    content: `Last updated: September 2026

By using Lytning Focus, you agree to these terms.

**What we offer**
Lytning Focus is a study productivity app with three plans: Free, Basic, and Pro (available monthly or yearly). Each plan includes specific features and limits, all listed on our Pricing page.

**How billing works**
Basic and Pro plans automatically renew on your billing cycle (monthly or yearly, matching what you selected) until you cancel — your card is charged again automatically at the start of each new period, using Razorpay's secure recurring billing. You'll always know your next renewal date on the Pricing page.

**Cancelling**
You can cancel anytime from the Pricing page, under your current plan. Cancelling stops all future automatic charges — you keep full access to your paid tier until your current period ends, then your account automatically reverts to Free. You keep all your data either way, you just lose access to paid-tier features and limits after reverting. Cancelling does not refund your current period; see our Refund Policy for that.

**Account termination**
We may suspend or terminate accounts that violate these terms, abuse the platform, or engage in fraudulent payment activity. You may delete your own account at any time from Account Settings — this permanently removes your data with no way to restore it.

**Acceptable use**
Don't use Lytning Focus to violate any law, harass others, attempt to bypass plan limits through technical exploitation, or resell/redistribute access to your account.

**Limitation of liability**
Lytning Focus is provided "as is." We aim for high reliability but don't guarantee uninterrupted access. We're not liable for indirect damages arising from use of the service, to the extent permitted by law.

**Changes to these terms**
We may update these terms occasionally. Continued use after changes means you accept the updated terms.

**Contact**
Questions about these terms can be sent through the Feedback page in Settings.`,
  },
  {
    id: "refund",
    title: "Refund Policy",
    content: `**7-day refund window**
If you're not satisfied with a paid plan, you can request a full refund within 7 days of your purchase date — no questions asked, for your first subscription to a given tier.

**What's covered**
- Your very first payment for Basic or Pro (monthly or yearly), within 7 days of that specific charge.

**What's not covered**
- Automatic renewal charges (when your subscription auto-renews for a new billing cycle) are not eligible for this 7-day window — it only applies to your very first payment for a given tier.
- Refund requests made after the 7-day window has passed.

**How to request a refund**
Email ryanlighton7business@gmail.com within your 7-day window, including:
- The email address your account is registered with
- Which plan you purchased (Basic or Pro) and whether it was monthly or yearly
- The approximate date you paid

We aim to process eligible refunds within 5-7 business days back to your original payment method via Razorpay.

**Failed or duplicate payments**
If you were charged more than once for the same purchase due to a technical error, or a payment failed but your card was still charged, email ryanlighton7business@gmail.com immediately with your account email and payment details — these are corrected promptly regardless of the 7-day window, since they're our error, not a change of mind.`,
  },
];

function LegalPage({ onBack, initialSection }) {
  const [openId, setOpenId] = useState(initialSection || "privacy");

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="max-w-2xl space-y-5">
      <button onClick={onBack} className="text-sm text-[var(--accent-text)] hover:brightness-110 flex items-center gap-1">
        <ChevronLeft size={15} /> Back
      </button>

      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-hover)] flex items-center justify-center glow-accent-30 shrink-0">
          <FileText size={19} className="text-white" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">Privacy, Terms & Refund Policy</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-0.5">Clear, plain-language terms — no legal jargon maze.</p>
        </div>
      </div>

      <div className="space-y-2">
        {LEGAL_SECTIONS.map((section) => {
          const open = openId === section.id;
          return (
            <GlowCard key={section.id} className="!p-0 overflow-hidden">
              <button onClick={() => setOpenId(open ? null : section.id)} className="w-full flex items-center gap-3 px-4 py-3.5 text-left">
                <p className="text-sm font-medium text-[var(--text-primary)] flex-1">{section.title}</p>
                <ChevronDown size={15} className={"text-[var(--text-muted)] shrink-0 transition-transform duration-200 " + (open ? "rotate-180" : "")} />
              </button>
              {open && (
                <div className="px-4 pb-4">
                  <p className="text-sm text-[var(--text-secondary)] leading-relaxed whitespace-pre-line">
                    {section.content.split("**").map((chunk, i) => (i % 2 === 1 ? <strong key={i} className="text-[var(--text-primary)]">{chunk}</strong> : chunk))}
                  </p>
                </div>
              )}
            </GlowCard>
          );
        })}
      </div>
    </div>
  );
}

function AboutPage({ onBack }) {
  const [openIndex, setOpenIndex] = useState(null);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="max-w-2xl space-y-5">
      <button onClick={onBack} className="text-sm text-[var(--accent-text)] hover:brightness-110 flex items-center gap-1">
        <ChevronLeft size={15} /> Back to Settings
      </button>

      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-hover)] flex items-center justify-center glow-accent-30 shrink-0">
          <HelpCircle size={19} className="text-white" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">About & How It Works</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-0.5">Everything in Lytning Focus, explained — tap a topic to expand it.</p>
        </div>
      </div>

      <div className="space-y-2">
        {ABOUT_TOPICS.map((topic, i) => {
          const open = openIndex === i;
          return (
            <GlowCard key={topic.title} className="!p-0 overflow-hidden">
              <button onClick={() => setOpenIndex(open ? null : i)} className="w-full flex items-center gap-3 px-4 py-3.5 text-left">
                <div className="h-8 w-8 rounded-lg bg-[var(--surface-2)] flex items-center justify-center shrink-0">
                  <topic.icon size={15} className="text-[var(--accent-text)]" />
                </div>
                <p className="text-sm font-medium text-[var(--text-primary)] flex-1">{topic.title}</p>
                <ChevronDown size={15} className={"text-[var(--text-muted)] shrink-0 transition-transform duration-200 " + (open ? "rotate-180" : "")} />
              </button>
              {open && (
                <div className="px-4 pb-4 pl-[52px]">
                  <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{topic.content}</p>
                </div>
              )}
            </GlowCard>
          );
        })}
      </div>
    </div>
  );
}

function RevenueDashboardPage({ onBack }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expenseDesc, setExpenseDesc] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [addingExpense, setAddingExpense] = useState(false);
  const [expenseError, setExpenseError] = useState("");
  const [confirmingDeleteId, setConfirmingDeleteId] = useState(null);
  const [expenseViewDate, setExpenseViewDate] = useState(new Date()); // which month is being browsed

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data: result, error } = await supabase.rpc("admin_get_revenue_dashboard");
    setLoading(false);
    if (!error) setData(result);
  }

  const rupees = (paise) => `₹${(paise / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

  async function handleAddExpense() {
    setExpenseError("");
    const amt = parseFloat(expenseAmount);
    if (!expenseDesc.trim() || !amt || amt <= 0) {
      setExpenseError("Enter a description and a valid amount.");
      return;
    }
    setAddingExpense(true);
    const { error } = await supabase.rpc("admin_add_expense", { p_description: expenseDesc.trim(), p_amount_rupees: amt });
    setAddingExpense(false);
    if (error) {
      setExpenseError("Failed to add expense — please try again.");
      return;
    }
    setExpenseDesc("");
    setExpenseAmount("");
    load();
  }

  async function handleDeleteExpense(id) {
    await supabase.rpc("admin_delete_expense", { p_expense_id: id });
    setConfirmingDeleteId(null);
    load();
  }

  if (loading) {
    return (
      <div className="max-w-3xl space-y-5">
        <button onClick={onBack} className="text-sm text-[var(--accent-text)] hover:brightness-110 flex items-center gap-1">
          <ChevronLeft size={15} /> Back to Settings
        </button>
        <GlowCard>
          <p className="text-sm text-[var(--text-muted)] text-center py-8">Loading dashboard…</p>
        </GlowCard>
      </div>
    );
  }

  const netAllTime = (data?.revenue_all_time || 0) - (data?.expenses_all_time || 0);

  // Filters the already-fetched expense list down to whichever month is
  // currently being browsed — no extra RPC call needed since the full
  // history is already in memory.
  const expensesForViewMonth = (data?.expenses || []).filter((e) => {
    const d = new Date(e.created_at);
    return d.getFullYear() === expenseViewDate.getFullYear() && d.getMonth() === expenseViewDate.getMonth();
  });
  const expensesForViewMonthTotal = expensesForViewMonth.reduce((sum, e) => sum + e.amount_paise, 0);
  const expenseMonthLabel = expenseViewDate.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const goPrevExpenseMonth = () => setExpenseViewDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const goNextExpenseMonth = () => setExpenseViewDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  const isCurrentExpenseMonth = expenseViewDate.getFullYear() === new Date().getFullYear() && expenseViewDate.getMonth() === new Date().getMonth();

  return (
    <div className="max-w-3xl space-y-5">
      <button onClick={onBack} className="text-sm text-[var(--accent-text)] hover:brightness-110 flex items-center gap-1">
        <ChevronLeft size={15} /> Back to Settings
      </button>

      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center shrink-0">
          <TrendingUp size={19} className="text-white" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">Revenue Dashboard</h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">Only visible to you — live revenue, expenses, and net profit.</p>
        </div>
      </div>

      {/* Top stats: revenue today/month/year, and live user count */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <GlowCard>
          <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)] mb-1">Today</p>
          <p className="text-lg font-bold text-emerald-400">{rupees(data?.revenue_today || 0)}</p>
        </GlowCard>
        <GlowCard>
          <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)] mb-1">This Month</p>
          <p className="text-lg font-bold text-emerald-400">{rupees(data?.revenue_month || 0)}</p>
        </GlowCard>
        <GlowCard>
          <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)] mb-1">This Year</p>
          <p className="text-lg font-bold text-emerald-400">{rupees(data?.revenue_year || 0)}</p>
        </GlowCard>
        <GlowCard>
          <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)] mb-1">Registered Users</p>
          <p className="text-lg font-bold text-[var(--accent-text)]">{(data?.registered_users_count || 0).toLocaleString()}</p>
        </GlowCard>
      </div>

      {/* Net profit summary */}
      <GlowCard glow className="bg-gradient-to-r from-[rgb(var(--accent-rgb)/0.12)] to-transparent">
        <p className="text-sm font-medium text-[var(--text-primary)] mb-3">All-Time Summary</p>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)] mb-1">Gross Revenue</p>
            <p className="text-base font-bold text-emerald-400">{rupees(data?.revenue_all_time || 0)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)] mb-1">Expenses</p>
            <p className="text-base font-bold text-red-400">-{rupees(data?.expenses_all_time || 0)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)] mb-1">Net Profit</p>
            <p className={"text-base font-bold " + (netAllTime >= 0 ? "text-[var(--accent-text)]" : "text-red-400")}>{rupees(netAllTime)}</p>
          </div>
        </div>
      </GlowCard>

      {/* Expense tracker */}
      <GlowCard>
        <p className="text-sm font-medium text-[var(--text-primary)] mb-3">Log an expense</p>
        <div className="flex flex-col sm:flex-row gap-2 mb-2">
          <input
            value={expenseDesc}
            onChange={(e) => setExpenseDesc(e.target.value)}
            placeholder="e.g. Domain renewal"
            className="flex-1 bg-[var(--input-bg)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl px-3 py-2 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)]"
          />
          <input
            value={expenseAmount}
            onChange={(e) => setExpenseAmount(e.target.value)}
            type="number"
            placeholder="Amount (₹)"
            className="sm:w-32 bg-[var(--input-bg)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl px-3 py-2 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)]"
          />
          <button
            onClick={handleAddExpense}
            disabled={addingExpense}
            className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-xl transition-colors shrink-0"
          >
            {addingExpense ? "Adding..." : "Add"}
          </button>
        </div>
        {expenseError && <p className="text-xs text-red-400 mb-2">{expenseError}</p>}

        <div className="flex items-center justify-between mt-4 pt-3 border-t border-[var(--border-subtle)]">
          <button onClick={goPrevExpenseMonth} className="h-8 w-8 rounded-lg bg-[var(--surface-2)] border border-[var(--card-border)] text-[var(--text-secondary-strong)] hover:bg-[var(--surface-3)] flex items-center justify-center transition-all active:scale-90">
            <ChevronLeft size={15} />
          </button>
          <div className="text-center">
            <p className="text-sm font-medium text-[var(--text-primary)]">{expenseMonthLabel}</p>
            <p className="text-xs text-red-400 mt-0.5">{rupees(expensesForViewMonthTotal)} spent this month</p>
          </div>
          <button
            onClick={goNextExpenseMonth}
            disabled={isCurrentExpenseMonth}
            className="h-8 w-8 rounded-lg bg-[var(--surface-2)] border border-[var(--card-border)] text-[var(--text-secondary-strong)] hover:bg-[var(--surface-3)] disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-all active:scale-90"
          >
            <ChevronRight size={15} />
          </button>
        </div>

        {expensesForViewMonth.length > 0 ? (
          <div className="space-y-1.5 mt-3">
            {expensesForViewMonth.map((e) => (
              <div key={e.id} className="flex items-center justify-between text-sm gap-2">
                <div className="min-w-0">
                  <p className="text-[var(--text-secondary-strong)] truncate">{e.description}</p>
                  <p className="text-[10px] text-[var(--text-faint)]">{new Date(e.created_at).toLocaleDateString()}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-red-400 font-medium">-{rupees(e.amount_paise)}</span>
                  {confirmingDeleteId === e.id ? (
                    <div className="flex gap-1">
                      <button onClick={() => handleDeleteExpense(e.id)} className="text-xs bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded-md">
                        Confirm
                      </button>
                      <button onClick={() => setConfirmingDeleteId(null)} className="text-xs text-[var(--text-muted)] px-2 py-1">
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmingDeleteId(e.id)} className="text-[var(--text-faint)] hover:text-red-400 p-1">
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[var(--text-muted)] text-center py-4">No expenses logged for {expenseMonthLabel}.</p>
        )}
      </GlowCard>

      {/* Full payment history */}
      <GlowCard>
        <p className="text-sm font-medium text-[var(--text-primary)] mb-3">Payment history ({data?.payment_history?.length || 0})</p>
        {(!data?.payment_history || data.payment_history.length === 0) ? (
          <p className="text-sm text-[var(--text-muted)] text-center py-4">No payments yet.</p>
        ) : (
          <div className="space-y-1.5 max-h-[420px] overflow-y-auto">
            {data.payment_history.map((p) => (
              <div key={p.id} className="flex items-center justify-between text-sm gap-2 py-1.5 border-b border-[var(--border-subtle)] last:border-0">
                <div className="min-w-0 flex-1">
                  <p className="text-[var(--text-primary)] truncate">{p.display_name}</p>
                  <p className="text-[10px] text-[var(--text-faint)]">
                    {new Date(p.paid_at).toLocaleDateString()} · {p.is_first_payment ? "First payment" : "Renewal"}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-emerald-400 font-medium">{rupees(p.amount_paise)}</p>
                  <p className="text-[10px] text-[var(--text-faint)]">
                    {p.plan === "lifetime" ? "Lifetime" : p.plan === "premium" ? "Pro" : "Basic"}
                    {p.billing_interval && p.billing_interval !== "lifetime" ? ` · ${p.billing_interval}` : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </GlowCard>
    </div>
  );
}

function RefundAdminPage({ onBack }) {
  const [email, setEmail] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState(null); // null = not searched yet, [] = searched, no results
  const [searchError, setSearchError] = useState("");
  const [refundingId, setRefundingId] = useState(null);
  const [confirmingId, setConfirmingId] = useState(null);
  const [refundError, setRefundError] = useState("");
  const [refundedIds, setRefundedIds] = useState(new Set());

  async function handleSearch() {
    if (!email.trim()) return;
    setSearching(true);
    setSearchError("");
    setResults(null);
    const { data, error } = await supabase.rpc("admin_lookup_payments_by_email", { p_email: email.trim() });
    setSearching(false);
    if (error) {
      setSearchError("Search failed — please try again.");
      return;
    }
    setResults(data || []);
  }

  async function handleRefund(row) {
    if (!row.payment_id || row.payment_id === "unknown") {
      setRefundError("No valid payment ID on this record — can't issue a refund for it.");
      setConfirmingId(null);
      return;
    }
    setRefundingId(row.payment_row_id);
    setRefundError("");
    const { data, error } = await supabase.functions.invoke("admin-refund-payment", {
      body: { payment_id: row.payment_id, reason: `Refund for ${row.display_name} — ${row.plan}` },
    });
    setRefundingId(null);
    setConfirmingId(null);
    if (error || !data?.success) {
      setRefundError(data?.error || "Refund failed — please try again, or use Razorpay's dashboard directly.");
      return;
    }
    setRefundedIds((prev) => new Set([...prev, row.payment_row_id]));
  }

  return (
    <div className="max-w-2xl space-y-5">
      <button onClick={onBack} className="text-sm text-[var(--accent-text)] hover:brightness-110 flex items-center gap-1">
        <ChevronLeft size={15} /> Back to Settings
      </button>

      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center shrink-0">
          <IndianRupee size={19} className="text-white" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">Issue a refund</h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">Look up a customer by email — every individual charge shows separately, clearly labeled first payment vs. renewal.</p>
        </div>
      </div>

      <GlowCard>
        <div className="flex gap-2">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="customer@email.com"
            className="flex-1 bg-[var(--input-bg)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)]"
          />
          <button
            onClick={handleSearch}
            disabled={searching || !email.trim()}
            className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white text-sm font-medium px-5 rounded-xl transition-colors flex items-center gap-2"
          >
            {searching && <Loader2 size={14} className="animate-spin" />}
            Search
          </button>
        </div>
        {searchError && <p className="text-xs text-red-400 mt-2">{searchError}</p>}
      </GlowCard>

      {refundError && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
          <p className="text-sm text-red-400">{refundError}</p>
          <button onClick={() => setRefundError("")} className="text-red-400 hover:text-red-300 shrink-0">
            <X size={14} />
          </button>
        </div>
      )}

      {results !== null && (
        results.length === 0 ? (
          <GlowCard>
            <p className="text-sm text-[var(--text-muted)] text-center py-4">No payments found for that email.</p>
          </GlowCard>
        ) : (
          <div className="space-y-3">
            {results.map((row) => {
              const isRefunded = refundedIds.has(row.payment_row_id);
              // Your refund policy only covers first payments within 7
              // days — surfacing this clearly here means you don't have
              // to manually reason through the payment history to check.
              const isWithinWindow = row.is_first_payment && (Date.now() - new Date(row.paid_at).getTime()) < 7 * 24 * 60 * 60 * 1000;
              return (
                <GlowCard key={row.payment_row_id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[var(--text-primary)]">
                        {row.display_name} — {row.plan === "premium" ? "Pro" : "Basic"} ({row.billing_interval})
                      </p>
                      <p className="text-xs text-[var(--text-faint)] mt-1">
                        Paid {new Date(row.paid_at).toLocaleDateString()} · Payment ID: {row.payment_id || "—"}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className={"text-xs font-medium px-2 py-1 rounded-full " + (row.is_first_payment ? "bg-[rgb(var(--accent-rgb)/0.15)] text-[var(--accent-text)]" : "bg-[var(--surface-2)] text-[var(--text-muted)]")}>
                        {row.is_first_payment ? "First payment" : "Renewal"}
                      </span>
                      {isRefunded && <span className="text-xs font-medium px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-400">Refunded</span>}
                    </div>
                  </div>

                  {!row.is_first_payment && (
                    <p className="text-xs text-amber-400 mt-2">⚠️ This is a renewal charge — per your refund policy, only first payments are eligible within the 7-day window.</p>
                  )}
                  {row.is_first_payment && !isWithinWindow && !isRefunded && (
                    <p className="text-xs text-amber-400 mt-2">⚠️ More than 7 days have passed since this first payment — outside your standard refund window.</p>
                  )}

                  {!isRefunded && (
                    <div className="mt-3 pt-3 border-t border-[var(--border-subtle)]">
                      {confirmingId === row.payment_row_id ? (
                        <div className="flex gap-2">
                          <button
                            onClick={() => setConfirmingId(null)}
                            className="flex-1 bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-secondary-strong)] text-xs font-medium py-2 rounded-lg transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleRefund(row)}
                            disabled={refundingId === row.payment_row_id}
                            className="flex-1 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-xs font-medium py-2 rounded-lg transition-colors"
                          >
                            {refundingId === row.payment_row_id ? "Processing..." : "Confirm refund"}
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmingId(row.payment_row_id)}
                          className="w-full text-xs font-medium py-2 rounded-lg border border-red-900/40 text-red-400 hover:bg-red-500/5 transition-colors"
                        >
                          Refund this payment{!isWithinWindow ? " anyway (outside normal policy)" : ""}
                        </button>
                      )}
                    </div>
                  )}
                </GlowCard>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}

function FeedbackAdminPage({ onBack }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actioningId, setActioningId] = useState(null);
  const [confirmingId, setConfirmingId] = useState(null); // which entry's delete-choice UI is open
  const [replyDraftId, setReplyDraftId] = useState(null); // which entry's reply box is open
  const [replyText, setReplyText] = useState("");
  const [replySaving, setReplySaving] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data: feedbackRows, error } = await supabase
      .from("user_feedback")
      .select("id, user_id, message, created_at, admin_reply, admin_replied_at")
      .eq("hidden_from_admin", false)
      .order("created_at", { ascending: false });
    if (error || !feedbackRows) {
      setLoading(false);
      return;
    }
    // user_feedback references auth.users, not profiles, directly — no
    // direct foreign key between user_feedback and profiles for PostgREST
    // to auto-join on, so fetch names separately and merge here instead.
    const userIds = [...new Set(feedbackRows.map((r) => r.user_id))];
    const { data: profileRows } = await supabase.from("profiles").select("user_id, display_name, username").in("user_id", userIds);
    const profileByUserId = {};
    (profileRows || []).forEach((p) => {
      profileByUserId[p.user_id] = p;
    });
    setEntries(
      feedbackRows.map((r) => ({
        ...r,
        displayName: profileByUserId[r.user_id]?.display_name || "Unknown user",
        username: profileByUserId[r.user_id]?.username || null,
      }))
    );
    setLoading(false);
  }

  async function handleHideOnly(id) {
    setActioningId(id);
    const { error } = await supabase.rpc("admin_hide_feedback", { p_feedback_id: id });
    setActioningId(null);
    setConfirmingId(null);
    if (!error) setEntries((list) => list.filter((e) => e.id !== id));
  }

  async function handleHideAndResetLimit(id) {
    setActioningId(id);
    const { error } = await supabase.rpc("admin_reset_feedback_limit", { p_feedback_id: id });
    setActioningId(null);
    setConfirmingId(null);
    if (!error) setEntries((list) => list.filter((e) => e.id !== id));
  }

  async function submitReply(id) {
    if (!replyText.trim()) return;
    setReplySaving(true);
    const { error } = await supabase.rpc("admin_reply_to_feedback", { p_feedback_id: id, p_reply: replyText.trim() });
    setReplySaving(false);
    if (error) {
      console.error("Failed to send reply:", error);
      return;
    }
    setEntries((list) => list.map((e) => (e.id === id ? { ...e, admin_reply: replyText.trim(), admin_replied_at: new Date().toISOString() } : e)));
    setReplyDraftId(null);
    setReplyText("");
  }

  return (
    <div className="max-w-2xl space-y-5">
      <button onClick={onBack} className="text-sm text-[var(--accent-text)] hover:brightness-110 flex items-center gap-1">
        <ChevronLeft size={15} /> Back to Settings
      </button>

      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center shrink-0">
          <MessageSquare size={19} className="text-white" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">All feedback</h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">{loading ? "Loading…" : `${entries.length} submission${entries.length === 1 ? "" : "s"}`}</p>
        </div>
      </div>

      {loading ? (
        <GlowCard>
          <p className="text-sm text-[var(--text-muted)] text-center py-4">Loading…</p>
        </GlowCard>
      ) : entries.length === 0 ? (
        <GlowCard>
          <p className="text-sm text-[var(--text-muted)] text-center py-4">No feedback submitted yet.</p>
        </GlowCard>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => (
            <GlowCard key={entry.id}>
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-[var(--text-primary)] mb-2 whitespace-pre-wrap break-words">{entry.message}</p>
                  <p className="text-xs text-[var(--text-faint)]">
                    {entry.displayName}
                    {entry.username ? ` (@${entry.username})` : ""} · {new Date(entry.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => {
                      setReplyDraftId(entry.id === replyDraftId ? null : entry.id);
                      setReplyText(entry.admin_reply || "");
                    }}
                    className="h-8 w-8 rounded-lg flex items-center justify-center text-[var(--text-faint)] hover:text-[var(--accent-text)] hover:bg-[rgb(var(--accent-rgb)/0.1)] transition-colors"
                    title={entry.admin_reply ? "Edit reply" : "Reply"}
                  >
                    <MessageSquare size={15} />
                  </button>
                  <button
                    onClick={() => setConfirmingId(entry.id === confirmingId ? null : entry.id)}
                    className="h-8 w-8 rounded-lg flex items-center justify-center text-[var(--text-faint)] hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    title="Delete"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              {/* The reply sits separately below the original question, so
                  it's always clear which is which — and this whole block
                  survives a normal delete, since that only hides the entry
                  from THIS admin list, never removes the row itself. */}
              {entry.admin_reply && (
                <div className="bg-[rgb(var(--accent-rgb)/0.06)] border border-[rgb(var(--accent-rgb)/0.2)] rounded-xl px-3 py-2.5 mt-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--accent-text)] mb-1">Your reply</p>
                  <p className="text-sm text-[var(--text-secondary-strong)] whitespace-pre-wrap break-words">{entry.admin_reply}</p>
                  <p className="text-[10px] text-[var(--text-faint)] mt-1">{new Date(entry.admin_replied_at).toLocaleString()}</p>
                </div>
              )}

              {replyDraftId === entry.id && (
                <div className="mt-3 pt-3 border-t border-[var(--border-subtle)] space-y-2">
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Write a reply this user will be able to see..."
                    rows={3}
                    className="w-full bg-[var(--input-bg)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl px-3 py-2 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)] resize-none"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => submitReply(entry.id)}
                      disabled={replySaving || !replyText.trim()}
                      className="flex-1 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 text-white text-sm font-medium py-2 rounded-lg transition-colors"
                    >
                      {replySaving ? "Sending..." : "Send Reply"}
                    </button>
                    <button
                      onClick={() => {
                        setReplyDraftId(null);
                        setReplyText("");
                      }}
                      className="px-4 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {confirmingId === entry.id && (
                <div className="mt-3 pt-3 border-t border-[var(--border-subtle)] flex gap-2">
                  <button
                    onClick={() => handleHideOnly(entry.id)}
                    disabled={actioningId === entry.id}
                    className="flex-1 text-sm font-medium bg-[var(--surface-2)] hover:bg-[var(--surface-3)] disabled:opacity-50 text-[var(--text-secondary-strong)] px-3 py-2 rounded-lg transition-colors"
                  >
                    Delete
                  </button>
                  <button
                    onClick={() => handleHideAndResetLimit(entry.id)}
                    disabled={actioningId === entry.id}
                    className="flex-1 text-sm font-medium bg-red-500/10 hover:bg-red-500/20 disabled:opacity-50 text-red-400 px-3 py-2 rounded-lg transition-colors"
                  >
                    Delete & Reset
                  </button>
                  <button onClick={() => setConfirmingId(null)} className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] px-3">
                    Cancel
                  </button>
                </div>
              )}
            </GlowCard>
          ))}
        </div>
      )}
    </div>
  );
}

function FeedbackPage({ onBack }) {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [alreadyUsed, setAlreadyUsed] = useState(false); // permanent — true even if the content was later deleted
  const [pastEntries, setPastEntries] = useState([]); // every past submission for this account, oldest first — a reset delete can leave more than one

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      // Eligibility is checked against the PERMANENT marker, not the
      // content itself — that way, if the content ever gets deleted, this
      // account still correctly shows as "already used" rather than being
      // offered the form again.
      const [{ data: usedRow }, { data: contentRows }] = await Promise.all([
        supabase.from("user_feedback_submitted").select("user_id").eq("user_id", user.id).maybeSingle(),
        // Not .maybeSingle() — a reset delete keeps the old row around
        // (just hidden from the admin list) and lets the account submit a
        // fresh one, so there can legitimately be more than one here.
        supabase.from("user_feedback").select("message, admin_reply, admin_replied_at, created_at").eq("user_id", user.id).order("created_at", { ascending: true }),
      ]);
      setAlreadyUsed(!!usedRow);
      setPastEntries(contentRows || []);
      setLoading(false);
    })();
  }, []);

  const submit = async () => {
    setError("");
    if (!message.trim()) return;
    setSubmitting(true);
    const trimmed = message.trim();
    const { error: rpcError } = await supabase.rpc("submit_user_feedback", { p_message: trimmed });
    setSubmitting(false);
    if (rpcError) {
      setError(rpcError.message?.includes("already submitted") ? "You've already sent a message with this account." : "Something went wrong — please try again.");
      setAlreadyUsed(true); // if it was a duplicate, this account's limit really is used either way
      return;
    }
    setAlreadyUsed(true);
    setPastEntries((list) => [...list, { message: trimmed, admin_reply: null, admin_replied_at: null, created_at: new Date().toISOString() }]);
    setMessage("");
  };

  return (
    <div className="max-w-xl space-y-5">
      <button onClick={onBack} className="text-sm text-[var(--accent-text)] hover:brightness-110 flex items-center gap-1">
        <ChevronLeft size={15} /> Back to Settings
      </button>

      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-hover)] flex items-center justify-center glow-accent-30 shrink-0">
          <MessageSquare size={19} className="text-white" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">Feedback & suggestions</h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">Feature requests, what you like, or anything else on your mind.</p>
        </div>
      </div>

      <GlowCard>
        {loading ? (
          <p className="text-sm text-[var(--text-muted)]">Loading…</p>
        ) : alreadyUsed ? (
          <div className="text-center py-2">
            <Check size={22} className="text-emerald-400 mx-auto mb-2" />
            <p className="text-sm font-medium text-[var(--text-primary)]">Thanks — we've got your message</p>
            <p className="text-xs text-[var(--text-muted)] mt-1">Each account gets one active message at a time.</p>
          </div>
        ) : (
          <>
            <p className="text-xs text-[var(--text-muted)] mb-3">
              A feature you'd like, something you enjoy, or just a comment about the site — each account gets <strong>one</strong> message, ever, so make it count.
            </p>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, 200))}
              rows={4}
              placeholder="What would you like to share?"
              className="w-full bg-[var(--input-bg)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl px-4 py-3 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)] resize-none"
            />
            <div className="flex items-center justify-between mt-2 mb-3">
              <p className="text-xs text-[var(--text-faint)]">{message.length}/200</p>
              {error && <p className="text-xs text-red-400">{error}</p>}
            </div>
            <button
              onClick={submit}
              disabled={submitting || !message.trim()}
              className="w-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white font-medium py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {submitting && <Loader2 size={15} className="animate-spin" />}
              Send message
            </button>
          </>
        )}
      </GlowCard>

      {pastEntries.length > 0 && (
        <div className="space-y-3">
          {pastEntries.map((entry, i) => (
            <GlowCard key={i}>
              <p className="text-[10px] text-[var(--text-faint)] mb-2">{new Date(entry.created_at).toLocaleString()}</p>
              <p className="text-sm text-[var(--text-secondary)] bg-[var(--input-bg)] border border-[var(--border)] rounded-xl px-4 py-3">{entry.message}</p>
              {entry.admin_reply && (
                <div className="bg-[rgb(var(--accent-rgb)/0.06)] border border-[rgb(var(--accent-rgb)/0.2)] rounded-xl px-4 py-3 mt-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--accent-text)] mb-1">Reply from the team</p>
                  <p className="text-sm text-[var(--text-secondary-strong)] whitespace-pre-wrap break-words">{entry.admin_reply}</p>
                  {entry.admin_replied_at && <p className="text-[10px] text-[var(--text-faint)] mt-1">{new Date(entry.admin_replied_at).toLocaleString()}</p>}
                </div>
              )}
            </GlowCard>
          ))}
        </div>
      )}
    </div>
  );
}

function AccountSettingsPage({ onBack, onLogout }) {
  const [profile, setProfile] = useState(null);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);

  const [draftDisplayName, setDraftDisplayName] = useState("");
  const [displayNameSaving, setDisplayNameSaving] = useState(false);
  const [displayNameSuccess, setDisplayNameSuccess] = useState("");

  const [draftUsername, setDraftUsername] = useState("");
  const [usernameStatus, setUsernameStatus] = useState(null);
  const [usernameSaving, setUsernameSaving] = useState(false);
  const [usernameError, setUsernameError] = useState("");
  const [usernameSuccess, setUsernameSuccess] = useState("");

  const [newEmail, setNewEmail] = useState("");
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [emailSuccess, setEmailSuccess] = useState("");

  const [hasPasswordIdentity, setHasPasswordIdentity] = useState(true); // assume yes until we know otherwise
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");

  const [dobDay, setDobDay] = useState("");
  const [dobMonth, setDobMonth] = useState("");
  const [dobYear, setDobYear] = useState("");
  const [dobSaving, setDobSaving] = useState(false);
  const [dobSuccess, setDobSuccess] = useState("");
  const [dobError, setDobError] = useState("");
  const [dobChangeStatus, setDobChangeStatus] = useState(null); // { has_dob, can_change, next_change_available_at }

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }
    setEmail(user.email || "");
    setHasPasswordIdentity((user.identities || []).some((i) => i.provider === "email"));
    const { data } = await supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle();
    setProfile(data || null);
    supabase.rpc("get_my_dob_change_status").then(({ data: dobStatus }) => setDobChangeStatus(dobStatus));
    if (data) {
      setDraftUsername(data.username);
      setDraftDisplayName(data.display_name || "");
      if (data.date_of_birth) {
        const [y, m, d] = data.date_of_birth.split("-");
        setDobYear(y);
        setDobMonth(String(parseInt(m, 10)));
        setDobDay(String(parseInt(d, 10)));
      }
    }
    setLoading(false);
  }

  const usernameCheck = checkUsernameChangeAllowed(profile);

  useEffect(() => {
    if (!usernameCheck.allowed || !profile) return;
    if (!draftUsername) {
      setUsernameStatus(null);
      return;
    }
    if (!usernameValid(draftUsername)) {
      setUsernameStatus("invalid");
      return;
    }
    if (draftUsername.toLowerCase() === profile.username.toLowerCase()) {
      setUsernameStatus("current");
      return;
    }
    setUsernameStatus("checking");
    const t = setTimeout(async () => {
      const { data } = await supabase.from("profiles").select("id").ilike("username", draftUsername).maybeSingle();
      setUsernameStatus(data ? "taken" : "available");
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftUsername, profile]);

  const saveUsername = async () => {
    setUsernameError("");
    setUsernameSuccess("");
    if (!usernameValid(draftUsername) || usernameStatus === "taken") return;
    if (draftUsername.toLowerCase() === profile.username.toLowerCase()) return;
    setUsernameSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("profiles")
      .update({ username: draftUsername.toLowerCase(), ...buildUsernameChangePayload(profile, usernameCheck) })
      .eq("user_id", user.id)
      .select()
      .single();
    setUsernameSaving(false);
    if (error) {
      // Postgres unique_violation — the old username is freed up the moment
      // this update runs, so a race where someone else grabs it first (rare
      // but possible) is caught here rather than silently succeeding wrong.
      setUsernameError(error.code === "23505" ? "That username was just taken — try another." : error.message || "Couldn't save changes.");
      return;
    }
    setProfile(data);
    setUsernameSuccess("Saved!");
  };

  const saveDisplayName = async () => {
    setDisplayNameSuccess("");
    setDisplayNameSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from("profiles").update({ display_name: draftDisplayName.trim() }).eq("user_id", user.id).select().single();
    setDisplayNameSaving(false);
    if (error) {
      console.error("Failed to save display name:", error);
      return;
    }
    setProfile(data);
    setDisplayNameSuccess("Saved!");
  };

  const saveDOB = async () => {
    setDobError("");
    setDobSuccess("");
    if (!dobDay || !dobMonth || !dobYear) {
      setDobError("Please select day, month, and year.");
      return;
    }
    const year = parseInt(dobYear, 10);
    const currentYear = new Date().getFullYear();
    if (year < currentYear - 120 || year > currentYear - 5) {
      setDobError("Please enter a realistic birth year.");
      return;
    }
    const dateStr = `${dobYear}-${String(dobMonth).padStart(2, "0")}-${String(dobDay).padStart(2, "0")}`;
    const testDate = new Date(dateStr);
    if (isNaN(testDate.getTime()) || testDate.getDate() !== parseInt(dobDay, 10)) {
      setDobError("That's not a valid date — please check the day for that month.");
      return;
    }
    setDobSaving(true);
    const { error } = await supabase.rpc("set_my_date_of_birth", { p_dob: dateStr });
    setDobSaving(false);
    if (error) {
      console.error("Failed to save date of birth:", error);
      setDobError((error.message || "").includes("DOB_CHANGE_LIMIT") ? "You can only change your date of birth once per year." : "Couldn't save — please try again.");
      return;
    }
    setProfile((p) => ({ ...p, date_of_birth: dateStr }));
    supabase.rpc("get_my_dob_change_status").then(({ data: dobStatus }) => setDobChangeStatus(dobStatus));
    setDobSuccess("Saved!");
  };

  const saveEmail = async () => {
    setEmailError("");
    setEmailSuccess("");
    if (!newEmail.trim() || !newEmail.includes("@")) {
      setEmailError("Enter a valid email address.");
      return;
    }
    // No point sending this to Supabase (or making the person wait for a
    // confirmation email) if it's literally the same address they already have.
    if (newEmail.trim().toLowerCase() === email.toLowerCase()) {
      setEmailError("That's already your current email.");
      return;
    }
    setEmailSaving(true);
    const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
    setEmailSaving(false);
    if (error) {
      setEmailError(error.message || "Couldn't update email.");
      return;
    }
    setEmailSuccess("Check your new email address for a confirmation link to finish the change.");
    setNewEmail("");
  };

  const savePassword = async () => {
    setPasswordError("");
    setPasswordSuccess("");
    if (newPassword.length < 6) {
      setPasswordError("Password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords don't match.");
      return;
    }
    setPasswordSaving(true);
    // For a Google-only account, this is what actually adds an "email"
    // identity to it — after this, the SAME email can be used to sign in
    // either by typing this password OR by continuing with Google, both
    // landing on this exact account rather than being treated separately.
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPasswordSaving(false);
    if (error) {
      setPasswordError(error.message || "Couldn't set password.");
      return;
    }
    setPasswordSuccess(hasPasswordIdentity ? "Password changed." : "Password set — you can now sign in with either Google or your email and this password.");
    setHasPasswordIdentity(true);
    setNewPassword("");
    setConfirmPassword("");
  };

  return (
    <div className="max-w-xl space-y-5">
      <button onClick={onBack} className="text-sm text-[var(--accent-text)] hover:brightness-110 flex items-center gap-1">
        <ChevronLeft size={15} /> Back to Settings
      </button>

      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-hover)] flex items-center justify-center glow-accent-30 shrink-0">
          <User size={19} className="text-white" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">Account</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-0.5">Manage your email, username, and display name.</p>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-[var(--text-secondary)]">Loading...</p>
      ) : (
        <>
          <GlowCard>
            <p className="text-sm font-medium text-[var(--text-primary)] mb-1">Email</p>
            <p className="text-xs text-[var(--text-muted)] mb-3">Current: {email}</p>
            <div className="flex gap-2">
              <input
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="New email address"
                className="flex-1 bg-[var(--input-bg)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)]"
              />
              <button onClick={saveEmail} disabled={emailSaving} className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white text-sm font-medium px-4 rounded-xl transition-colors shrink-0">
                {emailSaving ? "..." : "Update"}
              </button>
            </div>
            {emailError && <p className="text-xs text-red-400 mt-2">{emailError}</p>}
            {emailSuccess && <p className="text-xs text-emerald-400 mt-2">{emailSuccess}</p>}
          </GlowCard>

          <GlowCard>
            <p className="text-sm font-medium text-[var(--text-primary)] mb-1">{hasPasswordIdentity ? "Change password" : "Set a password"}</p>
            <p className="text-xs text-[var(--text-muted)] mb-3">
              {hasPasswordIdentity
                ? "Update the password you use to sign in with your email."
                : "Your account currently only signs in through Google. Set a password to also be able to sign in by typing your email directly — both ways will reach this same account."}
            </p>
            <div className="space-y-2">
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="New password"
                className="w-full bg-[var(--input-bg)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)]"
              />
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm password"
                className="w-full bg-[var(--input-bg)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)]"
              />
              <button
                onClick={savePassword}
                disabled={passwordSaving || !newPassword || !confirmPassword}
                className="w-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-xl transition-colors"
              >
                {passwordSaving ? "..." : hasPasswordIdentity ? "Update Password" : "Set Password"}
              </button>
            </div>
            {passwordError && <p className="text-xs text-red-400 mt-2">{passwordError}</p>}
            {passwordSuccess && <p className="text-xs text-emerald-400 mt-2">{passwordSuccess}</p>}
          </GlowCard>

          <GlowCard>
            <p className="text-sm font-medium text-[var(--text-primary)] mb-3">Display name</p>
            <input
              value={draftDisplayName}
              onChange={(e) => setDraftDisplayName(e.target.value.slice(0, 40))}
              maxLength={40}
              className="w-full bg-[var(--input-bg)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] outline-none mb-3"
            />
            {displayNameSuccess && <p className="text-xs text-emerald-400 mb-2">{displayNameSuccess}</p>}
            <button
              onClick={saveDisplayName}
              disabled={displayNameSaving || draftDisplayName.trim() === (profile.display_name || "")}
              className="w-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium py-2.5 rounded-xl transition-colors"
            >
              {displayNameSaving ? "Saving..." : "Save display name"}
            </button>
            <p className="text-[10px] text-[var(--text-faint)] mt-2">No limit — change this as often as you like.</p>
          </GlowCard>

          <GlowCard>
            <p className="text-sm font-medium text-[var(--text-primary)] mb-1">Date of birth</p>
            <p className="text-xs text-[var(--text-muted)] mb-3">Only used for your birthday greeting — never shown on your public profile.</p>
            {dobChangeStatus?.has_dob && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2 mb-3">
                <p className="text-xs text-amber-400">
                  {dobChangeStatus.can_change
                    ? "You can change this once a year — this change will lock it again for a year."
                    : `You've already changed this in the past year. Next change available ${new Date(dobChangeStatus.next_change_available_at).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}.`}
                </p>
              </div>
            )}
            <div className="grid grid-cols-3 gap-2 mb-3">
              <ThemedSelect
                value={dobDay}
                onChange={setDobDay}
                disabled={dobChangeStatus?.has_dob && !dobChangeStatus?.can_change}
                placeholder="Day"
                options={Array.from({ length: 31 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))}
              />
              <ThemedSelect
                value={dobMonth}
                onChange={setDobMonth}
                disabled={dobChangeStatus?.has_dob && !dobChangeStatus?.can_change}
                placeholder="Month"
                options={["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].map((m, i) => ({
                  value: String(i + 1),
                  label: m,
                }))}
              />
              <ThemedSelect
                value={dobYear}
                onChange={setDobYear}
                disabled={dobChangeStatus?.has_dob && !dobChangeStatus?.can_change}
                placeholder="Year"
                options={Array.from({ length: 100 }, (_, i) => new Date().getFullYear() - 5 - i).map((y) => ({ value: String(y), label: String(y) }))}
              />
            </div>
            {dobError && <p className="text-xs text-red-400 mb-2">{dobError}</p>}
            {dobSuccess && <p className="text-xs text-emerald-400 mb-2">{dobSuccess}</p>}
            <button
              onClick={saveDOB}
              disabled={dobSaving || (dobChangeStatus?.has_dob && !dobChangeStatus?.can_change)}
              className="w-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium py-2.5 rounded-xl transition-colors"
            >
              {dobSaving ? "Saving..." : dobChangeStatus?.has_dob ? "Update date of birth" : "Save date of birth"}
            </button>
          </GlowCard>


          <GlowCard>
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-medium text-[var(--text-primary)]">Username</p>
              {usernameCheck.allowed && (
                <span className="text-[10px] font-semibold text-[var(--accent-text)] bg-[rgb(var(--accent-rgb)/0.12)] px-2 py-0.5 rounded-full">
                  {usernameCheck.changesLeft} change{usernameCheck.changesLeft === 1 ? "" : "s"} left this week
                </span>
              )}
            </div>

            {!usernameCheck.allowed && (
              <div className="bg-[rgb(var(--accent-rgb)/0.08)] border border-[rgb(var(--accent-rgb)/0.2)] rounded-xl px-4 py-2.5 mb-3">
                <p className="text-xs text-[var(--text-secondary-strong)]">{usernameCheck.reason}</p>
              </div>
            )}

            <input
              value={draftUsername}
              onChange={(e) => setDraftUsername(e.target.value.toLowerCase().replace(/\s/g, ""))}
              disabled={!usernameCheck.allowed}
              maxLength={20}
              className="w-full bg-[var(--input-bg)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] outline-none disabled:opacity-50 mb-1"
            />
            <div className="text-xs min-h-[16px] mb-3">
              {usernameStatus === "invalid" && <span className="text-red-400">3-20 characters: lowercase letters, numbers, underscore only.</span>}
              {usernameStatus === "checking" && <span className="text-[var(--text-muted)]">Checking availability...</span>}
              {usernameStatus === "available" && <span className="text-emerald-400">✓ Username available</span>}
              {usernameStatus === "taken" && <span className="text-red-400">✕ Username already taken</span>}
            </div>

            {usernameError && <p className="text-xs text-red-400 mb-2">{usernameError}</p>}
            {usernameSuccess && <p className="text-xs text-emerald-400 mb-2">{usernameSuccess}</p>}

            <button
              onClick={saveUsername}
              disabled={!usernameCheck.allowed || usernameSaving || usernameStatus === "taken" || usernameStatus === "invalid" || usernameStatus === "checking" || usernameStatus === "current"}
              className="w-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium py-2.5 rounded-xl transition-colors"
            >
              {usernameSaving ? "Saving..." : "Save username"}
            </button>

            <p className="text-[10px] text-[var(--text-faint)] mt-2">
              Up to {USERNAME_CHANGE_LIMIT_PER_WEEK} username changes per rolling {USERNAME_WINDOW_DAYS}-day window. Profile pictures can be changed anytime.
            </p>
          </GlowCard>
        </>
      )}
    </div>
  );
}

// Share card — uses the real Web Share API where supported (opens the
// native OS share sheet, letting the person pick any installed app). On
// browsers without it (most desktop browsers), falls back to direct links
// for a few common platforms plus copy-link. Either way, this only ever
// knows a share was INITIATED — no website can know which app someone
// picked in a native share sheet, or how many people they actually sent it
// to afterward; that information never leaves the OS/target app.
const SHARE_URL = "https://studyflow.app"; // update to your real deployed URL
const SHARE_TEXT = "I've been using Lytning Focus to stay focused and build better study habits — thought you might like it too.";

function ShareCard() {
  const [copied, setCopied] = useState(false);
  const [justShared, setJustShared] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const hasNativeShare = typeof navigator !== "undefined" && !!navigator.share;

  const logShare = async (platform) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("share_events").insert({ user_id: user.id, platform });
  };

  // navigator.share()'s promise only resolves once the person actually
  // picks a target app in the OS sheet — if they back out of that sheet
  // instead, it rejects, and we deliberately don't log anything in that
  // case. Clicking the entry-point button alone never counts as a share.
  const nativeShare = async () => {
    try {
      await navigator.share({ title: "Lytning Focus", text: SHARE_TEXT, url: SHARE_URL });
      await logShare("native");
      setJustShared(true);
      setTimeout(() => {
        setJustShared(false);
        setExpanded(false);
      }, 1200);
    } catch (e) {
      // Person cancelled the share sheet — not an error, don't log it.
    }
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(SHARE_URL);
    await logShare("copy_link");
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const shareToWhatsApp = async () => {
    await logShare("whatsapp");
    window.open(`https://wa.me/?text=${encodeURIComponent(SHARE_TEXT + " " + SHARE_URL)}`, "_blank");
  };

  const shareToTwitter = async () => {
    await logShare("twitter");
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(SHARE_TEXT)}&url=${encodeURIComponent(SHARE_URL)}`, "_blank");
  };

  const shareViaEmail = async () => {
    await logShare("email");
    window.location.href = `mailto:?subject=${encodeURIComponent("Check out Lytning Focus")}&body=${encodeURIComponent(SHARE_TEXT + "\n\n" + SHARE_URL)}`;
  };

  if (!expanded) {
    return (
      <GlowCard>
        <p className="text-sm font-medium text-[var(--text-primary)] mb-1">Share Lytning Focus</p>
        <p className="text-xs text-[var(--text-muted)] mb-4">Know someone who'd focus better with this? Send them the link.</p>
        <button
          onClick={() => setExpanded(true)}
          className="w-full flex items-center justify-center gap-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium py-2.5 rounded-xl transition-colors"
        >
          <Send size={15} /> Share
        </button>
      </GlowCard>
    );
  }

  return (
    <GlowCard>
      <button onClick={() => setExpanded(false)} className="flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary-strong)] mb-3 transition-colors">
        <ChevronLeft size={13} /> Back
      </button>

      <div className="bg-[var(--surface-2)]/40 rounded-xl p-3 mb-4">
        <p className="text-xs text-[var(--text-secondary)]">{SHARE_TEXT}</p>
        <p className="text-xs text-[var(--accent-text)] mt-1 truncate">{SHARE_URL}</p>
      </div>

      {hasNativeShare ? (
        <button
          onClick={nativeShare}
          className="w-full flex items-center justify-center gap-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium py-2.5 rounded-xl transition-colors"
        >
          <Send size={15} /> {justShared ? "Shared!" : "Choose app to share to"}
        </button>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button onClick={shareToWhatsApp} className="flex items-center gap-1.5 text-xs font-medium bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-secondary-strong)] px-3 py-2 rounded-lg transition-colors">
            WhatsApp
          </button>
          <button onClick={shareToTwitter} className="flex items-center gap-1.5 text-xs font-medium bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-secondary-strong)] px-3 py-2 rounded-lg transition-colors">
            X / Twitter
          </button>
          <button onClick={shareViaEmail} className="flex items-center gap-1.5 text-xs font-medium bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-secondary-strong)] px-3 py-2 rounded-lg transition-colors">
            Email
          </button>
          <button onClick={copyLink} className="flex items-center gap-1.5 text-xs font-medium bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-secondary-strong)] px-3 py-2 rounded-lg transition-colors">
            <Copy size={12} /> {copied ? "Copied!" : "Copy Link"}
          </button>
        </div>
      )}
    </GlowCard>
  );
}

function Settings({ user, onLogout, theme, onSelectTheme, soundEnabled, onToggleSound, selectedSound, onSelectSound, themeSoundError, initialView, goTo }) {
  const { requireAuth } = useRequireAuth();
  const [showAppearance, setShowAppearance] = useState(initialView === "appearance");
  const [showSound, setShowSound] = useState(initialView === "sound");
  const [showAccount, setShowAccount] = useState(initialView === "account");
  const [showFeedback, setShowFeedback] = useState(initialView === "feedback");
  const [showFeedbackAdmin, setShowFeedbackAdmin] = useState(initialView === "feedbackAdmin");
  const [showRefundAdmin, setShowRefundAdmin] = useState(initialView === "refundAdmin");
  const [showRevenueDashboard, setShowRevenueDashboard] = useState(initialView === "revenueDashboard");
  const [showAbout, setShowAbout] = useState(initialView === "about");
  const [showLegal, setShowLegal] = useState(initialView === "legal");
  const isAdmin = user?.email === "vashvinraj@gmail.com";
  const [showDeleteWarning, setShowDeleteWarning] = useState(false); // step 1: the "are you sure" warning
  const [showDeleteTypeConfirm, setShowDeleteTypeConfirm] = useState(false); // step 2: type CONFIRM
  const [deleteConfirmInput, setDeleteConfirmInput] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState("");

  async function handleDeleteAccount() {
    setDeletingAccount(true);
    setDeleteAccountError("");
    const { error } = await supabase.rpc("delete_my_account");
    if (error) {
      console.error("Failed to delete account:", error);
      setDeletingAccount(false);
      setDeleteAccountError("Something went wrong — please try again, or contact support if this keeps happening.");
      return;
    }
    await supabase.auth.signOut();
    onLogout && onLogout();
  }

  if (showAbout) {
    return <AboutPage onBack={() => setShowAbout(false)} />;
  }
  if (showLegal) {
    return <LegalPage onBack={() => setShowLegal(false)} />;
  }
  if (showAppearance) {
    return <AppearancePage theme={theme} onSelectTheme={onSelectTheme} error={themeSoundError} onBack={() => setShowAppearance(false)} goTo={goTo} />;
  }
  if (showSound) {
    return <SoundPage selectedSound={selectedSound} onSelectSound={onSelectSound} error={themeSoundError} onBack={() => setShowSound(false)} goTo={goTo} />;
  }
  if (showAccount) {
    return <AccountSettingsPage onBack={() => setShowAccount(false)} onLogout={onLogout} />;
  }
  if (showFeedback) {
    return <FeedbackPage onBack={() => setShowFeedback(false)} />;
  }
  if (showFeedbackAdmin) {
    return <FeedbackAdminPage onBack={() => setShowFeedbackAdmin(false)} />;
  }
  if (showRefundAdmin) {
    return <RefundAdminPage onBack={() => setShowRefundAdmin(false)} />;
  }
  if (showRevenueDashboard) {
    return <RevenueDashboardPage onBack={() => setShowRevenueDashboard(false)} />;
  }

  const activeThemeInfo = THEMES.find((t) => t.key === theme) || THEMES[0];
  const activeSoundInfo = SOUND_OPTIONS.find((s) => s.key === selectedSound) || SOUND_OPTIONS[1];

  return (
    <div className="max-w-xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-hover)] flex items-center justify-center glow-accent-30 shrink-0">
          <SettingsIcon size={19} className="text-white" />
        </div>
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">Settings</h1>
      </div>

      <GlowCard>
        <p className="text-sm font-medium text-[var(--text-primary)] mb-4">Account</p>
        {!user ? (
          <div className="text-center py-4">
            <p className="text-sm text-[var(--text-secondary)] mb-3">You're browsing without an account.</p>
            <button
              onClick={() => requireAuth(() => {})}
              className="text-xs font-medium bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white px-4 py-2 rounded-lg transition-colors"
            >
              Sign in or create an account
            </button>
          </div>
        ) : (
        <>
        <div className="flex items-center gap-3 mb-4">
          <div className="h-12 w-12 rounded-full bg-gradient-to-br from-[var(--accent)] to-[var(--accent-hover)] flex items-center justify-center text-[var(--text-primary)] font-medium">
            {user.name[0]?.toUpperCase()}
          </div>
          <div>
            <p className="text-[var(--text-primary)] text-sm">{user.name}</p>
            <p className="text-[var(--text-muted)] text-xs">{user.email}</p>
          </div>
        </div>
        <button
          onClick={() => setShowAccount(true)}
          className="text-xs font-medium text-[var(--accent-text)] border border-[rgb(var(--accent-rgb)/0.4)] hover:bg-[rgb(var(--accent-rgb)/0.12)] transition-colors px-3 py-1.5 rounded-lg"
        >
          Edit profile
        </button>
        </>
        )}
      </GlowCard>

      <ShareCard />

      <GlowCard className="relative overflow-hidden">
        <div className="flex items-start gap-3">
          <div className="h-11 w-11 rounded-xl bg-[rgb(var(--accent-rgb)/0.2)] flex items-center justify-center shrink-0">
            <Smartphone size={19} className="text-[var(--accent-text)]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-medium text-[var(--text-primary)]">Mobile App</p>
              <span className="text-[10px] font-semibold uppercase tracking-wide bg-[rgb(var(--accent-rgb)/0.2)] text-[var(--accent-text)] px-2 py-0.5 rounded-full">Coming Soon</span>
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              A dedicated Lytning Focus app for iOS and Android is on the way — same features, built for your pocket.
            </p>
          </div>
        </div>
      </GlowCard>

      <GlowCard>
        <button onClick={() => setShowAppearance(true)} className="w-full flex items-center gap-3 text-left group">
          <div className="h-11 w-11 rounded-xl shrink-0 border border-[var(--border)]" style={{ background: activeThemeInfo.preview }} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-[var(--text-primary)]">Appearance</p>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">Currently: {activeThemeInfo.name} · {THEMES.length} themes available</p>
          </div>
          <ChevronRight size={16} className="text-[var(--text-faint)] group-hover:text-[var(--accent-text)] group-hover:translate-x-0.5 transition-all shrink-0" />
        </button>
      </GlowCard>

      <GlowCard>
        <button onClick={() => requireAuth(() => setShowFeedback(true))} className="w-full flex items-center gap-3 text-left group">
          <div className="h-11 w-11 rounded-xl shrink-0 bg-[rgb(var(--accent-rgb)/0.2)] flex items-center justify-center">
            <MessageSquare size={18} className="text-[var(--accent-text)]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-[var(--text-primary)]">Feedback & suggestions</p>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">Feature requests, comments, or anything else</p>
          </div>
          <ChevronRight size={16} className="text-[var(--text-faint)] group-hover:text-[var(--accent-text)] group-hover:translate-x-0.5 transition-all shrink-0" />
        </button>
      </GlowCard>

      {isAdmin && (
        <GlowCard>
          <button onClick={() => setShowFeedbackAdmin(true)} className="w-full flex items-center gap-3 text-left group">
            <div className="h-11 w-11 rounded-xl shrink-0 bg-amber-500/20 flex items-center justify-center">
              <MessageSquare size={18} className="text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[var(--text-primary)]">View all feedback (Admin)</p>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">Only visible to you — read and delete submissions</p>
            </div>
            <ChevronRight size={16} className="text-[var(--text-faint)] group-hover:text-[var(--accent-text)] group-hover:translate-x-0.5 transition-all shrink-0" />
          </button>
        </GlowCard>
      )}

      {isAdmin && (
        <GlowCard>
          <button onClick={() => setShowRefundAdmin(true)} className="w-full flex items-center gap-3 text-left group">
            <div className="h-11 w-11 rounded-xl shrink-0 bg-amber-500/20 flex items-center justify-center">
              <IndianRupee size={18} className="text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[var(--text-primary)]">Issue a refund (Admin)</p>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">Only visible to you — look up a customer and refund a payment</p>
            </div>
            <ChevronRight size={16} className="text-[var(--text-faint)] group-hover:text-[var(--accent-text)] group-hover:translate-x-0.5 transition-all shrink-0" />
          </button>
        </GlowCard>
      )}

      {isAdmin && (
        <GlowCard>
          <button onClick={() => setShowRevenueDashboard(true)} className="w-full flex items-center gap-3 text-left group">
            <div className="h-11 w-11 rounded-xl shrink-0 bg-amber-500/20 flex items-center justify-center">
              <TrendingUp size={18} className="text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[var(--text-primary)]">Revenue Dashboard (Admin)</p>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">Only visible to you — payment history, revenue totals, and expenses</p>
            </div>
            <ChevronRight size={16} className="text-[var(--text-faint)] group-hover:text-[var(--accent-text)] group-hover:translate-x-0.5 transition-all shrink-0" />
          </button>
        </GlowCard>
      )}

      <GlowCard>
        <div className="flex items-center justify-between text-sm mb-4">
          <span className="text-[var(--text-secondary-strong)] flex items-center gap-2 font-medium">
            <Bell size={14} /> Completion sound
          </span>
          <Toggle checked={soundEnabled} onChange={onToggleSound} />
        </div>
        <button
          onClick={() => setShowSound(true)}
          disabled={!soundEnabled}
          className="w-full flex items-center gap-3 text-left group disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <div className="h-9 w-9 rounded-full flex items-center justify-center shrink-0" style={{ background: "var(--accent)" }}>
            <Bell size={14} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-[var(--text-primary)]">{activeSoundInfo.name}</p>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">{SOUND_OPTIONS.length} sounds available — tap to change</p>
          </div>
          <ChevronRight size={16} className="text-[var(--text-faint)] group-hover:text-[var(--accent-text)] group-hover:translate-x-0.5 transition-all shrink-0" />
        </button>
      </GlowCard>

      <GlowCard>
        <button onClick={() => setShowLegal(true)} className="w-full flex items-center gap-3 text-left group">
          <div className="h-9 w-9 rounded-xl bg-[var(--surface-2)] flex items-center justify-center shrink-0">
            <FileText size={16} className="text-[var(--text-secondary-strong)]" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-[var(--text-primary)]">Privacy, Terms & Refund Policy</p>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">Billing, cancellation, and refund details</p>
          </div>
          <ChevronRight size={16} className="text-[var(--text-faint)] group-hover:text-[var(--accent-text)] group-hover:translate-x-0.5 transition-all shrink-0" />
        </button>
      </GlowCard>

      <GlowCard>
        <button onClick={() => setShowAbout(true)} className="w-full flex items-center gap-3 text-left group">
          <div className="h-9 w-9 rounded-xl bg-[var(--surface-2)] flex items-center justify-center shrink-0">
            <HelpCircle size={16} className="text-[var(--text-secondary-strong)]" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-[var(--text-primary)]">About & How It Works</p>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">A full guide to every feature — XP, levels, caps, and more</p>
          </div>
          <ChevronRight size={16} className="text-[var(--text-faint)] group-hover:text-[var(--accent-text)] group-hover:translate-x-0.5 transition-all shrink-0" />
        </button>
      </GlowCard>

      <div className="flex gap-3">
        <button onClick={onLogout} className="flex-1 flex items-center justify-center gap-2 bg-[var(--surface-solid)] border border-[var(--border)] hover:border-[var(--border-strong)] text-[var(--text-secondary-strong)] text-sm font-medium py-3 rounded-xl transition-colors">
          <LogOut size={15} /> Log out
        </button>
        <button
          onClick={() => setShowDeleteWarning(true)}
          className="flex-1 text-sm font-medium py-3 rounded-xl border border-red-900/40 text-red-400 hover:bg-red-500/5 transition-colors"
        >
          Delete account
        </button>
      </div>

      {showDeleteWarning && (
        <div className="fixed inset-0 md:left-60 lg:left-64 z-[400] flex items-center justify-center p-4" onClick={() => setShowDeleteWarning(false)}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div onClick={(e) => e.stopPropagation()} className="relative bg-[var(--surface-solid)] border border-red-500/40 rounded-3xl p-6 max-w-sm w-full text-center shadow-[0_0_60px_-10px_rgba(239,68,68,0.5)]">
            <div className="h-12 w-12 rounded-2xl bg-red-500/15 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle size={22} className="text-red-400" />
            </div>
            <p className="text-base font-semibold text-[var(--text-primary)] mb-2">Delete your account?</p>
            <p className="text-sm text-[var(--text-muted)] mb-6">
              This permanently deletes your profile, all study sessions, tasks, habits, groups you own, achievements, subscription record — everything, with no way to restore any of it. This action cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowDeleteWarning(false)}
                className="flex-1 bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-secondary-strong)] text-sm font-medium py-2.5 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowDeleteWarning(false);
                  setShowDeleteTypeConfirm(true);
                }}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white text-sm font-medium py-2.5 rounded-xl transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteTypeConfirm && (
        <div
          className="fixed inset-0 md:left-60 lg:left-64 z-[400] flex items-center justify-center p-4"
          onClick={() => {
            setShowDeleteTypeConfirm(false);
            setDeleteConfirmInput("");
            setDeleteAccountError("");
          }}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div onClick={(e) => e.stopPropagation()} className="relative bg-[var(--surface-solid)] border border-red-500/40 rounded-3xl p-6 max-w-sm w-full text-center shadow-[0_0_60px_-10px_rgba(239,68,68,0.5)]">
            <div className="h-12 w-12 rounded-2xl bg-red-500/15 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle size={22} className="text-red-400" />
            </div>
            <p className="text-base font-semibold text-[var(--text-primary)] mb-2">Last chance</p>
            <p className="text-sm text-[var(--text-muted)] mb-4">
              Type <span className="font-mono font-bold text-red-400">CONFIRM</span> below to permanently delete your account.
            </p>
            <input
              value={deleteConfirmInput}
              onChange={(e) => setDeleteConfirmInput(e.target.value)}
              placeholder="CONFIRM"
              autoFocus
              className="w-full bg-[var(--input-bg)] border border-red-500/30 focus:border-red-500 rounded-xl px-4 py-2.5 text-sm text-center text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)] mb-4 font-mono tracking-wide"
            />
            {deleteAccountError && <p className="text-xs text-red-400 mb-3">{deleteAccountError}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowDeleteTypeConfirm(false);
                  setDeleteConfirmInput("");
                  setDeleteAccountError("");
                }}
                disabled={deletingAccount}
                className="flex-1 bg-[var(--surface-2)] hover:bg-[var(--surface-3)] disabled:opacity-50 text-[var(--text-secondary-strong)] text-sm font-medium py-2.5 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleteConfirmInput !== "CONFIRM" || deletingAccount}
                className="flex-1 bg-red-500 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium py-2.5 rounded-xl transition-colors"
              >
                {deletingAccount ? "Deleting..." : "Delete Forever"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const NAV = [
  { key: "dashboard", label: "Dashboard", icon: Home },
  { key: "focus", label: "Focus", icon: Timer },
  { key: "tasks", label: "Tasks", icon: CheckSquare },
  { key: "stats", label: "Statistics", icon: BarChart3 },
  { key: "growth", label: "Growth", icon: Flame },
  { key: "events", label: "Events", icon: Calendar, requiredTier: "basic" },
  { key: "habits", label: "Habit Tracker", icon: Layers, requiredTier: "premium" },
  { key: "insights", label: "Insights", icon: TrendingUp, requiredTier: "premium" },
  { key: "groups", label: "Groups", icon: Users },
  { key: "leaderboard", label: "Leaderboard", icon: Trophy },
  { key: "achievements", label: "Achievements", icon: Trophy },
  { key: "profile", label: "Profile", icon: User },
  { key: "friends", label: "Friends", icon: Users },
  { key: "pricing", label: "Premium", icon: Crown },
  { key: "settings", label: "Settings", icon: SettingsIcon },
];

const MOBILE_NAV_KEYS = ["dashboard", "focus", "tasks", "pricing", "settings"];

// Standard cookie-consent banner. "Essential" storage (keeping you signed
// in) always works regardless of the choice made here — that's not a
// tracking cookie, it's what makes the app functional at all, so it isn't
// something a consent banner can honestly offer to disable. This banner is
// about being upfront and giving a real choice for anything beyond that.
function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("studyflow-cookie-consent");
      if (!stored) setVisible(true);
    } catch {
      // localStorage unavailable (private browsing, etc.) — just don't
      // nag about a choice that can't be remembered anyway.
    }
  }, []);

  const choose = (value, persist = true) => {
    try {
      if (persist) localStorage.setItem("studyflow-cookie-consent", value);
    } catch {
      // ignore — nothing we can do if storage is blocked
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed z-[400] bottom-0 inset-x-0 w-full">
      <div className="bg-[var(--surface-solid)] border-t border-[var(--card-border)] shadow-2xl shadow-black/40 px-4 py-4 md:px-8">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm text-[var(--text-primary)] font-medium mb-1">Cookies</p>
            <p className="text-xs text-[var(--text-muted)]">
              Lytning Focus uses local storage to keep you signed in and remember your preferences — that part always works so logging back in is quick. Everything else is up to you.
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => choose("accepted")}
              className="flex-1 md:flex-none bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-medium px-4 py-2.5 rounded-lg transition-colors"
            >
              Accept
            </button>
            <button
              onClick={() => choose("rejected")}
              className="flex-1 md:flex-none bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-secondary-strong)] text-xs font-medium px-4 py-2.5 rounded-lg transition-colors"
            >
              Reject
            </button>
            <button
              onClick={() => choose("once", false)}
              className="flex-1 md:flex-none bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-secondary-strong)] text-xs font-medium px-4 py-2.5 rounded-lg transition-colors"
            >
              Allow once
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// The sign-in modal and logout-confirmation dialog, shared between the
// landing page and the in-app view (via requireAuth) so both use the exact
// same overlay instead of a separate full-page "auth" screen/history level.
function AuthOverlays({ authModalOpen, setAuthModalOpen, authMode, setAuthMode, handleAuth, confirmingLogout, setConfirmingLogout, performLogout }) {
  return (
    <>
      {authModalOpen && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 overflow-y-auto">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setAuthModalOpen(false)} />
          <div className="relative w-full max-w-md my-8">
            <button
              onClick={() => setAuthModalOpen(false)}
              className="absolute -top-8 right-0 z-10 text-sm font-medium text-red-500 hover:text-red-400 transition-colors"
            >
              Close
            </button>
            <div className="bg-[var(--surface-solid)] border border-[var(--card-border)] rounded-3xl overflow-hidden max-h-[94vh] overflow-y-auto">
              <AuthScreen
                mode={authMode}
                setMode={setAuthMode}
                onAuth={(u) => {
                  setAuthModalOpen(false);
                  handleAuth(u);
                }}
                onBack={() => setAuthModalOpen(false)}
                embedded
              />
            </div>
          </div>
        </div>
      )}
      {confirmingLogout && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4" onClick={() => setConfirmingLogout(false)}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div onClick={(e) => e.stopPropagation()} className="relative bg-[var(--surface-solid)] border border-[var(--card-border)] rounded-3xl p-6 max-w-sm w-full text-center">
            <p className="text-sm text-[var(--text-primary)] font-medium mb-2">Log out?</p>
            <p className="text-xs text-[var(--text-muted)] mb-5">You'll need to sign in again to get back to your account.</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmingLogout(false)} className="flex-1 bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-secondary-strong)] text-sm font-medium py-2.5 rounded-xl transition-colors">
                Cancel
              </button>
              <button onClick={performLogout} className="flex-1 bg-red-500/90 hover:bg-red-500 text-white text-sm font-medium py-2.5 rounded-xl transition-colors">
                Log out
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Always-mounted, regardless of which tab is active — this is what lets an
// achievement notification pop up no matter where the person currently is
// in the app, rather than only being detected when they happen to visit
// the Achievements page itself.
function AchievementWatcher({ refreshKey, goTo }) {
  const [popup, setPopup] = useState(null); // the achievement def just detected, or null
  const dismissTimerRef = useRef(null);

  useEffect(() => {
    checkForNewAchievements();
    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  async function checkForNewAchievements() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const [sessionsRes, statsRes, earnedRes, friendsRes, groupContribRes, fullCompletionRes, shareRes, veteranRes, dayRankRes, weekRankRes, monthRankRes, premiumRes, cappedFocusXPRes] =
      await Promise.all([
        supabase.from("study_sessions").select("focused_seconds, completed_at"),
        supabase.from("user_task_stats").select("lifetime_tasks_completed, lifetime_task_xp, lifetime_group_xp").eq("user_id", user.id).maybeSingle(),
        supabase.from("user_achievements").select("*").eq("user_id", user.id),
        supabase.from("friend_requests").select("id").eq("status", "accepted").or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`),
        supabase.rpc("get_my_max_group_contribution_minutes"),
        supabase.rpc("get_my_full_completion_count"),
        supabase.rpc("get_my_share_count"),
        supabase.rpc("get_my_longest_group_membership_days"),
        supabase.rpc("get_my_leaderboard_rank", { p_period: "day" }),
        supabase.rpc("get_my_leaderboard_rank", { p_period: "week" }),
        supabase.rpc("get_my_leaderboard_rank", { p_period: "month" }),
        supabase.rpc("get_my_ever_been_premium"),
        supabase.rpc("get_my_capped_focus_xp"),
      ]);

    const sess = sessionsRes.data || [];
    const tasksDone = statsRes.data?.lifetime_tasks_completed || 0;
    const taskXP = statsRes.data?.lifetime_task_xp || 0;
    const groupXP = statsRes.data?.lifetime_group_xp || 0;

    const earnedMap = {};
    (earnedRes.data || []).forEach((r) => {
      earnedMap[r.achievement_key] = r;
    });
    const earnedKeys = new Set(Object.keys(earnedMap));

    const stats = computeStudyStats(sess);
    const totalMinutes = Math.floor(stats.totalSeconds / 60);
    const cappedFocusXP = cappedFocusXPRes.data || 0;
    const totalXPFromEarned = Object.values(earnedMap).reduce((sum, r) => sum + (r.xp_awarded || 0), 0);
    const level = computeGrowth(cappedFocusXP + taskXP + groupXP + totalXPFromEarned).current.level;

    const ctx = {
      streak: stats.streak,
      level,
      tasksCompleted: tasksDone,
      taskXP,
      groupXP,
      totalMinutes,
      cappedFocusXP,
      totalXPRaw: cappedFocusXP + taskXP + groupXP + totalXPFromEarned,
      friendCount: (friendsRes.data || []).length,
      maxGroupContribMinutes: groupContribRes.data || 0,
      fullCompletionCount: fullCompletionRes.data || 0,
      shareCount: shareRes.data || 0,
      longestGroupMembershipDays: veteranRes.data || 0,
      dayRank: dayRankRes.data ?? null,
      weekRank: weekRankRes.data ?? null,
      monthRank: monthRankRes.data ?? null,
      everBeenPremium: premiumRes.data || false,
      earnedKeys,
    };

    // "Newly claimable" means the condition is met but it hasn't been
    // claimed yet AND we haven't already shown a popup for it before —
    // that second check is what stops the same notification from
    // reappearing every time refreshKey changes, since meeting the
    // condition doesn't remove it from being claimable until actually
    // claimed on the Achievements page.
    const seenStorageKey = `lf_achievement_notified_${user.id}`;
    const alreadyNotified = new Set(JSON.parse(localStorage.getItem(seenStorageKey) || "[]"));

    const newlyClaimable = ACHIEVEMENTS.find((a) => !earnedKeys.has(a.key) && !alreadyNotified.has(a.key) && a.check(ctx));

    if (newlyClaimable) {
      alreadyNotified.add(newlyClaimable.key);
      localStorage.setItem(seenStorageKey, JSON.stringify([...alreadyNotified]));
      setPopup(newlyClaimable);
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = setTimeout(() => setPopup(null), 8000);
    }
  }

  if (!popup) return null;

  return (
    <div className="fixed top-4 right-4 left-4 sm:left-auto z-[500] sm:max-w-xs">
      <button
        onClick={() => {
          setPopup(null);
          goTo && goTo("achievements");
        }}
        className="w-full text-left bg-[var(--surface-solid)] border border-amber-500/40 rounded-2xl p-4 shadow-[0_0_40px_-8px_rgba(245,158,11,0.5)] flex items-start gap-3 transition-transform hover:scale-[1.02]"
      >
        <span className="text-2xl shrink-0">🏆</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-400 mb-0.5">Achievement Unlocked!</p>
          <p className="text-sm font-medium text-[var(--text-primary)] truncate">{popup.title}</p>
          <p className="text-xs text-[var(--text-muted)] mt-1">Tap to claim +{popup.xp.toLocaleString()} XP</p>
        </div>
        <div
          onClick={(e) => {
            e.stopPropagation();
            setPopup(null);
          }}
          className="text-[var(--text-faint)] hover:text-[var(--text-primary)] shrink-0 p-1 -m-1"
        >
          <X size={14} />
        </div>
      </button>
    </div>
  );
}

export default function StudyFlowAI() {
  const [screen, setScreen] = useState("checking"); // "checking" | "landing" | "auth" | "app"
  const [authMode, setAuthMode] = useState("login");
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [myGlobalTier, setMyGlobalTier] = useState(null); // used for the sidebar's Pro-exclusive badges
  const [tab, setTab] = useState("dashboard");
  // Only THREE levels matter for Back, not every tab switch inside the app:
  //   - on "auth" → Back just closes it, landing back on "app"
  //   - on "app" (any tab) → Back goes to "landing" (the Start Studying page)
  //   - on "landing" → Back leaves the site entirely (wherever the browser's
  //     own history had before this page — e.g. Google), no interception.
  // Switching tabs inside the app deliberately does NOT push a new history
  // entry — that's the part that was overcomplicating this before.
  const isPopStateNavRef = useRef(false);
  const hasHistoryBaselineRef = useRef(false);

  useEffect(() => {
    if (screen === "checking") return; // transient loading state, not a real page
    if (isPopStateNavRef.current) {
      // This screen change came FROM a Back/Forward press — don't push a
      // new entry for it, or Back would just keep re-adding forward history.
      isPopStateNavRef.current = false;
      return;
    }
    if (window.history.state?.screen === screen) {
      // Already exactly here — e.g. React re-running this effect for the
      // same value (StrictMode does this on mount) — pushing again here
      // would create a phantom duplicate entry, which is exactly what made
      // Back need an extra press before it visibly did anything.
      return;
    }
    if (!hasHistoryBaselineRef.current) {
      hasHistoryBaselineRef.current = true;
      window.history.replaceState({ screen }, "");
    } else {
      window.history.pushState({ screen }, "");
    }
  }, [screen]);

  useEffect(() => {
    const onPopState = (e) => {
      if (!e.state) return;
      isPopStateNavRef.current = true;
      if (e.state.screen) setScreen(e.state.screen);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const [settingsInitialView, setSettingsInitialView] = useState(null);
  const [hasProfile, setHasProfile] = useState(null); // null = still checking, true/false once known
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem("studyflow-theme") || "dark";
    } catch {
      return "dark";
    }
  });
  const [themeSoundError, setThemeSoundError] = useState("");

  // Apply the CSS variables for whichever theme is active — except on
  // Landing/Auth, which always show the default theme regardless of what's
  // saved, so a signed-out visitor (or someone before their first login)
  // never sees someone else's or a stale theme choice before they're in.
  useEffect(() => {
    applyTheme(screen === "landing" ? "dark" : theme);
  }, [theme, screen]);

  // The server's selected_theme/selected_sound are the real source of
  // truth once signed in — localStorage above is only ever a same-device
  // fallback for the instant before this loads, not something trusted for
  // premium eligibility.
  useEffect(() => {
    if (screen !== "app" || !user) return;
    (async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;
      const { data } = await supabase.from("profiles").select("selected_theme, selected_sound").eq("user_id", authUser.id).maybeSingle();
      if (data?.selected_theme) {
        setTheme(data.selected_theme);
        try { localStorage.setItem("studyflow-theme", data.selected_theme); } catch {}
      }
      if (data?.selected_sound) {
        setSelectedSound(data.selected_sound);
        try { localStorage.setItem("studyflow-sound-key", data.selected_sound); } catch {}
      }
    })();
  }, [screen, user]);

  const selectTheme = async (key) => {
    const previous = theme;
    setTheme(key); // optimistic — reverted below if the server rejects it
    setThemeSoundError("");
    const { error } = await supabase.rpc("set_my_theme", { p_theme_key: key });
    if (error) {
      setTheme(previous);
      setThemeSoundError((error.message || "").includes("THEME_LOCKED") ? "This theme requires Pro — upgrade to unlock it." : "Couldn't save that theme — please try again.");
      return;
    }
    try {
      localStorage.setItem("studyflow-theme", key);
    } catch {}
  };

  const [soundEnabled, setSoundEnabled] = useState(() => getSoundPrefs().enabled);
  const [selectedSound, setSelectedSound] = useState(() => getSoundPrefs().soundKey);

  const toggleSoundEnabled = () => {
    setSoundEnabled((v) => {
      const next = !v;
      try {
        localStorage.setItem("studyflow-sound-enabled", String(next));
      } catch {}
      return next;
    });
  };

  const selectSound = async (key) => {
    const previous = selectedSound;
    setSelectedSound(key);
    setThemeSoundError("");
    const { error } = await supabase.rpc("set_my_sound", { p_sound_key: key });
    if (error) {
      setSelectedSound(previous);
      setThemeSoundError((error.message || "").includes("SOUND_LOCKED") ? "This sound requires Pro — upgrade to unlock it." : "Couldn't save that sound — please try again.");
      return;
    }
    try {
      localStorage.setItem("studyflow-sound-key", key);
    } catch {}
  };

  // Bumped whenever a timer session is saved, so Dashboard/Statistics re-fetch real stats from Supabase.
  const [statsRefreshKey, setStatsRefreshKey] = useState(0);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: { session: authSession } } = await supabase.auth.getSession();
      const authUser = authSession?.user;
      if (!authUser) return;
      const { data: profileRow } = await supabase.from("profiles").select("premium_tier").eq("user_id", authUser.id).maybeSingle();
      setMyGlobalTier(profileRow?.premium_tier || "free");
    })();
  }, [statsRefreshKey, user]);
  // Tracks lifetime focused seconds so we can detect a Growth level-up the moment
  // a session is saved, regardless of which tab the person is currently on.
  const [totalFocusedSeconds, setTotalFocusedSeconds] = useState(null);
  const [levelUpInfo, setLevelUpInfo] = useState(null);
  const [pendingFriendRequests, setPendingFriendRequests] = useState(0);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data, error } = await supabase.from("study_sessions").select("focused_seconds");
      if (!error) {
        const total = (data || []).reduce((sum, s) => sum + (s.focused_seconds || 0), 0);
        setTotalFocusedSeconds(total);
      }
    })();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    async function loadPendingCount() {
      const { data, error } = await supabase
        .from("friend_requests")
        .select("id")
        .eq("receiver_id", user.id)
        .eq("status", "pending");
      if (!error) setPendingFriendRequests((data || []).length);
      else console.error("Failed to load pending friend requests:", error);
    }
    loadPendingCount();
    // Re-check whenever the person navigates to the Friends tab (catches
    // anything new) and whenever they leave it (catches anything they just
    // accepted/declined while there), without needing a realtime subscription.
  }, [user, tab]);

  // Whether this person has finished profile setup (picked a username). If
  // not, they get routed to the Profile tab regardless of what they click,
  // until they finish — this is the "first for whole setup" gate.
  useEffect(() => {
    if (!user) {
      setHasProfile(null);
      return;
    }
    (async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;
      const { data } = await supabase.from("profiles").select("id").eq("user_id", authUser.id).maybeSingle();
      setHasProfile(!!data);
    })();
  }, [user]);

  // Single active session: every time this account gets used somewhere —
  // this tab included, on restore OR fresh login — a random ID gets
  // written to profiles.active_session_id, overwriting whatever was there.
  // Each tab's own ID lives purely in memory (a ref, generated fresh once
  // per real page load) rather than sessionStorage — Chrome's "duplicate
  // tab" copies sessionStorage wholesale into the new tab, which would
  // give both tabs the identical ID and defeat this entirely. An in-memory
  // ref can't be duplicated that way; every real page load gets a
  // genuinely fresh one no matter how the tab was opened.
  const mySessionIdRef = useRef(null);
  const [kickedOut, setKickedOut] = useState(false);

  function getOrCreateTabSessionId() {
    if (!mySessionIdRef.current) {
      mySessionIdRef.current = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
    return mySessionIdRef.current;
  }

  async function claimSession() {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return;
    const id = getOrCreateTabSessionId();
    mySessionIdRef.current = id;
    await supabase.from("profiles").update({ active_session_id: id, active_session_started_at: new Date().toISOString() }).eq("user_id", authUser.id);
  }

  // Recover an abandoned stopwatch session — this has to live at the TRUE
  // top level, not inside the Focus component, because Focus itself only
  // mounts once you actually navigate to the Focus tab. Someone who closed
  // the site mid-session and reopens it landing anywhere else (Dashboard,
  // Tasks, wherever) would never trigger a check that lived inside Focus.
  // Uses lastHeartbeatAt (refreshed every few seconds while running) rather
  // than "now" for both the elapsed-time math and completed_at — so a long
  // gap between closing and reopening isn't wrongly counted as focus time,
  // and the session lands on the day it actually happened, not today.
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const liveRaw = sessionStorage.getItem(STOPWATCH_STORAGE_KEY);
        if (liveRaw) {
          // Normally sessionStorage having data means "same tab still
          // going" — but some browsers' "continue where you left off"
          // startup setting can restore sessionStorage across an actual
          // close, which would fool this into skipping recovery entirely.
          // A heartbeat that's much older than the 5s refresh interval
          // means it wasn't actually still running, whatever sessionStorage
          // claims — fall through to the recovery path below instead.
          const live = JSON.parse(liveRaw);
          const liveHeartbeatAge = live.lastHeartbeatAt ? (Date.now() - new Date(live.lastHeartbeatAt).getTime()) / 1000 : 0;
          if (!(live.running && liveHeartbeatAge > 30)) return; // genuinely still live — let StopwatchMode resume it normally
        }
        const backupRaw = liveRaw || localStorage.getItem(STOPWATCH_STORAGE_KEY);
        if (!backupRaw) return;
        const saved = JSON.parse(backupRaw);
        const lastKnownAt = saved.lastHeartbeatAt ? new Date(saved.lastHeartbeatAt).getTime() : Date.now();
        const abandonedSeconds =
          saved.running && saved.segmentStartedAt
            ? Math.floor((saved.accumulatedSeconds || 0) + (lastKnownAt - new Date(saved.segmentStartedAt).getTime()) / 1000)
            : Math.floor(saved.accumulatedSeconds || 0);
        sessionStorage.removeItem(STOPWATCH_STORAGE_KEY);
        localStorage.removeItem(STOPWATCH_STORAGE_KEY);
        if (abandonedSeconds > 0) {
          const { data: { user: activeUser } } = await supabase.auth.getUser();
          if (activeUser) {
            await supabase.from("study_sessions").insert({
              user_id: activeUser.id,
              timer_type: "stopwatch",
              duration_seconds: abandonedSeconds,
              focused_seconds: abandonedSeconds,
              break_seconds: 0,
              started_at: saved.sessionStartedAt || new Date(lastKnownAt).toISOString(),
              completed_at: new Date(lastKnownAt).toISOString(),
              group_ids: [],
            });
            setStatsRefreshKey((k) => k + 1);
          }
        }
      } catch (e) {
        console.error("Failed to recover abandoned stopwatch session:", e);
      }
    })();
  }, [user]);

  // Watches this account's own profile row in real time — the moment
  // active_session_id changes to something that isn't this tab's own ID,
  // a newer login happened somewhere else, so this tab signs itself out.
  useEffect(() => {
    if (!user) return;
    let channel;
    let cancelled = false;
    (async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser || cancelled) return;
      channel = supabase
        .channel(`session-guard-${authUser.id}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "profiles", filter: `user_id=eq.${authUser.id}` },
          (payload) => {
            const newId = payload.new?.active_session_id;
            if (newId && mySessionIdRef.current && newId !== mySessionIdRef.current) {
              setKickedOut(true);
            }
          }
        )
        .subscribe();
    })();
    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [user]);
  const [kickedOutMessage, setKickedOutMessage] = useState("");

  useEffect(() => {
    if (!kickedOut) return;
    (async () => {
      // Save whatever this tab's stopwatch had racked up BEFORE signing
      // out — this is what makes "started the timer somewhere else" mean
      // "the old one ends and gets saved," not "the old one just vanishes
      // whenever that tab happens to be looked at again."
      let savedSeconds = 0;
      try {
        const raw = sessionStorage.getItem(STOPWATCH_STORAGE_KEY) || localStorage.getItem(STOPWATCH_STORAGE_KEY);
        if (raw) {
          const saved = JSON.parse(raw);
          savedSeconds =
            saved.running && saved.segmentStartedAt
              ? Math.floor((saved.accumulatedSeconds || 0) + (Date.now() - new Date(saved.segmentStartedAt).getTime()) / 1000)
              : Math.floor(saved.accumulatedSeconds || 0);
          if (savedSeconds > 0) {
            const { data: { user: activeUser } } = await supabase.auth.getUser();
            if (activeUser) {
              await supabase.from("study_sessions").insert({
                user_id: activeUser.id,
                timer_type: "stopwatch",
                duration_seconds: savedSeconds,
                focused_seconds: savedSeconds,
                break_seconds: 0,
                started_at: saved.sessionStartedAt || new Date().toISOString(),
                completed_at: new Date().toISOString(),
                group_ids: [],
              });
            }
          }
        }
      } catch (e) {
        console.error("Failed to auto-save superseded timer session:", e);
      } finally {
        try {
          sessionStorage.removeItem(STOPWATCH_STORAGE_KEY);
          localStorage.removeItem(STOPWATCH_STORAGE_KEY);
        } catch {}
      }

      await supabase.auth.signOut();
      setUser(null);
      setScreen("landing");
      setKickedOutMessage(
        savedSeconds > 0
          ? `Signed in elsewhere — your ${formatDuration(savedSeconds)} timer here was saved automatically.`
          : "You were signed out because this account was signed in somewhere else."
      );
    })();
  }, [kickedOut]);

  // On first load, check whether Supabase already has a valid session (e.g. after a refresh)
  // so the person doesn't get bounced back to the landing page every time.
  async function checkRealSessionState(providedSession) {
    const session = providedSession !== undefined ? providedSession : (await supabase.auth.getSession()).data.session;
    const sessionUser = session?.user;
    if (sessionUser) {
      setUser({
        name: sessionUser.user_metadata?.full_name || sessionUser.email.split("@")[0],
        email: sessionUser.email,
      });
      setScreen("app");
      claimSession();
      const { data: profileRow } = await supabase.from("profiles").select("premium_tier").eq("user_id", sessionUser.id).maybeSingle();
      setMyGlobalTier(profileRow?.premium_tier || "free");
    } else {
      setUser(null);
      setMyGlobalTier(null);
      setScreen("landing");
    }
  }

  useEffect(() => {
    // onAuthStateChange's first callback (event "INITIAL_SESSION") fires
    // once Supabase's client has genuinely finished restoring the session
    // from storage — this is what a hard refresh actually needs, since a
    // one-off getSession() call made immediately on mount can race ahead
    // of that restoration and momentarily see "no session" even though a
    // valid one exists, which is exactly what was showing Free instead of
    // the real Pro/Basic tier right after a refresh.
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      checkRealSessionState(session);
    });
    return () => authListener.subscription.unsubscribe();
  }, []);

  // A kicked-out tab (signed out because this account logged in somewhere
  // else) can get stuck showing a STALE authenticated view if the browser
  // restores it from its back-forward cache via the Back button — bfcache
  // restores a frozen memory snapshot without running any new code, so it
  // can show "still logged in" content even though the session was
  // actually invalidated. Re-checking the real auth state on every bfcache
  // restore closes that gap.
  useEffect(() => {
    function handlePageShow(e) {
      if (e.persisted) checkRealSessionState();
    }
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

  const handleAuth = (u) => {
    setUser(u);
    setScreen("app");
    setTab("dashboard");
    claimSession();
  };

  const [confirmingLogout, setConfirmingLogout] = useState(false);

  const handleLogout = () => setConfirmingLogout(true);

  const performLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setScreen("landing");
    setConfirmingLogout(false);
  };

  const handleSessionSaved = useCallback(
    (focusedSeconds = 0) => {
      setStatsRefreshKey((k) => k + 1);
      setTotalFocusedSeconds((prevTotal) => {
        if (prevTotal === null) return prevTotal; // haven't loaded a baseline yet — skip level-up check this once
        const newTotal = prevTotal + focusedSeconds;
        const before = computeGrowth(Math.floor(prevTotal / 60) * GROWTH_XP_PER_MINUTE).current;
        const after = computeGrowth(Math.floor(newTotal / 60) * GROWTH_XP_PER_MINUTE).current;
        if (after.level > before.level) {
          setLevelUpInfo({ from: before, to: after });
        }
        return newTotal;
      });
    },
    []
  );

  if (screen === "checking") {
    return <div className="min-h-screen bg-[var(--bg)]" />;
  }

  if (screen === "landing") {
    return (
      <>
        <Landing
          onStart={() => setScreen("app")}
          user={user}
          onOpenAuth={(mode) => {
            setAuthMode(mode);
            setAuthModalOpen(true);
          }}
          onLogout={handleLogout}
        />
        {kickedOutMessage && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[400] bg-[var(--surface-solid)] border border-amber-500/40 rounded-xl px-4 py-3 shadow-2xl shadow-black/40 flex items-center gap-2 max-w-[90vw]">
            <AlertTriangle size={16} className="text-amber-400 shrink-0" />
            <p className="text-sm text-[var(--text-secondary-strong)]">{kickedOutMessage}</p>
            <button onClick={() => setKickedOutMessage("")} className="text-[var(--text-faint)] hover:text-[var(--text-primary)] ml-1">
              <X size={14} />
            </button>
          </div>
        )}
        <AuthOverlays
          authModalOpen={authModalOpen}
          setAuthModalOpen={setAuthModalOpen}
          authMode={authMode}
          setAuthMode={setAuthMode}
          handleAuth={handleAuth}
          confirmingLogout={confirmingLogout}
          setConfirmingLogout={setConfirmingLogout}
          performLogout={performLogout}
        />
      </>
    );
  }

  const isGuest = !user;
  // Force new SIGNED-IN users without a profile onto the Profile tab, no
  // matter what they click — Settings stays reachable so they can still
  // log out. Guests (browsing without an account at all) skip this
  // entirely — there's no profile to set up until they actually sign up.
  const effectiveTab = !isGuest && hasProfile === false && tab !== "profile" && tab !== "settings" ? "profile" : tab;

  // No separate "auth" screen/history level at all anymore — just a modal
  // over whatever's already on screen (landing or app), so there are only
  // ever two real levels for Back to deal with.
  const requireAuth = (fn) => {
    if (isGuest) {
      setAuthMode("signup");
      setAuthModalOpen(true);
      return;
    }
    fn();
  };

  return (
    <AuthGateContext.Provider value={{ isGuest, requireAuth }}>
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)] flex">
      <style>{`
        .glow-accent-50 { box-shadow: 0 10px 15px -3px rgb(var(--accent-rgb) / 0.5), 0 4px 6px -4px rgb(var(--accent-rgb) / 0.5); }
        .glow-accent-40 { box-shadow: 0 10px 15px -3px rgb(var(--accent-rgb) / 0.4), 0 4px 6px -4px rgb(var(--accent-rgb) / 0.4); }
        .glow-accent-30 { box-shadow: 0 10px 15px -3px rgb(var(--accent-rgb) / 0.3), 0 4px 6px -4px rgb(var(--accent-rgb) / 0.3); }
        .glow-accent-20 { box-shadow: 0 10px 15px -3px rgb(var(--accent-rgb) / 0.2), 0 4px 6px -4px rgb(var(--accent-rgb) / 0.2); }
        .glow-accent-50:hover { box-shadow: 0 10px 15px -3px rgb(var(--accent-rgb) / 0.6), 0 4px 6px -4px rgb(var(--accent-rgb) / 0.6); }
        .hide-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input[type=number] { -moz-appearance: textfield; }
      `}</style>
      <aside className="hidden md:flex md:w-60 lg:w-64 shrink-0 border-r border-[var(--border-subtle)] flex-col p-3 h-screen sticky top-0 overflow-y-auto hide-scrollbar">
        <div className="px-2 py-2.5 mb-2 border-b border-[var(--border-subtle)] flex items-center justify-start">
          <Logo size={22} />
        </div>
        <nav className="flex-1 space-y-0.5">
          {NAV.map((n) => (
            <button
              key={n.key}
              onClick={() => {
                if (n.key === "settings") setSettingsInitialView(null);
                setTab(n.key);
              }}
              className={
                "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors " +
                (effectiveTab === n.key ? "bg-[rgb(var(--accent-rgb)/0.1)] text-[var(--accent-text)] border border-[rgb(var(--accent-rgb)/0.2)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-solid)]")
              }
            >
              <n.icon size={15} />
              <span className="flex-1 text-left">{n.label}</span>
              {n.requiredTier && tierRank(myGlobalTier) < tierRank(n.requiredTier) && <Crown size={12} className="text-amber-400 shrink-0" />}
              {n.key === "friends" && pendingFriendRequests > 0 && (
                <span className="bg-[var(--accent)] text-white text-[10px] font-semibold rounded-full h-5 min-w-[18px] px-1 flex items-center justify-center">
                  {pendingFriendRequests}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="border-t border-[var(--border-subtle)] pt-2 mt-2">
          {isGuest ? (
            <button
              onClick={() => requireAuth(() => {})}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white transition-colors"
            >
              Sign in
            </button>
          ) : (
            <>
              <button
                onClick={() => {
                  setSettingsInitialView("account");
                  setTab("settings");
                }}
                className="w-full flex items-center gap-2.5 px-2 py-1.5 mb-1 rounded-lg border border-transparent hover:border-[var(--border)] hover:bg-white/10 transition-colors text-left cursor-pointer"
              >
                <div className="h-7 w-7 rounded-full bg-gradient-to-br from-[var(--accent)] to-[var(--accent-hover)] flex items-center justify-center text-[var(--text-primary)] text-xs font-medium shrink-0">
                  {user.name[0]?.toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-[var(--text-primary)] truncate leading-tight">{user.name}</p>
                  <p className="text-[11px] text-[var(--text-muted)] truncate leading-tight">{user.email}</p>
                </div>
              </button>
              <button onClick={handleLogout} className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-[var(--text-secondary)] border border-transparent hover:text-red-500 hover:border-red-500 transition-colors">
                <LogOut size={15} /> Log out
              </button>
            </>
          )}
        </div>
      </aside>

      <div className="md:hidden fixed top-0 inset-x-0 z-20 bg-[var(--overlay-bg-90)] backdrop-blur border-b border-[var(--border-subtle)] flex items-center justify-between px-4 py-2">
        <Logo size={24} />
        <button onClick={() => setMobileMenuOpen(true)} className="text-[var(--text-secondary-strong)]">
          <Menu size={22} />
        </button>
      </div>

      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-30 bg-[var(--overlay-bg-95)] backdrop-blur p-5 overflow-y-auto">
          <div className="flex items-center justify-between mb-6">
            <Logo size={26} />
            <button onClick={() => setMobileMenuOpen(false)} className="text-[var(--text-secondary-strong)]">
              <X size={22} />
            </button>
          </div>
          <div className="space-y-1">
            {NAV.map((n) => (
              <button
                key={n.key}
                onClick={() => {
                  if (n.key === "settings") setSettingsInitialView(null);
                  setTab(n.key);
                  setMobileMenuOpen(false);
                }}
                className={
                  "w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium " +
                  (effectiveTab === n.key ? "bg-[rgb(var(--accent-rgb)/0.1)] text-[var(--accent-text)]" : "text-[var(--text-secondary-strong)]")
                }
              >
                <n.icon size={18} />
                <span className="flex-1 text-left">{n.label}</span>
                {n.requiredTier && tierRank(myGlobalTier) < tierRank(n.requiredTier) && <Crown size={13} className="text-amber-400 shrink-0" />}
                {n.key === "friends" && pendingFriendRequests > 0 && (
                  <span className="bg-[var(--accent)] text-white text-[10px] font-semibold rounded-full h-5 min-w-[20px] px-1 flex items-center justify-center">
                    {pendingFriendRequests}
                  </span>
                )}
              </button>
            ))}
            <button onClick={handleLogout} className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm text-red-400 mt-4 mb-6 border-t border-[var(--border-subtle)] pt-5">
              <LogOut size={18} /> Log out
            </button>
          </div>
        </div>
      )}

      <AchievementWatcher refreshKey={statsRefreshKey} goTo={setTab} />

      <main className={"flex-1 min-w-0 px-5 md:px-8 pt-20 md:pt-8 pb-24 md:pb-8 " + (effectiveTab === "habits" ? "max-w-7xl" : "max-w-5xl")}>
        {effectiveTab === "dashboard" && (
          <Dashboard
            user={user}
            goTo={setTab}
            refreshKey={statsRefreshKey}
            goToAbout={() => {
              setSettingsInitialView("about");
              setTab("settings");
            }}
          />
        )}
        <div className={effectiveTab === "focus" ? "" : "hidden"}>
          <Focus onSessionSaved={handleSessionSaved} isActive={effectiveTab === "focus"} />
        </div>
        {effectiveTab === "tasks" && <Tasks goTo={setTab} />}
        {effectiveTab === "events" && <EventsPage goTo={setTab} />}
        {effectiveTab === "stats" && <Statistics refreshKey={statsRefreshKey} />}
        {effectiveTab === "insights" && <Insights refreshKey={statsRefreshKey} goTo={setTab} />}
        {effectiveTab === "habits" && <HabitTracker refreshKey={statsRefreshKey} goTo={setTab} />}
        {effectiveTab === "growth" && <Growth refreshKey={statsRefreshKey} goTo={setTab} />}
        {effectiveTab === "achievements" && <AchievementsTab refreshKey={statsRefreshKey} onLevelUp={setLevelUpInfo} />}
        {effectiveTab === "profile" && (
          <Profile
            refreshKey={statsRefreshKey}
            onProfileReady={() => setHasProfile(true)}
            goToAccountSettings={() => {
              setSettingsInitialView("account");
              setTab("settings");
            }}
          />
        )}
        {effectiveTab === "friends" && <Friends refreshKey={statsRefreshKey} goTo={setTab} />}
        {effectiveTab === "leaderboard" && <Leaderboard refreshKey={statsRefreshKey} />}
        {effectiveTab === "groups" && <Groups refreshKey={statsRefreshKey} goTo={setTab} />}
        {effectiveTab === "pricing" && (
          <Pricing
            goToLegal={() => {
              setSettingsInitialView("legal");
              setTab("settings");
            }}
          />
        )}
        {effectiveTab === "settings" && (
          <Settings
            user={user}
            onLogout={handleLogout}
            theme={theme}
            onSelectTheme={selectTheme}
            soundEnabled={soundEnabled}
            onToggleSound={toggleSoundEnabled}
            selectedSound={selectedSound}
            onSelectSound={selectSound}
            themeSoundError={themeSoundError}
            initialView={settingsInitialView}
            goTo={setTab}
          />
        )}
      </main>

      <nav className="md:hidden fixed bottom-0 inset-x-0 z-20 bg-[var(--overlay-bg-95)] backdrop-blur border-t border-[var(--border-subtle)] flex items-center justify-around py-2">
        {NAV.filter((n) => MOBILE_NAV_KEYS.includes(n.key)).map((n) => (
          <button
            key={n.key}
            onClick={() => {
              if (n.key === "settings") setSettingsInitialView(null);
              setTab(n.key);
            }}
            className={"flex flex-col items-center gap-1 px-3 py-1.5 " + (effectiveTab === n.key ? "text-[var(--accent-text)]" : "text-[var(--text-muted)]")}
          >
            <n.icon size={19} />
            <span className="text-[10px]">{n.label}</span>
          </button>
        ))}
      </nav>

      <LevelUpModal info={levelUpInfo} onClose={() => setLevelUpInfo(null)} />

      <AuthOverlays
        authModalOpen={authModalOpen}
        setAuthModalOpen={setAuthModalOpen}
        authMode={authMode}
        setAuthMode={setAuthMode}
        handleAuth={handleAuth}
        confirmingLogout={confirmingLogout}
        setConfirmingLogout={setConfirmingLogout}
        performLogout={performLogout}
      />
      <CookieConsentBanner />
    </div>
    </AuthGateContext.Provider>
  );
}