import { Github } from "lucide-react";
import { Button } from "@/components/ui/button";

export function GitHubButton() {
	return (
		<Button asChild className="transition-none" size="sm" variant="outline">
			<a
				href="https://github.com/akhilesh-dalvi/spendly"
				rel="noopener noreferrer"
				target="_blank"
			>
				<Github aria-hidden data-icon="inline-start" />
				GitHub
			</a>
		</Button>
	);
}
