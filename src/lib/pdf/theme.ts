import { StyleSheet } from "@react-pdf/renderer";

/**
 * The Site Ocular Report's visual constants and building blocks.
 *
 * Every colour here was read out of the office's own Word template
 * (`public/Ocular report Template.docx`) rather than matched by eye: the band
 * blue and dark navy come from its shading fills, the title teal and rule
 * orange from its theme's accent1 and accent2. The logo and compass are the
 * same JPEGs the template embeds.
 *
 * Type is Helvetica — react-pdf's built-in, and the closest metric match to the
 * template's Arial without shipping a font file.
 */

export const C = {
    band: "#00328C",
    dark: "#0E2841",
    teal: "#156082",
    orange: "#E97132",
    line: "#000000",
    rule: "#7F7F7F",
    ink: "#000000",
    white: "#FFFFFF",
} as const;

export const LOGO = "/report/lampara-logo.jpg";
export const COMPASS = "/report/compass.jpg";

export const s = StyleSheet.create({
    page: {
        paddingTop: 92,
        paddingBottom: 44,
        paddingHorizontal: 48,
        fontFamily: "Helvetica",
        fontSize: 8.5,
        color: C.ink,
        // NOTE: no `lineHeight` here on purpose. In react-pdf 4.9 a lineHeight
        // on the Page style is inherited by `fixed` children and makes a
        // bottom-anchored one vanish from every page — silently, with no
        // error. `footer` below is bottom-anchored (`header` survives it
        // because it's top-anchored, which is exactly what made this easy to
        // miss). Prose line spacing lives on the text styles instead.
    },

    // ── Running header, repeated on every page ────────────────────────────
    header: {
        position: "absolute",
        top: 28,
        left: 48,
        right: 48,
    },
    headerRow: {
        flexDirection: "row",
        alignItems: "flex-start",
        justifyContent: "space-between",
    },
    headerTitle: {
        fontFamily: "Helvetica-BoldOblique",
        fontSize: 17,
        // Without an explicit line box the 17pt title's descent runs into the
        // subtitle below it.
        lineHeight: 1.1,
        color: C.teal,
        letterSpacing: 0.2,
    },
    headerSub: {
        fontSize: 7,
        lineHeight: 1.1,
        color: C.ink,
        marginTop: 2,
        letterSpacing: 0.3,
    },
    headerLogo: { width: 132 },
    headerRule: {
        marginTop: 6,
        height: 1.6,
        backgroundColor: C.orange,
    },

    // ── Section band ─────────────────────────────────────────────────────
    band: {
        backgroundColor: C.band,
        paddingVertical: 3.5,
        marginTop: 12,
        marginBottom: 7,
    },
    bandText: {
        color: C.white,
        fontFamily: "Helvetica-Bold",
        fontSize: 9,
        textAlign: "center",
        letterSpacing: 0.4,
    },

    // ── Fill-in lines ────────────────────────────────────────────────────
    fill: {
        borderBottomWidth: 0.7,
        borderBottomColor: C.ink,
        paddingBottom: 0.5,
        paddingLeft: 3,
    },
    fillText: { fontSize: 8.5, lineHeight: 1.35 },

    // ── Tick boxes ───────────────────────────────────────────────────────
    checkWrap: { flexDirection: "row", alignItems: "center", marginRight: 12 },
    box: {
        width: 8.5,
        height: 8.5,
        borderWidth: 0.8,
        borderColor: C.ink,
        marginRight: 3.5,
        alignItems: "center",
        justifyContent: "center",
    },
    boxMark: {
        width: 4.5,
        height: 4.5,
        backgroundColor: C.ink,
    },
    checkLabel: { fontSize: 8.5 },

    // ── Tables ───────────────────────────────────────────────────────────
    table: { borderWidth: 0.8, borderColor: C.line, marginTop: 4 },
    tr: { flexDirection: "row", borderBottomWidth: 0.8, borderBottomColor: C.line },
    trLast: { flexDirection: "row" },
    td: {
        paddingVertical: 4,
        paddingHorizontal: 5,
        borderRightWidth: 0.8,
        borderRightColor: C.line,
        justifyContent: "center",
    },
    tdLast: { paddingVertical: 4, paddingHorizontal: 5, justifyContent: "center" },

    // ── Photo pages ──────────────────────────────────────────────────────
    photoHeading: {
        fontFamily: "Helvetica-Bold",
        fontSize: 9.5,
        color: C.dark,
        letterSpacing: 0.3,
        marginTop: 14,
        marginBottom: 4,
    },
    photoRule: { height: 1, backgroundColor: C.dark, marginBottom: 7 },
    photoFrame: {
        borderWidth: 0.8,
        borderColor: C.line,
        alignItems: "center",
        justifyContent: "center",
        padding: 4,
    },
    photoEmpty: {
        fontSize: 7.5,
        color: C.rule,
        fontFamily: "Helvetica-Oblique",
    },

    // ── Sign-off ─────────────────────────────────────────────────────────
    signLabel: {
        backgroundColor: C.band,
        color: C.white,
        fontFamily: "Helvetica-Bold",
        fontSize: 8,
        paddingVertical: 5,
        paddingHorizontal: 5,
    },
    footer: {
        position: "absolute",
        bottom: 22,
        left: 48,
        right: 48,
        flexDirection: "row",
        justifyContent: "space-between",
        fontSize: 6.5,
        color: C.rule,
    },
});
