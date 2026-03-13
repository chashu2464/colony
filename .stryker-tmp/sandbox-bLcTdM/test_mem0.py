#!/usr/bin/env python3
"""
测试Mem0初始化
"""
import os
import sys
import json

# 设置环境变量
os.environ['OPENAI_BASE_URL'] = 'https://open.bigmodel.cn/api/paas/v4/'
os.environ['OPENAI_API_KEY'] = os.getenv('OPENAI_API_KEY', 'your-key-here')

# 添加scripts目录到Python路径
sys.path.insert(0, 'scripts')

from mem0 import Memory

# 配置
config = {
    'vector_store': {
        'provider': 'qdrant',
        'config': {
            'host': 'localhost',
            'port': 6333,
            'collection_name': 'test_colony_memories'
        }
    },
    'llm': {
        'provider': 'openai',
        'config': {
            'model': 'glm-4-flash',
            'api_key': os.environ['OPENAI_API_KEY']
        }
    },
    'embedder': {
        'provider': 'openai',
        'config': {
            'model': 'embedding-3',
            'api_key': os.environ['OPENAI_API_KEY'],
            'embedding_dims': 1536
        }
    }
}

print('=== 测试Mem0初始化 ===')
print(f'OPENAI_BASE_URL: {os.environ.get("OPENAI_BASE_URL")}')
print(f'OPENAI_API_KEY: {"✅ 已设置" if os.environ.get("OPENAI_API_KEY") else "❌ 未设置"}')

try:
    print('\n1. 初始化Mem0...')
    memory = Memory.from_config(config)
    print('✅ Mem0初始化成功')

    print('\n2. 测试添加记忆...')
    result = memory.add(
        messages='This is a test memory from Colony',
        agent_id='test-agent',
        run_id='test-run'
    )
    print('✅ 添加记忆成功')
    print(f'结果: {json.dumps(result, indent=2, ensure_ascii=False)}')

    print('\n3. 测试搜索记忆...')
    search_result = memory.search(
        query='test memory',
        agent_id='test-agent',
        run_id='test-run',
        limit=5
    )
    print('✅ 搜索记忆成功')
    print(f'找到 {len(search_result.get("results", []))} 条记忆')

    print('\n=== 测试完成 ===')

except Exception as e:
    print(f'\n❌ 错误: {e}')
    import traceback
    traceback.print_exc()
    sys.exit(1)
