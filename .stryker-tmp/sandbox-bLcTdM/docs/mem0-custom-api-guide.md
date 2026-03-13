# Using Custom API Endpoints with Mem0

## Overview

Colony's Mem0 integration now supports custom API endpoints, allowing you to use:
- **Local models** (Ollama, LM Studio)
- **Third-party providers** (Together AI, Groq, OpenRouter)
- **Self-hosted OpenAI-compatible APIs**
- **Azure OpenAI**
- **Any OpenAI-compatible endpoint**

This guide shows you how to configure Mem0 to use these custom endpoints.

---

## Quick Start

### 1. Use the Custom API Configuration Template

```bash
cp config/mem0-custom-api.yaml config/mem0.yaml
```

### 2. Set Environment Variables

Create a `.env` file:

```bash
# For custom OpenAI-compatible endpoint
CUSTOM_LLM_BASE_URL=http://localhost:11434/v1
CUSTOM_LLM_API_KEY=your-api-key

CUSTOM_EMBEDDER_BASE_URL=http://localhost:11434/v1
CUSTOM_EMBEDDER_API_KEY=your-api-key

# Vector store
QDRANT_HOST=localhost
QDRANT_PORT=6333
```

### 3. Test Configuration

```bash
python3 scripts/mem0_config_loader.py --config config/mem0.yaml
```

---

## Configuration Examples

### Example 1: Ollama (Local Models)

**Setup Ollama:**
```bash
# Install Ollama
curl https://ollama.ai/install.sh | sh

# Pull models
ollama pull llama3
ollama pull nomic-embed-text

# Ollama automatically starts on http://localhost:11434
```

**Configuration (`config/mem0.yaml`):**
```yaml
llm:
  provider: openai  # Keep as 'openai' for API compatibility
  config:
    model: llama3
    base_url: http://localhost:11434/v1
    api_key: ollama  # Ollama doesn't require a real key

embedder:
  provider: openai
  config:
    model: nomic-embed-text
    base_url: http://localhost:11434/v1
    api_key: ollama
    embedding_dims: 768  # nomic-embed-text uses 768 dimensions

vector_store:
  provider: chroma  # Use Chroma for simplicity (no separate service)
  config:
    path: ./.mem0/chroma_db
```

**Environment variables:**
```bash
# No API keys needed for Ollama!
```

**Cost:** $0/month (completely free, runs locally)

---

### Example 2: LM Studio (Local Models with GUI)

**Setup LM Studio:**
1. Download from https://lmstudio.ai
2. Download a model (e.g., Mistral 7B)
3. Start the local server (default: http://localhost:1234)

**Configuration:**
```yaml
llm:
  provider: openai
  config:
    model: local-model  # Use the model name from LM Studio
    base_url: http://localhost:1234/v1
    api_key: lm-studio

embedder:
  provider: openai
  config:
    model: text-embedding-ada-002  # LM Studio compatible
    base_url: http://localhost:1234/v1
    api_key: lm-studio
    embedding_dims: 1536

vector_store:
  provider: chroma
  config:
    path: ./.mem0/chroma_db
```

**Cost:** $0/month (free, local)

---

### Example 3: Together AI (Cloud, Fast Inference)

**Setup:**
1. Sign up at https://together.ai
2. Get API key from dashboard

**Configuration:**
```yaml
llm:
  provider: openai
  config:
    model: mistralai/Mixtral-8x7B-Instruct-v0.1
    base_url: https://api.together.xyz/v1
    api_key: ${TOGETHER_API_KEY}

embedder:
  provider: openai
  config:
    model: togethercomputer/m2-bert-80M-8k-retrieval
    base_url: https://api.together.xyz/v1
    api_key: ${TOGETHER_API_KEY}
    embedding_dims: 768

vector_store:
  provider: qdrant
  config:
    host: localhost
    port: 6333
```

**Environment variables:**
```bash
TOGETHER_API_KEY=your-together-api-key
```

**Cost:** ~$0.20/1M tokens (cheaper than OpenAI)

---

### Example 4: Groq (Extremely Fast Inference)

**Setup:**
1. Sign up at https://groq.com
2. Get API key

**Configuration:**
```yaml
llm:
  provider: openai
  config:
    model: mixtral-8x7b-32768  # or llama3-70b-8192
    base_url: https://api.groq.com/openai/v1
    api_key: ${GROQ_API_KEY}

embedder:
  provider: openai  # Use OpenAI for embeddings
  config:
    model: text-embedding-3-small
    base_url: https://api.openai.com/v1
    api_key: ${OPENAI_API_KEY}
    embedding_dims: 1536

vector_store:
  provider: qdrant
  config:
    host: localhost
    port: 6333
```

**Environment variables:**
```bash
GROQ_API_KEY=your-groq-api-key
OPENAI_API_KEY=your-openai-api-key  # For embeddings only
```

**Cost:** Free tier available, then ~$0.27/1M tokens

---

### Example 5: OpenRouter (Access to Multiple Models)

**Setup:**
1. Sign up at https://openrouter.ai
2. Get API key

**Configuration:**
```yaml
llm:
  provider: openai
  config:
    model: anthropic/claude-3-opus  # or any model on OpenRouter
    base_url: https://openrouter.ai/api/v1
    api_key: ${OPENROUTER_API_KEY}
    default_headers:
      HTTP-Referer: https://your-site.com
      X-Title: Colony

embedder:
  provider: openai
  config:
    model: openai/text-embedding-3-small
    base_url: https://openrouter.ai/api/v1
    api_key: ${OPENROUTER_API_KEY}
    embedding_dims: 1536

vector_store:
  provider: qdrant
  config:
    host: localhost
    port: 6333
```

**Environment variables:**
```bash
OPENROUTER_API_KEY=your-openrouter-api-key
```

**Cost:** Varies by model (see https://openrouter.ai/models)

---

### Example 6: Azure OpenAI

**Setup:**
1. Create Azure OpenAI resource
2. Deploy models (e.g., gpt-4, text-embedding-ada-002)
3. Get endpoint and API key

**Configuration:**
```yaml
llm:
  provider: azure_openai
  config:
    model: gpt-4
    api_key: ${AZURE_OPENAI_API_KEY}
    azure_endpoint: ${AZURE_OPENAI_ENDPOINT}
    api_version: "2024-02-15-preview"
    azure_deployment: your-gpt4-deployment-name

embedder:
  provider: azure_openai
  config:
    model: text-embedding-ada-002
    api_key: ${AZURE_OPENAI_API_KEY}
    azure_endpoint: ${AZURE_OPENAI_ENDPOINT}
    api_version: "2024-02-15-preview"
    azure_deployment: your-embedding-deployment-name
    embedding_dims: 1536

vector_store:
  provider: qdrant
  config:
    host: localhost
    port: 6333
```

**Environment variables:**
```bash
AZURE_OPENAI_API_KEY=your-azure-api-key
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
```

**Cost:** Azure pricing (similar to OpenAI)

---

### Example 7: Cloudflare Workers AI

**Setup:**
1. Get Cloudflare account
2. Get API token and account ID

**Configuration:**
```yaml
llm:
  provider: openai
  config:
    model: "@cf/meta/llama-3-8b-instruct"
    base_url: https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/v1
    api_key: ${CF_API_TOKEN}
    default_headers:
      Authorization: "Bearer ${CF_API_TOKEN}"

embedder:
  provider: openai
  config:
    model: "@cf/baai/bge-base-en-v1.5"
    base_url: https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/v1
    api_key: ${CF_API_TOKEN}
    embedding_dims: 768

vector_store:
  provider: qdrant
  config:
    host: localhost
    port: 6333
```

**Environment variables:**
```bash
CF_ACCOUNT_ID=your-account-id
CF_API_TOKEN=your-api-token
```

**Cost:** Free tier available, very cheap

---

## Testing Your Configuration

### 1. Validate Configuration

```bash
python3 scripts/mem0_config_loader.py \
  --config config/mem0.yaml \
  --validate-only
```

Expected output:
```
Loading configuration from: config/mem0.yaml

=== Mem0 Configuration Summary ===

LLM Provider: openai
  Model: llama3
  Base URL: http://localhost:11434/v1
  API Key: ***

Embedder Provider: openai
  Model: nomic-embed-text
  Base URL: http://localhost:11434/v1
  API Key: ***
  Dimensions: 768

Vector Store Provider: chroma
  Path: ./.mem0/chroma_db

========================================

✓ Configuration validated successfully
```

### 2. Test Mem0 Functionality

```bash
python3 scripts/mem0_config_loader.py \
  --config config/mem0.yaml
```

This will:
- Load configuration
- Create Mem0 instance
- Add a test memory
- Search for the test memory

### 3. Run Colony Integration Tests

```bash
npm run build:server
node dist/tests/mem0-integration-test.js
```

---

## Troubleshooting

### Issue: "Connection refused"

**For Ollama:**
```bash
# Check if Ollama is running
curl http://localhost:11434/api/tags

# If not, start it
ollama serve
```

**For LM Studio:**
- Open LM Studio
- Go to "Local Server" tab
- Click "Start Server"

### Issue: "Model not found"

**For Ollama:**
```bash
# List available models
ollama list

# Pull the model if missing
ollama pull llama3
```

**For LM Studio:**
- Download the model in LM Studio
- Use the exact model name shown in the UI

### Issue: "Invalid API key"

**For local models (Ollama, LM Studio):**
- API key can be any string (e.g., "ollama", "lm-studio")
- It's not validated for local endpoints

**For cloud providers:**
- Double-check your API key
- Ensure environment variable is set correctly
- Check for extra spaces or quotes

### Issue: "Embedding dimensions mismatch"

Different models use different embedding dimensions:
- OpenAI text-embedding-3-small: 1536
- OpenAI text-embedding-3-large: 3072
- nomic-embed-text (Ollama): 768
- bge-base-en-v1.5: 768

Make sure `embedding_dims` matches your model!

---

## Performance Comparison

| Provider | Speed | Cost | Quality | Local |
|----------|-------|------|---------|-------|
| **Ollama** | Medium | Free | Good | ✅ |
| **LM Studio** | Medium | Free | Good | ✅ |
| **Groq** | Very Fast | Low | Good | ❌ |
| **Together AI** | Fast | Low | Good | ❌ |
| **OpenRouter** | Medium | Varies | Excellent | ❌ |
| **OpenAI** | Fast | High | Excellent | ❌ |
| **Azure OpenAI** | Fast | High | Excellent | ❌ |
| **Cloudflare** | Fast | Very Low | Good | ❌ |

---

## Recommendations

### For Development
**Use Ollama:**
- Free
- No API keys needed
- Good enough quality
- Privacy (runs locally)

```bash
ollama pull llama3
ollama pull nomic-embed-text
```

### For Production (Budget)
**Use Groq + OpenAI embeddings:**
- Very fast inference
- Low cost
- Good quality
- ~$5/month for typical usage

### For Production (Quality)
**Use OpenAI or Claude via OpenRouter:**
- Best quality
- Reliable
- Good support
- ~$50/month for typical usage

### For Enterprise
**Use Azure OpenAI:**
- Enterprise SLA
- Data residency
- Compliance (SOC 2, HIPAA)
- Predictable pricing

---

## Advanced: Custom Headers and Timeouts

```yaml
llm:
  provider: openai
  config:
    model: your-model
    base_url: https://your-api.com/v1
    api_key: ${YOUR_API_KEY}

    # Custom headers
    default_headers:
      Authorization: "Bearer ${YOUR_API_KEY}"
      X-Custom-Header: "value"
      User-Agent: "Colony/1.0"

    # Timeout settings
    timeout: 60  # seconds
    max_retries: 3

    # Request parameters
    temperature: 0.7
    max_tokens: 2000
```

---

## Next Steps

1. Choose a provider from the examples above
2. Update `config/mem0.yaml` with your configuration
3. Set environment variables in `.env`
4. Test with `python3 scripts/mem0_config_loader.py`
5. Run Colony: `npm start`

For more details, see:
- `docs/mem0-integration-guide.md`
- `config/mem0-custom-api.yaml` (full examples)
