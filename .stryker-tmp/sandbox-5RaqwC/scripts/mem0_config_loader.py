#!/usr/bin/env python3
"""
Configuration loader for Mem0 with environment variable substitution.
Supports custom API endpoints and OpenAI-compatible providers.
"""

import os
import re
import yaml
from typing import Dict, Any


def substitute_env_vars(value: Any) -> Any:
    """
    Recursively substitute environment variables in configuration values.

    Supports formats:
    - ${VAR_NAME}
    - ${VAR_NAME:-default_value}

    Examples:
    - ${OPENAI_API_KEY}
    - ${CUSTOM_BASE_URL:-https://api.openai.com/v1}
    """
    if isinstance(value, str):
        # Pattern: ${VAR_NAME} or ${VAR_NAME:-default}
        pattern = r'\$\{([^}:]+)(?::-(.*?))?\}'

        def replacer(match):
            var_name = match.group(1)
            default_value = match.group(2) if match.group(2) is not None else ''
            return os.environ.get(var_name, default_value)

        return re.sub(pattern, replacer, value)

    elif isinstance(value, dict):
        return {k: substitute_env_vars(v) for k, v in value.items()}

    elif isinstance(value, list):
        return [substitute_env_vars(item) for item in value]

    else:
        return value


def load_config(config_path: str) -> Dict[str, Any]:
    """
    Load Mem0 configuration from YAML file with environment variable substitution.

    Args:
        config_path: Path to the YAML configuration file

    Returns:
        Configuration dictionary with environment variables substituted
    """
    with open(config_path, 'r') as f:
        config = yaml.safe_load(f)

    # Substitute environment variables
    config = substitute_env_vars(config)

    return config


def validate_config(config: Dict[str, Any]) -> None:
    """
    Validate the configuration to ensure required fields are present.

    Args:
        config: Configuration dictionary

    Raises:
        ValueError: If required fields are missing or invalid
    """
    # Check LLM config
    if 'llm' not in config:
        raise ValueError("Missing 'llm' configuration")

    llm_config = config['llm'].get('config', {})
    if not llm_config.get('api_key'):
        raise ValueError("Missing LLM API key")

    # Check embedder config
    if 'embedder' not in config:
        raise ValueError("Missing 'embedder' configuration")

    embedder_config = config['embedder'].get('config', {})
    if not embedder_config.get('api_key'):
        raise ValueError("Missing embedder API key")

    # Check vector store config
    if 'vector_store' not in config:
        raise ValueError("Missing 'vector_store' configuration")

    print("✓ Configuration validated successfully")


def print_config_summary(config: Dict[str, Any]) -> None:
    """
    Print a summary of the loaded configuration (without sensitive data).

    Args:
        config: Configuration dictionary
    """
    print("\n=== Mem0 Configuration Summary ===\n")

    # LLM
    llm = config.get('llm', {})
    llm_config = llm.get('config', {})
    print(f"LLM Provider: {llm.get('provider', 'N/A')}")
    print(f"  Model: {llm_config.get('model', 'N/A')}")
    print(f"  Base URL: {llm_config.get('base_url', 'default')}")
    print(f"  API Key: {'***' if llm_config.get('api_key') else 'NOT SET'}")

    # Embedder
    embedder = config.get('embedder', {})
    embedder_config = embedder.get('config', {})
    print(f"\nEmbedder Provider: {embedder.get('provider', 'N/A')}")
    print(f"  Model: {embedder_config.get('model', 'N/A')}")
    print(f"  Base URL: {embedder_config.get('base_url', 'default')}")
    print(f"  API Key: {'***' if embedder_config.get('api_key') else 'NOT SET'}")
    print(f"  Dimensions: {embedder_config.get('embedding_dims', 'N/A')}")

    # Vector Store
    vector_store = config.get('vector_store', {})
    vs_config = vector_store.get('config', {})
    print(f"\nVector Store Provider: {vector_store.get('provider', 'N/A')}")
    if vector_store.get('provider') == 'qdrant':
        print(f"  Host: {vs_config.get('host', 'N/A')}")
        print(f"  Port: {vs_config.get('port', 'N/A')}")
        print(f"  Collection: {vs_config.get('collection_name', 'N/A')}")
    elif vector_store.get('provider') in ['chroma', 'faiss']:
        print(f"  Path: {vs_config.get('path', 'N/A')}")

    # Graph Store (optional)
    if 'graph_store' in config and config['graph_store'].get('provider'):
        graph_store = config['graph_store']
        gs_config = graph_store.get('config', {})
        print(f"\nGraph Store Provider: {graph_store.get('provider', 'N/A')}")
        print(f"  URL: {gs_config.get('url', 'N/A')}")
        print(f"  Username: {gs_config.get('username', 'N/A')}")
        print(f"  Password: {'***' if gs_config.get('password') else 'NOT SET'}")

    print("\n" + "="*40 + "\n")


def create_mem0_instance(config: Dict[str, Any]):
    """
    Create a Mem0 Memory instance with the loaded configuration.

    Args:
        config: Configuration dictionary

    Returns:
        Mem0 Memory instance
    """
    from mem0 import Memory
    from mem0.configs.base import MemoryConfig

    # Remove null/None values from graph_store if present
    if 'graph_store' in config:
        if not config['graph_store'].get('provider'):
            del config['graph_store']

    # Create MemoryConfig from dict
    try:
        memory_config = MemoryConfig(**config)
        return Memory.from_config(config)
    except Exception as e:
        # Fallback: try direct instantiation
        print(f"Warning: Could not create MemoryConfig: {e}")
        print("Trying direct Memory instantiation...")
        return Memory(config)


if __name__ == '__main__':
    import argparse

    parser = argparse.ArgumentParser(description='Load and validate Mem0 configuration')
    parser.add_argument('--config', type=str, default='config/mem0-custom-api.yaml',
                        help='Path to configuration file')
    parser.add_argument('--validate-only', action='store_true',
                        help='Only validate configuration without creating Mem0 instance')
    args = parser.parse_args()

    try:
        # Load configuration
        print(f"Loading configuration from: {args.config}")
        config = load_config(args.config)

        # Print summary
        print_config_summary(config)

        # Validate
        validate_config(config)

        if not args.validate_only:
            # Create Mem0 instance
            print("Creating Mem0 instance...")
            memory = create_mem0_instance(config)
            print("✓ Mem0 instance created successfully")

            # Test basic functionality
            print("\nTesting basic functionality...")
            test_result = memory.add("This is a test memory", user_id="test_user")
            print(f"✓ Test memory added: {test_result}")

            search_result = memory.search("test", user_id="test_user", limit=1)
            print(f"✓ Test search completed: {len(search_result.get('results', []))} results")

        print("\n✓ All checks passed!")

    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        exit(1)
