import { test as base } from "@playwright/test";
import { loadEnvironment } from "./environment";
import { createUser, type E2EUser } from "./users";

export const test = base.extend<{ user: E2EUser }>({
	user: async ({ page }, use) => {
		const user = await createUser(page, loadEnvironment());
		try {
			await use(user);
		} finally {
			await user.dispose();
		}
	},
});
