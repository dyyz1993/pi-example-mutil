#!/usr/bin/env python3
"""
自动优化器 - 持续监控并自动修复问题
每30秒检查一次，发现问题自动优化
"""

import os
import sys
import json
import time
import subprocess
from datetime import datetime
from pathlib import Path

sys.stdout = os.fdopen(sys.stdout.fileno(), 'w', buffering=1)

PROJECT_DIR = Path(__file__).parent.parent.absolute()
LOGS_DIR = PROJECT_DIR / "logs"
STATE_FILE = PROJECT_DIR / ".agent" / "optimizer_state.json"

class AutoOptimizer:
    def __init__(self):
        self.fixes_applied = []
        self.load_state()

    def load_state(self):
        if STATE_FILE.exists():
            try:
                with open(STATE_FILE) as f:
                    data = json.load(f)
                    self.fixes_applied = data.get("fixes", [])
            except:
                pass

    def save_state(self):
        STATE_FILE.parent.mkdir(exist_ok=True)
        with open(STATE_FILE, "w") as f:
            json.dump({
                "fixes": self.fixes_applied[-50:],  # 保留最近50条
                "last_update": datetime.now().isoformat()
            }, f, ensure_ascii=False, indent=2)

    def log(self, msg, level="INFO"):
        ts = datetime.now().strftime("%H:%M:%S")
        icons = {"INFO": "📊", "WARN": "⚠️", "FIX": "🔧", "OK": "✅", "ERR": "🔴"}
        print(f"[{ts}] {icons.get(level, '📌')} {msg}", flush=True)

    def check_daemon(self):
        """检查守护进程"""
        try:
            result = subprocess.run(["ps", "aux"], capture_output=True, text=True, timeout=5)
            for line in result.stdout.split("\n"):
                if "agent-daemon.py" in line and "grep" not in line:
                    parts = line.split()
                    return {"ok": True, "pid": parts[1]}
            return {"ok": False, "pid": None}
        except:
            return {"ok": False, "error": "check failed"}

    def fix_daemon(self):
        """修复守护进程"""
        self.log("守护进程未运行，正在重启...", "FIX")
        try:
            # 启动守护进程
            subprocess.run(
                ["nohup", "python3", "agent-daemon.py"],
                cwd=PROJECT_DIR,
                stdout=open(LOGS_DIR / "daemon.log", "w"),
                stderr=subprocess.STDOUT
            )
            time.sleep(2)
            result = self.check_daemon()
            if result["ok"]:
                self.log(f"守护进程已重启 (PID: {result['pid']})", "OK")
                self.fixes_applied.append({
                    "time": datetime.now().isoformat(),
                    "type": "daemon_restart",
                    "success": True
                })
                return True
        except Exception as e:
            self.log(f"重启失败: {e}", "ERR")
        return False

    def check_repeated_issues(self):
        """检查重复处理的 Issue"""
        processed_file = PROJECT_DIR / ".agent" / "processed_issues.json"
        if not processed_file.exists():
            return {"ok": True}

        try:
            with open(processed_file) as f:
                processed = json.load(f)

            # 检查日志中重复处理次数
            daemon_log = LOGS_DIR / "daemon.log"
            if daemon_log.exists():
                with open(daemon_log) as f:
                    content = f.read()

                repeats = {}
                for issue in processed:
                    count = content.count(f"处理 Issue #{issue}")
                    if count > 2:
                        repeats[issue] = count

                if repeats:
                    return {"ok": False, "repeats": repeats}
        except:
            pass

        return {"ok": True}

    def check_logs_for_errors(self):
        """检查日志中的错误"""
        errors = []
        for log_file in LOGS_DIR.glob("*.log"):
            try:
                with open(log_file) as f:
                    lines = f.readlines()[-100:]  # 最近100行
                    for line in lines:
                        if "error" in line.lower() and "env: node" not in line.lower():
                            errors.append({
                                "file": log_file.name,
                                "line": line.strip()[:100]
                            })
            except:
                pass

        return errors[:10]  # 返回最近10个错误

    def run_optimization_cycle(self):
        """运行一次优化检查"""
        self.log("=" * 50)
        self.log("开始优化检查周期")

        issues_found = []
        fixes_applied = []

        # 1. 检查守护进程
        daemon = self.check_daemon()
        if not daemon["ok"]:
            issues_found.append("daemon_not_running")
            if self.fix_daemon():
                fixes_applied.append("daemon_restarted")
        else:
            self.log(f"守护进程正常 (PID: {daemon['pid']})", "OK")

        # 2. 检查重复 Issue
        repeats = self.check_repeated_issues()
        if not repeats["ok"]:
            self.log(f"发现重复处理的 Issue: {repeats['repeats']}", "WARN")
            issues_found.append("repeated_issues")

        # 3. 检查错误
        errors = self.check_logs_for_errors()
        if errors:
            self.log(f"发现 {len(errors)} 个错误", "WARN")
            for err in errors[:3]:
                self.log(f"  - {err['file']}: {err['line'][:60]}...", "WARN")
            issues_found.append("errors_in_logs")

        # 4. 保存状态
        self.save_state()

        # 5. 总结
        if issues_found:
            self.log(f"发现问题: {', '.join(issues_found)}")
            if fixes_applied:
                self.log(f"已修复: {', '.join(fixes_applied)}", "FIX")
        else:
            self.log("系统运行正常，无需优化", "OK")

        return {
            "issues": issues_found,
            "fixes": fixes_applied
        }

    def run_forever(self):
        """持续运行"""
        self.log("🚀 自动优化器启动")
        self.log("检查间隔: 30秒")

        cycle = 0
        while True:
            try:
                cycle += 1
                self.run_optimization_cycle()

                # 每10个周期输出一次完整状态
                if cycle % 10 == 0:
                    self.log(f"已完成 {cycle} 个优化周期")

                time.sleep(30)

            except KeyboardInterrupt:
                self.log("收到中断信号，退出")
                break
            except Exception as e:
                self.log(f"优化器错误: {e}", "ERR")
                time.sleep(60)


if __name__ == "__main__":
    optimizer = AutoOptimizer()
    optimizer.run_forever()
