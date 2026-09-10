/**
 * The Province → City/Municipality → Barangay cascade behind the lead
 * property form.
 *
 * `phil-reg-prov-mun-brgy` ships ~3.5MB of PSGC data as plain JS objects (no
 * network calls, unlike some alternatives on npm that re-fetch the whole
 * country's barangay list from a GitHub Pages host on every keystroke) — but
 * it's still too big to sit in the main bundle for a form nobody opens on
 * most page views, so every call here goes through a dynamic `import()`,
 * same as @react-pdf/renderer for the document generators.
 *
 * Every level after Province is looked up by *code*, not name — 122
 * municipality names repeat across different provinces in this dataset (two
 * different "San Fernando"s, two "Rizal"s, etc.), so filtering barangays by a
 * municipality's name alone silently mixes barangays from unrelated
 * provinces. Codes are hierarchical and collision-free.
 */

type PhModule = {
    provinces: { name: string; reg_code: string; prov_code: string }[];
    city_mun: { name: string; prov_code: string; mun_code: string }[];
    barangays: { name: string; mun_code: string }[];
};

export type PhProvince = { name: string; code: string };
export type PhCityMun = { name: string; code: string };
export type PhBarangay = { name: string };

let cached: PhModule | null = null;

async function load(): Promise<PhModule> {
    if (!cached) {
        cached = (await import(
            "phil-reg-prov-mun-brgy"
        )) as unknown as PhModule;
    }
    return cached;
}

const collator = new Intl.Collator("en", { sensitivity: "base" });

/**
 * NCR (region 13) is stored as four separate legislative-district "provinces"
 * ("NCR, Second District", etc.) — technically correct PSGC, but not how
 * anyone filling out an address thinks of Metro Manila. Consolidated into one
 * synthetic province so "Metro Manila" is a single pick; city/barangay
 * lookups below expand it back into the four real province codes it stands
 * for. Safe to merge — the 28 NCR cities/municipalities have no duplicate
 * names between those four districts.
 */
const METRO_MANILA_CODE = "NCR";

export async function listProvinces(): Promise<PhProvince[]> {
    const d = await load();
    const ncrProvCodes = new Set(d.provinces.filter((p) => p.reg_code === "13").map((p) => p.prov_code));
    const nonNcr = d.provinces
        .filter((p) => p.reg_code !== "13")
        .map((p) => ({ name: p.name, code: p.prov_code }));
    const list = ncrProvCodes.size > 0
        ? [...nonNcr, { name: "Metro Manila", code: METRO_MANILA_CODE }]
        : nonNcr;
    return list.sort((a, b) => collator.compare(a.name, b.name));
}

async function ncrProvinceCodes(d: PhModule): Promise<string[]> {
    return [...new Set(d.provinces.filter((p) => p.reg_code === "13").map((p) => p.prov_code))];
}

export async function listCities(provinceCode: string): Promise<PhCityMun[]> {
    const d = await load();
    const provCodes =
        provinceCode === METRO_MANILA_CODE ? await ncrProvinceCodes(d) : [provinceCode];
    return d.city_mun
        .filter((c) => provCodes.includes(c.prov_code))
        .map((c) => ({ name: c.name, code: c.mun_code }))
        .sort((a, b) => collator.compare(a.name, b.name));
}

export async function listBarangays(cityCode: string): Promise<PhBarangay[]> {
    const d = await load();
    return d.barangays
        .filter((b) => b.mun_code === cityCode)
        .map((b) => ({ name: b.name }))
        .sort((a, b) => collator.compare(a.name, b.name));
}

/**
 * Re-derives codes from the names stored on a property, so editing a lead
 * re-opens the picker with Province/City/Barangay already selected instead
 * of forcing a re-pick from scratch. Province names are unique in this
 * dataset (unlike municipality names), so the province lookup is safe by
 * name; city and barangay lookups are then scoped by the resolved codes.
 */
export async function resolveCodes(args: {
    province?: string;
    cityMunicipality?: string;
    barangay?: string;
}): Promise<{ provinceCode?: string; cityCode?: string }> {
    if (!args.province) return {};
    const provinces = await listProvinces();
    const province = provinces.find((p) => p.name === args.province);
    if (!province) return {};

    if (!args.cityMunicipality) return { provinceCode: province.code };
    const cities = await listCities(province.code);
    const city = cities.find((c) => c.name === args.cityMunicipality);
    if (!city) return { provinceCode: province.code };

    return { provinceCode: province.code, cityCode: city.code };
}

export type PhAddressValue = {
    houseUnitBlockLot: string;
    streetName: string;
    subdivision: string;
    barangay: string;
    cityMunicipality: string;
    province: string;
    zipCode: string;
};

export const EMPTY_PH_ADDRESS: PhAddressValue = {
    houseUnitBlockLot: "",
    streetName: "",
    subdivision: "",
    barangay: "",
    cityMunicipality: "",
    province: "",
    zipCode: "",
};

/**
 * Only the cascade itself is required — House/Unit/Block & Lot, Street Name
 * and ZIP Code are all optional (Subdivision/Village always was). ZIP still
 * gets format-checked when someone bothers to type one; an empty ZIP is
 * just... empty.
 */
export function validatePhAddress(value: PhAddressValue): string | null {
    if (!value.province.trim()) return "Province is required";
    if (!value.cityMunicipality.trim()) return "City or Municipality is required";
    if (!value.barangay.trim()) return "Barangay is required";
    if (value.zipCode.trim() && !/^\d{4}$/.test(value.zipCode.trim())) {
        return "Enter a valid 4-digit ZIP code";
    }
    return null;
}

/** The four-line composed address every existing PDF/contract/Overview reads. */
export function composeLegacyAddress(args: {
    houseUnitBlockLot?: string;
    streetName?: string;
    subdivision?: string;
    barangay?: string;
    cityMunicipality?: string;
    province?: string;
    zipCode?: string;
}): { address: string; city: string; state: string; zip: string } {
    return {
        address: [args.houseUnitBlockLot, args.streetName, args.subdivision]
            .map((s) => s?.trim())
            .filter(Boolean)
            .join(", "),
        city: [args.barangay, args.cityMunicipality]
            .map((s) => s?.trim())
            .filter(Boolean)
            .join(", "),
        state: args.province?.trim() ?? "",
        zip: args.zipCode?.trim() ?? "",
    };
}
