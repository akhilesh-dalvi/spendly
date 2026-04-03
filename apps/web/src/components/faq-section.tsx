"use client";

import { SignedIn, SignedOut } from "@clerk/nextjs";
import { faqItems } from "@/components/faq-data";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";

interface FaqSectionProps {
	description?: string;
	id?: string;
	showSupportText?: boolean;
	title?: string;
}

export default function FaqSection({
	description = "Everything here is built to help you explore your spending with flexibility and clarity.",
	id = "faqs",
	showSupportText = true,
	title = "Frequently Asked Questions",
}: FaqSectionProps) {
	return (
		<section className="py-16 md:py-24" id={id}>
			<div className="mx-auto max-w-5xl px-4 md:px-6">
				<div className="mx-auto max-w-3xl text-center">
					<h2 className="mx-auto max-w-3xl text-balance font-semibold text-3xl md:text-4xl lg:text-5xl">
						{title}
					</h2>
					<p className="mt-4 text-balance text-muted-foreground">
						{description}
					</p>
				</div>

				<div className="mx-auto mt-12 max-w-3xl">
					<Accordion
						className="w-full rounded-2xl border bg-card px-8 py-3 shadow-sm ring-4 ring-muted dark:ring-0"
						collapsible
						type="single"
					>
						{faqItems.map((item) => (
							<AccordionItem
								className="border-dashed"
								key={item.id}
								value={item.id}
							>
								<AccordionTrigger className="cursor-pointer text-left text-base hover:no-underline">
									{item.question}
								</AccordionTrigger>
								<AccordionContent>
									<p className="text-base">{item.answer}</p>
								</AccordionContent>
							</AccordionItem>
						))}
					</Accordion>

					{showSupportText ? (
						<p className="mt-6 px-8 text-muted-foreground">
							<SignedOut>
								Still have questions?{" "}
								<a
									className="font-medium text-primary hover:underline"
									href="/sign-up"
								>
									Create a free account to get started
								</a>
							</SignedOut>
							<SignedIn>
								Need to check something in the app?{" "}
								<a
									className="font-medium text-primary hover:underline"
									href="/dashboard"
								>
									Open your dashboard
								</a>
							</SignedIn>
						</p>
					) : null}
				</div>
			</div>
		</section>
	);
}
