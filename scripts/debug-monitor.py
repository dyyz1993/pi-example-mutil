#!/usr/bin/env python3
"""
Agent 团队完整监控系统 v2
- 执行追踪：记录每个步骤
- 结果验证：检查是否真正执行
- 统一日志：结构化日志格式
- 告警机制：发现问题立即通知
"""

import os
import sys
import json
import time
import hashlib
import subprocess
from datetime import datetime
from pathlib import Path
from collections import defaultdict

sys.stdout = os.fdopen(sys.stdout.fileno(), 'w', buffering=1)
sys.stderr = os.fdopen(sys.stderr.fileno(), 'w', buffering=1)

PROJECT_DIR = Path(__file__).parent.parent.absolute()
LOGS_DIR = PROJECT_DIR / "logs"
TRACE_DIR = PROJECT_DIR / "logs" / "traces"
METRICS_DIR = PROJECT_DIR / "logs" / "metrics"

# 确保目录存在
TRACE_DIR.mkdir(parents=True, exist_ok=True)
METRICS_DIR.mkdir(exist_ok=True)

class ExecutionTracer:
    """执行追踪器 - 记录每个 Agent 的执行详情"""

    def __init__(self, session_id):
        self.session_id = session_id
        self.trace_file = TRACE_DIR / f"{session_id}.jsonl"
        self.start_time = time.time()
        self.steps = []

    def log_step(self, step_type, agent, action, details=None, success=True):
        """记录执行步骤"""
        step = {
            "timestamp": datetime.now().isoformat(),
            "step_type": step_type,  # "think", "tool_use", "tool_result", "error"
            "agent": agent,
            "action": action,
            "details": details,
            "success": success,
            "elapsed": time.time() - self.start_time
        }
        self.steps.append(step)

        # 实时写入
        with open(self.trace_file, "a") as f:
            f.write(json.dumps(step, ensure_ascii=False) + "\n")

        return step

    def finalize(self, summary):
        """完成追踪"""
        result = {
            "session_id": self.session_id,
            "start_time": datetime.fromtimestamp(self.start_time).isoformat(),
            "end_time": datetime.now().isoformat(),
            "total_steps": len(self.steps),
            "success_steps": sum(1 for s in self.steps if s["success"]),
            "failed_steps": sum(1 for s in self.steps if not s["success"]),
            "summary": summary
        }

        summary_file = TRACE_DIR / f"{self.session_id}_summary.json"
        with open(summary_file, "w") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)

        return result


class ExecutionValidator:
    """执行验证器 - 检查 Agent 是否真正执行了操作"""

    def __init__(self, project_dir):
        self.project_dir = Path(project_dir)
        self.baseline = self._capture_baseline()

    def _capture_baseline(self):
        """捕获当前项目状态作为基线"""
        baseline = {
            "files": {},
            "git_status": self._get_git_status(),
            "timestamp": datetime.now().isoformat()
        }

        # 记录所有文件的状态
        for f in self.project_dir.rglob("*"):
            if f.is_file() and not f.name.startswith("."):
                try:
                    baseline["files"][str(f.relative_to(self.project_dir))] = {
                        "size": f.stat().st_size,
                        "mtime": f.stat().st_mtime
                    }
                except:
                    pass

        return baseline

    def _get_git_status(self):
        """获取 Git 状态"""
        try:
            result = subprocess.run(
                ["git", "status", "--porcelain"],
                cwd=self.project_dir,
                capture_output=True, text=True, timeout=10
            )
            return result.stdout.strip()
        except:
            return "not_a_git_repo"

    def validate_execution(self):
        """验证是否有实际执行"""
        current = self._capture_baseline()
        changes = {
            "files_modified": [],
            "files_added": [],
            "files_deleted": [],
            "git_changed": False,
            "has_real_changes": False
        }

        # 检查文件变化
        for path, info in current["files"].items():
            if path not in self.baseline["files"]:
                changes["files_added"].append(path)
            elif info["mtime"] > self.baseline["files"][path]["mtime"]:
                changes["files_modified"].append(path)

        for path in self.baseline["files"]:
            if path not in current["files"]:
                changes["files_deleted"].append(path)

        # 检查 Git 变化
        changes["git_changed"] = current["git_status"] != self.baseline["git_status"]

        # 判断是否有真正的变化
        changes["has_real_changes"] = bool(
            changes["files_modified"] or
            changes["files_added"] or
            changes["files_deleted"] or
            changes["git_changed"]
        )

        return changes


class MetricsCollector:
    """指标收集器 - 收集运行指标"""

    def __init__(self):
        self.metrics = defaultdict(list)
        self.metrics_file = METRICS_DIR / "metrics.jsonl"

    def record(self, metric_name, value, tags=None):
        """记录指标"""
        entry = {
            "timestamp": datetime.now().isoformat(),
            "metric": metric_name,
            "value": value,
            "tags": tags or {}
        }
        self.metrics[metric_name].append(entry)

        # 实时写入
        with open(self.metrics_file, "a") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")

    def get_summary(self, hours=24):
        """获取过去N小时的指标摘要"""
        now = datetime.now()
        cutoff = now.timestamp() - (hours * 3600)

        summary = {}
        for metric_name, entries in self.metrics.items():
            recent = [
                e for e in entries
                if datetime.fromisoformat(e["timestamp"]).timestamp() > cutoff
            ]
            if recent:
                values = [e["value"] for e in recent if isinstance(e["value"], (int, float))]
                if values:
                    summary[metric_name] = {
                        "count": len(values),
                        "sum": sum(values),
                        "avg": sum(values) / len(values),
                        "min": min(values),
                        "max": max(values)
                    }
        return summary


class AgentDebugger:
    """Agent 调试器 - 主控制器"""

    def __init__(self):
        self.tracer = None
        self.validator = ExecutionValidator(PROJECT_DIR)
        self.metrics = MetricsCollector()
        self.session_id = datetime.now().strftime("%Y%m%d_%H%M%S")

    def log(self, message, level="INFO"):
        """打印日志"""
        timestamp = datetime.now().strftime("%H:%M:%S")
        icons = {"INFO": "📊", "WARN": "⚠️", "ERROR": "🔴", "SUCCESS": "✅", "DEBUG": "🔍"}
        print(f"[{timestamp}] {icons.get(level, '📌')} {message}", flush=True)

    def start_session(self, task_name):
        """开始一个调试会话"""
        self.session_id = f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_{task_name}"
        self.tracer = ExecutionTracer(self.session_id)
        self.validator = ExecutionValidator(PROJECT_DIR)

        self.tracer.log_step("session_start", "debugger", f"开始会话: {task_name}")
        self.log(f"开始调试会话: {task_name}")

    def trace_pi_execution(self, prompt, timeout=60):
        """追踪 pi 执行"""
        self.log("执行 pi 命令...", "DEBUG")
        self.tracer.log_step("tool_use", "system", "pi_execute", {"prompt_length": len(prompt)})

        start_time = time.time()
        try:
            # 设置环境
            env = os.environ.copy()
            env["PATH"] = "/Users/xuyingzhou/.nvm/versions/node/v25.2.1/bin:" + env.get("PATH", "")

            result = subprocess.run(
                ["/Users/xuyingzhou/.nvm/versions/node/v25.2.1/bin/pi", "-p", prompt, "--no-session"],
                cwd=PROJECT_DIR,
                capture_output=True,
                text=True,
                env=env,
                timeout=timeout
            )

            elapsed = time.time() - start_time

            self.tracer.log_step("tool_result", "system", "pi_complete", {
                "returncode": result.returncode,
                "stdout_length": len(result.stdout),
                "stderr_length": len(result.stderr),
                "elapsed": elapsed
            })

            self.metrics.record("pi_execution_time", elapsed)
            self.metrics.record("pi_return_code", result.returncode)

            return result.stdout, result.stderr, result.returncode

        except subprocess.TimeoutExpired:
            self.tracer.log_step("error", "system", "pi_timeout", {"timeout": timeout}, success=False)
            self.metrics.record("pi_timeout", 1)
            return "", "Timeout", -1
        except Exception as e:
            self.tracer.log_step("error", "system", "pi_error", {"error": str(e)}, success=False)
            return "", str(e), -1

    def validate_and_report(self):
        """验证执行结果并生成报告"""
        self.log("验证执行结果...", "DEBUG")

        changes = self.validator.validate_execution()

        self.tracer.log_step("validation", "debugger", "check_changes", changes)

        if changes["has_real_changes"]:
            self.log("检测到实际变化:", "SUCCESS")
            if changes["files_modified"]:
                self.log(f"  修改的文件: {len(changes['files_modified'])} 个", "SUCCESS")
            if changes["files_added"]:
                self.log(f"  新增的文件: {len(changes['files_added'])} 个", "SUCCESS")
            if changes["git_changed"]:
                self.log("  Git 状态有变化", "SUCCESS")
            self.metrics.record("execution_success", 1)
        else:
            self.log("未检测到实际变化 - Agent 可能只生成了报告", "WARN")
            self.metrics.record("execution_no_changes", 1)

        return changes

    def end_session(self, summary):
        """结束调试会话"""
        result = self.tracer.finalize(summary)
        self.log(f"会话结束: {result['total_steps']} 步骤, {result['success_steps']} 成功")
        return result

    def print_dashboard(self):
        """打印仪表盘"""
        print("\n" + "=" * 60)
        print("📊 Agent 监控仪表盘")
        print("=" * 60)

        # 系统状态
        daemon_running = self._check_daemon()
        print(f"\n🔧 系统状态:")
        print(f"  守护进程: {'✅ 运行中' if daemon_running else '❌ 未运行'}")

        # 最近追踪
        traces = list(TRACE_DIR.glob("*.jsonl"))[-5:]
        print(f"\n📝 最近追踪 ({len(traces)} 个):")
        for t in traces:
            stat = t.stat()
            mtime = datetime.fromtimestamp(stat.st_mtime).strftime("%m-%d %H:%M")
            print(f"  - {t.stem}: {mtime}")

        # 指标摘要
        metrics_summary = self.metrics.get_summary(hours=24)
        if metrics_summary:
            print(f"\n📈 24小时指标:")
            for name, stats in metrics_summary.items():
                print(f"  - {name}: avg={stats['avg']:.2f}, count={stats['count']}")

        print("=" * 60 + "\n")

    def _check_daemon(self):
        """检查守护进程"""
        try:
            result = subprocess.run(["ps", "aux"], capture_output=True, text=True)
            return "agent-daemon.py" in result.stdout
        except:
            return False


def main():
    """主函数 - 运行监控循环"""
    debugger = AgentDebugger()

    debugger.log("Agent 调试监控系统启动")
    debugger.print_dashboard()

    check_count = 0
    while True:
        try:
            check_count += 1

            # 每30秒检查一次
            time.sleep(30)

            # 检查守护进程状态
            daemon_ok = debugger._check_daemon()

            # 检查最近的执行
            if check_count % 10 == 0:  # 每5分钟
                debugger.log(f"定期检查 #{check_count}")
                debugger.print_dashboard()

                # 验证最近的执行是否有实际变化
                changes = debugger.validator.validate_execution()
                if not changes["has_real_changes"]:
                    debugger.log("警告: 最近没有实际代码变化", "WARN")

        except KeyboardInterrupt:
            debugger.log("收到中断信号，退出")
            break
        except Exception as e:
            debugger.log(f"监控错误: {e}", "ERROR")
            time.sleep(60)


if __name__ == "__main__":
    main()
