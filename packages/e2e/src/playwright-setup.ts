import { configureClerk } from "./authentication";
import { loadEnvironment } from "./environment";

export default async function setup(): Promise<void> {
	await configureClerk(loadEnvironment());
}
