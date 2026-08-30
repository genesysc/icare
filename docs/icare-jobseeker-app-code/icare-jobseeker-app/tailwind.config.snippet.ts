// Merge this into your existing tailwind.config.ts theme.extend
// Keeps the brand tokens as named utilities instead of scattering hex codes
// across components — e.g. bg-icare-purple, text-icare-teal-dark.

export const icareTheme = {
  colors: {
    icare: {
      purple: "#330072",
      "purple-dark": "#25004F",
      teal: "#00A499",
      "teal-dark": "#00726B",
      lavender: "#F4F1F8",
      ink: "#1C0F33",
      mute: "#6B6280",
      line: "#E2DEEA",
    },
    badge: {
      "verified-bg": "#E4F5F3",
      "verified-fg": "#00635D",
      "evidenced-bg": "#EFE9F7",
      "evidenced-fg": "#330072",
      "derived-bg": "#F1F0F4",
      "derived-fg": "#655D78",
      "declared-fg": "#655D78",
    },
  },
  fontFamily: {
    display: ["Fraunces", "serif"],
    body: ["Public Sans", "system-ui", "sans-serif"],
    mono: ["IBM Plex Mono", "monospace"],
  },
};
