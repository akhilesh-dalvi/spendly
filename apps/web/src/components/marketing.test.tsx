// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ComponentProps, type ReactNode, useCallback } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AboutPage, {
	metadata as aboutMetadata,
} from "../app/(marketing)/about/page";
import { faqPageGroups } from "../app/(marketing)/faqs/faq-page-data";
import FaqsPage, {
	metadata as faqsMetadata,
} from "../app/(marketing)/faqs/page";
import FeaturesPage from "../app/(marketing)/features/page";
import MarketingLayout from "../app/(marketing)/layout";
import LandingPage, { metadata as homeMetadata } from "../app/(marketing)/page";
import PricingPage, {
	metadata as pricingMetadata,
} from "../app/(marketing)/pricing/page";
import TermsPage from "../app/(marketing)/terms/page";
import { faqItems } from "./faq-data";
import FaqSection from "./faq-section";
import { MarketingHeader } from "./marketing-header";
import { ModeToggle } from "./mode-toggle";

const TERMS_HEADING = /terms/i;
const PRODUCT_TERMS = /expense|spendly/i;
const SUPPORT_PROMPT = /Still have questions/;
const PRICING_LINK = /pricing/i;
const UNSUPPORTED_FAQ_CLAIMS = /forever|unlimited|credit card|MCP|[—–]/i;
const UNSUPPORTED_ABOUT_CLAIMS =
	/Many budgeting tools|punishment|forever|zero setup|savings tracking|collaboration|MCP|No setup quiz|add cycles and plans when it helps|[—–]/i;
const UNSUPPORTED_PRICING_CLAIMS =
	/donat|sponsor|ko-fi|paypal|stripe|future|premium|paid tier|forever|unlimited|credit card|zero setup|MCP|AI feature|export|No setup quiz|add cycles and plans when it helps/i;

const auth = vi.hoisted(() => ({ setTheme: vi.fn(), signedIn: false }));
vi.mock("@clerk/nextjs", () => ({
	SignedIn: ({ children }: { children: ReactNode }) =>
		auth.signedIn ? children : null,
	SignedOut: ({ children }: { children: ReactNode }) =>
		auth.signedIn ? null : children,
	SignInButton: ({ children }: { children: ReactNode }) => children,
	UserButton: () => <button type="button">Account menu</button>,
}));
vi.mock("next-themes", () => ({
	useTheme: () => ({ setTheme: auth.setTheme }),
}));
vi.mock("next/link", () => ({
	default: ({ href, onClick, ...props }: ComponentProps<"a">) => {
		const handleClick = useCallback(
			(event: React.MouseEvent<HTMLAnchorElement>) => {
				event.preventDefault();
				onClick?.(event);
			},
			[onClick]
		);
		return <a {...props} href={href ?? "#"} onClick={handleClick} />;
	},
}));

beforeEach(() => {
	auth.signedIn = false;
	auth.setTheme.mockClear();
});

describe("public marketing routes", () => {
	it.each([
		{
			heading: "Understand your spending. On your terms.",
			name: "home",
			Page: LandingPage,
		},
		{
			heading: "Record expenses. See what changed.",
			name: "features",
			Page: FeaturesPage,
		},
		{ heading: "Spendly is free to use.", name: "pricing", Page: PricingPage },
		{
			heading: "About Spendly",
			name: "about",
			Page: AboutPage,
		},
		{
			heading: "Frequently asked questions",
			name: "faqs",
			Page: FaqsPage,
		},
	])(
		"offers public signup and readable primary content on $name",
		({ Page, heading }) => {
			const { container } = render(<Page />);
			expect(
				screen.getByRole("heading", { level: 1, name: heading })
			).toBeVisible();
			for (const link of screen.getAllByRole("link", {
				name:
					Page === PricingPage || Page === FaqsPage
						? "Sign up"
						: "Get Started Free",
			})) {
				expect(link).toHaveAttribute("href", "/sign-up");
			}
			expect(
				screen.queryByRole("link", { name: "Go to Dashboard" })
			).not.toBeInTheDocument();
			const scripts = container.querySelectorAll(
				'script[type="application/ld+json"]'
			);
			expect(scripts.length).toBeGreaterThan(0);
			for (const script of scripts) {
				expect(JSON.parse(script.textContent ?? "{}")).toMatchObject({
					"@context": "https://schema.org",
				});
			}
		}
	);

	it.each([LandingPage, FeaturesPage, PricingPage, AboutPage, FaqsPage])(
		"offers the dashboard instead of signup for a signed-in visitor %#",
		(Page) => {
			auth.signedIn = true;
			render(<Page />);
			for (const link of screen.getAllByRole("link", {
				name: Page === FaqsPage ? "Dashboard" : "Go to Dashboard",
			})) {
				expect(link).toHaveAttribute("href", "/dashboard");
			}
			expect(
				screen.queryByRole("link", { name: "Get Started Free" })
			).not.toBeInTheDocument();
		}
	);

	it("groups FAQ questions with working topic links and no redundant introduction", () => {
		render(<FaqsPage />);
		const topics = screen.getByRole("navigation", { name: "FAQ topics" });
		expect(within(topics).getAllByRole("link")).toHaveLength(5);
		for (const group of faqPageGroups) {
			expect(
				within(topics).getByRole("link", { name: group.title })
			).toHaveAttribute("href", `#${group.id}`);
			const section = screen.getByRole("region", { name: group.title });
			expect(section).toHaveAttribute("id", group.id);
			expect(within(section).getAllByRole("button")).toHaveLength(
				group.items.length
			);
		}
		expect(screen.queryByText("A quick way to use this page")).toBeNull();
	});

	it.each(faqPageGroups.flatMap((group) => group.items))(
		"opens and closes the page-owned answer to $question by keyboard",
		async (item) => {
			const user = userEvent.setup();
			render(<FaqsPage />);
			const trigger = screen.getByRole("button", { name: item.question });
			trigger.focus();
			await user.keyboard("{Enter}");
			expect(trigger).toHaveAttribute("aria-expanded", "true");
			if (item.steps) {
				const answer = screen.getByRole("region", { name: item.question });
				const list = within(answer).getByRole("list");
				expect(within(list).getAllByRole("listitem")).toHaveLength(
					item.steps.length
				);
				for (const step of item.steps) {
					expect(within(list).getByText(step.text)).toBeVisible();
					if (step.href) {
						expect(
							within(list).getByRole("link", { name: step.text })
						).toHaveAttribute("href", step.href);
					}
				}
				expect(item.steps.map((step) => step.text).join(" ")).toBe(item.answer);
			} else {
				expect(screen.getByText(item.answer)).toBeVisible();
			}
			await user.keyboard(" ");
			expect(trigger).toHaveAttribute("aria-expanded", "false");
		}
	);

	it.each([false, true])(
		"keeps FAQ help public without a signup-as-help CTA (%s)",
		(signedIn) => {
			auth.signedIn = signedIn;
			render(<FaqsPage />);
			const help = screen.getByRole("region", {
				name: "Still have a question?",
			});
			expect(within(help).getAllByRole("link")).toHaveLength(2);
			expect(
				within(help).getByRole("link", { name: "Explore features" })
			).toHaveAttribute("href", "/features");
			expect(
				within(help).getByRole("link", { name: "GitHub repository" })
			).toHaveAttribute("href", "https://github.com/akhilesh-dalvi/spendly");
			expect(help).toHaveTextContent("and open Issues");
			expect(help).toHaveTextContent("Check for an existing report");
			expect(help).toHaveTextContent("what you expected");
			expect(help).toHaveTextContent("Bug reports are public.");
			expect(help).toHaveTextContent(
				"leave out personal financial details and credentials"
			);
			expect(within(help).queryByRole("link", { name: "Sign up" })).toBeNull();
			expect(screen.getByRole("main")).not.toHaveTextContent("No setup quiz");
		}
	);

	it("keeps FAQ structured answers identical to the page-owned content and metadata aligned", () => {
		const { container } = render(<FaqsPage />);
		const scripts = Array.from(
			container.querySelectorAll('script[type="application/ld+json"]'),
			(script) => JSON.parse(script.textContent ?? "{}")
		);
		const items = faqPageGroups.flatMap((group) => group.items);
		expect(scripts[0]).toEqual({
			"@context": "https://schema.org",
			"@type": "FAQPage",
			mainEntity: items.map((item) => ({
				"@type": "Question",
				acceptedAnswer: { "@type": "Answer", text: item.answer },
				name: item.question,
			})),
		});
		expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
		const description =
			"Get practical answers about Spendly setup, cycle dates, optional planning, categories, tags, editable expense history, and comparing cycles.";
		expect(faqsMetadata).toMatchObject({
			alternates: { canonical: "https://spendly.example.com/faqs" },
			description,
			openGraph: { description, title: "Spendly | FAQs" },
			title: "Spendly | FAQs",
			twitter: { description, title: "Spendly | FAQs" },
		});
		expect(scripts[1]).toMatchObject({
			"@type": "WebApplication",
			description,
			featureList: [
				"Flexible, non-overlapping cycles with an exclusive end date",
				"Optional planned amounts per category, without spending blocks",
				"Editable past expenses and cycles",
				"Side-by-side comparison of 2-5 cycles",
			],
			url: "https://spendly.example.com/faqs",
		});
		expect(JSON.stringify(scripts)).not.toMatch(UNSUPPORTED_FAQ_CLAIMS);
	});

	it("explains AI actions through the CLI with review and privacy guidance", () => {
		render(<FaqsPage />);
		expect(faqPageGroups[1]?.id).toBe("using-ai");
		const ai = screen.getByRole("region", { name: "Using AI" });
		expect(
			within(ai).getByRole("link", {
				name: "Set up the CLI and Spendly skill",
			})
		).toHaveAttribute("href", "/docs/cli/ai-agents");
		const answers = faqPageGroups[1]?.items
			.map((item) => item.answer)
			.join(" ");
		expect(answers).toContain("not a chat inside the web app");
		expect(answers).toContain("Do not save it yet.");
		expect(answers).toContain("read back the result");
		expect(answers).toContain("may be sent to its AI provider");
		expect(answers).toContain("check existing records before trying again");
	});

	it("preserves FAQ date boundaries, optional setup, and organization caveats", () => {
		const answers = new Map(
			faqPageGroups
				.flatMap((group) => group.items)
				.map((item) => [item.id, item.answer])
		);
		expect(answers.get("first-expense")).toContain("then create a cycle");
		expect(answers.get("first-expense")).toContain("Enter an amount");
		expect(answers.get("first-expense")).not.toContain("positive amount");
		expect(
			faqPageGroups
				.flatMap((group) => group.items)
				.find((item) => item.id === "optional-planning")?.question
		).toBe("Do I need to set planned amounts?");
		expect(answers.get("optional-setup")).toContain(
			"Both starting paths require a cycle"
		);
		expect(answers.get("optional-setup")).toContain(
			"Categories, category types, tags, notes, planned amounts, and accounts are optional."
		);
		expect(answers.get("cycle-dates")).toContain(
			"The start date is included; the end date is not."
		);
		expect(answers.get("cycle-dates")).toContain(
			"July 1 as the start and August 1 as the end"
		);
		expect(answers.get("trip-cycle")).toContain("use a tag");
		expect(answers.get("outside-cycle")).toContain("In the web app");
		expect(answers.get("outside-cycle")).toContain("Past dates are allowed.");
		expect(answers.get("editable-history")).toContain(
			"rather than assuming they have moved"
		);
		expect(answers.get("categories-and-types")).toContain(
			"not a savings-tracking feature"
		);
		expect(answers.get("changing-categories")).toContain(
			"it does not delete the expenses"
		);
		expect(answers.get("optional-planning")).toContain(
			"does not block you from saving expenses"
		);
		expect(answers.get("comparison")).toContain("Select 2-5 cycles");
	});

	it("tells About's personal origin, developer motivation, and open-source story", () => {
		render(<AboutPage />);
		expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
		expect(
			screen
				.getAllByRole("heading", { level: 2 })
				.map((heading) => heading.textContent)
		).toEqual([
			"From pen and paper to a spreadsheet",
			"A personal tool, a real project",
			"Why open source",
			"Making the habit easier",
			"Make it part of your day",
		]);
		const main = screen.getByRole("main");
		expect(main).toHaveTextContent("At the end of each day");
		expect(main).toHaveTextContent("Later, I moved to Excel.");
		expect(main).toHaveTextContent("Google Sheets");
		expect(main).toHaveTextContent("phone and laptop");
		expect(main).toHaveTextContent("The spreadsheet worked");
		expect(main).toHaveTextContent(
			"not make everyone follow the system I happened to use"
		);
		expect(main).toHaveTextContent("a real product in my portfolio");
		expect(main).toHaveTextContent(
			"I’m Akhilesh, the developer behind Spendly."
		);
		expect(main).toHaveTextContent("learning to build with AI");
		expect(main).toHaveTextContent(
			"I review AI-generated code and test what I ship, including complete user journeys."
		);
		expect(main).toHaveTextContent(
			"people who want to build their own expense-tracking habit"
		);
		expect(
			within(main).getByRole("link", { name: "Spendly CLI" })
		).toHaveAttribute("href", "/docs/cli");
		expect(main).toHaveTextContent("fork it to build what you need");
		expect(main).toHaveTextContent("or contribute improvements");
		expect(main).toHaveTextContent(
			"a command-line tool for recording expenses without opening the web app"
		);
		expect(
			within(main).getByRole("link", { name: "Explore features" })
		).toHaveAttribute("href", "/features");
		expect(
			within(main).getByRole("link", {
				name: "akhilesh-dalvi/spendly",
			})
		).toHaveAttribute("href", "https://github.com/akhilesh-dalvi/spendly");
		expect(within(main).queryByRole("link", { name: PRICING_LINK })).toBeNull();
		expect(main).not.toHaveTextContent(UNSUPPORTED_ABOUT_CLAIMS);
	});

	it.each([false, true])(
		"keeps About's shared closing CTA accurate for signed-in state %s",
		(signedIn) => {
			auth.signedIn = signedIn;
			render(<AboutPage />);
			const hero = screen.getByRole("region", { name: "About Spendly" });
			const primary = within(hero).getByRole("link", {
				name: signedIn ? "Go to Dashboard" : "Sign up",
			});
			expect(primary).toHaveAttribute(
				"href",
				signedIn ? "/dashboard" : "/sign-up"
			);
			expect(primary).toHaveAttribute("data-variant", "default");
			expect(primary).toHaveAttribute("data-size", "lg");
			if (signedIn) {
				expect(
					within(hero).queryByRole("link", { name: "Sign up" })
				).toBeNull();
				expect(
					within(hero).queryByRole("link", { name: "Sign in" })
				).toBeNull();
			} else {
				const signIn = within(hero).getByRole("link", { name: "Sign in" });
				expect(signIn).toHaveAttribute("href", "/sign-in");
				expect(signIn).toHaveAttribute("data-variant", "outline");
				expect(signIn).toHaveAttribute("data-size", "lg");
			}
			expect(
				within(hero).getByRole("link", { name: "Explore features" })
			).not.toHaveAttribute("data-slot", "button");
			const closingSection = screen
				.getByRole("heading", { name: "Make it part of your day" })
				.closest("section");
			if (!closingSection) {
				throw new Error("About must render the shared closing CTA section");
			}
			expect(closingSection).toHaveTextContent(
				"Try Spendly for your own spending and see whether it fits the way you like to keep track."
			);
			expect(within(closingSection).getAllByRole("link")).toHaveLength(1);
			expect(
				within(closingSection).getByRole("link", {
					name: signedIn ? "Go to Dashboard" : "Get Started Free",
				})
			).toHaveAttribute("href", signedIn ? "/dashboard" : "/sign-up");
			expect(
				screen.queryByRole("link", {
					name: signedIn ? "Get Started Free" : "Go to Dashboard",
				})
			).toBeNull();
			const footer = screen.getByRole("contentinfo");
			if (signedIn) {
				expect(
					within(footer).queryByRole("link", { name: "Sign up" })
				).toBeNull();
				expect(
					within(footer).queryByRole("link", { name: "Sign in" })
				).toBeNull();
			} else {
				expect(
					within(footer).getByRole("link", { name: "Sign up" })
				).toHaveAttribute("href", "/sign-up");
				expect(
					within(footer).getByRole("link", { name: "Sign in" })
				).toHaveAttribute("href", "/sign-in");
			}
		}
	);

	it("keeps About metadata and structured data consistent with its scope", () => {
		const { container } = render(<AboutPage />);
		const description =
			"The story behind Spendly: how a daily expense-tracking habit grew from pen and paper into an open-source app, built by a developer learning with AI.";
		expect(aboutMetadata).toMatchObject({
			alternates: { canonical: "https://spendly.example.com/about" },
			description,
			openGraph: {
				description,
				title: "Spendly | About",
				url: "https://spendly.example.com/about",
			},
			title: "Spendly | About",
			twitter: { description, title: "Spendly | About" },
		});
		const script = container.querySelector(
			'script[type="application/ld+json"]'
		);
		expect(JSON.parse(script?.textContent ?? "{}")).toMatchObject({
			"@type": "WebApplication",
			description,
			featureList: ["Expense tracking in the web app and CLI"],
			url: "https://spendly.example.com/about",
		});
	});

	it("explains present pricing and included capabilities without speculative offers", () => {
		const { container } = render(<PricingPage />);
		const main = screen.getByRole("main");
		expect(main).toHaveTextContent(
			"All current web and CLI features are free."
		);
		expect(main).toHaveTextContent("optional spending plans");
		expect(main).toHaveTextContent("cycles - date ranges you choose");
		expect(main).toHaveTextContent("Record expenses and edit past entries.");
		expect(main).toHaveTextContent(
			"Add categories, tags, or notes when useful."
		);
		expect(main).toHaveTextContent("Set optional planned amounts");
		expect(main).toHaveTextContent(
			"Keep tracking even when spending goes over your plan."
		);
		expect(main).toHaveTextContent("Compare 2-5 cycles side by side");
		expect(main).toHaveTextContent(
			"In the web app, create a cycle covering your expense date"
		);
		expect(main).toHaveTextContent("then add an expense.");
		expect(main).toHaveTextContent(
			"Categories, tags, notes, and planned amounts are optional."
		);
		expect(main).toHaveTextContent(
			"Cycles cannot overlap, and the end date is not included."
		);
		expect(
			screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)
		).toEqual(["What's included", "Start with a cycle"]);
		const allPricingContent = `${container.textContent} ${JSON.stringify(pricingMetadata)}`;
		expect(allPricingContent).not.toMatch(UNSUPPORTED_PRICING_CLAIMS);
		expect(
			screen.queryByRole("link", { name: "Full pricing details" })
		).not.toBeInTheDocument();
	});

	it.each([false, true])(
		"keeps Pricing next steps useful for signed-in state %s",
		(signedIn) => {
			auth.signedIn = signedIn;
			render(<PricingPage />);
			const hero = screen.getByRole("region", {
				name: "Spendly is free to use.",
			});
			expect(
				within(hero).getByRole("link", {
					name: signedIn ? "Go to Dashboard" : "Sign up",
				})
			).toHaveAttribute("href", signedIn ? "/dashboard" : "/sign-up");
			if (signedIn) {
				expect(
					within(hero).queryByRole("link", { name: "Sign up" })
				).toBeNull();
				expect(
					within(hero).queryByRole("link", { name: "Sign in" })
				).toBeNull();
			} else {
				expect(
					within(hero).getByRole("link", { name: "Sign in" })
				).toHaveAttribute("href", "/sign-in");
				expect(
					within(hero).queryByRole("link", { name: "Go to Dashboard" })
				).toBeNull();
			}
			const closingSection = screen
				.getByRole("heading", { name: "Start with a cycle" })
				.closest("section");
			if (!closingSection) {
				throw new Error("Pricing must render the shared closing CTA section");
			}
			expect(within(closingSection).getAllByRole("link")).toHaveLength(1);
			expect(
				within(closingSection).getByRole("link", {
					name: signedIn ? "Go to Dashboard" : "Get Started Free",
				})
			).toHaveAttribute("href", signedIn ? "/dashboard" : "/sign-up");
			expect(
				within(closingSection).queryByRole("link", { name: "Sign in" })
			).toBeNull();
			expect(
				within(closingSection).queryByRole("link", { name: "Explore features" })
			).toBeNull();
			expect(
				screen.getByRole("link", { name: "Explore features" })
			).toHaveAttribute("href", "/features");
			expect(screen.getByRole("link", { name: "Spendly CLI" })).toHaveAttribute(
				"href",
				"/docs/cli"
			);
		}
	);

	it("uses consistent current facts in Pricing metadata and structured data", () => {
		const { container } = render(<PricingPage />);
		const description =
			"All current Spendly web and CLI features are free, including expense tracking, optional spending plans, editable expense history, and cycle comparisons.";
		expect(pricingMetadata).toMatchObject({
			alternates: { canonical: "https://spendly.example.com/pricing" },
			description,
			openGraph: { description, title: "Spendly | Pricing" },
			title: "Spendly | Pricing",
			twitter: { description, title: "Spendly | Pricing" },
		});
		const script = container.querySelector(
			'script[type="application/ld+json"]'
		);
		expect(JSON.parse(script?.textContent ?? "{}")).toMatchObject({
			"@type": "WebApplication",
			description,
			featureList: [
				"Expense tracking with flexible cycles",
				"Editable expense history",
				"Optional planned amounts per category and cycle",
				"Side-by-side comparison of 2-5 cycles",
			],
			url: "https://spendly.example.com/pricing",
		});
	});

	it("explains Features setup and keeps CLI and FAQ guidance public", () => {
		render(<FeaturesPage />);
		const hero = screen.getByRole("region", {
			name: "Record expenses. See what changed.",
		});
		expect(hero).toHaveTextContent("cycles - date ranges you choose");
		expect(hero).toHaveTextContent(
			"In the app, create a cycle covering your expense date"
		);
		expect(screen.getByRole("link", { name: "Spendly CLI" })).toHaveAttribute(
			"href",
			"/docs/cli"
		);
		expect(screen.getByRole("link", { name: "Read FAQs" })).toHaveAttribute(
			"href",
			"/faqs"
		);
		expect(within(hero).getByRole("link", { name: "Sign up" })).toHaveAttribute(
			"href",
			"/sign-up"
		);
		expect(within(hero).getByRole("link", { name: "Sign in" })).toHaveAttribute(
			"href",
			"/sign-in"
		);
		expect(hero).toHaveTextContent("enter a positive amount and date");
		expect(hero).toHaveTextContent(
			"set the end date to the first day of the next month"
		);
		expect(hero).toHaveTextContent("set the end date to your next payday");
		expect(hero).toHaveTextContent(
			"set the end date to the day after you return"
		);
		expect(hero).toHaveTextContent("The end date is not included.");
		expect(hero).toHaveTextContent("Cycles cannot overlap");
		expect(screen.getByRole("main")).toHaveTextContent(
			"Add your first expense and build a clearer picture of your spending as you go."
		);
		expect(screen.getByRole("main")).not.toHaveTextContent(
			"or add cycles and plans when it helps"
		);
	});

	it("introduces core terms before Features benefits without making organization required", () => {
		render(<FeaturesPage />);
		const terms = screen.getByRole("region", {
			name: "A few names you'll see in Spendly",
		});
		expect(
			within(terms)
				.getAllByRole("term")
				.map((term) => term.textContent)
		).toEqual([
			"Cycle",
			"Expense",
			"Category",
			"Category type",
			"Tag",
			"Planned amount",
		]);
		expect(within(terms).getAllByRole("definition")).toHaveLength(6);
		expect(terms).toHaveTextContent(
			"Categories, category types, tags, notes, and planned amounts are optional."
		);
		expect(terms).toHaveTextContent(
			"Something you spent money on, like groceries or a taxi ride."
		);
		expect(terms).toHaveTextContent(
			"A group of similar expenses within a cycle"
		);
		expect(terms).toHaveTextContent(
			"such as Groceries, Rent, Dining out, or Gifts"
		);
		expect(terms).toHaveTextContent("Group Groceries and Rent under Needs");
		expect(terms).toHaveTextContent(
			"Savings is also a label, not a savings-tracking feature."
		);
		expect(terms).toHaveTextContent("Dining out and Gifts under Wants");
		expect(terms).toHaveTextContent(
			"A label for related expenses across categories"
		);
		expect(
			screen.getByRole("region", {
				name: "Make your spending easier to review",
			})
		).toHaveTextContent(
			"You can keep adding expenses even if spending goes over your plan."
		);
		const regions = screen.getAllByRole("region");
		expect(regions.indexOf(terms)).toBeLessThan(
			regions.indexOf(
				screen.getByRole("region", {
					name: "Make your spending easier to review",
				})
			)
		);
	});

	it("keeps the public canonical URL and a real skip-to-content destination", () => {
		render(
			<MarketingLayout>
				<LandingPage />
			</MarketingLayout>
		);
		expect(homeMetadata.alternates?.canonical).toBe(
			"https://spendly.example.com/"
		);
		expect(
			screen.getByRole("link", { name: "Skip to content" })
		).toHaveAttribute("href", "#main-content");
		expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
	});

	it("explains setup before the product tour and links to the first steps", () => {
		render(<LandingPage />);
		expect(
			screen
				.getAllByRole("heading", { level: 2 })
				.map((heading) => heading.textContent)
		).toEqual([
			"From setup to your first expense",
			"See how Spendly works",
			"Is Spendly right for you?",
			"Common questions",
			"Start tracking for free",
		]);
		expect(
			screen.getByRole("link", { name: "See how it works" })
		).toHaveAttribute("href", "#how-it-works");
		const workflow = document.getElementById("how-it-works");
		expect(workflow).toHaveTextContent(
			"Choose a date range - Spendly calls this a cycle."
		);
		expect(workflow).toHaveTextContent("Enter an amount and date, then save.");
		expect(workflow).toHaveTextContent(
			"Your expense date must fall within this range."
		);
		const tourHeadings = screen
			.getAllByRole("heading", { level: 3 })
			.map((heading) => heading.textContent);
		expect(
			tourHeadings.indexOf("Check your spending at a glance")
		).toBeLessThan(tourHeadings.indexOf("See what changed over time"));
		expect(screen.getAllByRole("link", { name: "Sign in" })).toHaveLength(2);
	});

	it("presents product choices without manual-only wording or tour labels", () => {
		render(<LandingPage />);
		expect(
			screen.getByRole("heading", { name: "Focused by design" })
		).toBeVisible();
		expect(screen.getByRole("link", { name: "Spendly CLI" })).toHaveAttribute(
			"href",
			"/docs/cli"
		);
		expect(screen.queryByText("Know the limits")).not.toBeInTheDocument();
		expect(
			screen.queryByText("You enter expenses yourself", { exact: false })
		).not.toBeInTheDocument();
		for (const label of [
			"Expense entry",
			"Expense history",
			"Overview",
			"Comparison",
		]) {
			expect(
				screen.queryByText(label, { exact: true })
			).not.toBeInTheDocument();
		}
	});

	it.each([false, true])(
		"offers public FAQ help regardless of sign-in state (%s)",
		async (signedIn) => {
			auth.signedIn = signedIn;
			const user = userEvent.setup();
			render(<LandingPage />);
			expect(
				screen.getByRole("link", { name: "Browse all FAQs" })
			).toHaveAttribute("href", "/faqs");
			const question = screen.getByRole("button", {
				name: "What if my expense is outside my cycle dates?",
			});
			question.focus();
			await user.keyboard("{Enter}");
			expect(question).toHaveAttribute("aria-expanded", "true");
			expect(
				screen.getByText(
					"Create a cycle that covers the expense date before saving it. You can use past dates when recording an older expense."
				)
			).toBeVisible();
			expect(screen.queryByText(SUPPORT_PROMPT)).not.toBeInTheDocument();
		}
	);

	it("opens the product screenshots by keyboard and restores focus on escape", async () => {
		const user = userEvent.setup();
		render(<LandingPage />);
		const trigger = screen.getByRole("button", {
			name: "Open Add what you spent screenshot fullscreen",
		});
		trigger.focus();
		await user.keyboard("{Enter}");
		expect(screen.getByRole("dialog")).toHaveAccessibleName(
			"Add what you spent"
		);
		await user.keyboard("{Escape}");
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
		expect(trigger).toHaveFocus();
	});

	it("provides readable terms and a return link", () => {
		render(<TermsPage />);
		expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
			TERMS_HEADING
		);
		expect(screen.getByRole("main")).toHaveTextContent(PRODUCT_TERMS);
		expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute(
			"href",
			"/"
		);
	});

	it.each([
		"Add what you spent",
		"Find and fix past entries",
		"See what changed over time",
		"Check your spending at a glance",
	])(
		"opens the %s screenshot with an accessible title and closes it",
		async (title) => {
			const user = userEvent.setup();
			render(<LandingPage />);
			await user.click(
				screen.getByRole("button", {
					name: `Open ${title} screenshot fullscreen`,
				})
			);
			const dialog = screen.getByRole("dialog");
			expect(dialog).toHaveAccessibleName();
			expect(within(dialog).getAllByRole("img")).toHaveLength(2);
			await user.click(within(dialog).getByRole("button", { name: "Close" }));
			expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
		}
	);
});

describe("marketing navigation and help", () => {
	it("uses Sign in and Sign up in the navigation", () => {
		render(<MarketingHeader />);
		expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
		const signupLinks = screen.getAllByRole("link", { name: "Sign up" });
		expect(signupLinks).toHaveLength(2);
		for (const link of signupLinks) {
			expect(link).toHaveAttribute("href", "/sign-up");
		}
	});

	it.each([false, true])(
		"links to GitHub regardless of sign-in state (%s)",
		(signedIn) => {
			auth.signedIn = signedIn;
			render(<MarketingHeader />);
			const link = screen.getByRole("link", { name: "GitHub" });
			expect(link).toHaveAttribute(
				"href",
				"https://github.com/akhilesh-dalvi/spendly"
			);
			expect(link).toHaveAttribute("target", "_blank");
			expect(link).toHaveAttribute("rel", "noopener noreferrer");
		}
	);

	it("opens, closes, and dismisses the mobile navigation without responding to unrelated keys", async () => {
		const user = userEvent.setup();
		render(<MarketingHeader />);
		await user.click(screen.getByRole("button", { name: "Open Menu" }));
		expect(screen.getByRole("button", { name: "Close Menu" })).toHaveAttribute(
			"aria-expanded",
			"true"
		);
		fireEvent.keyDown(document, { key: "ArrowDown" });
		expect(
			screen.getByRole("button", { name: "Close Menu" })
		).toBeInTheDocument();
		fireEvent.keyDown(document, { key: "Escape" });
		expect(screen.getByRole("button", { name: "Open Menu" })).toHaveAttribute(
			"aria-expanded",
			"false"
		);
		await user.click(screen.getByRole("button", { name: "Open Menu" }));
		await user.click(screen.getByRole("link", { name: "Features" }));
		expect(
			screen.getByRole("button", { name: "Open Menu" })
		).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Open Menu" }));
		await user.click(screen.getByRole("link", { name: "home" }));
		expect(
			screen.getByRole("button", { name: "Open Menu" })
		).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Open Menu" }));
		await user.click(screen.getByRole("button", { name: "Close Menu" }));
		expect(
			screen.getByRole("button", { name: "Open Menu" })
		).toBeInTheDocument();
	});

	it("shows account controls only for signed-in visitors", () => {
		auth.signedIn = true;
		render(<MarketingHeader />);
		expect(screen.getByRole("button", { name: "Account menu" })).toBeVisible();
		expect(
			screen.queryByRole("button", { name: "Sign in" })
		).not.toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Toggle theme" })).toBeVisible();
	});

	it.each(["Light", "Dark", "System"])(
		"changes the theme to %s",
		async (theme) => {
			const user = userEvent.setup();
			render(<ModeToggle />);
			await user.click(screen.getByRole("button", { name: "Toggle theme" }));
			await user.click(screen.getByRole("menuitem", { name: theme }));
			expect(auth.setTheme).toHaveBeenCalledWith(theme.toLowerCase());
		}
	);

	it("keeps linked FAQ setup advice consistent with the homepage", async () => {
		const user = userEvent.setup();
		render(<FaqSection />);
		await user.click(
			screen.getByRole("button", {
				name: "What happens if an expense date falls outside my current cycles?",
			})
		);
		expect(
			screen.getByText(
				"Create a cycle that covers the expense date before saving it. You can use past dates when recording an older expense."
			)
		).toBeVisible();
	});

	it.each(faqItems)("expands and collapses $question", async (item) => {
		const user = userEvent.setup();
		render(<FaqSection />);
		const trigger = screen.getByRole("button", { name: item.question });
		await user.click(trigger);
		expect(trigger).toHaveAttribute("aria-expanded", "true");
		expect(screen.getByText(item.answer)).toBeVisible();
		await user.click(trigger);
		expect(trigger).toHaveAttribute("aria-expanded", "false");
	});

	it("supports custom FAQ headings and hides support calls to action", () => {
		render(
			<FaqSection
				description="Custom help"
				id="help"
				showSupportText={false}
				title="Help center"
			/>
		);
		expect(screen.getByRole("heading", { name: "Help center" })).toBeVisible();
		expect(screen.getByText("Custom help")).toBeVisible();
		expect(screen.queryByText(SUPPORT_PROMPT)).not.toBeInTheDocument();
	});
});
