import { useEffect, useRef, useState } from "react";

import {
    listBarangays,
    listCities,
    listProvinces,
    resolveCodes,
    type PhAddressValue,
    type PhBarangay,
    type PhCityMun,
    type PhProvince,
} from "@/lib/ph-address.ts";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select.tsx";

/**
 * House/Unit/Block & Lot, Street, Subdivision (free text) plus a
 * Province → City/Municipality → Barangay cascade sourced from PSGC data —
 * each level's options come from the level above, so a wrong barangay for
 * the chosen city is not a state that's reachable in the UI.
 *
 * Selects are keyed by PSGC code internally (never by name — see
 * src/lib/ph-address.ts on why), but the value this component emits is all
 * names, matching what `properties.province` / `.city_municipality` /
 * `.barangay` actually store.
 */
export default function PhilippineAddressFields({
    value,
    onChange,
    disabled,
    error,
}: {
    value: PhAddressValue;
    onChange: (value: PhAddressValue) => void;
    disabled?: boolean;
    /**
     * `validatePhAddress`'s message, shown inline instead of a toast — every
     * other field in the surrounding form shows its error next to the field,
     * so "Province is required" popping up at the top-right of the screen
     * with nothing on the form itself highlighted was the odd one out.
     */
    error?: string | null;
}) {
    const [provinces, setProvinces] = useState<PhProvince[] | null>(null);
    const [cities, setCities] = useState<PhCityMun[] | null>(null);
    const [barangays, setBarangays] = useState<PhBarangay[] | null>(null);
    const [provinceCode, setProvinceCode] = useState("");
    const [cityCode, setCityCode] = useState("");

    // Load the province list once, and — if this instance opens already
    // carrying a province/city (editing an existing property) — resolve
    // those names back to codes so the cascade re-populates instead of
    // forcing a re-pick from scratch.
    const resolvedFor = useRef<string | null>(null);
    useEffect(() => {
        let cancelled = false;
        const key = `${value.province}|${value.cityMunicipality}`;
        if (resolvedFor.current === key) return;
        resolvedFor.current = key;

        (async () => {
            const list = await listProvinces();
            if (cancelled) return;
            setProvinces(list);

            const { provinceCode: pCode, cityCode: cCode } = await resolveCodes({
                province: value.province,
                cityMunicipality: value.cityMunicipality,
                barangay: value.barangay,
            });
            if (cancelled) return;

            if (pCode) {
                setProvinceCode(pCode);
                setCities(await listCities(pCode));
            }
            if (cancelled) return;
            if (cCode) {
                setCityCode(cCode);
                setBarangays(await listBarangays(cCode));
            }
        })();

        return () => {
            cancelled = true;
        };
        // Re-resolves only when the incoming value's province/city actually
        // changes identity (e.g. switching which lead is being edited) — not
        // on every keystroke elsewhere in the form.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value.province, value.cityMunicipality]);

    async function handleProvinceChange(code: string) {
        const province = provinces?.find((p) => p.code === code);
        setProvinceCode(code);
        setCityCode("");
        setBarangays(null);
        setCities(await listCities(code));
        onChange({
            ...value,
            province: province?.name ?? "",
            cityMunicipality: "",
            barangay: "",
        });
    }

    async function handleCityChange(code: string) {
        const city = cities?.find((c) => c.code === code);
        setCityCode(code);
        setBarangays(await listBarangays(code));
        onChange({ ...value, cityMunicipality: city?.name ?? "", barangay: "" });
    }

    function handleBarangayChange(name: string) {
        onChange({ ...value, barangay: name });
    }

    return (
        <div className="space-y-3">
            <div className="space-y-1.5">
                <Label htmlFor="ph-house">House/Unit/Block & Lot Number</Label>
                <Input
                    id="ph-house"
                    placeholder="e.g. Blk 3 Lot 12, Unit 4B"
                    value={value.houseUnitBlockLot}
                    disabled={disabled}
                    onChange={(e) => onChange({ ...value, houseUnitBlockLot: e.target.value })}
                />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                    <Label htmlFor="ph-street">Street Name</Label>
                    <Input
                        id="ph-street"
                        placeholder="e.g. Kabesang Imo St"
                        value={value.streetName}
                        disabled={disabled}
                        onChange={(e) => onChange({ ...value, streetName: e.target.value })}
                    />
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="ph-subdivision">Subdivision/Village</Label>
                    <Input
                        id="ph-subdivision"
                        placeholder="Optional"
                        value={value.subdivision}
                        disabled={disabled}
                        onChange={(e) => onChange({ ...value, subdivision: e.target.value })}
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                    <Label htmlFor="ph-province">
                        Province <span className="text-destructive">*</span>
                    </Label>
                    <Select
                        value={provinceCode}
                        onValueChange={handleProvinceChange}
                        disabled={disabled || !provinces}
                    >
                        <SelectTrigger id="ph-province">
                            <SelectValue placeholder={provinces ? "Select province" : "Loading…"} />
                        </SelectTrigger>
                        <SelectContent>
                            {provinces?.map((p) => (
                                <SelectItem key={p.code} value={p.code}>
                                    {p.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-1.5">
                    <Label htmlFor="ph-city">
                        City or Municipality <span className="text-destructive">*</span>
                    </Label>
                    <Select
                        value={cityCode}
                        onValueChange={handleCityChange}
                        disabled={disabled || !cities}
                    >
                        <SelectTrigger id="ph-city">
                            <SelectValue
                                placeholder={!provinceCode ? "Select province first" : "Select city/municipality"}
                            />
                        </SelectTrigger>
                        <SelectContent>
                            {cities?.map((c) => (
                                <SelectItem key={c.code} value={c.code}>
                                    {c.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                    <Label htmlFor="ph-barangay">
                        Barangay <span className="text-destructive">*</span>
                    </Label>
                    <Select
                        value={value.barangay}
                        onValueChange={handleBarangayChange}
                        disabled={disabled || !barangays}
                    >
                        <SelectTrigger id="ph-barangay">
                            <SelectValue
                                placeholder={!cityCode ? "Select city/municipality first" : "Select barangay"}
                            />
                        </SelectTrigger>
                        <SelectContent>
                            {barangays?.map((b) => (
                                <SelectItem key={b.name} value={b.name}>
                                    {b.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-1.5">
                    <Label htmlFor="ph-zip">ZIP Code</Label>
                    <Input
                        id="ph-zip"
                        placeholder="Optional"
                        inputMode="numeric"
                        maxLength={4}
                        value={value.zipCode}
                        disabled={disabled}
                        onChange={(e) =>
                            onChange({ ...value, zipCode: e.target.value.replace(/\D/g, "").slice(0, 4) })
                        }
                    />
                </div>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
    );
}
