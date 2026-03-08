#!/usr/bin/env python3
"""
Mem0 Bridge for Colony
Provides a JSON-RPC interface to Mem0 for TypeScript integration.
Supports custom API endpoints and OpenAI-compatible providers.
"""

import sys
import json
import logging
import os
from typing import Dict, Any, Optional
from mem0 import Memory

# Qdrant models for monkeypatch
try:
    from qdrant_client.models import Filter, FieldCondition, MatchValue, Range, MatchAny, DatetimeRange
    HAS_QDRANT_MODELS = True
except ImportError:
    HAS_QDRANT_MODELS = False

# Import config loader if available
try:
    from mem0_config_loader import load_config, substitute_env_vars
    HAS_CONFIG_LOADER = True
except ImportError:
    HAS_CONFIG_LOADER = False

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    stream=sys.stderr
)
logger = logging.getLogger('mem0_bridge')


def normalize_filters(filters: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Normalize MongoDB-style $ operator prefixes to mem0-compatible format.

    Converts $gte/$lte/$in/$gt/$lt/$ne etc. to gte/lte/in/gt/lt/ne
    so that mem0's qdrant._create_filter() can correctly parse range conditions.
    """
    if not filters or not isinstance(filters, dict):
        return filters
    result = {}
    for key, value in filters.items():
        normalized_key = key.lstrip('$')
        if isinstance(value, dict):
            result[normalized_key] = normalize_filters(value)
        else:
            result[normalized_key] = value
    return result


def _improved_create_filter(self, filters):
    """Improved Qdrant filter creation to support Range, DatetimeRange and MatchAny.
    This replaces the default mem0 implementation to fix range bugs and support $in.
    """
    if not filters:
        return None

    # If models are not available, we can't do anything (though this shouldn't happen)
    if not HAS_QDRANT_MODELS:
        return None

    conditions = []
    for key, value in filters.items():
        if isinstance(value, dict):
            range_keys = ["gte", "lte", "gt", "lt"]
            if any(k in value for k in range_keys):
                # Use DatetimeRange if any value is a string (ISO date)
                is_datetime = any(isinstance(v, str) for v in value.values() if v is not None)
                if is_datetime:
                    conditions.append(FieldCondition(key=key, range=DatetimeRange(
                        gte=value.get("gte"), lte=value.get("lte"), gt=value.get("gt"), lt=value.get("lt")
                    )))
                else:
                    conditions.append(FieldCondition(key=key, range=Range(
                        gte=value.get("gte"), lte=value.get("lte"), gt=value.get("gt"), lt=value.get("lt")
                    )))
            elif "in" in value:
                conditions.append(FieldCondition(key=key, match=MatchAny(any=value["in"])))
            else:
                conditions.append(FieldCondition(key=key, match=MatchValue(value=value)))
        else:
            conditions.append(FieldCondition(key=key, match=MatchValue(value=value)))

    return Filter(must=conditions) if conditions else None


class Mem0Bridge:
    """Bridge between Colony (TypeScript) and Mem0 (Python)."""

    def __init__(self, config: Dict[str, Any]):
        """Initialize Mem0 with the provided configuration."""
        logger.info('Initializing Mem0...')

        # If config is a file path, load it
        if isinstance(config, str):
            if HAS_CONFIG_LOADER:
                logger.info(f'Loading configuration from file: {config}')
                config = load_config(config)
            else:
                logger.error('Config loader not available, cannot load from file')
                raise ValueError('Config loader not available')

        # Build Mem0 config
        mem0_config = {}

        # Vector store config
        if 'vectorStore' in config:
            mem0_config['vector_store'] = {
                'provider': config['vectorStore']['provider'],
                'config': config['vectorStore']['config']
            }
        elif 'vector_store' in config:
            # Support both camelCase and snake_case
            mem0_config['vector_store'] = config['vector_store']

        # LLM config with environment variable support
        if 'llm' in config:
            llm_config = config['llm']
            llm_provider_config = llm_config.get('config', {}).copy()

            # Check for LLM-specific environment variables first
            llm_base_url = os.environ.get('LLM_BASE_URL') or os.environ.get('OPENAI_BASE_URL')
            llm_api_key = os.environ.get('LLM_API_KEY') or os.environ.get('OPENAI_API_KEY')

            # IMPORTANT: Mem0's LLM also does NOT support base_url in config
            # It only uses OPENAI_BASE_URL environment variable (same as embedder)
            if llm_base_url:
                logger.info(f"Using LLM endpoint from env: {llm_base_url}")
                # Note: base_url is NOT added to llm_provider_config
                # Mem0 will read it from OPENAI_BASE_URL environment variable

            if llm_api_key:
                llm_provider_config['api_key'] = llm_api_key
                logger.info("Using LLM API key from environment")

            mem0_config['llm'] = {
                'provider': llm_config.get('provider', 'openai'),
                'config': llm_provider_config  # ✅ 不包含base_url
            }

        # Embedder config with environment variable support
        if 'embedder' in config:
            embedder_config = config['embedder']
            embedder_provider_config = embedder_config.get('config', {}).copy()

            # Check for embedder-specific environment variables first, fallback to shared
            embedder_base_url = os.environ.get('EMBEDDER_BASE_URL') or os.environ.get('OPENAI_BASE_URL')
            embedder_api_key = os.environ.get('EMBEDDER_API_KEY') or os.environ.get('OPENAI_API_KEY')

            # IMPORTANT: Mem0's embedder does NOT support base_url in config
            # It only uses OPENAI_BASE_URL environment variable
            # So we just log it but don't add to config
            if embedder_base_url:
                logger.info(f"Using embedder endpoint from env: {embedder_base_url}")
                # Note: base_url is NOT added to embedder_provider_config
                # Mem0 will read it from OPENAI_BASE_URL environment variable

            if embedder_api_key:
                embedder_provider_config['api_key'] = embedder_api_key
                logger.info("Using embedder API key from environment")

            mem0_config['embedder'] = {
                'provider': embedder_config.get('provider', 'openai'),
                'config': embedder_provider_config
            }

        # Graph store config (optional)
        if 'graphStore' in config:
            mem0_config['graph_store'] = {
                'provider': config['graphStore']['provider'],
                'config': config['graphStore']['config']
            }
        elif 'graph_store' in config and config['graph_store'].get('provider'):
            mem0_config['graph_store'] = config['graph_store']

        # Remove graph_store if provider is None/null
        if 'graph_store' in mem0_config and not mem0_config['graph_store'].get('provider'):
            del mem0_config['graph_store']
            logger.info('Graph store disabled')

        # Initialize Mem0
        logger.info('Mem0 configuration:')
        logger.info(f"  LLM: {mem0_config.get('llm', {}).get('provider', 'N/A')}")
        logger.info(f"  Embedder: {mem0_config.get('embedder', {}).get('provider', 'N/A')}")
        logger.info(f"  Vector Store: {mem0_config.get('vector_store', {}).get('provider', 'N/A')}")
        logger.info(f"  Graph Store: {mem0_config.get('graph_store', {}).get('provider', 'disabled')}")

        # Use Memory.from_config() to properly initialize with dict config
        self.memory = Memory.from_config(mem0_config)
        logger.info('Mem0 initialized successfully')

        # Apply Qdrant monkeypatch if using Qdrant
        if HAS_QDRANT_MODELS and mem0_config.get('vector_store', {}).get('provider') == 'qdrant':
            try:
                from mem0.vector_stores.qdrant import Qdrant
                Qdrant._create_filter = _improved_create_filter
                logger.info('Applied monkeypatch for Qdrant._create_filter')
            except (ImportError, AttributeError):
                logger.warning('Failed to apply Qdrant monkeypatch')

    def add(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Add memories from messages."""
        messages = params.get('messages')
        user_id = params.get('user_id')
        agent_id = params.get('agent_id')
        run_id = params.get('run_id')
        metadata = params.get('metadata', {})

        result = self.memory.add(
            messages,
            user_id=user_id,
            agent_id=agent_id,
            run_id=run_id,
            metadata=metadata
        )

        return result

    def search(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Search for memories."""
        query = params.get('query')
        user_id = params.get('user_id')
        agent_id = params.get('agent_id')
        run_id = params.get('run_id')
        limit = params.get('limit', 5)
        filters = normalize_filters(params.get('filters'))
        threshold = params.get('threshold')
        rerank = params.get('rerank', True)

        result = self.memory.search(
            query,
            user_id=user_id,
            agent_id=agent_id,
            run_id=run_id,
            limit=limit,
            filters=filters,
            threshold=threshold,
            rerank=rerank
        )

        return result

    def get_all(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Get all memories for a session."""
        user_id = params.get('user_id')
        agent_id = params.get('agent_id')
        run_id = params.get('run_id')
        limit = params.get('limit')
        filters = normalize_filters(params.get('filters'))

        result = self.memory.get_all(
            user_id=user_id,
            agent_id=agent_id,
            run_id=run_id,
            limit=limit,
            filters=filters
        )

        return result

    def update(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Update a memory."""
        memory_id = params.get('memory_id')
        data = params.get('data')

        result = self.memory.update(memory_id, data)
        return result

    def delete(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Delete a memory."""
        memory_id = params.get('memory_id')

        result = self.memory.delete(memory_id)
        return result

    def handle_request(self, request: Dict[str, Any]) -> Dict[str, Any]:
        """Handle a JSON-RPC request."""
        request_id = request.get('id')
        method = request.get('method')
        params = request.get('params', {})

        try:
            # Dispatch to appropriate method
            if method == 'add':
                data = self.add(params)
            elif method == 'search':
                data = self.search(params)
            elif method == 'get_all':
                data = self.get_all(params)
            elif method == 'update':
                data = self.update(params)
            elif method == 'delete':
                data = self.delete(params)
            else:
                raise ValueError(f'Unknown method: {method}')

            return {
                'id': request_id,
                'success': True,
                'data': data
            }

        except Exception as e:
            logger.error(f'Error handling request: {e}', exc_info=True)
            return {
                'id': request_id,
                'success': False,
                'error': str(e)
            }


def main():
    """Main entry point for the bridge."""
    import argparse

    parser = argparse.ArgumentParser(description='Mem0 Bridge for Colony')
    parser.add_argument('--config', type=str, required=True, help='JSON configuration')
    args = parser.parse_args()

    # Parse config
    try:
        config = json.loads(args.config)
    except json.JSONDecodeError as e:
        logger.error(f'Invalid config JSON: {e}')
        sys.exit(1)

    # Initialize bridge
    try:
        bridge = Mem0Bridge(config)
    except Exception as e:
        logger.error(f'Failed to initialize Mem0: {e}', exc_info=True)
        sys.exit(1)

    logger.info('Mem0 bridge ready, waiting for requests...')

    # Process requests from stdin
    for line in sys.stdin:
        line = line.strip()
        logger.debug(f'Received line: {line[:100]}...' if len(line) > 100 else f'Received line: {line}')

        if not line:
            continue

        try:
            request = json.loads(line)
            logger.debug(f'Processing request {request.get("id")}: {request.get("method")}')
            response = bridge.handle_request(request)

            # Write response to stdout
            print(json.dumps(response), flush=True)
            logger.debug(f'Sent response for request {request.get("id")}')

        except json.JSONDecodeError as e:
            logger.error(f'Invalid request JSON: {e}')
            error_response = {
                'id': None,
                'success': False,
                'error': f'Invalid JSON: {e}'
            }
            print(json.dumps(error_response), flush=True)

        except Exception as e:
            logger.error(f'Unexpected error: {e}', exc_info=True)
            error_response = {
                'id': None,
                'success': False,
                'error': f'Unexpected error: {e}'
            }
            print(json.dumps(error_response), flush=True)


if __name__ == '__main__':
    main()
