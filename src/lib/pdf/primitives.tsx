import { Image, Text, View } from "@react-pdf/renderer";

import { LOGO, s } from "./theme.ts";

/**
 * The report's drawn pieces. Split from ./theme.ts so this file exports only
 * components — mixing constants in breaks Fast Refresh, and the lint gate
 * rightly refuses it.
 */
/**
 * The masthead, fixed so it repeats on every page as the Word header does.
 *
 * `logo` is overridable because the offline preview script renders outside a
 * server, where the default `/report/...` path resolves to nothing.
 */
export function ReportHeader({ logo = LOGO }: { logo?: string }) {
    return (
        <View style={s.header} fixed>
            <View style={s.headerRow}>
                <View>
                    <Text style={s.headerTitle}>SITE OCULAR REPORT</Text>
                    <Text style={s.headerSub}>LAMPARA ELECTRICAL INSTALLATION SERVICES</Text>
                </View>
                <Image style={s.headerLogo} src={logo} />
            </View>
            <View style={s.headerRule} />
        </View>
    );
}

export function Band({ children }: { children: string }) {
    return (
        <View style={s.band}>
            <Text style={s.bandText}>{children}</Text>
        </View>
    );
}

/**
 * One tick box.
 *
 * The mark is a drawn square, not a character. A glyph inside an 8pt box is at
 * the mercy of the font's metrics and of the renderer's line box, and the
 * failure mode is silent — a ticked option printing as unticked, which is worse
 * than any styling flaw on this page.
 */
export function Check({ on, label }: { on: boolean; label: string }) {
    return (
        <View style={s.checkWrap}>
            <View style={s.box}>{on ? <View style={s.boxMark} /> : null}</View>
            <Text style={s.checkLabel}>{label}</Text>
        </View>
    );
}

