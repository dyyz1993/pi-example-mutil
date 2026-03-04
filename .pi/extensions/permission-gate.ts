import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { isToolCallEventType } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  // 危险命令拦截
  pi.on("tool_call", async (event, ctx) => {
    if (isToolCallEventType("bash", event)) {
      const cmd = event.input.command;
      const dangerous = ["rm -rf", "sudo", "chmod 777", "> /dev/"];
      
      for (const danger of dangerous) {
        if (cmd?.includes(danger)) {
          const ok = await ctx.ui.confirm(
            "⚠️ 危险操作",
            `命令包含 "${danger}"，确定要执行吗？\n\n${cmd}`
          );
          if (!ok) {
            return { block: true, reason: "用户拒绝执行危险命令" };
          }
        }
      }
    }
  });

  // 保护敏感文件
  pi.on("tool_call", async (event, ctx) => {
    if (isToolCallEventType("write", event) || isToolCallEventType("edit", event)) {
      const path = event.input.file_path || event.input.path;
      const protected_files = [".env", "credentials", "secrets", "private.key"];
      
      for (const prot of protected_files) {
        if (path?.includes(prot)) {
          const ok = await ctx.ui.confirm(
            "🔒 敏感文件",
            `正在修改敏感文件: ${path}\n\n确定要继续吗？`
          );
          if (!ok) {
            return { block: true, reason: "用户拒绝修改敏感文件" };
          }
        }
      }
    }
  });
}
