import { CliError } from "../errors.js";

export interface NamedResource {
	id: string;
	name: string;
}

export const resolveExactName = <Resource extends NamedResource>(options: {
	kind: string;
	name: string;
	nonInteractive: boolean;
	resources: readonly Resource[];
}): Resource => {
	const normalizedName = options.name.trim().toLocaleLowerCase();
	if (normalizedName.length === 0) {
		throw new CliError("INVALID_INPUT", `${options.kind} name cannot be empty`);
	}
	if (options.nonInteractive) {
		throw new CliError(
			"NON_INTERACTIVE_INPUT_REQUIRED",
			`Non-interactive ${options.kind} selectors require a stable ID`
		);
	}
	const matches = options.resources.filter(
		(resource) => resource.name.trim().toLocaleLowerCase() === normalizedName
	);
	if (matches.length === 0) {
		throw new CliError("RESOURCE_NOT_FOUND", `${options.kind} was not found`, {
			details: { name: options.name },
		});
	}
	if (matches.length > 1) {
		throw new CliError(
			"INVALID_INPUT",
			`${options.kind} name is ambiguous; use an ID`,
			{
				details: {
					candidates: matches.map(({ id, name }) => ({ id, name })),
				},
			}
		);
	}
	const match = matches[0];
	if (!match) {
		throw new CliError("INTERNAL_ERROR", "Selector resolution failed");
	}
	return match;
};

export const resolveIdOrExactName = <Resource extends NamedResource>(options: {
	kind: string;
	nonInteractive: boolean;
	resources: readonly Resource[];
	selector: string;
}): Resource => {
	const exactId = options.resources.find(
		(resource) => resource.id === options.selector
	);
	return (
		exactId ??
		resolveExactName({
			kind: options.kind,
			name: options.selector,
			nonInteractive: options.nonInteractive,
			resources: options.resources,
		})
	);
};
