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
