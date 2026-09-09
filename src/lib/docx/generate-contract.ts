import type { ContractDocxData } from "./contract-data.ts";

const TEMPLATE_URL = "/Contract Template.docx";

/**
 * Fills `public/Contract Template.docx` with the contract's data and returns
 * the generated document as a Blob. The template's tokens (`{homeowner_name}`,
 * `{price_words}`, etc.) were hand-tokenised from `Contract Sample.docx` —
 * see the migration note in 0018_contracts.sql for the field list.
 */
export async function generateContractDocx(data: ContractDocxData): Promise<Blob> {
    const [{ default: PizZip }, { default: Docxtemplater }, templateBuffer] = await Promise.all([
        import("pizzip"),
        import("docxtemplater"),
        fetch(TEMPLATE_URL).then((res) => {
            if (!res.ok) throw new Error("Failed to load the contract template");
            return res.arrayBuffer();
        }),
    ]);

    const zip = new PizZip(templateBuffer);
    const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });

    doc.render(data);

    return doc.getZip().generate({
        type: "blob",
        mimeType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
}
