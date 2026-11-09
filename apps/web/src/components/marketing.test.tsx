// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ComponentProps, type ReactNode, useCallback } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AboutPage from "../app/(marketing)/about/page";
import FaqsPage from "../app/(marketing)/faqs/page";
import FeaturesPage from "../app/(marketing)/features/page";
import MarketingLayout from "../app/(marketing)/layout";
import LandingPage, { metadata as homeMetadata } from "../app/(marketing)/page";
import PricingPage from "../app/(marketing)/pricing/page";
import TermsPage from "../app/(marketing)/terms/page";
import { faqItems } from "./faq-data";
import FaqSection from "./faq-section";
import { MarketingHeader } from "./marketing-header";
import { ModeToggle } from "./mode-toggle";

const TERMS_HEADING = /terms/i;
const PRODUCT_TERMS = /expense|spendly/i;
const SUPPORT_PROMPT = /Still have questions/;

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
			heading: "Spendly is built for people who want calmer expense tracking.",
			name: "about",
			Page: AboutPage,
		},
		{
			heading: "Answers about how Spendly works in real life.",
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
				name: "Get Started Free",
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
				name: "Go to Dashboard",
			})) {
				expect(link).toHaveAttribute("href", "/dashboard");
			}
			expect(
				screen.queryByRole("link", { name: "Get Started Free" })
			).not.toBeInTheDocument();
		}
	);

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
