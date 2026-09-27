# YAI + LibreChat local integration

LibreChat is embedded in the YAI application. YAI owns sign-in, user and organization access,
model permissions, and provider credentials. LibreChat provides the chat interface and stores new
conversations. Users sign in to YAI and do not enter a provider API key in LibreChat.

## Start the integrated stack

The canonical local stack is defined in the YAI repository. Keep this LibreChat repository as a
separate checkout beside it. From the YAI repository root:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.integration.example .env }
# Configure the model-provider credentials and optional TAVILY_API_KEY in .env.
docker compose up --build
```

Open <http://localhost:8081>. The first build compiles both repositories and can take several
minutes. Stop the services with `docker compose down`; named volumes keep local data. Use
`docker compose down -v` only when you intend to erase the local databases and uploads.

For the current Gemma 4 31B development setup, follow the YAI checkout's
[`docs/local-ollama.md`](../../yai/task-wizard/docs/local-ollama.md) after the initial build.
The standalone LibreChat Compose override has been removed; start the integration from YAI.

The default Compose build path for this repository is `../../incentiv/LibreChat`, relative to the
YAI repository. Set `LIBRECHAT_REPO_PATH` in the YAI `.env` file if your checkout is elsewhere.

## Credential and data ownership

- The YAI backend calls the configured model provider. The base gateway uses
  `PLAYGROUND_VLLM_API_KEY`; the optional local Ollama adapter uses `OLLAMA_API_KEY`.
- LibreChat uses `TAVILY_API_KEY` for web search on the server.
- Keep credentials in the YAI repository's ignored `.env` file. No key belongs in browser
  storage or client configuration.
- YAI issues a short-lived, single-use sign-in ticket. LibreChat redeems it using a separate
  integration secret; the YAI JWT signing keys are not shared.
- YAI resolves the linked user and active persona for each inference request, then checks chat,
  model, attachment, and usage permissions.
- LibreChat stores new chat history in MongoDB. YAI's existing chat records remain unchanged and
  are not displayed in this pilot.

See [`docs/yai-librechat-local-integration.md`](../../yai/task-wizard/docs/yai-librechat-local-integration.md)
in the YAI checkout for the architecture diagram, request flow, local setup, and pilot scope.
