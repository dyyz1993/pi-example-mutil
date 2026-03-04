#!/usr/bin/env python3
"""
Agent 团队自动化守护进程
简单的定时任务调度器，替代 cron
"""

import subprocess
import time
import os
import sys
from datetime import datetime
from pathlib import Path

# 禁用输出缓冲
sys.stdout = os.fdopen(sys.stdout.fileno(), 'w', buffering=1)
sys.stderr = os.fdopen(sys.stderr.fileno(), 'w', buffering=1)

# 配置
PROJECT_DIR = Path(__file__).parent.absolute()
PI_PATH = "/Users/xuyingzhou/.nvm/versions/node/v25.2.1/bin/pi"
LOGS_DIR = PROJECT_DIR / "logs"

# 环境变量
ENV = os.environ.copy()
ENV["PATH"] = "/Users/xuyingzhou/.nvm/versions/node/v25.2.1/bin:/usr/local/bin:/usr/bin:/bin"

# 任务配置
TASKS = [
    {
        "name": "check-issues",
        "interval": 300,  # 5 分钟
        "prompt": "作为 Team Lead，检查 GitHub 未处理的 Issue，分析并分配任务",
        "log": "cron-issue.log"
    },
    {
        "name": "check-prs",
        "interval": 3600,  # 1 小时
        "prompt": "作为 Team Lead，检查待处理的 PR，进行代码审查",
        "log": "cron-pr.log"
    },
    {
        "name": "health-check",
        "interval": 86400,  # 1 天
        "prompt": "作为 Team Lead，检查项目健康状态并更新知识库",
        "log": "cron-health.log"
    },
    {
        "name": "weekly-report",
        "interval": 604800,  # 1 周
        "prompt": "作为 Team Lead，生成本周工作报告",
        "log": "cron-report.log"
    }
]

# 任务上次执行时间
last_run = {}

def log(message):
    """打印日志"""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{timestamp}] {message}", flush=True)

def run_task(task):
    """执行任务"""
    log(f"执行任务: {task['name']}")
    
    log_file = LOGS_DIR / task["log"]
    
    try:
        result = subprocess.run(
            [PI_PATH, "-p", task["prompt"], "--no-session"],
            cwd=PROJECT_DIR,
            capture_output=True,
            text=True,
            env=ENV,
            timeout=300  # 5 分钟超时
        )
        
        # 写入日志
        with open(log_file, "a") as f:
            f.write(f"\n{'='*50}\n")
            f.write(f"时间: {datetime.now()}\n")
            f.write(f"任务: {task['name']}\n")
            f.write(f"{'='*50}\n")
            f.write(result.stdout)
            if result.stderr:
                f.write(f"\n错误:\n{result.stderr}\n")
        
        log(f"任务完成: {task['name']} (输出 {len(result.stdout)} 字符)")
        
    except subprocess.TimeoutExpired:
        log(f"任务超时: {task['name']}")
        with open(log_file, "a") as f:
            f.write(f"\n{datetime.now()} - 任务超时\n")
    except Exception as e:
        log(f"任务失败: {task['name']} - {e}")

def main():
    """主循环"""
    # 确保日志目录存在
    LOGS_DIR.mkdir(exist_ok=True)
    
    log("=" * 50)
    log("Agent 团队自动化守护进程启动")
    log("=" * 50)
    log(f"项目目录: {PROJECT_DIR}")
    log(f"pi 路径: {PI_PATH}")
    log(f"任务数量: {len(TASKS)}")
    
    for task in TASKS:
        log(f"  - {task['name']}: 每 {task['interval']} 秒")
        last_run[task["name"]] = 0
    
    log("")
    log("等待任务执行...")
    log("")
    
    try:
        while True:
            current_time = time.time()
            
            for task in TASKS:
                if current_time - last_run[task["name"]] >= task["interval"]:
                    run_task(task)
                    last_run[task["name"]] = current_time
            
            # 每 10 秒检查一次
            time.sleep(10)
            
    except KeyboardInterrupt:
        log("\n收到中断信号，正在退出...")

if __name__ == "__main__":
    main()