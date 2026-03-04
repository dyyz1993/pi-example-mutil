/**
 * 智能裁剪扩展 - 减少上下文占用
 * 
 * 功能：
 * 1. 删除重复读取同一文件的旧结果
 * 2. 删除过长的工具输出（保留摘要）
 * 3. 压缩已完成任务的历史
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { AgentMessage, ToolResultMessage } from "@mariozechner/pi-ai";

export default function (pi: ExtensionAPI) {
  
  // 在每次发送给 LLM 之前处理消息
  pi.on("context", async (event, ctx) => {
    const messages = event.messages;
    const pruned = pruneMessages(messages);
    
    const savedTokens = estimateTokens(messages) - estimateTokens(pruned);
    if (savedTokens > 1000) {
      ctx.ui.notify(`智能裁剪: 节省约 ${savedTokens} tokens`, "info");
    }
    
    return { messages: pruned };
  });

  // 自定义压缩逻辑
  pi.on("session_before_compact", async (event, ctx) => {
    const { preparation, customInstructions } = event;
    
    // 可以自定义压缩指令
    const instructions = customInstructions || `
请压缩以下对话，保留：
1. 用户的核心目标
2. 已完成的关键工作
3. 重要的技术决策
4. 待处理的问题

删除：
1. 重复的文件读取内容
2. 已解决的调试过程
3. 无关的闲聊
    `;
    
    // 返回 undefined 使用默认压缩，或返回自定义压缩结果
    return undefined;
  });
}

/**
 * 裁剪消息
 */
function pruneMessages(messages: AgentMessage[]): AgentMessage[] {
  const seen = {
    files: new Map<string, number>(),  // path -> message index
    commands: new Map<string, number>(), // command -> message index
  };
  
  const toRemove = new Set<number>();
  
  messages.forEach((msg, idx) => {
    // 处理工具结果
    if (msg.role === "toolResult") {
      // 重复读取同一文件 - 标记旧的删除
      if (msg.toolName === "read" && msg.details?.path) {
        const path = msg.details.path;
        if (seen.files.has(path)) {
          toRemove.add(seen.files.get(path)!); // 删除旧的
        }
        seen.files.set(path, idx);
      }
      
      // 重复执行同一命令 - 标记旧的删除
      if (msg.toolName === "bash" && msg.details?.command) {
        const cmd = msg.details.command.slice(0, 50); // 取前50字符
        if (seen.commands.has(cmd)) {
          toRemove.add(seen.commands.get(cmd)!);
        }
        seen.commands.set(cmd, idx);
      }
      
      // 过长的输出 - 截断
      const content = msg.content?.[0];
      if (content && content.type === "text" && content.text.length > 10000) {
        content.text = content.text.slice(0, 5000) + 
          `\n\n... [截断，原始输出 ${content.text.length} 字符]`;
      }
    }
  });
  
  // 过滤掉标记删除的消息
  if (toRemove.size > 0) {
    return messages.filter((_, idx) => !toRemove.has(idx));
  }
  
  return messages;
}

/**
 * 估算 token 数量
 */
function estimateTokens(messages: AgentMessage[]): number {
  return messages.reduce((total, msg) => {
    if (msg.role === "user" || msg.role === "assistant") {
      const text = typeof msg.content === "string" 
        ? msg.content 
        : msg.content?.map(c => c.type === "text" ? c.text : "").join("") || "";
      return total + Math.ceil(text.length / 4);
    }
    if (msg.role === "toolResult") {
      const text = msg.content?.map(c => c.type === "text" ? c.text : "").join("") || "";
      return total + Math.ceil(text.length / 4);
    }
    return total;
  }, 0);
}
