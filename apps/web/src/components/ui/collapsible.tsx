"use client";

import {
	Content as CollapsibleContentPrimitive,
	Root as CollapsibleRoot,
	Trigger as CollapsibleTriggerPrimitive,
} from "@radix-ui/react-collapsible";
import type { ComponentPropsWithoutRef } from "react";

function Collapsible({
	...props
}: ComponentPropsWithoutRef<typeof CollapsibleRoot>) {
	return <CollapsibleRoot data-slot="collapsible" {...props} />;
}

function CollapsibleTrigger({
	...props
}: ComponentPropsWithoutRef<typeof CollapsibleTriggerPrimitive>) {
	return (
		<CollapsibleTriggerPrimitive data-slot="collapsible-trigger" {...props} />
	);
}

function CollapsibleContent({
	...props
}: ComponentPropsWithoutRef<typeof CollapsibleContentPrimitive>) {
	return (
		<CollapsibleContentPrimitive data-slot="collapsible-content" {...props} />
	);
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
