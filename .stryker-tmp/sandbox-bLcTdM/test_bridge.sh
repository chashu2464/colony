#!/bin/bash
echo "=== 测试Mem0 Bridge启动 ==="

# 读取.env文件
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

echo -e "\n1. 环境变量检查"
echo "OPENAI_BASE_URL: ${OPENAI_BASE_URL:-未设置}"
echo "OPENAI_API_KEY: ${OPENAI_API_KEY:+已设置 (长度: ${#OPENAI_API_KEY})}"

echo -e "\n2. 测试Python模块导入"
PYTHONPATH=scripts python3 -c "import mem0_bridge; print('✅ mem0_bridge可导入')" 2>&1

echo -e "\n3. 测试Mem0 Bridge启动"
CONFIG='{"vector_store":{"provider":"qdrant","config":{"host":"localhost","port":6333,"collection_name":"test_memories"}},"llm":{"provider":"openai","config":{"model":"glm-4-flash"}},"embedder":{"provider":"openai","config":{"model":"embedding-3","embedding_dims":1536}}}'

echo "配置: $CONFIG"
echo ""

# 启动Python进程并等待输出
timeout 10s bash -c "
    PYTHONPATH=scripts python3 -u -m mem0_bridge --config '$CONFIG' 2>&1 &
    PID=\$!
    echo \"Python进程PID: \$PID\"

    # 等待5秒看是否有输出
    sleep 5

    # 检查进程是否还在运行
    if ps -p \$PID > /dev/null; then
        echo \"✅ Python进程仍在运行\"
        kill \$PID 2>/dev/null
    else
        echo \"❌ Python进程已退出\"
    fi
" || echo "❌ 超时或错误"

echo -e "\n=== 测试完成 ==="
