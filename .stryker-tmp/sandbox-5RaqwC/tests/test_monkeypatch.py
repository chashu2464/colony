import sys
import os
from typing import Dict, Any, Optional

# Add scripts directory to Python path
sys.path.insert(0, 'scripts')

from mem0 import Memory
from qdrant_client.models import FieldCondition, Filter, MatchValue, Range, MatchAny

def improved_create_filter(self, filters):
    if not filters:
        return None
    conditions = []
    for key, value in filters.items():
        if isinstance(value, dict):
            # Range
            range_keys = ["gte", "lte", "gt", "lt"]
            if any(k in value for k in range_keys):
                conditions.append(FieldCondition(key=key, range=Range(
                    gte=value.get("gte"), 
                    lte=value.get("lte"), 
                    gt=value.get("gt"), 
                    lt=value.get("lt")
                )))
            # In
            elif "in" in value:
                conditions.append(FieldCondition(key=key, match=MatchAny(any=value["in"])))
            # Fallback
            else:
                conditions.append(FieldCondition(key=key, match=MatchValue(value=value)))
        else:
            conditions.append(FieldCondition(key=key, match=MatchValue(value=value)))
    return Filter(must=conditions) if conditions else None

# Monkeypatch
from mem0.vector_stores.qdrant import Qdrant
Qdrant._create_filter = improved_create_filter

# Test
print("Testing monkeypatched _create_filter...")
config = {
    "vector_store": {
        "provider": "qdrant",
        "config": {"host": "localhost", "port": 6333}
    }
}
m = Memory.from_config(config)

# Test single gte
filters = {"importance": {"gte": 5}}
print(f"Filters: {filters}")
try:
    # We call _create_filter directly to test it
    f = m.vector_store._create_filter(filters)
    print(f"✅ Created filter: {f}")
except Exception as e:
    print(f"❌ Failed: {e}")

# Test in
filters_in = {"subtype": {"in": ["A", "B"]}}
print(f"Filters: {filters_in}")
try:
    f = m.vector_store._create_filter(filters_in)
    print(f"✅ Created filter: {f}")
except Exception as e:
    print(f"❌ Failed: {e}")
