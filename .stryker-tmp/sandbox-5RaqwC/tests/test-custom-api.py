#!/usr/bin/env python3
"""
Quick test for custom API endpoint configuration.
"""

import sys
import os

# Add scripts directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'scripts'))

from mem0_config_loader import load_config, create_mem0_instance

def test_custom_api():
    print("=== Testing Custom API Endpoint ===\n")

    # Load configuration
    config_path = "config/mem0.yaml"
    print(f"1. Loading configuration from: {config_path}")
    config = load_config(config_path)

    # Print endpoint info
    llm_base_url = config.get('llm', {}).get('config', {}).get('base_url', 'default')
    embedder_base_url = config.get('embedder', {}).get('config', {}).get('base_url', 'default')

    print(f"   LLM endpoint: {llm_base_url}")
    print(f"   Embedder endpoint: {embedder_base_url}")
    print()

    # Create Mem0 instance
    print("2. Creating Mem0 instance...")
    try:
        memory = create_mem0_instance(config)
        print("   ✓ Mem0 instance created successfully")
    except Exception as e:
        print(f"   ❌ Failed to create Mem0 instance: {e}")
        return False

    print()

    # Test add (memory extraction with LLM)
    print("3. Testing memory extraction (LLM)...")
    try:
        result = memory.add(
            "用户喜欢喝咖啡，特别是拿铁",
            user_id="test_user"
        )
        print(f"   ✓ Memory added: {result['results'][0]['memory']}")
        print(f"   Event: {result['results'][0]['event']}")
    except Exception as e:
        print(f"   ❌ Failed to add memory: {e}")
        import traceback
        traceback.print_exc()
        return False

    print()

    # Test search (embedder + vector search)
    print("4. Testing semantic search (Embedder)...")
    try:
        results = memory.search(
            "用户喜欢什么饮料？",
            user_id="test_user",
            limit=3
        )
        print(f"   ✓ Search completed: {len(results['results'])} results")
        for i, result in enumerate(results['results'], 1):
            print(f"   {i}. {result['memory']} (score: {result.get('score', 'N/A')})")
    except Exception as e:
        print(f"   ❌ Failed to search: {e}")
        import traceback
        traceback.print_exc()
        return False

    print()

    # Cleanup
    print("5. Cleaning up test data...")
    try:
        memory.delete_all(user_id="test_user")
        print("   ✓ Test data cleaned up")
    except Exception as e:
        print(f"   ⚠️  Cleanup warning: {e}")

    print()
    print("=== All Tests Passed ✓ ===")
    print()
    print("Your custom API endpoint is working correctly!")
    print(f"LLM: {llm_base_url}")
    print(f"Embedder: {embedder_base_url}")

    return True


if __name__ == '__main__':
    try:
        success = test_custom_api()
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n\nTest interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n\n❌ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
