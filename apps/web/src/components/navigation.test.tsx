// @vitest-environment jsdom
import { fireEvent, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Home } from "lucide-react";
import { type ComponentProps, useCallback } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppSidebar } from "./app-sidebar";
import { MobileNav } from "./mobile-nav";
import { NavMain } from "./nav-main";
import { NavUser } from "./nav-user";
import {
	Sidebar,
	SidebarContent,
	SidebarGroupLabel,
	SidebarInset,
	SidebarMenu,
	SidebarMenuAction,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarMenuSub,
	SidebarMenuSubButton,
	SidebarMenuSubItem,
	SidebarProvider,
	SidebarTrigger,
	useSidebar,
} from "./ui/sidebar";

const USER_MENU = /Primary User/;
const MORE_DESTINATION_NAMES = new Map([
	["/settings", "Settings"],
	["/data/tags", "Tags"],
]);

const state = vi.hoisted(() => ({
	clerkUser: undefined as unknown,
	convexUser: undefined as unknown,
	openUserProfile: vi.fn(),
	pathname: "/expenses/one",
	signOut: vi.fn(),
}));
vi.mock("next/navigation", () => ({ usePathname: () => state.pathname }));
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
vi.mock("convex/react", () => ({ useQuery: () => state.convexUser }));
vi.mock("@clerk/nextjs", () => ({
	useClerk: () => ({
		openUserProfile: state.openUserProfile,
		signOut: state.signOut,
	}),
	useUser: () => ({ user: state.clerkUser }),
}));

function StateControls() {
	const { state: sidebarState, setOpen } = useSidebar();
	const expand = useCallback(() => setOpen(true), [setOpen]);
	return (
		<>
			<output aria-label="Sidebar state">{sidebarState}</output>
			<button onClick={expand} type="button">
				Expand sidebar
			</button>
		</>
	);
}

beforeEach(() => {
	vi.stubGlobal("innerWidth", 1024);
	state.pathname = "/expenses/one";
	state.convexUser = undefined;
	state.clerkUser = undefined;
	vi.clearAllMocks();
});
afterEach(() => {
	vi.unstubAllGlobals();
});

describe("desktop and mobile navigation", () => {
	it.each([
		{
			clerk: {
				fullName: "Clerk name",
				imageUrl: "",
				primaryEmailAddress: { emailAddress: "clerk@example.com" },
			},
			expected: "Backend name",
			user: { email: "backend@example.com", name: "Backend name" },
		},
		{
			clerk: {
				fullName: "Clerk name",
				imageUrl: "",
				primaryEmailAddress: { emailAddress: "clerk@example.com" },
			},
			expected: "Clerk name",
			user: undefined,
		},
		{ clerk: undefined, expected: "User", user: undefined },
	])(
		"resolves the sidebar identity to $expected and highlights nested expense routes",
		({ user, clerk, expected }) => {
			state.convexUser = user;
			state.clerkUser = clerk;
			render(
				<SidebarProvider>
					<AppSidebar />
				</SidebarProvider>
			);
			expect(screen.getByText(expected)).toBeVisible();
			expect(screen.getByRole("link", { name: "Expenses" })).toHaveAttribute(
				"aria-current",
				"page"
			);
			expect(
				screen.getByRole("link", { name: "Dashboard" })
			).not.toHaveAttribute("aria-current");
			expect(screen.getByRole("link", { name: "CLI Docs" })).toHaveAttribute(
				"href",
				"/docs/cli"
			);
			expect(screen.getByText("Manage")).toBeVisible();
		}
	);

	it("expands nested navigation and retains active state on the selected child", async () => {
		const user = userEvent.setup();
		render(
			<SidebarProvider>
				<NavMain
					items={[
						{
							icon: Home,
							isActive: false,
							items: [
								{ isActive: true, title: "First", url: "/first" },
								{ isActive: false, title: "Second", url: "/second" },
							],
							title: "Tools",
							url: "/tools",
						},
					]}
					label="Tools"
				/>
			</SidebarProvider>
		);
		expect(
			screen.queryByRole("link", { name: "First" })
		).not.toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Toggle" }));
		expect(screen.getByRole("link", { name: "First" })).toHaveAttribute(
			"aria-current",
			"page"
		);
		expect(screen.getByRole("link", { name: "Second" })).not.toHaveAttribute(
			"aria-current"
		);
		await user.click(screen.getByRole("button", { name: "Toggle" }));
		expect(
			screen.queryByRole("link", { name: "First" })
		).not.toBeInTheDocument();
	});

	it.each([
		"/dashboard",
		"/accounts/one",
		"/settings",
		"/data/tags",
		"/docs/cli/install",
	])(
		"highlights the appropriate mobile destination for %s",
		async (pathname) => {
			state.pathname = pathname;
			const user = userEvent.setup();
			render(<MobileNav />);
			if (pathname === "/dashboard" || pathname.startsWith("/accounts")) {
				expect(
					screen.getByRole("link", {
						name: pathname === "/dashboard" ? "Dashboard" : "Accounts",
					})
				).toHaveAttribute("aria-current", "page");
				expect(
					screen.getByRole("button", { name: "More" })
				).not.toHaveAttribute("aria-current");
			} else {
				expect(screen.getByRole("button", { name: "More" })).toHaveAttribute(
					"aria-current",
					"page"
				);
				await user.click(screen.getByRole("button", { name: "More" }));
				expect(
					screen.getByRole("menuitem", {
						name: MORE_DESTINATION_NAMES.get(pathname) ?? "CLI Docs",
					})
				).toHaveAttribute("aria-current", "page");
			}
		}
	);

	it.each([1024, 400])(
		"opens account actions in a %spx viewport",
		async (width) => {
			vi.stubGlobal("innerWidth", width);
			const user = userEvent.setup();
			render(
				<SidebarProvider>
					<NavUser
						user={{
							avatar: "",
							email: "user@example.com",
							name: "Primary User",
						}}
					/>
				</SidebarProvider>
			);
			await user.click(screen.getByRole("button", { name: USER_MENU }));
			expect(
				screen.getByRole("menuitem", { name: "Settings" })
			).toHaveAttribute("href", "/settings");
			await user.click(screen.getByRole("menuitem", { name: "Account" }));
			expect(state.openUserProfile).toHaveBeenCalledOnce();
			await user.click(screen.getByRole("button", { name: USER_MENU }));
			await user.click(screen.getByRole("menuitem", { name: "Log out" }));
			expect(state.signOut).toHaveBeenCalledOnce();
		}
	);
});

describe("sidebar state and composition", () => {
	it("toggles desktop state by button and keyboard and persists the resulting state", async () => {
		const user = userEvent.setup();
		const onClick = vi.fn();
		render(
			<SidebarProvider>
				<Sidebar>
					<SidebarContent>Navigation</SidebarContent>
				</Sidebar>
				<SidebarTrigger onClick={onClick} />
				<StateControls />
			</SidebarProvider>
		);
		expect(
			screen.getByRole("status", { name: "Sidebar state" })
		).toHaveTextContent("expanded");
		await user.click(screen.getByRole("button", { name: "Toggle Sidebar" }));
		expect(onClick).toHaveBeenCalledOnce();
		expect(
			screen.getByRole("status", { name: "Sidebar state" })
		).toHaveTextContent("collapsed");
		expect(document.cookie).toContain("sidebar_state=false");
		await user.click(screen.getByRole("button", { name: "Expand sidebar" }));
		expect(
			screen.getByRole("status", { name: "Sidebar state" })
		).toHaveTextContent("expanded");
		fireEvent.keyDown(window, { key: "b" });
		fireEvent.keyDown(window, { ctrlKey: true, key: "a" });
		expect(
			screen.getByRole("status", { name: "Sidebar state" })
		).toHaveTextContent("expanded");
		fireEvent.keyDown(window, { ctrlKey: true, key: "b" });
		expect(
			screen.getByRole("status", { name: "Sidebar state" })
		).toHaveTextContent("collapsed");
		fireEvent.keyDown(window, { key: "b", metaKey: true });
		expect(
			screen.getByRole("status", { name: "Sidebar state" })
		).toHaveTextContent("expanded");
	});

	it("reports controlled open-state changes without changing its controlled value", async () => {
		const onOpenChange = vi.fn();
		const user = userEvent.setup();
		render(
			<SidebarProvider onOpenChange={onOpenChange} open={false}>
				<SidebarTrigger />
				<StateControls />
			</SidebarProvider>
		);
		await user.click(screen.getByRole("button", { name: "Toggle Sidebar" }));
		expect(onOpenChange).toHaveBeenCalledWith(true);
		expect(
			screen.getByRole("status", { name: "Sidebar state" })
		).toHaveTextContent("collapsed");
	});

	it("opens and dismisses the mobile sidebar without collapsing desktop state", async () => {
		vi.stubGlobal("innerWidth", 400);
		const user = userEvent.setup();
		render(
			<SidebarProvider>
				<Sidebar>
					<SidebarContent>Mobile navigation</SidebarContent>
				</Sidebar>
				<SidebarTrigger />
				<StateControls />
			</SidebarProvider>
		);
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Toggle Sidebar" }));
		expect(screen.getByRole("dialog", { name: "Sidebar" })).toHaveTextContent(
			"Mobile navigation"
		);
		await user.keyboard("{Escape}");
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
		expect(
			screen.getByRole("status", { name: "Sidebar state" })
		).toHaveTextContent("expanded");
	});

	it.each(["floating", "inset", "sidebar"] as const)(
		"supports a right-aligned %s sidebar with composed menu links",
		(variant) => {
			const { container } = render(
				<SidebarProvider defaultOpen={false}>
					<Sidebar collapsible="icon" side="right" variant={variant}>
						<SidebarGroupLabel asChild>
							<h2>Utilities</h2>
						</SidebarGroupLabel>
						<SidebarMenu>
							<SidebarMenuItem>
								<SidebarMenuButton
									asChild
									size="sm"
									tooltip={{ children: "Item help" }}
									variant="outline"
								>
									<a href="/item">Item</a>
								</SidebarMenuButton>
								<SidebarMenuAction asChild showOnHover>
									<button type="button">Edit item</button>
								</SidebarMenuAction>
								<SidebarMenuSub>
									<SidebarMenuSubItem>
										<SidebarMenuSubButton href="/small" size="sm">
											Small child
										</SidebarMenuSubButton>
									</SidebarMenuSubItem>
									<SidebarMenuSubItem>
										<SidebarMenuSubButton href="/normal">
											Normal child
										</SidebarMenuSubButton>
									</SidebarMenuSubItem>
								</SidebarMenuSub>
							</SidebarMenuItem>
						</SidebarMenu>
					</Sidebar>
					<SidebarInset>Workspace</SidebarInset>
				</SidebarProvider>
			);
			expect(container.querySelector('[data-slot="sidebar"]')).toHaveAttribute(
				"data-side",
				"right"
			);
			expect(container.querySelector('[data-slot="sidebar"]')).toHaveAttribute(
				"data-variant",
				variant
			);
			expect(screen.getByRole("link", { name: "Item" })).toHaveAttribute(
				"href",
				"/item"
			);
			expect(screen.getByRole("link", { name: "Small child" })).toHaveAttribute(
				"data-size",
				"sm"
			);
			expect(screen.getByRole("main")).toHaveTextContent("Workspace");
		}
	);

	it("renders a fixed sidebar without a mobile dialog", () => {
		vi.stubGlobal("innerWidth", 400);
		render(
			<SidebarProvider>
				<Sidebar collapsible="none">Always visible</Sidebar>
			</SidebarProvider>
		);
		expect(screen.getByText("Always visible")).toBeVisible();
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	});

	it("requires the sidebar provider for stateful consumers", () => {
		expect(() => renderHook(useSidebar)).toThrow(
			"useSidebar must be used within a SidebarProvider."
		);
	});
});
