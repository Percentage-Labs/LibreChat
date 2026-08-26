# LibreChat with Y.AI

This configuration runs LibreChat locally with Y.AI as an OpenAI-compatible chat-completions
provider. It exposes only `qwen3.6-35b-a3b` and requires every LibreChat user to supply their own
Y.AI API key.

## Start

Docker Desktop must be running. From the repository root, run:

```bash
docker compose -f docker-compose.yml -f docker-compose.yai.yaml up -d api
```

The first start may take several minutes while Docker downloads the images. Follow startup with:

```bash
docker compose -f docker-compose.yml -f docker-compose.yai.yaml logs -f api
```

Open <http://localhost:3080>, register or sign in, select **YAI**, and enter your personal API key
when prompted. A key can also be added or rotated under **Settings → API keys → Provider API
keys**.

Stop the local stack without deleting its data:

```bash
docker compose -f docker-compose.yml -f docker-compose.yai.yaml down
```

## Key handling

- There is no administrator Y.AI key and no fallback key in `.env` or `librechat.yai.yaml`.
- The Y.AI base URL is fixed to `https://api.yaiprotocol.com/v1`; users cannot redirect their key
  to another host through this endpoint.
- LibreChat stores each user's provider key encrypted in MongoDB. The local operator controls the
  encryption material and the running server, so this protects keys at rest and from other users,
  not from the server administrator.
- Keep the generated `librechat-data` Docker volume. It contains the temporary local encryption
  and session secrets used to decrypt keys after a restart.

## Compatibility limits

Y.AI currently supports basic, non-streaming text chat through `/v1/chat/completions`. This setup
therefore hides LibreChat features that would send unsupported tools, files, structured output,
web search, reasoning, or streaming parameters. The Docker override also leaves out the RAG and
vector-database dependencies because file retrieval is disabled and would require a separate
deployment-level embeddings key. The model ID is written literally in
`librechat.yai.yaml`; setting `YAI_MODEL` in `.env` does not change LibreChat's custom endpoint
model list.

## Troubleshooting

- **YAI is missing:** inspect the API logs for a `librechat.yai.yaml` validation error, then confirm
  the Compose command includes both files in the documented order.
- **401 or authentication error:** replace the current user's Y.AI key in Provider API keys.
- **Model-not-found error:** confirm the key is entitled to `qwen3.6-35b-a3b` and that Y.AI still
  publishes that exact model ID.
- **Provider response/format error:** Y.AI's OpenAI compatibility may have changed; compare the API
  logs with the current Y.AI chat-completions documentation before adding an adapter.
