import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
	"clean expired CLI capabilities",
	{ hours: 1 },
	internal.cli.v1.maintenance.cleanupExpired,
	{}
);

export default crons;
