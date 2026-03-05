#!/usr/bin/env python3
"""
Agent 24小时监控仪表盘
实时展示执行状态、日志、指标
"""

import os
import sys
import json
import time
import subprocess
from datetime import datetime, timedelta
from pathlib import Path
from collections import defaultdict

PROJECT_DIR = Path(__file__).parent.parent.absolute()
LOGS_DIR = PROJECT_DIR / "logs"
TRACE_DIR = LOGS_DIR / "traces"

class Dashboard:
    def __init__(self):
        self.last_update = 0
        self.update_interval = 5  # 5秒刷新

    def clear_screen(self):
        os.system('clear')

    def get_daemon_status(self):
        """获取守护进程状态"""
        try:
            result = subprocess.run(
                ["ps", "aux"],
                capture_output=True, text=True, timeout=5
            )
            for line in result.stdout.split("\n"):
                if "agent-daemon.py" in line and "grep" not in line:
                    parts = line.split()
                    pid = parts[1]
                    cpu = parts[2]
                    mem = parts[3]
                    return {"running": True, "pid": pid, "cpu": cpu, "mem": mem}
            return {"running": False}
        except:
            return {"running": False, "error": "check failed"}

    def get_monitor_status(self):
        """获取监控进程状态"""
        try:
            result = subprocess.run(
                ["ps", "aux"],
                capture_output=True, text=True, timeout=5
            )
            for line in result.stdout.split("\n"):
                if "monitor.py" in line and "grep" not in line:
                    return {"running": True}
            return {"running": False}
        except:
            return {"running": False}

    def get_recent_logs(self, log_file, lines=10):
        """获取最近的日志"""
        log_path = LOGS_DIR / log_file
        if log_path.exists():
            try:
                with open(log_path, "r") as f:
                    all_lines = f.readlines()
                    return all_lines[-lines:]
            except:
                return []
        return []

    def get_processed_issues(self):
        """获取已处理的 Issue"""
        processed_file = PROJECT_DIR / ".agent" / "processed_issues.json"
        if processed_file.exists():
            try:
                with open(processed_file, "r") as f:
                    return json.load(f)
            except:
                return []
        return []

    def get_execution_stats(self):
        """获取执行统计"""
        stats = {
            "total_issues": 0,
            "processed_issues": 0,
            "success_count": 0,
            "error_count": 0,
            "last_execution": None
        }

        # 统计日志
        daemon_log = LOGS_DIR / "daemon.log"
        if daemon_log.exists():
            try:
                with open(daemon_log, "r") as f:
                    content = f.read()
                    stats["processed_issues"] = content.count("处理完成")
                    stats["error_count"] = content.lower().count("error")
            except:
                pass

        # 已处理 Issue
        processed = self.get_processed_issues()
        stats["total_issues"] = len(processed)

        # 最近执行时间
        issue_logs = list(LOGS_DIR.glob("issue-*.log"))
        if issue_logs:
            latest = max(issue_logs, key=lambda x: x.stat().st_mtime)
            stats["last_execution"] = datetime.fromtimestamp(
                latest.stat().st_mtime
            ).strftime("%H:%M:%S")

        return stats

    def get_git_changes(self):
        """获取 Git 变更"""
        try:
            result = subprocess.run(
                ["git", "status", "--short"],
                cwd=PROJECT_DIR,
                capture_output=True, text=True, timeout=5
            )
            changes = result.stdout.strip().split("\n")
            changes = [c for c in changes if c]
            return {
                "total": len(changes),
                "added": len([c for c in changes if c.startswith("A") or c.startswith("??")]),
                "modified": len([c for c in changes if c.startswith("M")]),
                "deleted": len([c for c in changes if c.startswith("D")])
            }
        except:
            return {"total": 0}

    def render(self):
        """渲染仪表盘"""
        self.clear_screen()

        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        print("=" * 70)
        print(f"  🤖 Agent 团队监控仪表盘              {now}")
        print("=" * 70)

        # 1. 系统状态
        print("\n📋 系统状态")
        print("-" * 70)

        daemon = self.get_daemon_status()
        monitor = self.get_monitor_status()

        daemon_status = f"✅ 运行中 (PID: {daemon['pid']}, CPU: {daemon['cpu']}%)" if daemon["running"] else "❌ 未运行"
        monitor_status = "✅ 运行中" if monitor["running"] else "❌ 未运行"

        print(f"  守护进程: {daemon_status}")
        print(f"  监控系统: {monitor_status}")

        # 2. 执行统计
        print("\n📊 执行统计")
        print("-" * 70)

        stats = self.get_execution_stats()
        print(f"  已处理 Issue: {stats['total_issues']} 个")
        print(f"  完成次数: {stats['processed_issues']} 次")
        print(f"  错误次数: {stats['error_count']} 次")
        print(f"  最近执行: {stats['last_execution'] or '无'}")

        # 3. Git 变更
        print("\n📝 Git 变更")
        print("-" * 70)

        git = self.get_git_changes()
        print(f"  待提交: {git['total']} 个文件")
        if git['total'] > 0:
            print(f"    - 新增: {git['added']}")
            print(f"    - 修改: {git['modified']}")
            print(f"    - 删除: {git['deleted']}")

        # 4. 最近日志
        print("\n📜 最近日志 (daemon.log)")
        print("-" * 70)

        logs = self.get_recent_logs("daemon.log", 8)
        for log in logs:
            log = log.strip()
            if log:
                # 简化显示
                if "处理完成" in log:
                    print(f"  ✅ {log}")
                elif "跳过" in log:
                    print(f"  ⏭️ {log}")
                elif "错误" in log or "error" in log.lower():
                    print(f"  ❌ {log}")
                else:
                    print(f"  📌 {log}")

        # 5. 已处理 Issue
        print("\n🔢 已处理 Issue")
        print("-" * 70)

        processed = self.get_processed_issues()
        if processed:
            print(f"  {', '.join(map(str, processed))}")
        else:
            print("  暂无")

        # 6. 底部操作提示
        print("\n" + "=" * 70)
        print("  按 Ctrl+C 退出 | 刷新间隔: 5秒")
        print("=" * 70)

    def run(self):
        """运行仪表盘"""
        print("启动监控仪表盘...")
        time.sleep(1)

        try:
            while True:
                current_time = time.time()
                if current_time - self.last_update >= self.update_interval:
                    self.render()
                    self.last_update = current_time
                time.sleep(1)
        except KeyboardInterrupt:
            print("\n\n退出监控仪表盘")


if __name__ == "__main__":
    dashboard = Dashboard()
    dashboard.run()
