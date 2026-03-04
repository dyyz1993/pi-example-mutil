#!/usr/bin/env python3
"""
Agent 团队自动化守护进程 v2
真正的自动化开发系统 - 不只是生成报告，而是实际执行开发任务
"""

import subprocess
import time
import os
import sys
import json
from datetime import datetime
from pathlib import Path

# 禁用输出缓冲
sys.stdout = os.fdopen(sys.stdout.fileno(), 'w', buffering=1)
sys.stderr = os.fdopen(sys.stderr.fileno(), 'w', buffering=1)

# 配置
PROJECT_DIR = Path(__file__).parent.absolute()
PI_PATH = "/Users/xuyingzhou/.nvm/versions/node/v25.2.1/bin/pi"
LOGS_DIR = PROJECT_DIR / "logs"
GITHUB_REPO = "dyyz1993/pi-example-mutil"

# 环境变量
ENV = os.environ.copy()
ENV["PATH"] = "/Users/xuyingzhou/.nvm/versions/node/v25.2.1/bin:/usr/local/bin:/usr/bin:/bin"

def log(message):
    """打印日志"""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{timestamp}] {message}", flush=True)

def run_pi(prompt, timeout=300):
    """执行 pi 命令"""
    try:
        result = subprocess.run(
            [PI_PATH, "-p", prompt, "--no-session"],
            cwd=PROJECT_DIR,
            capture_output=True,
            text=True,
            env=ENV,
            timeout=timeout
        )
        # 安全：不记录 prompt 内容（可能包含敏感信息）
        return result.stdout, result.stderr, result.returncode
    except subprocess.TimeoutExpired:
        return "", "Timeout", -1
    except Exception as e:
        # 安全：不记录详细错误信息
        return "", "Execution failed", -1

def get_github_issues():
    """获取 GitHub 未处理的 Issue"""
    try:
        result = subprocess.run(
            ["gh", "issue", "list", "--repo", GITHUB_REPO, "--state", "open", "--json", "number,title,body,labels"],
            capture_output=True,
            text=True,
            timeout=30
        )
        if result.returncode == 0:
            return json.loads(result.stdout)
        return []
    except Exception as e:
        log(f"获取 Issue 失败: {e}")
        return []

def process_issue(issue):
    """处理单个 Issue - 真正的自动化开发"""
    issue_num = issue["number"]
    title = issue["title"]
    body = issue.get("body", "")
    
    log(f"处理 Issue #{issue_num}: {title}")
    
    # 使用 subagent 工具委托给具体的 Agent 执行开发
    prompt = f"""你是 Team Lead，需要处理 GitHub Issue #{issue_num}。

**Issue 标题**: {title}
**Issue 内容**: 
{body}

**重要指令**：
1. 分析这个 Issue 是什么类型的任务（bug修复/新功能/文档更新）
2. 使用 subagent 工具委托给合适的子 Agent 执行实际开发工作
3. 子 Agent 必须使用 write、edit、bash 等工具真正修改代码
4. 开发完成后提交代码并创建 PR

**不要只生成报告！必须真正执行开发！**

示例流程：
```
# 1. 分析后委托给 backend-dev
使用 subagent 工具，agent: "backend-dev"，task: "实现 XXX 功能"

# 2. backend-dev 会真正写代码
# 3. 检查结果
# 4. 创建 PR
```

现在开始处理 Issue #{issue_num}："""
    
    stdout, stderr, code = run_pi(prompt, timeout=600)
    
    log(f"Issue #{issue_num} 处理完成")
    
    # 写入日志
    log_file = LOGS_DIR / f"issue-{issue_num}.log"
    with open(log_file, "w") as f:
        f.write(f"=== Issue #{issue_num}: {title} ===\n")
        f.write(f"时间: {datetime.now()}\n\n")
        f.write(stdout)
        if stderr:
            f.write(f"\n\n错误:\n{stderr}")
    
    return stdout

def check_and_process_issues():
    """检查并处理所有未处理的 Issue"""
    log("检查 GitHub Issue...")
    
    issues = get_github_issues()
    
    if not issues:
        log("没有未处理的 Issue")
        return
    
    log(f"发现 {len(issues)} 个未处理的 Issue")
    
    for issue in issues:
        process_issue(issue)
        time.sleep(5)  # 避免请求过快

def health_check():
    """项目健康检查"""
    log("执行项目健康检查...")
    
    prompt = """作为 Team Lead，执行项目健康检查：

1. 检查是否有未提交的代码更改
2. 检查是否有失败的测试
3. 检查知识库是否需要更新
4. 如果发现问题，使用 subagent 工具委托给相应的 Agent 处理

重要：不要只生成报告！要实际执行操作解决问题！
"""
    
    stdout, stderr, code = run_pi(prompt, timeout=300)
    log("健康检查完成")

def generate_weekly_report():
    """生成周报"""
    log("生成周报...")
    
    prompt = """作为 Team Lead，生成本周工作报告：

1. 查看本周完成的任务
2. 查看本周创建的 Issue 和 PR
3. 生成周报并保存到 .agent/reports/weekly-{date}.md

使用 write 工具创建报告文件。
"""
    
    stdout, stderr, code = run_pi(prompt, timeout=300)
    log("周报生成完成")

# 任务配置
TASKS = [
    {
        "name": "check-issues",
        "interval": 300,  # 5 分钟
        "handler": check_and_process_issues
    },
    {
        "name": "health-check",
        "interval": 3600,  # 1 小时
        "handler": health_check
    },
    {
        "name": "weekly-report",
        "interval": 86400,  # 1 天
        "handler": generate_weekly_report
    }
]

# 任务上次执行时间
last_run = {}

def main():
    """主循环"""
    # 确保日志目录存在
    LOGS_DIR.mkdir(exist_ok=True)
    
    log("=" * 60)
    log("Agent 团队自动化守护进程 v2 启动")
    log("真正的自动化开发 - 不只是生成报告")
    log("=" * 60)
    # 安全：不记录敏感路径信息
    log(f"项目目录: <configured>")
    log(f"GitHub 仓库: {GITHUB_REPO}")
    # 安全：不记录完整路径
    log(f"pi 路径: <configured>")
    log("")
    log("任务配置:")
    for task in TASKS:
        log(f"  - {task['name']}: 每 {task['interval']} 秒")
        last_run[task["name"]] = 0
    
    log("")
    log("开始监控...")
    log("")
    
    try:
        while True:
            current_time = time.time()
            
            for task in TASKS:
                if current_time - last_run[task["name"]] >= task["interval"]:
                    try:
                        task["handler"]()
                    except Exception as e:
                        log(f"任务 {task['name']} 执行失败: {e}")
                    last_run[task["name"]] = current_time
            
            # 每 10 秒检查一次
            time.sleep(10)
            
    except KeyboardInterrupt:
        log("\n收到中断信号，正在退出...")

if __name__ == "__main__":
    main()