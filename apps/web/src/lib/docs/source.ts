import { loader } from "fumadocs-core/source";
import { defineDocs } from "fumadocs-mdx/macro";

const cliDocs = defineDocs({
	dir: "content/docs/cli",
});

export const cliDocsSource = loader({
	baseUrl: "/docs/cli",
	source: cliDocs.toFumadocsSource(),
});
