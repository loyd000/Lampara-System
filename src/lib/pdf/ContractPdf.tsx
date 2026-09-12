import {
    Document,
    Image,
    Page,
    StyleSheet,
    Text,
    View,
} from "@react-pdf/renderer";

import type { ContractPdfData } from "./contract-data.ts";
import { C, LOGO } from "./theme.ts";

/**
 * The Photovoltaic Installation Contract, rebuilt as a react-pdf document.
 *
 * It replaces the docxtemplater path that filled `public/Contract
 * Template.docx`: the clause text below is transcribed from the office's own
 * `public/Contract Sample.docx`, so the wording is the reference's, but the
 * layout is this file's — which is why the output no longer inherits the Word
 * template's broken spacing, mid-word line breaks, and stray run splits.
 *
 * Content flows: clauses are ordinary blocks and react-pdf paginates them, so
 * editing a clause can never leave a heading orphaned at a page foot the way
 * fixed pages would. Only the signature block is `wrap={false}` — a signature
 * split across two pages is not a signature.
 */

const styles = StyleSheet.create({
    page: {
        paddingTop: 36,
        paddingBottom: 40,
        paddingHorizontal: 46,
        fontFamily: "Helvetica",
        fontSize: 8.5,
        color: C.ink,
        // NOTE: no `lineHeight` here on purpose. In react-pdf 4.9 a lineHeight
        // on the Page style is inherited by `fixed` children and makes a
        // bottom-anchored one vanish from every page — silently, with no error.
        // (Top-anchored fixed elements survive it, which is why this is easy to
        // miss.) Prose line spacing lives on the text styles instead. The quote
        // and ocular PDFs still have the Page-level lineHeight and are missing
        // their running footers for exactly this reason.
    },

    // ── Letterhead ────────────────────────────────────────────────────────
    header: { marginBottom: 4 },
    headerRow: {
        flexDirection: "row",
        alignItems: "flex-start",
        justifyContent: "space-between",
    },
    logo: { width: 118 },
    companyDetails: { alignItems: "flex-end", maxWidth: 300 },
    companyName: {
        fontFamily: "Helvetica-Bold",
        fontSize: 9.5,
        color: C.dark,
        textTransform: "uppercase",
        letterSpacing: 0.3,
    },
    addressLine: {
        fontSize: 7.2,
        color: "#444444",
        textAlign: "right",
        marginTop: 1,
    },
    headerRule: { marginTop: 8, height: 2, backgroundColor: C.orange },

    // ── Document title ────────────────────────────────────────────────────
    docTitle: {
        fontFamily: "Helvetica-Bold",
        fontSize: 15,
        color: C.teal,
        letterSpacing: 0.6,
        textAlign: "center",
        marginTop: 14,
    },
    docSubtitle: {
        fontSize: 7.5,
        color: "#64748B",
        textAlign: "center",
        marginTop: 2,
        marginBottom: 12,
        letterSpacing: 0.4,
        textTransform: "uppercase",
    },

    // ── Parties ───────────────────────────────────────────────────────────
    partiesRow: { flexDirection: "row", gap: 12, marginBottom: 10 },
    partyCard: {
        flex: 1,
        backgroundColor: "#F8FAFC",
        borderWidth: 0.8,
        borderColor: "#E2E8F0",
        borderRadius: 4,
        padding: 8,
    },
    partyLabel: {
        fontSize: 7,
        fontFamily: "Helvetica-Bold",
        color: C.teal,
        textTransform: "uppercase",
        letterSpacing: 0.5,
        marginBottom: 3,
    },
    partyName: { fontFamily: "Helvetica-Bold", fontSize: 9.5, color: C.dark },
    partyDetail: { fontSize: 7.8, color: "#475569", marginTop: 2, lineHeight: 1.35 },
    partyNote: {
        fontSize: 6.6,
        color: "#94A3B8",
        marginTop: 3,
        fontStyle: "italic",
    },

    // ── Clauses ───────────────────────────────────────────────────────────
    clause: { marginBottom: 9 },
    clauseHeading: {
        fontFamily: "Helvetica-Bold",
        fontSize: 9,
        color: C.dark,
        marginBottom: 2.5,
    },
    body: { fontSize: 8.5, color: "#1E293B", textAlign: "justify", lineHeight: 1.45 },
    bodySpaced: {
        fontSize: 8.5,
        color: "#1E293B",
        textAlign: "justify",
        lineHeight: 1.45,
        marginTop: 4,
    },
    bullet: { fontSize: 8.5, color: "#1E293B", paddingLeft: 10, marginTop: 2, lineHeight: 1.45 },
    strong: { fontFamily: "Helvetica-Bold", color: C.dark },

    // ── Highlighted blocks inside clauses ────────────────────────────────
    specBox: {
        borderLeftWidth: 2,
        borderLeftColor: C.teal,
        backgroundColor: "#F8FAFC",
        paddingVertical: 5,
        paddingHorizontal: 8,
        marginTop: 5,
        marginBottom: 5,
    },
    specRow: { flexDirection: "row", marginBottom: 1.5 },
    specValue: { flex: 1, fontSize: 8.3, color: "#1E293B", lineHeight: 1.35 },
    specKind: {
        width: 66,
        fontSize: 8.3,
        fontFamily: "Helvetica-Bold",
        color: C.dark,
        textAlign: "right",
    },

    priceBox: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: "#F1F5F9",
        borderTopWidth: 1.5,
        borderTopColor: C.teal,
        paddingVertical: 6,
        paddingHorizontal: 10,
        marginTop: 5,
        marginBottom: 5,
    },
    priceWords: {
        flex: 1,
        fontSize: 8.3,
        fontFamily: "Helvetica-Bold",
        color: C.dark,
        paddingRight: 12,
    },
    priceFigure: {
        fontSize: 12,
        fontFamily: "Helvetica-Bold",
        color: C.teal,
    },

    bankBox: {
        backgroundColor: "#F8FAFC",
        borderWidth: 0.8,
        borderColor: "#E2E8F0",
        borderRadius: 4,
        padding: 7,
        marginTop: 4,
    },
    bankTitle: {
        fontSize: 7.5,
        fontFamily: "Helvetica-Bold",
        color: C.teal,
        textTransform: "uppercase",
        letterSpacing: 0.4,
        marginBottom: 3,
    },
    bankRow: { fontSize: 7.8, color: "#334155", marginBottom: 1, lineHeight: 1.4 },

    // ── Signatures ────────────────────────────────────────────────────────
    signHeading: {
        fontSize: 10,
        fontFamily: "Helvetica-Bold",
        color: C.teal,
        borderBottomWidth: 1,
        borderBottomColor: C.teal,
        paddingBottom: 2,
        marginTop: 14,
        marginBottom: 6,
        textTransform: "uppercase",
        letterSpacing: 0.4,
    },
    signIntro: { fontSize: 8, color: "#475569", marginBottom: 14, lineHeight: 1.4 },
    signRow: { flexDirection: "row", gap: 26 },
    signCol: { flex: 1 },
    signLine: {
        borderBottomWidth: 0.8,
        borderBottomColor: C.ink,
        marginTop: 26,
        marginBottom: 3,
    },
    signName: { fontFamily: "Helvetica-Bold", fontSize: 8.5, color: C.dark },
    signRole: {
        fontSize: 7,
        color: "#64748B",
        textTransform: "uppercase",
        letterSpacing: 0.3,
        marginTop: 1,
    },
    signMeta: { fontSize: 7.5, color: "#475569", marginTop: 6 },
    preparedBy: {
        fontSize: 7.8,
        color: "#475569",
        marginTop: 18,
        paddingTop: 6,
        borderTopWidth: 0.5,
        borderTopColor: "#E2E8F0",
    },

    pageFooter: {
        position: "absolute",
        bottom: 18,
        left: 46,
        right: 46,
        flexDirection: "row",
        justifyContent: "space-between",
        borderTopWidth: 0.5,
        borderTopColor: "#E2E8F0",
        paddingTop: 4,
    },
    footerText: { fontSize: 7, color: "#94A3B8" },
});

function Clause({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
    return (
        // `minPresenceAhead` keeps a heading from stranding at the foot of a
        // page with its body overleaf: if less than this much room is left,
        // the whole clause moves to the next page instead.
        <View style={styles.clause} minPresenceAhead={40}>
            <Text style={styles.clauseHeading}>
                {n}. {title}
            </Text>
            {children}
        </View>
    );
}

/** A clause whose whole body is one or more plain paragraphs. */
function Paragraphs({ items }: { items: string[] }) {
    return (
        <>
            {items.map((text, i) => (
                <Text key={i} style={i === 0 ? styles.body : styles.bodySpaced}>
                    {text}
                </Text>
            ))}
        </>
    );
}

export function ContractPdf({
    data,
    docTitle,
    logo = LOGO,
}: {
    data: ContractPdfData;
    /** See QuotePdf — this becomes the print preview's suggested filename. */
    docTitle?: string;
    logo?: string;
}) {
    const homeowner = data.homeownerName || "________________________";

    return (
        <Document
            title={docTitle ?? `Photovoltaic Installation Contract — ${homeowner}`}
            author="Lampara Electrical Installation Services"
        >
            <Page size="A4" style={styles.page}>
                {/*
                 * The running footer is declared first even though it prints
                 * last: it is absolutely positioned, so document order costs
                 * nothing, and a `fixed` element placed after content that
                 * wraps across pages is dropped from every page instead of
                 * repeating on each.
                 */}
                <View style={styles.pageFooter} fixed>
                    <Text style={styles.footerText}>
                        Photovoltaic Installation Contract · {homeowner}
                    </Text>
                    <Text
                        style={styles.footerText}
                        render={({ pageNumber, totalPages }) =>
                            `Page ${pageNumber} of ${totalPages}`
                        }
                    />
                </View>

                {/* Letterhead */}
                <View style={styles.header}>
                    <View style={styles.headerRow}>
                        <Image style={styles.logo} src={logo} />
                        <View style={styles.companyDetails}>
                            <Text style={styles.companyName}>
                                Lampara Electrical Installation Services
                            </Text>
                            <Text style={styles.addressLine}>
                                Maharlika Highway, Brgy. Lusacan, Tiaong, Quezon
                            </Text>
                            <Text style={styles.addressLine}>
                                24 Lanzones St., Brgy. Potrero, Malabon City, Metro Manila
                            </Text>
                            <Text style={styles.addressLine}>
                                09707834005 · lamparaeis@gmail.com · TIN: 364-923-009-000
                            </Text>
                        </View>
                    </View>
                    <View style={styles.headerRule} />
                </View>

                <Text style={styles.docTitle}>PHOTOVOLTAIC INSTALLATION CONTRACT</Text>
                <Text style={styles.docSubtitle}>{data.contractDate}</Text>

                {/* Parties */}
                <View style={styles.partiesRow}>
                    <View style={styles.partyCard}>
                        <Text style={styles.partyLabel}>Homeowner</Text>
                        <Text style={styles.partyName}>{homeowner}</Text>
                        <Text style={styles.partyNote}>as appears on the utility bill</Text>
                        <Text style={styles.partyDetail}>
                            {data.siteAddress || "________________________"}
                        </Text>
                        <Text style={styles.partyDetail}>
                            {data.phoneNumber || "________________________"}
                        </Text>
                    </View>

                    <View style={styles.partyCard}>
                        <Text style={styles.partyLabel}>Contractor</Text>
                        <Text style={styles.partyName}>
                            Lampara Electrical Installation Services
                        </Text>
                        <Text style={styles.partyDetail}>
                            Maharlika Highway, Brgy. Lusacan, Tiaong, Quezon
                        </Text>
                        <Text style={styles.partyDetail}>
                            24 Lanzones St., Brgy. Potrero, Malabon City, Metro Manila
                        </Text>
                        <Text style={styles.partyDetail}>09707834005</Text>
                    </View>
                </View>

                {/* Recitals */}
                <View style={styles.clause}>
                    <Text style={styles.clauseHeading}>Recitals</Text>
                    <Text style={styles.body}>
                        The Contractor is engaged in an independent business, is licensed and
                        qualified to do business in the Republic of the Philippines, and will
                        comply with all local laws regarding taxes and licenses. The Contractor
                        is engaged in the same business for other clients, and the Homeowner is
                        not the only customer of the Contractor. The parties to this Contract
                        agree as follows:
                    </Text>
                </View>

                <Clause n={1} title="Scope of Work">
                    <Text style={styles.body}>
                        The project scope includes the installation of a{" "}
                        <Text style={styles.strong}>
                            {data.systemSizeKw || "____"} kW-DC
                        </Text>{" "}
                        rated roof-mounted solar photovoltaic system at the property located at
                        the address listed above. The photovoltaic system shall consist of:
                    </Text>

                    <View style={styles.specBox}>
                        <View style={styles.specRow}>
                            <Text style={styles.specValue}>
                                {data.panelLine || "________________________"}
                            </Text>
                            <Text style={styles.specKind}>Solar Panels</Text>
                        </View>
                        <View style={styles.specRow}>
                            <Text style={styles.specValue}>
                                {data.inverterLine || "________________________"}
                            </Text>
                            <Text style={styles.specKind}>Inverter</Text>
                        </View>
                        <View style={styles.specRow}>
                            <Text style={styles.specValue}>
                                {data.batteryLine || "________________________"}
                            </Text>
                            <Text style={styles.specKind}>Battery</Text>
                        </View>
                    </View>

                    <Text style={styles.body}>
                        The system shall be supported by a premium-grade aluminum mounting
                        system and other components, including but not limited to solar
                        batteries (if required), AC disconnect, and electrical hardware
                        (circuit breakers, wire, conduit, junction boxes, etc.). All equipment
                        will be installed as required by applicable codes, the local utility
                        company, and Homeowner's Association guidelines (if applicable). During
                        daylight hours this photovoltaic system will provide electricity in
                        parallel with the local utility service provider.
                    </Text>
                </Clause>

                <Clause n={2} title="The Contract Price">
                    <Text style={styles.body}>
                        The Homeowner shall pay the Contractor for the materials and labor to be
                        performed under this agreement in the amount of:
                    </Text>

                    <View style={styles.priceBox}>
                        <Text style={styles.priceWords}>{data.priceWords || "____"}</Text>
                        <Text style={styles.priceFigure}>PHP {data.priceFigures || "____"}</Text>
                    </View>

                    <Text style={styles.body}>
                        The amount stated above is exclusive of VAT. Payment shall be made to
                        the following bank account:
                    </Text>

                    <View style={styles.bankBox}>
                        <Text style={styles.bankTitle}>Payment Details</Text>
                        <Text style={styles.bankRow}>
                            <Text style={styles.strong}>Account Name: </Text>
                            LAMPARA ELECTRICAL INSTALLATION SERVICES
                        </Text>
                        <Text style={styles.bankRow}>
                            <Text style={styles.strong}>Bank Name: </Text>
                            BDO — Malabon Governor Pascual Branch
                        </Text>
                        <Text style={styles.bankRow}>
                            <Text style={styles.strong}>Account Number: </Text>
                            005698016190
                        </Text>
                    </View>
                </Clause>

                <Clause n={3} title="Progress Payments">
                    <Text style={styles.body}>
                        The Homeowner shall make payments under this contract in accordance with
                        the following schedule:
                    </Text>
                    <Text style={styles.bullet}>
                        • Fifty percent (50%) of the contract price is due upon signing of this
                        agreement.
                    </Text>
                    <Text style={styles.bullet}>
                        • Fifty percent (50%) of the contract price is due upon delivery of
                        materials and completion of the project.
                    </Text>
                </Clause>

                <Clause n={4} title="General Provisions">
                    <Paragraphs
                        items={[
                            "Any alterations or deviation to the above specifications, including but not limited to any such alteration or deviation involving additional materials and/or labor costs, will be executed only upon a written order for the same, signed by both the Homeowner and the Contractor. If there is any charge for such alteration or deviation, the additional price must be mutually agreed in writing and added to the contract price of this contract.",
                        ]}
                    />
                </Clause>

                <Clause n={5} title="Work Quality">
                    <Paragraphs
                        items={[
                            "All work shall be completed in a quality manner and in compliance with all building and electrical codes, all other applicable laws, and all applicable utility requirements, including appropriate utility interconnection obligations.",
                        ]}
                    />
                </Clause>

                <Clause n={6} title="Project Approval">
                    <Paragraphs
                        items={[
                            "The Contractor shall furnish to the Homeowner a plan including construction and equipment specifications for solar facilities, a description of the work to be done, and the materials and equipment to be used and/or installed prior to the commencement of the work. All equipment and materials shall be provided with original manufacturers' warranties where and as applicable.",
                        ]}
                    />
                </Clause>

                <Clause n={7} title="Licensing">
                    <Paragraphs
                        items={[
                            "To the extent required by law, all work shall be performed by individuals duly licensed and authorized by law to perform said work.",
                        ]}
                    />
                </Clause>

                <Clause n={8} title="Subcontractors">
                    <Paragraphs
                        items={[
                            "The Contractor may at its discretion engage subcontractors to perform work hereunder, provided the Contractor shall fully pay said subcontractor and in all instances remain responsible for the proper completion of this Contract.",
                        ]}
                    />
                </Clause>

                <Clause n={9} title="Release / Waivers">
                    <Paragraphs
                        items={[
                            "The Contractor shall furnish the Homeowner appropriate releases or waivers of lien for all work performed or materials provided at the time the next periodic payment shall be due.",
                        ]}
                    />
                </Clause>

                <Clause n={10} title="Project Timeline">
                    <Text style={styles.body}>
                        The estimated installation timeline of the solar photovoltaic (PV)
                        system shall be as follows:
                    </Text>
                    <Text style={styles.bullet}>
                        • <Text style={styles.strong}>Day 1–2 — Preparation and delivery of materials.</Text>{" "}
                        Site preparation, confirmation of layout, and delivery of solar panels,
                        inverter, mounting structures, and other required materials.
                    </Text>
                    <Text style={styles.bullet}>
                        • <Text style={styles.strong}>Day 2–4 — Installation works.</Text>{" "}
                        Installation of mounting structures, solar panels, inverter system,
                        DC/AC wiring, protection devices, and integration with the existing
                        electrical system.
                    </Text>
                    <Text style={styles.bullet}>
                        • <Text style={styles.strong}>Day 4–5 — Testing, commissioning, and turnover.</Text>{" "}
                        System testing, inspection, commissioning of the solar PV system, and
                        turnover of the completed installation including basic system
                        orientation for the Homeowner.
                    </Text>
                    <Text style={styles.bodySpaced}>
                        The above timeline is an estimated schedule and may be adjusted
                        depending on site conditions, weather, material availability, and
                        utility or permit-related requirements beyond the Contractor's control.
                    </Text>
                </Clause>

                <Clause n={11} title="Change Orders">
                    <Paragraphs
                        items={[
                            "All change orders shall be in writing and signed by both the Contractor and the Homeowner. Such change orders shall be incorporated in and become a part of this contract. Payment for all tasks (time and equipment) under this contract shall be as performed in accordance with Article 4 and as indicated in a duly ordered and executed change order.",
                        ]}
                    />
                </Clause>

                <Clause n={12} title="Permits">
                    <Paragraphs
                        items={[
                            "The Homeowner shall obtain all permits necessary (if needed) for the work to be performed.",
                        ]}
                    />
                </Clause>

                <Clause n={13} title="Site Condition and Cleaning">
                    <Paragraphs
                        items={[
                            "The Contractor agrees to remove all debris created by the installation and to leave the premises in clean condition. The Contractor shall not be responsible for landscaping improvement services as part of this contract.",
                        ]}
                    />
                </Clause>

                <Clause n={14} title="Warranty of Work">
                    <Paragraphs
                        items={[
                            "The Contractor provides a two (2) year workmanship warranty covering the quality of installation and workmanship of the solar photovoltaic (PV) system, including defects arising directly from improper installation, workmanship errors, or system issues attributable to the Contractor. Within the warranty period, the Contractor shall provide free minor and essential support services, including system inspection, basic troubleshooting, inverter checking, and configuration of related solar devices.",
                            "The Contractor shall likewise be responsible for any water leakage, roof penetration, or structural issues directly caused by defective installation of the solar panels, mounting system, or associated components, provided that such defects are reported within three (3) months from the date of project turnover or after the occurrence of at least two (2) to three (3) significant rainfall events, whichever comes later. Upon verification that the issue resulted from defective workmanship, the Contractor shall, at no cost to the Client, repair and reseal the affected areas to restore the weatherproof integrity of the installation. This warranty shall not cover leaks or structural issues arising from pre-existing roof defects, aging, corrosion, structural movement, unauthorized modifications, or events beyond the Contractor's reasonable control.",
                            "Furthermore, if any solar panel, mounting hardware, inverter, or system component becomes displaced, dislodged, or damaged due to improper installation or workmanship attributable to the Contractor, the Contractor shall undertake the necessary repairs or reinstallation at no cost to the Client. However, this provision shall not apply to damages caused by natural disasters, typhoons exceeding the applicable design standards, earthquakes, floods, lightning, vandalism, accidents, misuse, or any event beyond the Contractor's control.",
                            "Services such as cleaning of solar panels, preventive maintenance, rewiring or modification of existing electrical connections, relocation or repositioning of system components, system upgrades or expansions, client-requested alterations, and repairs resulting from external factors including power surges, natural disasters, misuse, negligence, or unauthorized modifications are excluded from this workmanship warranty and shall be subject to corresponding service fees.",
                            "Replacement of defective components beyond the one (1) year free service period shall be at the Client's expense, except where such replacement is necessary due to proven workmanship defects covered under this warranty. The Contractor may assist in the replacement or installation of such components, subject to applicable labor and service charges.",
                            "The inverter is covered by a standard five (5) year limited manufacturer's warranty, subject to the manufacturer's terms and conditions, with the option for warranty extension where available. In the event of inverter failure, the Contractor shall provide a temporary replacement unit, if available, while the original unit is undergoing evaluation or warranty processing by the supplier or manufacturer.",
                            "The battery is likewise covered by a standard five (5) year limited manufacturer's warranty, with any warranty extension subject to the manufacturer's policies, approval, and applicable terms and conditions.",
                            "The solar panels are covered by a standard ten (10) year product warranty against manufacturing defects affecting the panel frame, glass, solar cells, and junction box, together with the applicable manufacturer's linear performance warranty. Any claim relating to manufacturing defects or guaranteed power output shall be subject to the manufacturer's warranty policies and evaluation procedures.",
                            "If the system is tampered with, modified, repaired, expanded, or altered by any third party or person not authorized by the Contractor, the workmanship warranty shall automatically become void, and the Contractor shall not be liable for any resulting issues or damages.",
                            "However, should the Contractor fail to respond to a formal written service request within seventy-two (72) working hours, excluding weekends and holidays, the Client may engage the services of a duly licensed Electrical Engineer or Registered Master Electrician with sufficient experience in solar photovoltaic systems to perform the necessary repairs without automatically voiding the workmanship warranty, provided that the repairs are limited to the reported issue and proper documentation is furnished to the Contractor.",
                            "It is strongly recommended that all maintenance, repairs, and servicing be carried out by the Contractor or authorized personnel to ensure system safety, preserve system integrity, and maintain warranty validity.",
                        ]}
                    />
                </Clause>

                <Clause n={15} title="Contractor's Status">
                    <Text style={styles.bullet}>
                        • The Contractor is an independent contractor and is not an employee of
                        the Homeowner.
                    </Text>
                    <Text style={styles.bullet}>
                        • The Contractor shall furnish all equipment, tools, and supplies to
                        accomplish the assigned work, except as agreed to in writing by both the
                        Homeowner and the Contractor.
                    </Text>
                    <Text style={styles.bullet}>
                        • The Contractor maintains control over the manner in which the tasks
                        are to be performed and the products made.
                    </Text>
                    <Text style={styles.bullet}>
                        • The Contractor will be responsible for any solar installation related
                        unforeseen accident.
                    </Text>
                    <Text style={styles.bullet}>
                        • The Homeowner will withhold no payroll taxes, Social Security, or
                        workers' compensation taxes for the Contractor. These items are solely
                        the responsibility of the Contractor.
                    </Text>
                </Clause>

                <Clause n={16} title="Cancellation">
                    <Paragraphs
                        items={[
                            "In the event that the Client cancels the project after payment of the downpayment but prior to commencement, a portion of the downpayment shall be retained as a reservation and administrative fee, while any remaining balance shall be refunded depending on the timing of cancellation: 90% refundable if cancelled more than seven (7) days before the scheduled start date, 50% refundable if cancelled three (3) to seven (7) days before, and non-refundable if cancelled less than seventy-two (72) hours prior to commencement.",
                        ]}
                    />
                </Clause>

                <Clause n={17} title="Governing Law and Venue">
                    <Paragraphs
                        items={[
                            "This Agreement will be interpreted and enforced according to the laws of the Republic of the Philippines, and any proceeding to compel arbitration or to enforce an arbitration award is to be brought against any of the Parties in San Pedro Regional Trial Court. Each of the Parties consents to the jurisdiction of such court (and of the appropriate appellate court) in any such action or proceeding and waives any objection to such venue.",
                        ]}
                    />
                </Clause>

                <Clause n={18} title="Attorney Fees and Costs">
                    <Paragraphs
                        items={[
                            "In the event that any Party initiates proceedings to compel arbitration or to enforce this Agreement or enjoin its breach, the prevailing Party or Parties will be awarded its or their reasonable attorney fees and costs at arbitration, trial, and on any appeal as set by the trier of fact, including any bankruptcy proceedings.",
                        ]}
                    />
                </Clause>

                {/* Signatures — never split across a page break. */}
                <View wrap={false}>
                    <Text style={styles.signHeading}>Signatures</Text>
                    <Text style={styles.signIntro}>
                        The individuals signing below hereby represent that they are authorized
                        to enter into this Agreement on behalf of the Party for whom they sign.
                    </Text>

                    <View style={styles.signRow}>
                        <View style={styles.signCol}>
                            <View style={styles.signLine} />
                            <Text style={styles.signName}>JOHN KARLO DE GUZMAN</Text>
                            <Text style={styles.signRole}>Proprietor · Contractor</Text>
                            <Text style={styles.signMeta}>Date: {data.contractDate}</Text>
                        </View>

                        <View style={styles.signCol}>
                            <View style={styles.signLine} />
                            <Text style={styles.signName}>
                                {(data.homeownerName || "").toUpperCase() ||
                                    "________________________"}
                            </Text>
                            <Text style={styles.signRole}>Homeowner</Text>
                            <Text style={styles.signMeta}>Date: ____________________</Text>
                        </View>
                    </View>

                    {data.preparedByName ? (
                        <Text style={styles.preparedBy}>
                            Prepared by:{" "}
                            <Text style={styles.strong}>
                                {data.preparedByName.toUpperCase()}
                            </Text>{" "}
                            — Sales Engineer, Lampara Electrical Installation Services
                        </Text>
                    ) : null}
                </View>
            </Page>
        </Document>
    );
}
