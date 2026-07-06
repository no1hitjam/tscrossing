import { execSync } from "node:child_process";

process.env.GITHUB_PAGES = "true";
execSync("npm run build", { stdio: "inherit", env: process.env });
