import type { Metadata } from "next";
import CallToAction from "@/components/call-to-action";
import FaqSection from "@/components/faq-section";
import FooterSection from "@/components/footer";
import HeroSection from "@/components/hero-section";
import LandingDemoStrip from "@/components/landing-demo-strip";
import LandingDifferentiation from "@/components/landing-differentiation";
import LandingProof from "@/components/landing-proof";
import {
	createMarketingMetadata,
	createSoftwareApplicationJsonLd,
} from "@/lib/seo";

const homeDescription =
	"Record expenses by month, payday, or trip. Choose your own date ranges, compare spending over time, and add spending plans only if they help.";

export const metadata: Metadata = createMarketingMetadata({
	description: homeDescription,
	path: "/",
	title: "Understand Your Spending. On Your Terms.",
});

const homeStructuredData = createSoftwareApplicationJsonLd({
	description: homeDescription,
	featureList: [
		"Track expenses in date ranges called cycles",
		"Add optional spending plans by category",
		"Compare spending across cycles",
		"Edit past expenses to correct your records",
	],
	path: "/",
});

const homeFaqItems = [
	{
		answer:
			"Yes. Expense tracking, spending plans, and cycle comparisons are free to use.",
		id: "home-free",
		question: "Is Spendly free?",
	},
	{
		answer:
			"Create a cycle that covers the expense date before saving it. You can use past dates when recording an older expense.",
		id: "home-outside-cycle",
		question: "What if my expense is outside my cycle dates?",
	},
	{
		answer:
			"Yes. You can edit past expenses, including their amount, date, category, tags, and notes.",
		id: "home-edit",
		question: "Can I correct an expense later?",
	},
];

export default function LandingPage() {
	return (
		<>
			<main id="main-content">
				<HeroSection />
				<LandingProof />
				<LandingDemoStrip />
				<LandingDifferentiation />
				<FaqSection
					browseAllFaqs
					description="A few things to know before you start."
					items={homeFaqItems}
					title="Common questions"
				/>
				<CallToAction
					description="Create your account, choose your first date range, and start recording expenses."
					title="Start tracking for free"
				/>
			</main>
			<FooterSection />
			<script type="application/ld+json">
				{JSON.stringify(homeStructuredData)}
			</script>
		</>
	);
}
