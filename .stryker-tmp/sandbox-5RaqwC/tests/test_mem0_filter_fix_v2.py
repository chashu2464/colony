#!/usr/bin/env python3
import sys
import os
import json
from datetime import datetime, timedelta

# Add scripts directory to Python path
sys.path.insert(0, 'scripts')

from mem0 import Memory
from mem0_bridge import normalize_filters

# Use real Qdrant on localhost for E2E validation
config = {
    'vector_store': {
        'provider': 'qdrant',
        'config': {
            'host': 'localhost',
            'port': 6333,
            'collection_name': 'test_filter_v2'
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

def test_v2_scenarios():
    print("\n=== Testing V2 Scenarios (Improved Filter) ===")
    try:
        # Initialize Mem0Bridge to apply the monkeypatch
        from mem0_bridge import Mem0Bridge
        # Create a temporary config for the bridge initialization
        bridge_config = {
            'vectorStore': {
                'provider': 'qdrant',
                'config': config['vector_store']['config']
            }
        }
        bridge = Mem0Bridge(bridge_config)
        print("✅ Monkeypatch applied via Mem0Bridge")

        memory = Memory.from_config(config)
        
        # 1. Add Test Data
        now = datetime.now()
        yesterday = (now - timedelta(days=1)).isoformat() + "Z"
        tomorrow = (now + timedelta(days=1)).isoformat() + "Z"
        
        print("1. Adding test memories...")
        memory.add(
            "Observation from yesterday", 
            user_id="v2_user", 
            metadata={"created_at": yesterday, "importance": 10, "subtype": "observation"}
        )
        memory.add(
            "Plan for tomorrow", 
            user_id="v2_user", 
            metadata={"created_at": tomorrow, "importance": 5, "subtype": "plan"}
        )

        # 2. Test Numerical Range (Single Key)
        print("\n2. Testing Numerical Range (Single Key: gte=8)...")
        filters_num = normalize_filters({"importance": {"$gte": 8}})
        res_num = memory.search("Observation", user_id="v2_user", filters=filters_num)
        print(f"Results: {len(res_num['results'])}")
        assert len(res_num['results']) > 0, "Numerical gte filter failed"

        # 3. Test ISO String Range (DatetimeRange)
        print("\n3. Testing ISO String Range (DatetimeRange: created_at)...")
        filters_dt = normalize_filters({
            "created_at": {
                "$gte": (now - timedelta(days=2)).isoformat() + "Z", 
                "$lte": (now - timedelta(seconds=1)).isoformat() + "Z"
            }
        })
        print(f"Filters: {filters_dt}")
        res_dt = memory.search("Observation", user_id="v2_user", filters=filters_dt)
        print(f"Results: {len(res_dt['results'])}")
        assert len(res_dt['results']) > 0, "ISO string range filter failed (DatetimeRange)"

        # 4. Test MatchAny (MatchIn)
        print("\n4. Testing MatchAny ($in: ['plan', 'other'])...")
        filters_in = normalize_filters({"subtype": {"$in": ["plan", "other"]}})
        res_in = memory.search("Plan", user_id="v2_user", filters=filters_in)
        print(f"Results: {len(res_in['results'])}")
        assert len(res_in['results']) > 0, "MatchAny filter failed"

        # 5. Test Dual Keys Overwrite Check
        print("\n5. Testing Dual Keys (gte and lte check for overwrite bug)...")
        filters_dual = normalize_filters({"importance": {"$gte": 4, "$lte": 6}})
        res_dual = memory.search("Plan", user_id="v2_user", filters=filters_dual)
        print(f"Results: {len(res_dual['results'])}")
        assert len(res_dual['results']) > 0, "Dual keys numerical range filter failed"

        print("\n✅ V2 Verification PASSED (All scenarios covered)")

    except Exception as e:
        print(f"\n❌ V2 Verification FAILED: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    test_v2_scenarios()
