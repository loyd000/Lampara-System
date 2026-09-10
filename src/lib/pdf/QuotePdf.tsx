import {
    Document,
    Image,
    Page,
    StyleSheet,
    Text,
    View,
} from "@react-pdf/renderer";

import type { QuotePdfData } from "./quote-data.ts";
import { C, LOGO } from "./theme.ts";

const styles = StyleSheet.create({
    page: {
        paddingTop: 36,
        paddingBottom: 36,
        paddingHorizontal: 40,
        fontFamily: "Helvetica",
        fontSize: 8.5,
        color: C.ink,
        lineHeight: 1.35,
    },

    // ── Letterhead ────────────────────────────────────────────────────────
    header: {
        marginBottom: 12,
    },
    headerRow: {
        flexDirection: "row",
        alignItems: "flex-start",
        justifyContent: "space-between",
    },
    logo: {
        width: 120,
    },
    companyDetails: {
        alignItems: "flex-end",
        maxWidth: 320,
    },
    companyName: {
        fontFamily: "Helvetica-Bold",
        fontSize: 10,
        color: C.dark,
        textTransform: "uppercase",
        letterSpacing: 0.3,
    },
    preparerTag: {
        fontFamily: "Helvetica-Bold",
        fontSize: 8,
        color: C.teal,
        marginTop: 1,
    },
    addressLine: {
        fontSize: 7.2,
        color: "#444444",
        textAlign: "right",
        marginTop: 1,
    },
    contactLine: {
        fontSize: 7.2,
        color: "#444444",
        textAlign: "right",
        marginTop: 1.5,
    },
    headerRule: {
        marginTop: 8,
        height: 2,
        backgroundColor: C.orange,
    },

    // ── Document Title & Meta ─────────────────────────────────────────────
    titleRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-end",
        marginTop: 12,
        marginBottom: 10,
    },
    docTitle: {
        fontFamily: "Helvetica-Bold",
        fontSize: 18,
        color: C.teal,
        letterSpacing: 0.5,
    },
    metaBlock: {
        alignItems: "flex-end",
    },
    metaText: {
        fontSize: 8.5,
        fontFamily: "Helvetica-Bold",
        color: C.dark,
    },
    metaSubText: {
        fontSize: 8,
        color: "#555555",
        marginTop: 1,
    },

    // ── To Box ────────────────────────────────────────────────────────────
    toCard: {
        backgroundColor: "#F8FAFC",
        borderWidth: 0.8,
        borderColor: "#E2E8F0",
        borderRadius: 4,
        padding: 8,
        marginBottom: 10,
    },
    toLabel: {
        fontSize: 7.5,
        fontFamily: "Helvetica-Bold",
        color: C.teal,
        textTransform: "uppercase",
        letterSpacing: 0.5,
        marginBottom: 2,
    },
    toName: {
        fontFamily: "Helvetica-Bold",
        fontSize: 10,
        color: C.dark,
    },
    toDetail: {
        fontSize: 8,
        color: "#475569",
        marginTop: 1,
    },

    introText: {
        fontSize: 8.5,
        marginBottom: 8,
        color: "#334155",
    },
    introBold: {
        fontFamily: "Helvetica-Bold",
        color: C.dark,
    },

    // ── Itemised Table ────────────────────────────────────────────────────
    table: {
        marginTop: 4,
        marginBottom: 10,
        borderWidth: 0.8,
        borderColor: "#CBD5E1",
        borderRadius: 3,
        overflow: "hidden",
    },
    tableHeader: {
        flexDirection: "row",
        backgroundColor: C.teal,
        paddingVertical: 5,
        paddingHorizontal: 6,
        alignItems: "center",
    },
    tableHeaderCol: {
        color: C.white,
        fontFamily: "Helvetica-Bold",
        fontSize: 8,
        textTransform: "uppercase",
        letterSpacing: 0.3,
    },
    tableRow: {
        flexDirection: "row",
        borderTopWidth: 0.5,
        borderTopColor: "#E2E8F0",
        paddingVertical: 5,
        paddingHorizontal: 6,
        alignItems: "flex-start",
    },
    tableRowAlt: {
        backgroundColor: "#F8FAFC",
    },
    colNum: { width: 24, fontSize: 8, textAlign: "center" },
    colDesc: { flex: 1, fontSize: 8, paddingRight: 6 },
    colQty: { width: 55, fontSize: 8, textAlign: "center" },
    colPrice: { width: 85, fontSize: 8, textAlign: "right" },
    colTotal: { width: 90, fontSize: 8, textAlign: "right", fontFamily: "Helvetica-Bold" },

    totalSection: {
        flexDirection: "row",
        justifyContent: "flex-end",
        alignItems: "center",
        paddingVertical: 6,
        paddingHorizontal: 10,
        backgroundColor: "#F1F5F9",
        borderTopWidth: 1.5,
        borderTopColor: C.teal,
    },
    grandTotalLabel: {
        fontSize: 9.5,
        fontFamily: "Helvetica-Bold",
        color: C.dark,
        marginRight: 14,
        letterSpacing: 0.4,
    },
    grandTotalAmount: {
        fontSize: 12,
        fontFamily: "Helvetica-Bold",
        color: C.teal,
    },

    closingText: {
        fontSize: 8,
        fontStyle: "italic",
        color: "#475569",
        marginBottom: 14,
    },

    // ── Terms & Conditions ────────────────────────────────────────────────
    sectionTitle: {
        fontSize: 10.5,
        fontFamily: "Helvetica-Bold",
        color: C.teal,
        borderBottomWidth: 1,
        borderBottomColor: C.teal,
        paddingBottom: 2,
        marginBottom: 8,
        marginTop: 4,
        textTransform: "uppercase",
        letterSpacing: 0.4,
    },
    termsGrid: {
        flexDirection: "row",
        gap: 12,
    },
    termsCol: {
        flex: 1,
    },
    termItem: {
        marginBottom: 7,
    },
    termHeading: {
        fontFamily: "Helvetica-Bold",
        fontSize: 7.5,
        color: C.dark,
        marginBottom: 1.5,
    },
    termBody: {
        fontSize: 7,
        color: "#334155",
        lineHeight: 1.25,
    },
    termBullet: {
        fontSize: 7,
        color: "#334155",
        paddingLeft: 6,
        lineHeight: 1.25,
    },

    // ── Payment & Signatures ──────────────────────────────────────────────
    paySignBox: {
        flexDirection: "row",
        marginTop: 12,
        paddingTop: 10,
        borderTopWidth: 1,
        borderTopColor: "#CBD5E1",
        gap: 20,
    },
    paymentBox: {
        flex: 1,
        backgroundColor: "#F8FAFC",
        borderWidth: 0.8,
        borderColor: "#E2E8F0",
        borderRadius: 4,
        padding: 8,
    },
    paymentTitle: {
        fontSize: 8,
        fontFamily: "Helvetica-Bold",
        color: C.teal,
        textTransform: "uppercase",
        marginBottom: 4,
    },
    paymentDetail: {
        fontSize: 7.5,
        color: "#334155",
        marginBottom: 1.5,
    },
    signBox: {
        flex: 1,
        justifyContent: "space-between",
        paddingTop: 4,
    },
    signTitle: {
        fontSize: 7.5,
        color: "#475569",
        marginBottom: 2,
    },
    signName: {
        fontFamily: "Helvetica-Bold",
        fontSize: 8.5,
        color: C.dark,
        marginBottom: 16,
    },
    signCompany: {
        fontSize: 7.5,
        fontFamily: "Helvetica-Bold",
        color: C.dark,
    },
    signLine: {
        borderBottomWidth: 0.8,
        borderBottomColor: C.ink,
        marginTop: 24,
        marginBottom: 3,
    },
    signLineLabel: {
        fontSize: 7,
        color: "#64748B",
        textAlign: "center",
        textTransform: "uppercase",
        letterSpacing: 0.3,
    },

    // ── Photos Page ───────────────────────────────────────────────────────
    photoCard: {
        borderWidth: 0.8,
        borderColor: "#CBD5E1",
        borderRadius: 4,
        overflow: "hidden",
        marginBottom: 14,
    },
    photoHeading: {
        backgroundColor: C.teal,
        color: C.white,
        fontFamily: "Helvetica-Bold",
        fontSize: 8.5,
        paddingVertical: 4,
        paddingHorizontal: 8,
    },
    photoWell: {
        height: 230,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#F1F5F9",
        padding: 6,
    },
    photoImg: {
        maxWidth: "100%",
        maxHeight: "100%",
        objectFit: "contain",
    },
    photoCaption: {
        fontSize: 7.5,
        color: "#475569",
        padding: 5,
        backgroundColor: "#FFFFFF",
        textAlign: "center",
    },

    pageFooter: {
        position: "absolute",
        bottom: 16,
        left: 40,
        right: 40,
        flexDirection: "row",
        justifyContent: "space-between",
        borderTopWidth: 0.5,
        borderTopColor: "#E2E8F0",
        paddingTop: 4,
    },
    footerText: {
        fontSize: 7,
        color: "#94A3B8",
    },
});

export function QuotePdf({
    data,
    docTitle,
    logo = LOGO,
}: {
    data: QuotePdfData;
    /**
     * The PDF's `/Title`. Chrome's print preview pre-fills the "Save as PDF"
     * filename from it, so it has to match the name the button offers.
     */
    docTitle?: string;
    logo?: string;
}) {
    const hasPhotos = Boolean(data.inverterBatteryPhoto || data.roofPanelPhoto);

    return (
        <Document title={docTitle ?? data.quotationNo} author={data.preparerName}>
            {/* ════ PAGE 1: Proposal & Itemised Quotation ════ */}
            <Page size="A4" style={styles.page}>
                {/* Header */}
                <View style={styles.header}>
                    <View style={styles.headerRow}>
                        <Image style={styles.logo} src={logo} />
                        <View style={styles.companyDetails}>
                            <Text style={styles.companyName}>
                                Lampara Electrical Installation Services
                            </Text>
                            <Text style={styles.preparerTag}>
                                {data.preparerName} — Sales
                            </Text>
                            <Text style={styles.addressLine}>
                                Maligaya St. Brgy. Lusacan, Tiaong, Quezon
                            </Text>
                            <Text style={styles.addressLine}>
                                24 Lanzones St. Brgy Potrero Malabon City Metro Manila
                            </Text>
                            <Text style={styles.contactLine}>
                                09707834005 · lamparaeis@gmail.com · TIN: 364-923-009-000
                            </Text>
                        </View>
                    </View>
                    <View style={styles.headerRule} />
                </View>

                {/* Document Title & Meta */}
                <View style={styles.titleRow}>
                    <Text style={styles.docTitle}>QUOTATION</Text>
                    <View style={styles.metaBlock}>
                        <Text style={styles.metaText}>
                            Quotation#: {data.quotationNo}
                        </Text>
                        <Text style={styles.metaSubText}>Date: {data.date}</Text>
                    </View>
                </View>

                {/* To Block */}
                <View style={styles.toCard}>
                    <Text style={styles.toLabel}>Prepared For:</Text>
                    <Text style={styles.toName}>{data.customerName}</Text>
                    {data.customerAddress && (
                        <Text style={styles.toDetail}>{data.customerAddress}</Text>
                    )}
                    <Text style={styles.toDetail}>
                        Contact: {data.customerPhone}
                        {data.customerEmail ? ` · ${data.customerEmail}` : ""}
                    </Text>
                </View>

                {/* Intro statement */}
                <Text style={styles.introText}>
                    Dear Sir/Madam,{"\n"}
                    Thank you for your valuable inquiry. We are pleased to quote as below for
                    the{" "}
                    <Text style={styles.introBold}>
                        Supply of Materials, Tools, Supervision and Technical skills for the
                        Installation of the PV System:
                    </Text>
                </Text>

                {/* Items Table */}
                <View style={styles.table}>
                    <View style={styles.tableHeader}>
                        <Text style={[styles.tableHeaderCol, styles.colNum]}>#</Text>
                        <Text style={[styles.tableHeaderCol, styles.colDesc]}>
                            Description
                        </Text>
                        <Text style={[styles.tableHeaderCol, styles.colQty]}>Qty</Text>
                        <Text style={[styles.tableHeaderCol, styles.colPrice]}>Price</Text>
                        <Text style={[styles.tableHeaderCol, styles.colTotal]}>Total</Text>
                    </View>

                    {data.items.map((item, idx) => (
                        <View
                            key={idx}
                            style={[
                                styles.tableRow,
                                idx % 2 === 1 ? styles.tableRowAlt : {},
                            ]}
                        >
                            <Text style={styles.colNum}>{item.num}</Text>
                            <Text style={styles.colDesc}>{item.description}</Text>
                            <Text style={styles.colQty}>{item.qtyStr}</Text>
                            <Text style={styles.colPrice}>{item.priceStr}</Text>
                            <Text style={styles.colTotal}>{item.totalStr}</Text>
                        </View>
                    ))}

                    {/* Grand Total */}
                    <View style={styles.totalSection}>
                        <Text style={styles.grandTotalLabel}>GRAND TOTAL</Text>
                        <Text style={styles.grandTotalAmount}>{data.grandTotalStr}</Text>
                    </View>
                </View>

                <Text style={styles.closingText}>
                    We hope you find our offer to be in line with your requirements.
                </Text>

                {data.notes && (
                    <View style={[styles.toCard, { marginTop: 4, marginBottom: 12 }]}>
                        <Text style={styles.toLabel}>Notes / Scope Details:</Text>
                        <Text style={styles.toDetail}>{data.notes}</Text>
                    </View>
                )}

                {/* Running Footer */}
                <View style={styles.pageFooter} fixed>
                    <Text style={styles.footerText}>
                        Lampara Electrical Installation Services · {data.quotationNo}
                    </Text>
                    <Text style={styles.footerText}>Page 1 of {hasPhotos ? "3" : "2"}</Text>
                </View>
            </Page>

            {/* ════ PAGE 2: Terms & Conditions & Payment ════ */}
            <Page size="A4" style={styles.page}>
                <Text style={styles.sectionTitle}>Terms & Conditions</Text>

                <View style={styles.termsGrid}>
                    <View style={styles.termsCol}>
                        <View style={styles.termItem}>
                            <Text style={styles.termHeading}>1. General</Text>
                            <Text style={styles.termBody}>
                                All quotations provided by Lampara Electrical Installation
                                Services (&quot;the Company&quot;) are subject to these Terms
                                and Conditions. By accepting a quotation, the client
                                (&quot;the Customer&quot;) agrees to be bound by these Terms
                                and Conditions.
                            </Text>
                        </View>

                        <View style={styles.termItem}>
                            <Text style={styles.termHeading}>2. Validity of Quotation</Text>
                            <Text style={styles.termBody}>
                                Quotations are valid for 7 days from the date of issue unless
                                otherwise specified. Prices, product availability, and
                                installation timelines may change after this period.
                            </Text>
                        </View>

                        <View style={styles.termItem}>
                            <Text style={styles.termHeading}>3. Scope of Work</Text>
                            <Text style={styles.termBody}>
                                The quotation outlines the specific products, materials, and
                                services included. Any additional work, variations, or
                                upgrades requested by the Customer will be subject to
                                additional charges.
                            </Text>
                        </View>

                        <View style={styles.termItem}>
                            <Text style={styles.termHeading}>4. Pricing</Text>
                            <Text style={styles.termBody}>
                                All prices are quoted in Philippine Peso (PHP) and
                                include/exclude GST as stated. The Company reserves the right
                                to correct any typographical or calculation errors.
                            </Text>
                        </View>

                        <View style={styles.termItem}>
                            <Text style={styles.termHeading}>
                                5. Deposit and Payment Terms
                            </Text>
                            <Text style={styles.termBody}>
                                Payment terms are as follows:
                            </Text>
                            <Text style={styles.termBullet}>
                                • 50% upon signing or approval of the project.
                            </Text>
                            <Text style={styles.termBullet}>
                                • 40% after delivery of the materials.
                            </Text>
                            <Text style={styles.termBullet}>
                                • 10% after completion of the installation.
                            </Text>
                        </View>

                        <View style={styles.termItem}>
                            <Text style={styles.termHeading}>
                                6. Site Access and Requirements
                            </Text>
                            <Text style={styles.termBody}>
                                The Customer must provide safe and reasonable access to the
                                installation site. Any delays caused by restricted access,
                                unsafe conditions, or incomplete site readiness may result in
                                additional charges.
                            </Text>
                        </View>

                        <View style={styles.termItem}>
                            <Text style={styles.termHeading}>7. Permits and Approvals</Text>
                            <Text style={styles.termBody}>
                                Unless stated otherwise, the Company will assist in obtaining
                                required permits, approvals, and grid connection applications.
                                Approval timelines are dependent on third-party authorities.
                            </Text>
                        </View>

                        <View style={styles.termItem}>
                            <Text style={styles.termHeading}>8. Product Warranties</Text>
                            <Text style={styles.termBody}>
                                Standard product warranties apply:
                            </Text>
                            <Text style={styles.termBullet}>
                                • Solar Panels: 10 years product warranty
                            </Text>
                            <Text style={styles.termBullet}>
                                • Solis Hybrid Inverter: 5 years product warranty
                            </Text>
                            <Text style={styles.termBullet}>
                                • Lithium Battery: 5 years product warranty
                            </Text>
                            <Text style={styles.termBullet}>
                                • After-Sales: 1 year accessories & 2 years workmanship
                            </Text>
                        </View>
                    </View>

                    <View style={styles.termsCol}>
                        <View style={styles.termItem}>
                            <Text style={styles.termHeading}>9. Installation Timeline</Text>
                            <Text style={styles.termBody}>
                                Installation dates are estimates only and may be affected by
                                weather conditions, supply delays, or unforeseen circumstances.
                            </Text>
                        </View>

                        <View style={styles.termItem}>
                            <Text style={styles.termHeading}>10. Variations</Text>
                            <Text style={styles.termBody}>
                                Any changes to the agreed scope of work must be documented and
                                approved in writing. Variations may affect price and timeline.
                            </Text>
                        </View>

                        <View style={styles.termItem}>
                            <Text style={styles.termHeading}>11. Ownership of Goods</Text>
                            <Text style={styles.termBody}>
                                All equipment remains the property of the Company until full
                                payment has been received.
                            </Text>
                        </View>

                        <View style={styles.termItem}>
                            <Text style={styles.termHeading}>12. System Performance</Text>
                            <Text style={styles.termBody}>
                                Performance estimates are based on standard test conditions.
                                Actual output varies with site irradiance, shading, and usage.
                            </Text>
                        </View>

                        <View style={styles.termItem}>
                            <Text style={styles.termHeading}>13. Liability</Text>
                            <Text style={styles.termBody}>
                                The Company is not liable for damages arising from improper
                                use, pre-existing site defects, or grid outages beyond control.
                            </Text>
                        </View>

                        <View style={styles.termItem}>
                            <Text style={styles.termHeading}>14. Cancellation</Text>
                            <Text style={styles.termBody}>
                                If the Customer cancels after work has commenced or materials
                                have been ordered, the Customer is liable for costs incurred.
                            </Text>
                        </View>

                        <View style={styles.termItem}>
                            <Text style={styles.termHeading}>15. Governing Law</Text>
                            <Text style={styles.termBody}>
                                These Terms and Conditions are governed by the laws of the
                                Republic of the Philippines.
                            </Text>
                        </View>

                        <View style={styles.termItem}>
                            <Text style={styles.termHeading}>16. Acceptance</Text>
                            <Text style={styles.termBody}>
                                By approving or signing this quotation, the Customer confirms
                                they have read, understood, and agreed to all Terms.
                            </Text>
                        </View>
                    </View>
                </View>

                {/* Payment Instructions & Authorization Block */}
                <View style={styles.paySignBox}>
                    <View style={styles.paymentBox}>
                        <Text style={styles.paymentTitle}>Payment Instructions</Text>
                        <Text style={styles.paymentDetail}>
                            <Text style={{ fontFamily: "Helvetica-Bold" }}>Bank Name: </Text>
                            BDO (Banco de Oro)
                        </Text>
                        <Text style={styles.paymentDetail}>
                            <Text style={{ fontFamily: "Helvetica-Bold" }}>Account Name: </Text>
                            Lampara Electrical Installation Services
                        </Text>
                        <Text style={styles.paymentDetail}>
                            <Text style={{ fontFamily: "Helvetica-Bold" }}>Account Number: </Text>
                            005698016190
                        </Text>
                    </View>

                    <View style={styles.signBox}>
                        <View>
                            <Text style={styles.signTitle}>Prepared by:</Text>
                            <Text style={styles.signName}>{data.preparerName}</Text>
                        </View>
                        <View>
                            <Text style={styles.signCompany}>
                                For, LAMPARA ELECTRICAL INSTALLATION SERVICES
                            </Text>
                            <View style={styles.signLine} />
                            <Text style={styles.signLineLabel}>Authorized Signature</Text>
                        </View>
                    </View>
                </View>

                <View style={styles.pageFooter} fixed>
                    <Text style={styles.footerText}>
                        Lampara Electrical Installation Services · {data.quotationNo}
                    </Text>
                    <Text style={styles.footerText}>Page 2 of {hasPhotos ? "3" : "2"}</Text>
                </View>
            </Page>

            {/* ════ PAGE 3: Site Layout & Inspection Photos (Optional) ════ */}
            {hasPhotos && (
                <Page size="A4" style={styles.page}>
                    <Text style={styles.sectionTitle}>Proposed System Layout & Site Photos</Text>
                    <Text style={[styles.introText, { marginBottom: 12 }]}>
                        Photos captured during the site ocular inspection for {data.customerName}:
                    </Text>

                    {data.inverterBatteryPhoto && (
                        <View style={styles.photoCard}>
                            <Text style={styles.photoHeading}>
                                Proposed Location of Inverter and Battery
                            </Text>
                            <View style={styles.photoWell}>
                                <Image
                                    style={styles.photoImg}
                                    src={data.inverterBatteryPhoto.src}
                                />
                            </View>
                            {data.inverterBatteryPhoto.caption && (
                                <Text style={styles.photoCaption}>
                                    {data.inverterBatteryPhoto.caption}
                                </Text>
                            )}
                        </View>
                    )}

                    {data.roofPanelPhoto && (
                        <View style={styles.photoCard}>
                            <Text style={styles.photoHeading}>
                                Proposed Location of Panels / Roof Design
                            </Text>
                            <View style={styles.photoWell}>
                                <Image
                                    style={styles.photoImg}
                                    src={data.roofPanelPhoto.src}
                                />
                            </View>
                            {data.roofPanelPhoto.caption && (
                                <Text style={styles.photoCaption}>
                                    {data.roofPanelPhoto.caption}
                                </Text>
                            )}
                        </View>
                    )}

                    <View style={styles.pageFooter} fixed>
                        <Text style={styles.footerText}>
                            Lampara Electrical Installation Services · {data.quotationNo}
                        </Text>
                        <Text style={styles.footerText}>Page 3 of 3</Text>
                    </View>
                </Page>
            )}
        </Document>
    );
}
