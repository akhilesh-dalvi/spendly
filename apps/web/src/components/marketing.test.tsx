// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps, ReactNode } from "react";
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
const SCREENSHOT_TRIGGER = /screenshot fullscreen/;
const SUPPORT_PROMPT = /Still have questions/;

const auth = vi.hoisted(() => ({ signedIn: false, setTheme: vi.fn() }));
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
	default: ({ href, onClick, ...props }: ComponentProps<"a">) => (
		<a
			{...props}
			href={href ?? "#"}
			onClick={(event) => {
				event.preventDefault();
				onClick?.(event);
			}}
		/>
	),
}));

beforeEach(() => {
	auth.signedIn = false;
	auth.setTheme.mockClear();
});

describe("public marketing routes", () => {
	it.each([
		{
			name: "home",
			Page: LandingPage,
			heading: "Spendly gives you a calmer way to track spending.",
		},
		{
			name: "features",
			Page: FeaturesPage,
			heading: "Expense tracking designed for observation, not enforcement.",
		},
		{ name: "pricing", Page: PricingPage, heading: "Spendly is free to use." },
		{
			name: "about",
			Page: AboutPage,
			heading: "Spendly is built for people who want calmer expense tracking.",
		},
		{
			name: "faqs",
			Page: FaqsPage,
			heading: "Answers about how Spendly works in real life.",
		},
	])("offers public signup and readable primary content on $name", ({
		Page,
		heading,
	}) => {
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
	});

	it.each([
		LandingPage,
		FeaturesPage,
		PricingPage,
		AboutPage,
		FaqsPage,
	])("offers the dashboard instead of signup for a signed-in visitor %#", (Page) => {
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

	it("opens each product screenshot with an accessible title and closes it", async () => {
		const user = userEvent.setup();
		render(<LandingPage />);
		for (const trigger of screen.getAllByRole("button", {
			name: SCREENSHOT_TRIGGER,
		})) {
			await user.click(trigger);
			const dialog = screen.getByRole("dialog");
			expect(dialog).toHaveAccessibleName();
			expect(within(dialog).getAllByRole("img")).toHaveLength(2);
			await user.click(within(dialog).getByRole("button", { name: "Close" }));
			expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
		}
	});
});

describe("marketing navigation and help", () => {
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
			screen.queryByRole("button", { name: "Login" })
		).not.toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Toggle theme" })).toBeVisible();
	});

	it.each([
		"Light",
		"Dark",
		"System",
	])("changes the theme to %s", async (theme) => {
		const user = userEvent.setup();
		render(<ModeToggle />);
		await user.click(screen.getByRole("button", { name: "Toggle theme" }));
		await user.click(screen.getByRole("menuitem", { name: theme }));
		expect(auth.setTheme).toHaveBeenCalledWith(theme.toLowerCase());
	});

	it("expands FAQ answers and collapses the previous question", async () => {
		const user = userEvent.setup();
		render(<FaqSection />);
		for (const item of faqItems) {
			const trigger = screen.getByRole("button", { name: item.question });
			await user.click(trigger);
			expect(trigger).toHaveAttribute("aria-expanded", "true");
			expect(screen.getByText(item.answer)).toBeVisible();
			await user.click(trigger);
			expect(trigger).toHaveAttribute("aria-expanded", "false");
		}
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
