# CLI 图片生成能力调研（2026-03-19）

## 结论速览
- 如果你要“终端里直接稳定出图 + 可编辑 + 成本可预估”，首选 OpenAI `gpt-image-1`（curl/脚本化最顺）。
- 如果你要“多模型市场 + 快速试不同社区模型”，Replicate CLI 最灵活（`replicate run` 直接可用）。
- 如果你要“自建推理服务/工作流”，fal CLI 与 Comfy 生态更适合工程化部署，不是最短路径的“开箱即出图 CLI”。
- 如果你在 AWS/GCP 体系内，建议走 `aws bedrock-runtime invoke-model` 或 `gcloud + curl` 方式统一接入，利于权限与审计。

## 主流 CLI 路线对比
| 路线 | 是否可直接出图 | 主要能力 | 典型命令入口 | 备注 |
|---|---|---|---|---|
| OpenAI API + CLI（curl） | 是 | 文生图、图生图、编辑、掩码编辑 | `curl ... /v1/images` | 官方图像模型能力完整，价格文档清晰 |
| Replicate CLI | 是 | 运行社区/官方模型、串联预测、训练 | `replicate run ...` | 模型丰富，能力上限取决于选用模型 |
| AWS CLI（Bedrock） | 是 | 通过 `invoke-model` 调图像模型（如 Nova Canvas） | `aws bedrock-runtime invoke-model` | 企业权限体系成熟 |
| GCP CLI + curl（Vertex Imagen） | 是 | 调 Imagen 生成/编辑能力 | `gcloud auth print-access-token` + `curl ...:predict` | 更像“CLI+REST”组合 |
| fal CLI | 部分（偏部署） | 部署/管理 serverless AI app，可做图像生成服务 | `fal run`/`fal deploy` | 官方明确：只调预训练 Model APIs 时可不用 CLI |
| comfy-cli | 否（偏管理） | 安装/管理 ComfyUI、节点、模型 | `comfy install`/`comfy launch` | 出图核心在 ComfyUI 工作流/API |

## 关键发现
- OpenAI：图像 API 支持生成与编辑，`gpt-image-1` 为原生多模态图像输出模型，且有质量/尺寸对应价格。
- Gemini：Gemini API 模型列表中，`gemini-2.0-flash-preview-image-generation` 支持图像输出；Gemini CLI 文档更偏编码代理与会话，不是“图像创作专用 CLI”。
- AWS：Bedrock Runtime CLI 提供 `invoke-model`；Nova Canvas 文档给出图像生成/编辑能力与模型 ID `amazon.nova-canvas-v1:0`。
- GCP：Vertex Imagen 文档提供基于 `gcloud` 鉴权 + `curl` 的标准调用路径。
- Replicate：官方 CLI README 直接给出 `replicate run stability-ai/sdxl` 等图像生成示例。
- fal/comfy：都属于“工程化工作流/平台型 CLI”，不是单纯 prompt -> png 的轻量通道。

## 选型建议
- 追求最快落地：OpenAI API（curl）或 Replicate CLI。
- 追求多模型实验：Replicate CLI。
- 追求企业合规与云内统一：AWS CLI Bedrock / GCP Vertex（gcloud + curl）。
- 追求自定义工作流编排：ComfyUI + comfy-cli（管理）或 fal（部署）。

## 参考来源（官方文档）
- OpenAI Image generation: https://platform.openai.com/docs/guides/images/image-generation
- OpenAI GPT Image model: https://developers.openai.com/api/docs/models/gpt-image-1
- OpenAI Pricing: https://openai.com/api/pricing/
- Gemini models: https://ai.google.dev/gemini-api/docs/models/gemini-v2
- Gemini CLI docs: https://geminicli.com/docs/
- Gemini CLI quota: https://geminicli.com/docs/resources/quota-and-pricing/
- AWS CLI Bedrock Runtime: https://docs.aws.amazon.com/cli/latest/reference/bedrock-runtime/invoke-model.html
- Amazon Nova Canvas: https://docs.aws.amazon.com/nova/latest/userguide/image-generation.html
- Vertex Imagen API: https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/imagen-api
- Replicate CLI: https://github.com/replicate/cli
- fal CLI install/setup: https://docs.fal.ai/serverless/getting-started/installation
- Comfy CLI getting started: https://docs.comfy.org/comfy-cli/getting-started
