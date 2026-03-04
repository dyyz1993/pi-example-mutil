import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

export default function (pi: ExtensionAPI) {
  // 注册 /stats 命令
  pi.registerCommand("stats", {
    description: "显示项目统计信息",
    handler: async (_args, ctx) => {
      const result = await pi.exec("find", [".", "-name", "*.ts", "-o", "-name", "*.tsx"]);
      const files = result.stdout.split("\n").filter(Boolean).length;
      ctx.ui.notify(`项目有 ${files} 个 TypeScript 文件`, "info");
    },
  });

  // 注册代码统计工具
  pi.registerTool({
    name: "count_lines",
    label: "Count Lines",
    description: "统计代码行数",
    parameters: Type.Object({
      pattern: Type.Optional(Type.String({ description: "文件模式，默认 *.ts" })),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const pattern = params.pattern || "*.ts";
      const result = await pi.exec("sh", ["-c", `find . -name "${pattern}" -exec wc -l {} + | tail -1`]);
      return {
        content: [{ type: "text", text: `${pattern} 文件总行数: ${result.stdout.trim()}` }],
      };
    },
  });
}
