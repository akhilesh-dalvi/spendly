import { createFromSource } from "fumadocs-core/search/server";
import { cliDocsSource } from "@/lib/docs/source";

export const { GET } = createFromSource(cliDocsSource);
