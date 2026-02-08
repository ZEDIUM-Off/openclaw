import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSubsystemLogger } from "../logging/subsystem.js";

const dockerLog = createSubsystemLogger("docker");

export type DockerComposeResult = {
  ok: boolean;
  output: string;
  error?: string;
};

export type MemgraphStatus = {
  running: boolean;
  healthy?: boolean;
  error?: string;
};

/**
 * Get the path to the docker-compose file for Memgraph
 * Looks relative to the source file location (works with pnpm link)
 */
export async function resolveMemgraphComposePath(): Promise<string> {
  const fs = await import("node:fs");

  // Get the directory of this source file
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  // Possible paths relative to the source file location
  const possiblePaths = [
    // From src/infra/docker-manager.ts -> repo root
    path.resolve(__dirname, "../../docker/memgraph/docker-compose.yml"),
    // From dist/infra/docker-manager.js -> repo root
    path.resolve(__dirname, "../../../docker/memgraph/docker-compose.yml"),
    // Fallback: current working directory
    path.resolve(process.cwd(), "docker/memgraph/docker-compose.yml"),
    // Fallback: ~/.openclaw (user config dir)
    path.resolve(process.env.HOME || "~", ".openclaw/docker/memgraph/docker-compose.yml"),
  ];

  for (const p of possiblePaths) {
    try {
      if (fs.existsSync(p)) {
        return p;
      }
    } catch {
      // ignore
    }
  }

  // Return the most likely path (even if it doesn't exist, for error reporting)
  return possiblePaths[0];
}

/**
 * Run docker compose command
 */
async function runDockerCompose(
  composeFile: string,
  command: string[],
  timeoutMs = 60000,
): Promise<DockerComposeResult> {
  return new Promise((resolve) => {
    const args = ["compose", "-f", composeFile, ...command];
    dockerLog.info(`docker ${args.join(" ")}`);

    const proc = spawn("docker", args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      proc.kill("SIGTERM");
    }, timeoutMs);

    proc.stdout?.on("data", (data) => {
      stdout += String(data);
    });

    proc.stderr?.on("data", (data) => {
      stderr += String(data);
    });

    proc.on("error", (err) => {
      clearTimeout(timeout);
      resolve({
        ok: false,
        output: "",
        error: `Failed to spawn docker: ${String(err)}`,
      });
    });

    proc.on("close", (code) => {
      clearTimeout(timeout);
      if (timedOut) {
        resolve({
          ok: false,
          output: stdout,
          error: `Command timed out after ${timeoutMs}ms`,
        });
      } else if (code !== 0) {
        resolve({
          ok: false,
          output: stdout,
          error: stderr || `Exit code ${code}`,
        });
      } else {
        resolve({ ok: true, output: stdout });
      }
    });
  });
}

/**
 * Check if Memgraph container is running
 */
export async function checkMemgraphStatus(): Promise<MemgraphStatus> {
  try {
    const composeFile = await resolveMemgraphComposePath();

    // Check if containers are running
    const psResult = await runDockerCompose(composeFile, ["ps", "--format", "json"], 10000);

    if (!psResult.ok) {
      return { running: false, error: psResult.error };
    }

    // Parse the output to check if memgraph is running
    const output = psResult.output.toLowerCase();
    const isRunning = output.includes("memgraph") && output.includes("running");

    if (!isRunning) {
      return { running: false };
    }

    // Check health if running
    const healthy = output.includes("healthy") || !output.includes("unhealthy");

    return { running: true, healthy };
  } catch (err) {
    return { running: false, error: String(err) };
  }
}

/**
 * Start Memgraph container
 */
export async function startMemgraph(): Promise<DockerComposeResult> {
  try {
    const composeFile = await resolveMemgraphComposePath();

    // First check if it's already running
    const status = await checkMemgraphStatus();
    if (status.running) {
      dockerLog.info("Memgraph is already running");
      return { ok: true, output: "Memgraph already running" };
    }

    // Start the containers
    dockerLog.info("Starting Memgraph...");
    const result = await runDockerCompose(composeFile, ["up", "-d"], 60000);

    if (result.ok) {
      dockerLog.info("Memgraph started successfully");
      // Wait a bit for the service to be ready
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } else {
      dockerLog.error(`Failed to start Memgraph: ${result.error}`);
    }

    return result;
  } catch (err) {
    const error = String(err);
    dockerLog.error(`Error starting Memgraph: ${error}`);
    return { ok: false, output: "", error };
  }
}

/**
 * Stop Memgraph container
 */
export async function stopMemgraph(): Promise<DockerComposeResult> {
  try {
    const composeFile = await resolveMemgraphComposePath();

    // Check if it's running first
    const status = await checkMemgraphStatus();
    if (!status.running) {
      dockerLog.info("Memgraph is not running");
      return { ok: true, output: "Memgraph not running" };
    }

    // Stop the containers
    dockerLog.info("Stopping Memgraph...");
    const result = await runDockerCompose(composeFile, ["down"], 30000);

    if (result.ok) {
      dockerLog.info("Memgraph stopped successfully");
    } else {
      dockerLog.error(`Failed to stop Memgraph: ${result.error}`);
    }

    return result;
  } catch (err) {
    const error = String(err);
    dockerLog.error(`Error stopping Memgraph: ${error}`);
    return { ok: false, output: "", error };
  }
}

/**
 * Check if Docker is available
 */
export async function isDockerAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn("docker", ["version"], {
      stdio: ["ignore", "ignore", "ignore"],
      env: process.env,
    });

    proc.on("error", () => {
      resolve(false);
    });

    proc.on("close", (code) => {
      resolve(code === 0);
    });

    // Timeout after 5 seconds
    setTimeout(() => {
      proc.kill("SIGTERM");
      resolve(false);
    }, 5000);
  });
}

/**
 * Auto-start Memgraph if KGM is enabled and Docker is available
 * Returns true if Memgraph was started (or was already running), false otherwise
 */
export async function autoStartMemgraphIfNeeded(params: {
  kgmEnabled?: boolean;
}): Promise<boolean> {
  if (!params.kgmEnabled) {
    return true; // Nothing to do
  }

  const dockerAvailable = await isDockerAvailable();
  if (!dockerAvailable) {
    dockerLog.warn("Docker not available, cannot auto-start Memgraph");
    return false;
  }

  const status = await checkMemgraphStatus();
  if (status.running) {
    dockerLog.info("Memgraph is already running");
    return true;
  }

  const result = await startMemgraph();
  return result.ok;
}

/**
 * Auto-stop Memgraph if it was started by the gateway
 */
export async function autoStopMemgraphIfNeeded(): Promise<void> {
  const dockerAvailable = await isDockerAvailable();
  if (!dockerAvailable) {
    return;
  }

  await stopMemgraph();
}
