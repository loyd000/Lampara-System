// Detect dark mode preference and set the class before next-themes loads.
// This avoids a flash of unstyled content (FOUC) when the page loads.
//
// A separate file, not an inline <script>, on purpose: it lets the CSP in
// vercel.json use a plain `script-src 'self'` with no 'unsafe-inline' —
// an inline script here would otherwise force that CSP directive open for
// every script on the page, not just this one.
try {
    let theme = localStorage.getItem("theme");
    if (theme === "system" || !theme) {
        let prefersDark = window.matchMedia(
            "(prefers-color-scheme: dark)",
        ).matches;
        theme = prefersDark ? "dark" : "light";
    }
    document.documentElement.classList.add(theme);
} catch (e) { }
