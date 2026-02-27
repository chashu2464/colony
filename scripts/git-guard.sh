#!/bin/bash
# Colony Git Guard - Prevents direct commits to master/main

current_branch=$(git rev-parse --abbrev-ref HEAD)
if [[ "$current_branch" == "master" ]] || [[ "$current_branch" == "main" ]]; then
    echo "❌ 错误: 禁止直接在 $current_branch 分支上提交代码。"
    echo "请使用 dev-workflow init 初始化任务，或手动创建分支: git checkout -b feature/task-XYZ"
    exit 1
fi
