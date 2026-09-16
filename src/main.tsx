import { createRoot } from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import App from "./App.tsx";

// Android System WebView's backdrop-filter support is device-dependent (it's
// updated separately from the app, and older versions accept the CSS without
// rendering it) — index.css's [data-platform="android"] rules use this to
// skip the blur entirely there rather than gambling per-device. iOS/web keep
// attempting it; both have consistent, reliable support.
document.documentElement.dataset.platform = Capacitor.getPlatform();

createRoot(document.getElementById("root")!).render(<App />);
