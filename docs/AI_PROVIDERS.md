# AI provider settings

Open AI Settings from the start menu or game menu. Choose a provider to fill its API base URL automatically. Enter its key when required, then use **Fetch models** and select a model, or enter an exact model ID manually. Opening settings and changing provider, endpoint or key refreshes discovery. Discovery lists models without generating a game turn. **Test Connection** performs a small inference request and may incur the provider's normal charge; **Save Settings** persists the selection.

Presets cover LM Studio, Ollama, llama.cpp, vLLM, LocalAI, Jan, OpenAI, Google Gemini, Anthropic Claude, OpenRouter, Groq, Together AI, Fireworks AI, DeepSeek, Mistral AI, xAI, Cerebras and Hugging Face. Custom OpenAI-compatible endpoints support other gateways. Providers requiring different authentication protocols, such as AWS request signing, need a compatible gateway.

Endpoint fields remain editable for remote local servers and gateways. Use the API base URL; a pasted `/chat/completions`, `/messages` or `/models` suffix is removed. Local servers must be running with a model available. Cloud lists depend on credentials and account permissions. Listing a model does not guarantee chat support, sufficient context, structured event reliability, or access to inference; manual IDs remain available when discovery is unsupported or unavailable.

Saved keys are reused only for the same provider and normalized endpoint. Switching providers keeps unsaved drafts while the dialog is open, but does not transfer a saved secret to a different endpoint. Keys are stored locally in the existing settings file and are never returned to the browser. This file is ignored by Git.

Defaults and discovery behavior live in `backend/services/ai-providers.js`. Discovery uses the provider's models endpoint, including Anthropic pagination, with timeouts and clear errors. Tests cover defaults, normalization, model filtering, pagination, failures and key isolation using a local mock server. Live paid-provider inference has not been verified.

Official references: [Gemini OpenAI compatibility](https://ai.google.dev/gemini-api/docs/openai), [Claude models](https://platform.claude.com/docs/en/api/models/list), [Groq compatibility](https://console.groq.com/docs/openai), [Together compatibility](https://docs.together.ai/docs/inference/openai-compatibility), [Fireworks compatibility](https://docs.fireworks.ai/tools-sdks/openai-compatibility), [Cerebras model discovery](https://inference-docs.cerebras.ai/api-reference/models/list-models), [Hugging Face chat completion](https://huggingface.co/docs/inference-providers/en/tasks/chat-completion).

## Local saved credentials

AI Settings persists the provider, endpoint, model and API key in `data/llm_settings.json`. This local file takes precedence over environment defaults and is ignored by Git. Normal clones do not receive it. Never force-add it or distribute a workspace archive containing local settings. `git ls-files data/llm_settings.json` should produce no output. Current settings responses expose only whether a key is present. The examined historical file contains a local-provider placeholder, not the current cloud key.

Gemini model discovery now excludes obvious image/video/audio/live/research/robotics-only model IDs from game choices. This is a conservative name-based filter, not a compatibility guarantee; manual IDs remain available. Turn generation has an 8,000-token output allowance and a check for independent world events. No live/paid inference was used for implementation checks.


## Turn output compatibility

Updated 9 October 2026. Turn generation and its single corrective generation request structured output for every provider preset. Advisor, diplomacy and the connection test retain ordinary prose output. The backend negotiates format support with the selected endpoint/model rather than assuming every model on a provider has the same capabilities.

| Provider family | Preferred turn format | On explicit format rejection |
| --- | --- | --- |
| OpenAI, Gemini/Gemma, OpenRouter, Groq, Together, Fireworks, DeepSeek, Mistral, xAI, Cerebras, Hugging Face | JSON object mode | Prompted JSON text |
| Ollama, llama.cpp, vLLM, LocalAI, Jan, custom OpenAI-compatible endpoints | JSON object mode | Prompted JSON text |
| LM Studio | JSON schema envelope | JSON object mode, then prompted JSON text |
| Anthropic Claude | Named turn-submission tool | Automatic tool choice, then prompted JSON text |

The Claude tool only carries the returned JSON; the application never executes model-supplied tool calls. Only one expected submission is accepted. The schema is deliberately an envelope rather than a second full game contract: the existing semantic validator checks dates, identities, movements and political effects. Server versions and individual models may reject or ignore optional format controls, so the provider-independent parser and integrity checks always remain active.

Fallback requires an explicit unsupported-format error (or a routing error saying no endpoint supports the requested parameters). Authentication/access failures, unknown models, rate limits, connection failures, output refusals and server outages are not format fallbacks. A successful but malformed generation uses the existing single corrective-generation budget. Negotiation never switches models/providers or changes keys. At most two format rejections can precede a generation, and rejected modes are cached in memory for ten minutes per provider/endpoint/model. Saving settings clears the cache; no capability state is written to the private settings file.

Local diagnostic counters now include provider_requests and format_fallbacks as well as generation requests. Tests use all catalogue entries with mocked completions plus a temporary local HTTP server for Claude request/error handling. No paid/live provider calls or browser checks were run.

Protocol references: [OpenAI JSON mode](https://developers.openai.com/api/docs/guides/structured-outputs), [Claude tool choice and content blocks](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools), [LM Studio schema output](https://lmstudio.ai/docs/developer/openai-compat/structured-output), [Ollama compatibility](https://docs.ollama.com/api/openai-compatibility), [Groq structured output](https://console.groq.com/docs/structured-outputs), [OpenRouter parameter routing](https://openrouter.ai/docs/guides/routing/provider-selection), [Together structured output](https://docs.together.ai/docs/inference/chat/structured-outputs), [Fireworks structured output](https://docs.fireworks.ai/structured-responses/structured-response-formatting).
