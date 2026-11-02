import defaultMdxComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";
import { DocsCodeBlock } from "@/components/docs/code-block";

export const getMDXComponents = (
	components?: MDXComponents
): MDXComponents => ({
	...defaultMdxComponents,
	pre: DocsCodeBlock,
	...components,
});
