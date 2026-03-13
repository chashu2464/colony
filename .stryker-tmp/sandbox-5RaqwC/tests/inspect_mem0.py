from mem0 import Memory
import os

config = {
    "vector_store": {
        "provider": "qdrant",
        "config": {"host": "localhost", "port": 6333}
    }
}
m = Memory.from_config(config)
print(f"Vector store class: {m.vector_store.__class__.__name__}")
print(f"Vector store methods: {dir(m.vector_store)}")
