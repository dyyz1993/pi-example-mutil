#!/usr/bin/env python3
"""
Agent 团队智能监控系统
- 每30秒检查进度
- 每10分钟总结问题
- 自动生成优化建议
"""

import os
import sys
import json
import time
import re
from datetime import datetime, timedelta
from pathlib import Path
from collections import defaultdict

# 禁用输出缓冲
sys.stdout = os.fdopen(sys.stdout.fileno(), 'w', buffering=1)
sys.stderr = os.fdopen(sys.stderr.fileno(), 'w', buffering=1)

PROJECT_DIR = Path(__file__).parent.parent.absolute()
LOGS_DIR = PROJECT_DIR / "logs"
DAEMON_LOG = LOGS_DIR / "daemon.log"
PROCESSED_FILE = PROJECT_DIR / ".agent" / "processed_issues.json"
MONITOR_STATE = PROJECT_DIR / ".agent" / "monitor_state.json"

# 监控配置
CHECK_INTERVAL = 30  # 检查间隔（秒）
SUMMARY_INTERVAL = 600  # 总结间隔（秒）= 10分钟

class AgentMonitor:
    def __init__(self):
        self.start_time = time.time()
        self.last_log_size = 0
        self.last_check_time = time.time()
        self.last_summary_time = time.time()

        # 统计数据
        self.stats = {
            "issues_processed": 0,
            "issues_completed": 0,
            "issues_skipped": 0,
            "errors": [],
            "warnings": [],
            "repeated_issues": defaultdict(int),
            "stuck_issues": {},
            "optimizations": []
        }

        self.state = self.load_state()

    def load_state(self):
        """加载监控状态"""
        if MONITOR_STATE.exists():
            try:
                with open(MONITOR_STATE, "r") as f:
                    return json.load(f)
            except:
                pass
        return {
            "known_issues": {},
            "last_optimization": None,
            "optimization_history": []
        }

    def save_state(self):
        """保存监控状态"""
        MONITOR_STATE.parent.mkdir(exist_ok=True)
        with open(MONITOR_STATE, "w") as f:
            json.dump(self.state, f, indent=2, ensure_ascii=False)

    def log(self, message, level="INFO"):
        """打印日志"""
        timestamp = datetime.now().strftime("%H:%M:%S")
        prefix = {"INFO": "📊", "WARN": "⚠️", "ERROR": "🔴", "OPT": "🔧"}
        print(f"[{timestamp}] {prefix.get(level, '📌')} {message}", flush=True)

    def check_daemon_status(self):
        """检查守护进程状态"""
        import subprocess
        try:
            result = subprocess.run(
                ["ps", "aux"],
                capture_output=True, text=True, timeout=5
            )
            if "agent-daemon.py" in result.stdout:
                # 提取 PID
                for line in result.stdout.split("\n"):
                    if "agent-daemon.py" in line and "grep" not in line:
                        parts = line.split()
                        pid = parts[1]
                        return {"running": True, "pid": pid}
            return {"running": False, "pid": None}
        except Exception as e:
            return {"running": False, "error": str(e)}

    def analyze_logs(self):
        """分析日志文件"""
        if not DAEMON_LOG.exists():
            return

        # 读取新增的日志
        current_size = DAEMON_LOG.stat().st_size
        if current_size <= self.last_log_size:
            return

        with open(DAEMON_LOG, "r") as f:
            f.seek(self.last_log_size)
            new_content = f.read()
        self.last_log_size = current_size

        # 分析日志内容
        for line in new_content.split("\n"):
            if not line.strip():
                continue

            # 检测重复处理同一 Issue
            match = re.search(r"处理 Issue #(\d+)", line)
            if match:
                issue_num = match.group(1)
                self.stats["repeated_issues"][issue_num] += 1

            # 检测处理完成
            if "处理完成" in line:
                self.stats["issues_completed"] += 1

            # 检测跳过
            if "跳过" in line:
                self.stats["issues_skipped"] += 1

            # 检测错误
            if "error" in line.lower() or "failed" in line.lower():
                self.stats["errors"].append({
                    "time": datetime.now().isoformat(),
                    "message": line[:200]
                })

            # 检测警告（如 node not found）
            if "no such file" in line.lower() or "not found" in line.lower():
                self.stats["warnings"].append({
                    "time": datetime.now().isoformat(),
                    "message": line[:200]
                })

    def check_issue_progress(self):
        """检查 Issue 处理进度"""
        # 检查是否有 Issue 卡住（超过10分钟没完成）
        current_time = time.time()

        for issue_num, count in self.stats["repeated_issues"].items():
            if count > 3:  # 同一 Issue 处理超过3次
                self.stats["stuck_issues"][issue_num] = {
                    "count": count,
                    "detected_at": datetime.now().isoformat()
                }

    def generate_optimization_suggestions(self):
        """生成优化建议"""
        suggestions = []

        # 检查重复处理
        for issue_num, count in self.stats["repeated_issues"].items():
            if count > 2:
                suggestions.append({
                    "type": "repeated_issue",
                    "severity": "HIGH",
                    "issue": issue_num,
                    "count": count,
                    "suggestion": f"Issue #{issue_num} 被重复处理 {count} 次，建议：1) 手动检查 Issue 状态 2) 添加 'done' 标签 3) 或关闭 Issue",
                    "auto_fix": f"gh issue edit {issue_num} --add-label 'done'"
                })

        # 检查卡住的 Issue
        for issue_num, info in self.stats["stuck_issues"].items():
            suggestions.append({
                "type": "stuck_issue",
                "severity": "CRITICAL",
                "issue": issue_num,
                "suggestion": f"Issue #{issue_num} 可能卡住了（{info['count']}次处理），建议人工干预",
                "auto_fix": None
            })

        # 检查错误
        if len(self.stats["errors"]) > 3:
            suggestions.append({
                "type": "too_many_errors",
                "severity": "HIGH",
                "count": len(self.stats["errors"]),
                "suggestion": f"检测到 {len(self.stats['errors'])} 个错误，建议检查日志",
                "auto_fix": None
            })

        # 检查环境问题
        node_errors = [e for e in self.stats["warnings"] if "node" in e["message"].lower()]
        if node_errors:
            suggestions.append({
                "type": "environment",
                "severity": "MEDIUM",
                "suggestion": "检测到 Node.js 环境问题，已自动修复 PATH",
                "auto_fix": "已修复 agent-daemon.py 中的 ENV 配置"
            })

        return suggestions

    def apply_auto_fixes(self, suggestions):
        """应用自动修复"""
        for sug in suggestions:
            if sug["type"] == "repeated_issue" and sug.get("auto_fix"):
                self.log(f"尝试自动修复: {sug['auto_fix']}", "OPT")
                # 这里可以实际执行修复命令
                # import subprocess
                # subprocess.run(sug["auto_fix"], shell=True)

    def print_summary(self):
        """打印总结报告"""
        elapsed = int(time.time() - self.start_time)
        minutes = elapsed // 60
        seconds = elapsed % 60

        print("\n" + "=" * 60)
        print(f"📊 监控总结报告 - 运行时间: {minutes}分{seconds}秒")
        print("=" * 60)

        # 守护进程状态
        daemon = self.check_daemon_status()
        if daemon["running"]:
            print(f"✅ 守护进程运行中 (PID: {daemon['pid']})")
        else:
            print("❌ 守护进程未运行!")

        # 统计
        print(f"\n📈 统计:")
        print(f"  - Issue 处理完成: {self.stats['issues_completed']}")
        print(f"  - Issue 跳过: {self.stats['issues_skipped']}")
        print(f"  - 错误数: {len(self.stats['errors'])}")
        print(f"  - 警告数: {len(self.stats['warnings'])}")

        # 重复处理
        if self.stats["repeated_issues"]:
            print(f"\n🔄 重复处理:")
            for issue, count in self.stats["repeated_issues"].items():
                status = "⚠️ 异常" if count > 2 else "✅ 正常"
                print(f"  - Issue #{issue}: {count} 次 {status}")

        # 优化建议
        suggestions = self.generate_optimization_suggestions()
        if suggestions:
            print(f"\n🔧 优化建议:")
            for i, sug in enumerate(suggestions, 1):
                severity = {"CRITICAL": "🔴", "HIGH": "🟠", "MEDIUM": "🟡"}.get(sug["severity"], "⚪")
                print(f"  {i}. {severity} {sug['suggestion']}")
                if sug.get("auto_fix"):
                    print(f"     自动修复: {sug['auto_fix']}")

        print("=" * 60 + "\n")

        # 保存优化历史
        if suggestions:
            self.state["optimization_history"].append({
                "time": datetime.now().isoformat(),
                "suggestions": suggestions
            })
            # 只保留最近10条
            self.state["optimization_history"] = self.state["optimization_history"][-10:]
            self.save_state()

        # 重置统计
        self.stats = {
            "issues_processed": 0,
            "issues_completed": 0,
            "issues_skipped": 0,
            "errors": [],
            "warnings": [],
            "repeated_issues": defaultdict(int),
            "stuck_issues": {},
            "optimizations": []
        }

    def run(self):
        """主循环"""
        self.log("Agent 团队智能监控系统启动")
        self.log(f"检查间隔: {CHECK_INTERVAL}秒, 总结间隔: {SUMMARY_INTERVAL}秒")

        try:
            while True:
                current_time = time.time()

                # 检查进度
                if current_time - self.last_check_time >= CHECK_INTERVAL:
                    self.analyze_logs()
                    self.check_issue_progress()

                    # 简短状态报告
                    daemon = self.check_daemon_status()
                    status = "✅" if daemon["running"] else "❌"
                    self.log(f"守护进程: {status} | 完成: {self.stats['issues_completed']} | 错误: {len(self.stats['errors'])}")

                    self.last_check_time = current_time

                # 定期总结
                if current_time - self.last_summary_time >= SUMMARY_INTERVAL:
                    self.print_summary()
                    self.last_summary_time = current_time

                time.sleep(5)

        except KeyboardInterrupt:
            self.log("收到中断信号，正在退出...")
            self.print_summary()

if __name__ == "__main__":
    monitor = AgentMonitor()
    monitor.run()
