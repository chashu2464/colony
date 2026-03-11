#!/bin/bash
echo "=== Colony Mem0 诊断 ==="

echo -e "\n1. 检查Python进程"
if ps aux | grep "python.*mem0_bridge" | grep -v grep > /dev/null; then
    echo "✅ Python进程正在运行"
    ps aux | grep "python.*mem0_bridge" | grep -v grep
else
    echo "❌ Python进程未运行"
fi

echo -e "\n2. 检查Qdrant"
if curl -s http://localhost:6333/health > /dev/null 2>&1; then
    echo "✅ Qdrant正在运行"
    curl -s http://localhost:6333/health | head -1
else
    echo "❌ Qdrant未运行"
fi

echo -e "\n3. 检查环境变量"
node -e "require('dotenv').config(); console.log('OPENAI_BASE_URL:', process.env.OPENAI_BASE_URL || '❌ 未设置')"
node -e "require('dotenv').config(); console.log('OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? '✅ 已设置 (长度: ' + process.env.OPENAI_API_KEY.length + ')' : '❌ 未设置')"

echo -e "\n4. 检查Python模块"
if PYTHONPATH=scripts python3 -c "import mem0_bridge; print('✅ mem0_bridge可导入')" 2>&1; then
    :
else
    echo "❌ mem0_bridge导入失败"
fi

echo -e "\n5. 检查mem0版本"
if pip3 show mem0ai > /dev/null 2>&1; then
    echo "✅ mem0ai已安装"
    pip3 show mem0ai | grep Version
else
    echo "❌ mem0ai未安装"
fi

echo -e "\n6. 检查会话文件"
if [ -d ".data/sessions" ]; then
    echo "✅ 会话目录存在"
    ls -lh .data/sessions/ | tail -5
else
    echo "❌ 会话目录不存在"
fi

echo -e "\n7. 检查配置文件"
if [ -f "config/mem0.yaml" ]; then
    echo "✅ mem0.yaml存在"
else
    echo "❌ mem0.yaml不存在"
fi

if [ -f ".env" ]; then
    echo "✅ .env文件存在"
else
    echo "❌ .env文件不存在"
fi

echo -e "\n8. 检查Python和Node版本"
echo "Python: $(python3 --version)"
echo "Node: $(node --version)"
echo "npm: $(npm --version)"

echo -e "\n=== 诊断完成 ==="
