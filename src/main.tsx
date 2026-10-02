import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// styles.css first: it holds the primitives (.btn, .input, .menu…) that component
// stylesheets override, and Vite emits CSS in import order
import "./styles.css";
// --font-ui names Pretendard first: serve it, or a phone without it installed falls back to the
// system font. The dynamic subset splits it by unicode-range, so a page loads only the glyphs it uses
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "katex/dist/katex.min.css";
import { App } from "./App.tsx";
import { SettingsProvider } from "./lib/settings.ts";
import "./lib/viewport.ts";

const container = document.getElementById("root");
if (!container) throw new Error("#root is missing from index.html");

createRoot(container).render(
  <StrictMode>
    <SettingsProvider>
      <App />
    </SettingsProvider>
  </StrictMode>,
);
