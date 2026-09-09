import { Document, Image, Page, Text, View } from "@react-pdf/renderer";

import {
    BATTERY_OPTION_LABELS,
    CONNECTION_TYPE_LABELS,
    METER_FORM_LABELS,
    METER_KIND_LABELS,
    METER_PHASE_LABELS,
    MOUNTING_LABELS,
    ORIENTATION_LABELS,
    PACKAGE_TYPE_LABELS,
    PANEL_OPTION_LABELS,
    ROOF_ACCESS_LABELS,
    SUPPORT_PURLIN_LABELS,
    SYSTEM_CAPACITY_LABELS,
    USAGE_HABIT_LABELS,
} from "@/lib/constants.ts";
import { C, COMPASS, s } from "./theme.ts";
import { Band, Check, ReportHeader } from "./primitives.tsx";

/**
 * The Site Ocular Report, rebuilt as a PDF to match the office's Word template
 * page for page.
 *
 * Everything the reader sees comes from `ReportData`, which the caller
 * assembles — photos already fetched to data URIs, names already resolved — so
 * this file stays a layout and nothing here has to wait on the network.
 */

export type ReportPhoto = { src: string; caption?: string };

export type ReportData = {
    // Client details
    name: string;
    date: string;
    address: string;
    coords: string;
    usageHabit?: string;
    kwh: string;
    bill: string;
    appliances: { label: string; on: boolean; note: string }[];
    others: string;
    vehicle: string;

    // Roof
    roofType: string;
    supportPurlins: string[];
    roofArea: string;
    roofWidth: string;
    roofLength: string;
    roofAccess?: string;
    mounting: string[];
    orientation: string[];
    estDc: string;
    estAc: string;

    // Electric meter & panel
    meterPhase?: string;
    transformers: string;
    meterKind?: string;
    meterForm?: string;
    serviceDisconnect?: boolean;
    sdRating: string;
    grounding?: boolean;
    mdp: string;
    cbSize: string;
    wireSize: string;
    connectionType?: string;
    floors: string;

    // System package
    systemCapacity?: string;
    packageType?: string;
    batteryOption?: string;
    panelOption?: string;
    notes: string;

    // Photos, by slot
    photos: {
        buildingFront: ReportPhoto[];
        roofView: ReportPhoto[];
        meralcoMeter: ReportPhoto[];
        mainBreaker: ReportPhoto[];
        meralcoBill: ReportPhoto[];
        roofPanelDesign: ReportPhoto[];
        inverterBattery: ReportPhoto[];
        dcConduit: ReportPhoto[];
        acConduit: ReportPhoto[];
        other: ReportPhoto[];
    };

    // Sign-off
    preparedBy: string;
    preparedDate: string;
    approvedBy: string;
    approvedDate: string;
};

const CONTENT_WIDTH = 516;

export function OcularReport({
    data,
    logo,
    compass = COMPASS,
}: {
    data: ReportData;
    /** Overridden only by the offline preview script; see theme.tsx. */
    logo?: string;
    compass?: string;
}) {
    return (
        <Document
            title={`Site Ocular Report — ${data.name}`}
            author="Lampara Electrical Installation Services"
            subject="Site Ocular Report"
        >
            {/* ══ Page 1 — the form ══════════════════════════════════════ */}
            <Page size="LETTER" style={s.page}>
                <ReportHeader logo={logo} />

                <Band>CLIENT DETAILS</Band>

                <View style={{ flexDirection: "row", marginBottom: 7 }}>
                    <Text style={{ width: 62 }}>Name              :</Text>
                    <View style={[s.fill, { flex: 1, marginRight: 18 }]}>
                        <Text style={s.fillText}>{data.name || " "}</Text>
                    </View>
                    <Text style={{ width: 26 }}>Date:</Text>
                    <View style={[s.fill, { width: 130 }]}>
                        <Text style={s.fillText}>{data.date || " "}</Text>
                    </View>
                </View>

                <View style={{ flexDirection: "row", marginBottom: 7 }}>
                    <Text style={{ width: 62 }}>Address          :</Text>
                    <View style={[s.fill, { flex: 1 }]}>
                        <Text style={s.fillText}>{data.address || " "}</Text>
                    </View>
                </View>

                <View style={{ flexDirection: "row", marginBottom: 9 }}>
                    <Text style={{ width: 62 }}>Coordinates  :</Text>
                    <View style={[s.fill, { flex: 1 }]}>
                        <Text style={s.fillText}>{data.coords || " "}</Text>
                    </View>
                </View>

                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 9 }}>
                    <Text style={{ marginRight: 10 }}>Consumption / Usage Habits:</Text>
                    {Object.entries(USAGE_HABIT_LABELS).map(([key, label]) => (
                        <Check key={key} on={data.usageHabit === key} label={label} />
                    ))}
                </View>

                <View style={{ flexDirection: "row", marginBottom: 10 }}>
                    <Text style={{ marginRight: 3 }}>Monthly consumption(kWh):</Text>
                    <View style={[s.fill, { width: 78, marginRight: 24 }]}>
                        <Text style={s.fillText}>{data.kwh || " "}</Text>
                    </View>
                    <Text style={{ marginRight: 3 }}>Monthly Electric Bill :</Text>
                    <View style={[s.fill, { flex: 1 }]}>
                        <Text style={s.fillText}>{data.bill || " "}</Text>
                    </View>
                </View>

                {/* Appliances — two columns, as the form prints them */}
                <View style={{ flexDirection: "row", marginBottom: 9 }}>
                    <Text style={{ width: 62 }}>Appliances:</Text>
                    <View style={{ flex: 1 }}>
                        {chunk(data.appliances, 2).map((pair, i) => (
                            <View key={i} style={{ flexDirection: "row", marginBottom: 4 }}>
                                {pair.map((a) => (
                                    <View
                                        key={a.label}
                                        style={{ flexDirection: "row", alignItems: "flex-end", flex: 1 }}
                                    >
                                        <Check on={a.on} label={a.label} />
                                        <View style={[s.fill, { flex: 1, marginRight: 14 }]}>
                                            <Text style={s.fillText}>{a.note || " "}</Text>
                                        </View>
                                    </View>
                                ))}
                                {pair.length === 1 ? <View style={{ flex: 1 }} /> : null}
                            </View>
                        ))}
                        <View style={{ flexDirection: "row", alignItems: "flex-end" }}>
                            <Check on={Boolean(data.others)} label="Others:" />
                            <View style={[s.fill, { flex: 1 }]}>
                                <Text style={s.fillText}>{data.others || " "}</Text>
                            </View>
                        </View>
                    </View>
                </View>

                <View style={{ flexDirection: "row", marginBottom: 4 }}>
                    <Text style={{ marginRight: 3 }}>Recommended vehicle (Carabao, Tamaraw):</Text>
                    <View style={[s.fill, { flex: 1 }]}>
                        <Text style={s.fillText}>{data.vehicle || " "}</Text>
                    </View>
                </View>

                {/* ── Roof ─────────────────────────────────────────────── */}
                <View style={s.table}>
                    <View style={s.tr}>
                        <View style={[s.td, { width: CONTENT_WIDTH * 0.4 }]}>
                            <Text>Roof Type: {data.roofType || "—"}</Text>
                        </View>
                        <View style={[s.tdLast, { flex: 1, flexDirection: "row", flexWrap: "wrap" }]}>
                            <Text style={{ marginRight: 8 }}>Support / Purlins:</Text>
                            {Object.entries(SUPPORT_PURLIN_LABELS).map(([key, label]) => (
                                <Check key={key} on={data.supportPurlins.includes(key)} label={label} />
                            ))}
                        </View>
                    </View>

                    <View style={s.tr}>
                        <View style={[s.td, { width: CONTENT_WIDTH * 0.4 }]}>
                            <Text>Roof Area: {data.roofArea || "______"}</Text>
                        </View>
                        <View style={[s.td, { flex: 1 }]}>
                            <Text>Width {data.roofWidth || "______"}</Text>
                        </View>
                        <View style={[s.tdLast, { flex: 1 }]}>
                            <Text>Length {data.roofLength || "______"}</Text>
                        </View>
                    </View>

                    <View style={s.tr}>
                        <View style={[s.td, { width: CONTENT_WIDTH * 0.25 }]}>
                            <Text style={{ marginBottom: 4 }}>Roof Access:</Text>
                            {Object.entries(ROOF_ACCESS_LABELS).map(([key, label]) => (
                                <View key={key} style={{ marginBottom: 2 }}>
                                    <Check on={data.roofAccess === key} label={label} />
                                </View>
                            ))}
                        </View>
                        <View style={[s.td, { width: CONTENT_WIDTH * 0.3 }]}>
                            <Text style={{ marginBottom: 4 }}>Mounting:</Text>
                            {Object.entries(MOUNTING_LABELS).map(([key, label]) => (
                                <View key={key} style={{ marginBottom: 2 }}>
                                    <Check on={data.mounting.includes(key)} label={label} />
                                </View>
                            ))}
                        </View>
                        <View style={[s.tdLast, { flex: 1, flexDirection: "row" }]}>
                            <View style={{ flex: 1 }}>
                                <Text style={{ marginBottom: 4 }}>ROOF FACING / ORIENTATION:</Text>
                                {Object.entries(ORIENTATION_LABELS).map(([key, label]) => (
                                    <View key={key} style={{ marginBottom: 2 }}>
                                        <Check
                                            on={data.orientation.includes(key)}
                                            label={label.toUpperCase()}
                                        />
                                    </View>
                                ))}
                            </View>
                            <Image src={compass} style={{ width: 62, height: 62, alignSelf: "center" }} />
                        </View>
                    </View>

                    <View style={s.tr}>
                        <View style={[s.td, { width: CONTENT_WIDTH * 0.4 }]}>
                            <Text>EST. DC {data.estDc || "______"}</Text>
                        </View>
                        <View style={[s.tdLast, { flex: 1 }]}>
                            <Text>EST. AC {data.estAc || "______"}</Text>
                        </View>
                    </View>

                    {/* Electric meter — one label cell against four stacked rows */}
                    <View style={s.tr}>
                        <View
                            style={[
                                s.td,
                                { width: CONTENT_WIDTH * 0.25, justifyContent: "center" },
                            ]}
                        >
                            <Text>Electric Meter:</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                            <View
                                style={{
                                    flexDirection: "row",
                                    borderBottomWidth: 0.8,
                                    borderBottomColor: C.line,
                                }}
                            >
                                <View style={[s.td, { flex: 1, borderRightWidth: 0.8 }]}>
                                    <View style={{ flexDirection: "row" }}>
                                        {Object.entries(METER_PHASE_LABELS).map(([key, label]) => (
                                            <Check
                                                key={key}
                                                on={data.meterPhase === key}
                                                label={label}
                                            />
                                        ))}
                                    </View>
                                </View>
                                <View style={[s.tdLast, { width: 150 }]}>
                                    <Text>No. of Transformer: {data.transformers}</Text>
                                </View>
                            </View>

                            <View
                                style={{
                                    flexDirection: "row",
                                    borderBottomWidth: 0.8,
                                    borderBottomColor: C.line,
                                    paddingVertical: 4,
                                    paddingHorizontal: 5,
                                }}
                            >
                                {Object.entries(METER_KIND_LABELS).map(([key, label]) => (
                                    <Check key={key} on={data.meterKind === key} label={label} />
                                ))}
                            </View>

                            <View
                                style={{
                                    flexDirection: "row",
                                    borderBottomWidth: 0.8,
                                    borderBottomColor: C.line,
                                    paddingVertical: 4,
                                    paddingHorizontal: 5,
                                }}
                            >
                                {Object.entries(METER_FORM_LABELS).map(([key, label]) => (
                                    <Check key={key} on={data.meterForm === key} label={label} />
                                ))}
                            </View>

                            <View
                                style={{
                                    flexDirection: "row",
                                    alignItems: "flex-end",
                                    paddingVertical: 4,
                                    paddingHorizontal: 5,
                                }}
                            >
                                <Text style={{ marginRight: 6 }}>Service Disconnect:</Text>
                                <Check on={data.serviceDisconnect === true} label="Yes" />
                                <Check on={data.serviceDisconnect === false} label="No" />
                                <Text style={{ marginRight: 3 }}>Rating:</Text>
                                <View style={[s.fill, { flex: 1 }]}>
                                    <Text style={s.fillText}>{data.sdRating || " "}</Text>
                                </View>
                            </View>
                        </View>
                    </View>

                    <View style={s.tr}>
                        <View style={[s.td, { width: CONTENT_WIDTH * 0.25 }]} />
                        <View style={[s.tdLast, { flex: 1, flexDirection: "row" }]}>
                            <Text style={{ marginRight: 8 }}>Grounding:</Text>
                            <Check on={data.grounding === true} label="Yes" />
                            <Check on={data.grounding === false} label="No" />
                        </View>
                    </View>

                    <View style={s.tr}>
                        <View style={[s.td, { flex: 1 }]}>
                            <Text>Main Distribution Panel:</Text>
                            <Text>{data.mdp || " "}</Text>
                        </View>
                        <View style={[s.td, { flex: 1 }]}>
                            <Text>CB Size or Rating:</Text>
                            <Text>{data.cbSize || " "}</Text>
                        </View>
                        <View style={[s.tdLast, { flex: 1 }]}>
                            <Text>Wire Size:</Text>
                            <Text>{data.wireSize || " "}</Text>
                        </View>
                    </View>

                    <View style={s.trLast}>
                        <View
                            style={[
                                s.td,
                                { flex: 1, flexDirection: "row", alignItems: "center", flexWrap: "wrap" },
                            ]}
                        >
                            <Text style={{ marginRight: 8 }}>Network / Connection Type:</Text>
                            {Object.entries(CONNECTION_TYPE_LABELS).map(([key, label]) => (
                                <Check key={key} on={data.connectionType === key} label={label} />
                            ))}
                        </View>
                        <View style={[s.tdLast, { width: 150 }]}>
                            <Text>No. of Floors: {data.floors}</Text>
                        </View>
                    </View>
                </View>

                {/* ── System package ─────────────────────────────────────
                    Banded heading, table and Notes move as one block: split
                    across a page the Notes label lands on one and its box on
                    the next. */}
                <View wrap={false}>
                <Band>SYSTEM PACAKAGE/DETAILS</Band>

                <View style={s.table}>
                    <View style={s.tr}>
                        <View
                            style={[
                                s.tdLast,
                                { flex: 1, flexDirection: "row", alignItems: "center", flexWrap: "wrap" },
                            ]}
                        >
                            <Text style={{ marginRight: 10 }}>System Capacity/Size:</Text>
                            {Object.entries(SYSTEM_CAPACITY_LABELS).map(([key, label]) => (
                                <Check key={key} on={data.systemCapacity === key} label={label} />
                            ))}
                        </View>
                    </View>
                    <View style={s.tr}>
                        <View style={[s.td, { flex: 1, flexDirection: "row", alignItems: "center" }]}>
                            <Text style={{ marginRight: 8 }}>Package:</Text>
                            {Object.entries(PACKAGE_TYPE_LABELS).map(([key, label]) => (
                                <Check key={key} on={data.packageType === key} label={label} />
                            ))}
                        </View>
                        <View style={[s.tdLast, { flex: 1, flexDirection: "row", alignItems: "center" }]}>
                            <Text style={{ marginRight: 8 }}>Battery:</Text>
                            {Object.entries(BATTERY_OPTION_LABELS).map(([key, label]) => (
                                <Check key={key} on={data.batteryOption === key} label={label} />
                            ))}
                        </View>
                    </View>
                    <View style={s.trLast}>
                        <View
                            style={[s.tdLast, { flex: 1, flexDirection: "row", alignItems: "center" }]}
                        >
                            <Text style={{ marginRight: 8 }}>Panels:</Text>
                            {Object.entries(PANEL_OPTION_LABELS).map(([key, label]) => (
                                <Check key={key} on={data.panelOption === key} label={label} />
                            ))}
                        </View>
                    </View>
                </View>

                <View
                    style={{
                        borderWidth: 0.8,
                        borderColor: C.line,
                        marginTop: 8,
                        padding: 6,
                        minHeight: 74,
                    }}
                >
                    <Text style={{ marginBottom: 3 }}>Notes:</Text>
                    <Text>{data.notes}</Text>
                </View>
                </View>

                <PageFooter name={data.name} />
            </Page>

            {/* ══ Photo pages ════════════════════════════════════════════ */}
            <Page size="LETTER" style={s.page}>
                <ReportHeader logo={logo} />

                <PhotoSection title="BUILDING FRONT VIEW" photos={data.photos.buildingFront} height={228} />
                <PhotoSection
                    title="ROOF VIEW (DRONE SHOT/GOOGLE EARTH)"
                    photos={data.photos.roofView}
                    height={228}
                />

                <PageFooter name={data.name} />
            </Page>

            <Page size="LETTER" style={s.page}>
                <ReportHeader logo={logo} />

                <Text style={s.photoHeading}>MAIN PANEL BOARD</Text>
                <View style={s.photoRule} />
                <View style={{ flexDirection: "row", borderWidth: 0.8, borderColor: C.line }}>
                    {[
                        { head: "MERALCO METER", photos: data.photos.meralcoMeter },
                        { head: "MAIN CIRCUIT BREAKER", photos: data.photos.mainBreaker },
                        { head: "MERALCO BILL", photos: data.photos.meralcoBill },
                    ].map((col, i) => (
                        <View
                            key={col.head}
                            style={{
                                flex: 1,
                                borderRightWidth: i < 2 ? 0.8 : 0,
                                borderRightColor: C.line,
                            }}
                        >
                            <View style={{ backgroundColor: C.dark, paddingVertical: 3 }}>
                                <Text
                                    style={{
                                        color: C.white,
                                        fontFamily: "Helvetica-Bold",
                                        fontSize: 7.5,
                                        textAlign: "center",
                                    }}
                                >
                                    {col.head}
                                </Text>
                            </View>
                            <Slot photo={col.photos[0]} height={176} />
                        </View>
                    ))}
                </View>

                <PhotoSection
                    title="ROOF WITH PANEL DESIGN"
                    photos={data.photos.roofPanelDesign}
                    height={250}
                />

                <PageFooter name={data.name} />
            </Page>

            <Page size="LETTER" style={s.page}>
                <ReportHeader logo={logo} />

                <PhotoSection
                    title="INVERTER AND BATTERY LOCATION (W or W/O BATTERY)"
                    photos={data.photos.inverterBattery}
                    height={250}
                />

                <Text style={s.photoHeading}>DC CONDUIT LINES</Text>
                <View style={s.photoRule} />
                <StripBand>FROM PV MODULES TO INVERTER</StripBand>
                <PhotoStrip photos={data.photos.dcConduit} />

                <PageFooter name={data.name} />
            </Page>

            <Page size="LETTER" style={s.page}>
                <ReportHeader logo={logo} />

                <Text style={s.photoHeading}>AC CONDUIT LINES</Text>
                <View style={s.photoRule} />
                <StripBand>FROM INVERTER TO SOLAR DISCONNECT TO SERVICE DISCONNECT</StripBand>
                <PhotoStrip photos={data.photos.acConduit} />

                {data.photos.other.length > 0 && (
                    <>
                        <Text style={s.photoHeading}>OTHER PHOTOS</Text>
                        <View style={s.photoRule} />
                        <PhotoStrip photos={data.photos.other.slice(0, 3)} />
                    </>
                )}

                {/* ── Sign-off ─────────────────────────────────────────── */}
                <View style={{ marginTop: 26, borderWidth: 0.8, borderColor: C.line }}>
                    <View style={{ flexDirection: "row", borderBottomWidth: 0.8, borderBottomColor: C.line }}>
                        <Text style={[s.signLabel, { width: 92 }]}>Prepared by:</Text>
                        <View style={[s.td, { flex: 1 }]}>
                            <Text>{data.preparedBy || " "}</Text>
                        </View>
                        <Text style={[s.signLabel, { width: 92 }]}>Approved by :</Text>
                        <View style={[s.tdLast, { flex: 1 }]}>
                            <Text>{data.approvedBy || " "}</Text>
                        </View>
                    </View>
                    <View style={{ flexDirection: "row" }}>
                        <Text style={[s.signLabel, { width: 92 }]}>Date &amp; Signature:</Text>
                        <View style={[s.td, { flex: 1, minHeight: 34 }]}>
                            <Text>{data.preparedDate || " "}</Text>
                        </View>
                        <Text style={[s.signLabel, { width: 92 }]}>Date &amp; Signature :</Text>
                        <View style={[s.tdLast, { flex: 1, minHeight: 34 }]}>
                            <Text>{data.approvedDate || " "}</Text>
                        </View>
                    </View>
                </View>

                <PageFooter name={data.name} />
            </Page>
        </Document>
    );
}

// ── Pieces ───────────────────────────────────────────────────────────────

function PageFooter({ name }: { name: string }) {
    return (
        <View style={s.footer} fixed>
            <Text>Site Ocular Report — {name}</Text>
            <Text
                render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
            />
        </View>
    );
}

function StripBand({ children }: { children: string }) {
    return (
        <View style={{ backgroundColor: C.dark, paddingVertical: 3 }}>
            <Text
                style={{
                    color: C.white,
                    fontFamily: "Helvetica-Bold",
                    fontSize: 7.5,
                    textAlign: "center",
                }}
            >
                {children}
            </Text>
        </View>
    );
}

function PhotoSection({
    title,
    photos,
    height,
}: {
    title: string;
    photos: ReportPhoto[];
    height: number;
}) {
    return (
        <View wrap={false}>
            <Text style={s.photoHeading}>{title}</Text>
            <View style={s.photoRule} />
            <Slot photo={photos[0]} height={height} />
        </View>
    );
}

/** The three-across rows the form uses for conduit runs. */
function PhotoStrip({ photos }: { photos: ReportPhoto[] }) {
    const cells = [0, 1, 2];
    return (
        <View style={{ flexDirection: "row", borderWidth: 0.8, borderColor: C.line, borderTopWidth: 0 }}>
            {cells.map((i) => (
                <View
                    key={i}
                    style={{ flex: 1, borderRightWidth: i < 2 ? 0.8 : 0, borderRightColor: C.line }}
                >
                    <Slot photo={photos[i]} height={186} bare />
                </View>
            ))}
        </View>
    );
}

/** One picture well. Empty slots print as an empty frame, as the blank form does. */
function Slot({
    photo,
    height,
    bare,
}: {
    photo: ReportPhoto | undefined;
    height: number;
    bare?: boolean;
}) {
    return (
        <View
            style={[
                bare
                    ? { alignItems: "center", justifyContent: "center", padding: 4 }
                    : s.photoFrame,
                { height },
            ]}
        >
            {photo ? (
                <Image src={photo.src} style={{ maxWidth: "100%", maxHeight: "100%" }} />
            ) : (
                <Text style={s.photoEmpty}>No photo</Text>
            )}
        </View>
    );
}

function chunk<T>(items: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
}
