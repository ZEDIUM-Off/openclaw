import type { Command } from "commander";
import { kgmEnsureAgentCommand, kgmInitCommand, kgmStatusCommand } from "../../commands/kgm.js";
import { defaultRuntime } from "../../runtime.js";
import { theme } from "../../terminal/theme.js";
import { runCommandWithRuntime } from "../cli-utils.js";
import { formatHelpExamples } from "../help-format.js";

export function registerKgmCommands(program: Command) {
  const kgm = program.command("kgm").description("Knowledge Graph Memory (KGM) commands");

  kgm
    .command("status")
    .description("Check KGM status")
    .option("--json", "JSON output", false)
    .action(async (opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await kgmStatusCommand(defaultRuntime, { json: Boolean(opts.json) });
      });
    });

  kgm
    .command("init")
    .description("Initialize KGM admin schema")
    .option("--json", "JSON output", false)
    .addHelpText(
      "after",
      () =>
        `\n${theme.heading("Examples:")}\n${formatHelpExamples([
          ["openclaw kgm init", "Initialize the admin schema."],
        ])}\n`,
    )
    .action(async (opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await kgmInitCommand(defaultRuntime, { json: Boolean(opts.json) });
      });
    });

  kgm
    .command("ensure-agent")
    .description("Initialize KGM schema for a specific agent")
    .requiredOption("--agent <id>", "Agent id")
    .option("--json", "JSON output", false)
    .action(async (opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await kgmEnsureAgentCommand(defaultRuntime, {
          agentId: String(opts.agent),
          json: Boolean(opts.json),
        });
      });
    });
}
