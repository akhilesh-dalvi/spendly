import { repeatAsync } from "../async-iteration.js";
import type { BackendCommandContext } from "../client/convex-client.js";
import { tagSchema } from "../domain/read-schemas.js";
import type { InteractivePrompter } from "../input/types.js";
import { queryParsed } from "./mutation-support.js";

const ADD_TAG = "__spendly_add_tag__";
const SKIP_MATCH = "__spendly_skip_tag__";
const pendingTag = (index: number) => `__spendly_pending_tag_${index}__`;
const matchKey = (name: string) => name.trim().toLowerCase();
const UNSAFE_TAG_NAME = /[\p{Cc}\p{Zl}\p{Zp}]/u;
const MAX_PENDING_TAGS = 20;

export interface ExpenseTagDraft {
	newTagNames: string[];
	tagIds: string[];
}

export const promptExpenseTags = async (options: {
	context: BackendCommandContext;
	initial?: ExpenseTagDraft;
	message: string;
	prompter: InteractivePrompter;
}): Promise<ExpenseTagDraft> => {
	const tags = await queryParsed(
		options.context,
		"resources.listTags",
		{},
		tagSchema.array()
	);
	let tagIds = options.initial?.tagIds ?? [];
	let newTagNames = options.initial?.newTagNames ?? [];
	for await (const selected of repeatAsync(() =>
		options.prompter.multiselect({
			initialValues: [
				...tagIds,
				...newTagNames.map((_, index) => pendingTag(index)),
			],
			message: options.message,
			options: [
				...tags.map((tag) => ({ label: tag.name, value: tag.id })),
				...newTagNames.map((name, index) => ({
					label: `${name} (new, not saved)`,
					value: pendingTag(index),
				})),
				...(newTagNames.length < MAX_PENDING_TAGS
					? [{ label: "Add a new tag (select, then confirm)", value: ADD_TAG }]
					: []),
			],
			required: false,
			searchable: tags.length > 8,
		})
	)) {
		const selectedSet = new Set(selected);
		tagIds = tags.filter((tag) => selectedSet.has(tag.id)).map((tag) => tag.id);
		newTagNames = newTagNames.filter((_, index) =>
			selectedSet.has(pendingTag(index))
		);
		if (!selectedSet.has(ADD_TAG)) {
			return { newTagNames, tagIds };
		}
		const name = (
			await options.prompter.text({
				message: "New tag name (blank to go back)",
				validate: (raw) => {
					if (UNSAFE_TAG_NAME.test(raw) || [...raw.trim()].length > 100) {
						return "Use at most 100 characters and no control characters";
					}
					if (
						raw.trim() &&
						newTagNames.some((pending) => matchKey(pending) === matchKey(raw))
					) {
						return "That tag is already staged";
					}
				},
			})
		).trim();
		if (!name) {
			continue;
		}
		const matches = tags.filter((tag) => matchKey(tag.name) === matchKey(name));
		if (matches.length === 0) {
			newTagNames.push(name);
			continue;
		}
		const choice = await options.prompter.select({
			message:
				"This tag name already exists. Choose an existing tag or go back",
			options: [
				...matches.map((tag) => ({
					label: `Use ${tag.name}${matches.length > 1 ? ` (${tag.id})` : ""}`,
					value: tag.id,
				})),
				{ label: "Go back without adding a tag", value: SKIP_MATCH },
			],
		});
		if (choice !== SKIP_MATCH && !tagIds.includes(choice)) {
			tagIds.push(choice);
		}
	}
	throw new Error("The tag picker did not finish");
};
