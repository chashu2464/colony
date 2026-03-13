#!/usr/bin/env python3
import sys
import os
import json
from typing import Dict, Any, Optional

# Add scripts directory to Python path
sys.path.insert(0, 'scripts')

from mem0_bridge import normalize_filters
from mem0 import Memory

# Configure environment (consistent with other tests)
os.environ['OPENAI_BASE_URL'] = 'https://open.bigmodel.cn/api/paas/v4/'

# Mock config for testing (using real qdrant on localhost)
config = {
    'vector_store': {
        'provider': 'qdrant',
        'config': {
            'host': 'localhost',
            'port': 6333,
            'collection_name': 'test_filter_fix'
        }
    },
    'llm': {
        'provider': 'openai',
        'config': {
            'model': 'glm-4-flash',
            'api_key': os.environ.get('OPENAI_API_KEY')
        }
    },
    'embedder': {
        'provider': 'openai',
        'config': {
            'model': 'embedding-3',
            'api_key': os.environ.get('OPENAI_API_KEY'),
            'embedding_dims': 1536
        }
    }
}

def test_normalization():
    print("\n--- 1. Testing normalize_filters logic ---")
    filters_with_dollar = {
        "created_at": {"$gte": "2024-01-01T00:00:00Z", "$lte": "2024-12-31T23:59:59Z"},
        "importance": {"$gte": 5},
        "subtypes": {"$in": ["observation", "plan"]},
        "simple_field": "some_value"
    }

    normalized = normalize_filters(filters_with_dollar)
    print(f"Original: {json.dumps(filters_with_dollar, indent=2)}")
    print(f"Normalized: {json.dumps(normalized, indent=2)}")

    # Verify normalization
    assert "gte" in normalized["created_at"]
    assert "$gte" not in normalized["created_at"]
    assert "lte" in normalized["created_at"]
    assert "in" in normalized["subtypes"]
    assert "gte" in normalized["importance"]
    assert normalized["simple_field"] == "some_value"
    print("✅ Normalization logic check PASSED")

def test_e2e_search():
    print("\n--- 2. Testing E2E search with real Qdrant ---")
    try:
        memory = Memory.from_config(config)
        
        # Add a test memory
        print("Adding test memory...")
        memory.add(
            "I love apples and oranges", 
            user_id="qa_test_user", 
            metadata={
                "created_at": "2024-05-01T00:00:00Z", 
                "importance": 8, 
                "subtype": "observation",
                "workflowStage": "analysis"
            }
        )
        
        # Test Case A: TimeWindow Range
        filters_tw = {
            "created_at": {"$gte": "2024-01-01T00:00:00Z", "$lte": "2024-12-31T23:59:59Z"}
        }
        print(f"Case A - Searching with timeWindow filters: {filters_tw}")
        result_tw = memory.search(
            "apples",
            user_id="qa_test_user",
            filters=normalize_filters(filters_tw)
        )
        print(f"Search result (timeWindow): {len(result_tw.get('results', []))} results found.")
        assert len(result_tw.get('results', [])) > 0, "Should find the memory using time range"

        # Test Case B: Importance Range
        filters_imp = {
            "importance": {"$gte": 5}
        }
        print(f"Case B - Searching with importance filters: {filters_imp}")
        result_imp = memory.search(
            "apples",
            user_id="qa_test_user",
            filters=normalize_filters(filters_imp)
        )
        print(f"Search result (importance): {len(result_imp.get('results', []))} results found.")
        assert len(result_imp.get('results', [])) > 0, "Should find the memory using importance range"

        # Test Case C: Multiple filters
        filters_multi = {
            "importance": {"$gte": 5},
            "subtype": "observation"
        }
        print(f"Case C - Searching with multiple filters: {filters_multi}")
        result_multi = memory.search(
            "apples",
            user_id="qa_test_user",
            filters=normalize_filters(filters_multi)
        )
        print(f"Search result (multi): {len(result_multi.get('results', []))} results found.")
        assert len(result_multi.get('results', [])) > 0, "Should find the memory using multiple filters"

        print("✅ E2E verification PASSED (no ValidationError)")

    except Exception as e:
        print(f"❌ E2E verification FAILED: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    test_normalization()
    test_e2e_search()
    print("\n=== All Tests Completed Successfully ===")
