import { tool } from "@opencode-ai/plugin"

export default tool({
  description: "Skill mínima de conectividad para verificar que el loop base del agente funciona",
  args: {
    message: tool.schema.string().optional().describe("Mensaje opcional para verificar el contrato de entrada.")
  },
  async execute(args, context) {
    return {
      pong: true,
      message: args.message ?? "pong",
      repoRoot: context.worktree
    }
  }
})