import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
	"/",
	"/features(.*)",
	"/pricing(.*)",
	"/about(.*)",
	"/faqs(.*)",
	"/sign-in(.*)",
	"/sign-up(.*)",
	"/api(.*)",
]);

export default clerkMiddleware(async (auth, request) => {
	const { userId } = await auth();

	if (isPublicRoute(request)) {
		return NextResponse.next();
	}

	if (!userId) {
		const signInUrl = new URL("/sign-in", request.url);
		signInUrl.searchParams.set("redirect_url", request.url);
		return NextResponse.redirect(signInUrl);
	}

	return NextResponse.next();
});

export const config = {
	matcher: [
		"/((?!_next|[^?]*.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
		"/(api|trpc)(.*)",
	],
};
