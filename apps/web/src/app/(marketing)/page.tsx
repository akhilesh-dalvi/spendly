import type { Metadata } from "next";
import CallToAction from "@/components/call-to-action";
import FaqSection from "@/components/faq-section";
import FooterSection from "@/components/footer";
import HeroSection from "@/components/hero-section";
import LandingDemoStrip from "@/components/landing-demo-strip";
import LandingDifferentiation from "@/components/landing-differentiation";
import LandingProof from "@/components/landing-proof";
import LandingTrust from "@/components/landing-trust";
import Pricing from "@/components/pricing";
import {
	createMarketingMetadata,
	createSoftwareApplicationJsonLd,
} from "@/lib/seo";

const homeDescription =
	"Discover a calmer way to track expenses with flexible cycles, optional planning, and editable history.";

export const metadata: Metadata = createMarketingMetadata({
	title: "Flexible Expense Tracking for Real-Life Cycles",
	description: homeDescription,
	path: "/",
});

const homeStructuredData = createSoftwareApplicationJsonLd({
	description: homeDescription,
	path: "/",
	featureList: [
		"Track expenses across your own spending cycles",
		"Add plans only when you want them",
		"Compare multiple cycles without judgment",
		"Edit history whenever your records need correction",
	],
});

export default function LandingPage() {
	return (
		<>
			<main>
				<HeroSection />
				<LandingProof />
				<LandingDemoStrip />
				<LandingDifferentiation />
				<Pricing />
				<LandingTrust />
				<FaqSection
					description="Quick answers to the common questions people ask before they start using Spendly."
					title="Common questions"
				/>
				<CallToAction />
				<FooterSection />
			</main>
			<script type="application/ld+json">
				{JSON.stringify(homeStructuredData)}
			</script>
		</>
	);
}
