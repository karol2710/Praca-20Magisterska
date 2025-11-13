import { RequestHandler } from "express";
import { execSync } from "child_process";
import { query } from "@server/db";

interface DeployRequest {
  repository: string;
  helmInstall: string;
}

interface DeployResponse {
  success: boolean;
  output: string;
  error?: string;
}

export const handleDeploy: RequestHandler = async (req, res) => {
  const user = (req as any).user;
  const { repository, helmInstall } = req.body as DeployRequest;

  if (!repository || !helmInstall) {
    return res.status(400).json({
      success: false,
      output: "",
      error: "Repository and Helm Install are required",
    } as DeployResponse);
  }

  try {
    const output: string[] = [];

    output.push("=== Starting Helm Deployment ===\n");

    // Parse repository - format: "name https://url"
    const [repoName, repoUrl] = repository.trim().split(/\s+/);
    if (!repoName || !repoUrl) {
      throw new Error(
        "Invalid repository format. Expected: 'name https://url'"
      );
    }

    // Step 1: Add temporary helm repo
    output.push(`Adding helm repository: ${repoName}`);
    try {
      const addRepoOutput = execSync(
        `helm repo add ${repoName} ${repoUrl}`,
        {
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "pipe"],
        }
      );
      output.push(addRepoOutput);
    } catch (error) {
      output.push(
        `Note: Repository might already exist or there was a warning (continuing)\n`
      );
    }

    // Update repo cache
    output.push("Updating helm repository cache...");
    try {
      const updateOutput = execSync("helm repo update", {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      output.push(updateOutput);
    } catch (error) {
      output.push("Helm repo update completed with warnings\n");
    }

    // Step 2: Deploy using kubectl upgrade --install
    output.push(`\nDeploying with: ${helmInstall}`);
    try {
      const deployOutput = execSync(`helm upgrade --install ${helmInstall}`, {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      output.push(deployOutput);
    } catch (error: any) {
      throw new Error(`Helm upgrade failed: ${error.message}`);
    }

    // Step 3: Delete temporary helm repo
    output.push(`\nRemoving temporary repository: ${repoName}`);
    try {
      const removeOutput = execSync(`helm repo remove ${repoName}`, {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      output.push(removeOutput);
    } catch (error) {
      output.push(`Warning: Failed to remove repository\n`);
    }

    output.push("\n=== Helm Deployment Completed Successfully ===");

    res.status(200).json({
      success: true,
      output: output.join("\n"),
    } as DeployResponse);
  } catch (error: any) {
    const errorMessage = error.message || "Unknown error occurred";
    res.status(500).json({
      success: false,
      output: "",
      error: errorMessage,
    } as DeployResponse);
  }
};
