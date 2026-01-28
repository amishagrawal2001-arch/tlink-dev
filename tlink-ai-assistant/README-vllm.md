# vLLM with Tlink AI Assistant

This README describes how to run vLLM and connect it to the Tlink AI Assistant plugin.

## What
vLLM is a high-performance inference server that exposes an OpenAI-compatible Chat Completions API. Tlink AI Assistant uses `POST /v1/chat/completions`.

## Where
Run vLLM on a machine you control (local workstation, on-prem server, or private VM). Tlink will connect to `http://<host>:8000/v1`.

## Who
Use vLLM with Tlink AI Assistant if you need:
- Local inference with low latency
- Full control over prompts and data
- An OpenAI-compatible endpoint for the assistant

## When
Choose vLLM when GPU capacity is available and you want self-hosted inference rather than a cloud provider.

## How (Setup)

### Prerequisites / Dependencies
- Python 3.9–3.11 (recommend a clean virtualenv)
- NVIDIA GPU + driver (≥ 525 for CUDA 12.x or matching your PyTorch wheel)
- CUDA runtime via PyTorch wheel (install Torch with the matching CUDA tag):
  ```bash
  pip install torch==2.2.2+cu121 torchvision==0.17.2+cu121 --index-url https://download.pytorch.org/whl/cu121
  ```
- vLLM:
  ```bash
  pip install "vllm>=0.4.0"
  ```
- Optional: flash-attn for better throughput (requires compatible GPU toolchain):
  ```bash
  pip install flash-attn --no-build-isolation
  ```
- If you hit `urllib3`/`boto3` import issues, align versions:
  ```bash
  pip install "urllib3<2.2" "botocore<1.35" "boto3<1.35"
  ```
Do these in the same environment you use to launch vLLM.

### 1) Start vLLM

- Mistral-7B-Instruct-v0.3 

```bash
python -m vllm.entrypoints.openai.api_server \
  --model mistralai/Mistral-7B-Instruct-v0.3 \
  --host 0.0.0.0 \
  --port 8000 \
  --max-model-len 4096 \
  --gpu-memory-utilization 0.9 \
  --enforce-eager
```

- deepseek-coder-6.7b-instruct

```bash
python -m vllm.entrypoints.openai.api_server \
  --model deepseek-ai/deepseek-coder-6.7b-instruct \
  --host 0.0.0.0 --port 8000 \
  --max-model-len 4096 \
  --gpu-memory-utilization 0.9 \
  --enforce-eager
```

To launch another model, replace `--model` with one of the options below (ensure your GPU/VRAM matches the hardware guidelines):
- Llama 3/3.1: `--model meta-llama/Meta-Llama-3-8B` (or `Meta-Llama-3-70B` for multi-GPU)
- Mistral/Mixtral: `--model mistralai/Mistral-7B-Instruct-v0.3` or `--model mistralai/Mixtral-8x7B-Instruct`
- Gemma: `--model google/gemma-2b-it`, `google/gemma-7b-it`, or `google/gemma-2-9b-it`
- Qwen: `--model Qwen2-7B-Instruct`, `Qwen2-72B-Instruct`, or `Qwen2.5-14B-Instruct`
- Phi: `--model microsoft/Phi-3-mini-4k-instruct`, `microsoft/Phi-3.5-mini-instruct`, or `microsoft/Phi-3.5-mini-instruct` (code)
- Code models: `--model bigcode/starcoder2-7b`, `--model bigcode/starcoder2-15b`, or other OpenAI-compatible causal LMs

Keep the model string exactly as exposed by `GET /v1/models`.

### 2) Verify the API
```bash
curl -i http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"mistralai/Mistral-7B-Instruct-v0.3","messages":[{"role":"user","content":"ping"}],"stream":false}'

curl -s http://10.83.6.106:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "deepseek-ai/deepseek-coder-6.7b-instruct",
    "messages": [{"role": "user", "content": "Say hello from vLLM"}],
    "max_tokens": 256,
    "temperature": 0.2,
    "stream": false
  }' | jq .
```



### 3) Configure Tlink AI Assistant
1. Open Tlink settings -> AI Assistant -> AI Providers
2. Select **vLLM (Local)**
3. Set:
   - Base URL: `http://<host>:8000/v1`
   - Model: must match a name from `GET /v1/models`
   - API Key: optional (only if your vLLM server enforces auth)
4. Save config and select vLLM as the active provider

## Troubleshooting

### Common errors
- **400 Bad Request: model not found**  
  The model name in Tlink must match the vLLM server model list. Check `GET /v1/models`.

- **400 Bad Request: tools not supported**  
  Some models do not support tool calls. Disable tools or use a tool-capable model.

- **Connection refused / timeout**  
  Verify host/port reachability and firewall rules.

### Helpful checks
```bash
curl -s http://localhost:8000/v1/models | head -n 20
```

## Notes
- Keep the model name in Tlink in sync with the vLLM server.
- If the server is remote, ensure the host and port are reachable from the Tlink machine.

## Supported Models (Common Choices)
- **Llama family**: Llama 2, Llama 3/3.1 (e.g., `meta-llama/Meta-Llama-3-8B`, `Meta-Llama-3-70B`), CodeLlama/CodeQwen-style code variants.  
  _Use case_: General chat, reasoning; code variants for coding/analysis.
- **Mistral/Mixtral**: `mistralai/Mistral-7B-Instruct-v0.3`, `Mixtral-8x7B-Instruct` (Mixture-of-Experts).  
  _Use case_: Fast, strong small/medium models; Mixtral for higher quality with MoE efficiency.
- **Gemma**: `google/gemma-2b/7b/2b-it/7b-it`, `gemma-2-9b/27b`.  
  _Use case_: Lightweight, responsive models; good balance of quality vs. VRAM.
- **Qwen**: `Qwen2-7B`, `Qwen2-72B`, `Qwen2.5-*` (instruct/code).  
  _Use case_: Strong multilingual + coding; larger Qwen2.5 for higher quality.
- **Phi**: `microsoft/phi-2`, `Phi-3-*` (mini/medium), and Phi-3.5-instruct/code.  
  _Use case_: Very small footprint; good for constrained GPUs or edge; Phi-3.5-code for coding.
- **Code models**: StarCoder2, SantaCoder, other OpenAI-compatible causal LMs (GPTQ/AWQ/FP16/BF16).  
  _Use case_: Code completion, explanation, refactoring; pick quantized variants for limited VRAM.

Always verify the exact model name via `GET /v1/models` on your vLLM server and use that exact string in Tlink.

## Hardware Guidelines (Rough VRAM for FP16/BF16)
- **7B class** (Llama/Mistral/Gemma 7B, Phi-3 medium): ~14–16 GB VRAM; 8 GB may work with 8-bit/4-bit quantization (lower throughput).
- **13B class**: ~26 GB VRAM; quantized can fit on 16–20 GB.
- **70B class**: ~140 GB VRAM (multi-GPU with tensor parallelism or quantization).
- **Mixtral 8x7B**: ~48–60 GB effective; needs multi-GPU or aggressive quantization to fit on a single 24–32 GB card.
- Add ~20–30% headroom for KV cache during longer chats/streaming.

Tips:
- Prefer BF16/FP16 for best quality; use GPTQ/AWQ/4-bit/8-bit if VRAM is tight.
- For multi-GPU, enable tensor parallelism; ensure NVLink/PCIe bandwidth is adequate.
- If you see OOM at load time, use a smaller or quantized checkpoint.

## Running Multiple Models
- **Separate servers (simplest)**: run one model per vLLM server on different ports (e.g., port 8000 for Mistral, 8001 for Llama). Point Tlink to the desired port.
- **Single server, multiple models (if supported)**: use `--served-models` with aliases and enough VRAM. Example:
  ```bash
  python -m vllm.entrypoints.openai.api_server \
    --served-models llama8b=meta-llama/Meta-Llama-3-8B,mistral=mistralai/Mistral-7B-Instruct-v0.3 \
    --host 0.0.0.0 --port 8000
  ```
  Then call `/v1/chat/completions` with `model: "llama8b"` or `model: "mistral"`. If VRAM is tight, enable eviction/limits so vLLM can swap models.
- **Hardware reminder**: two 7B models resident in FP16/BF16 need roughly 2 × (14–16 GB) VRAM. Quantization or eviction reduces footprint but adds switching cost.

In Tlink, set the `model` field to the exact name/alias exposed by `/v1/models` on the target port.

## Concurrency (Multiple Users)
- vLLM batches concurrent requests automatically (dynamic/continuous batching) using paged attention and a scheduler, so multiple users can hit `/v1/chat/completions` in parallel without extra app logic.
- Preemptive scheduling and cache eviction help keep shorter prompts moving even under load.
- Tuning knobs: `--gpu-memory-utilization`, `--max-num-seqs`, `--max-num-batches` (adjust based on GPU/model size).
- If latency spikes under heavy load, lower batch limits or run an additional vLLM server on another port.

## Troubleshooting OOM
- **KV cache too big**: lower context length, e.g., `--max-model-len 4096` (or 2048/3072). If you hit “input tokens exceed max context” (e.g., 24K > 4096), clear/shorten chat history or start a new session; only raise `--max-model-len` if GPU VRAM allows.
- **cuGraph/compile OOM**: run eager to avoid graph capture: `--enforce-eager` (or set env `VLLM_COMPILE=0`).
- **Memory headroom**: tune `--gpu-memory-utilization` (e.g., 0.85–0.95) and reduce `--max-num-seqs` if needed.
- **Check for stray processes**: ensure no other vLLM/Python instances are holding VRAM (`nvidia-smi`).

```bash
python -m vllm.entrypoints.openai.api_server \
  --model deepseek-ai/deepseek-coder-6.7b-instruct \
  --host 0.0.0.0 --port 8000 \
  --max-model-len 4096 \
  --gpu-memory-utilization 0.9 \
  --enforce-eager
``` 

## Load Models from Local Disk (Offline)
1) Download the model locally (all files: config/tokenizer/safetensors), e.g.:
   ```bash
   git lfs install
   git clone https://huggingface.co/deepseek-ai/deepseek-coder-6.7b-instruct /path/to/deepseek-local
   ```
   or
   ```bash
   huggingface-cli download deepseek-ai/deepseek-coder-6.7b-instruct \
     --local-dir /path/to/deepseek-local \
     --local-dir-use-symlinks False
   ```
2) Start vLLM pointing to the local path:
   ```bash
   HF_HUB_OFFLINE=1 \
   python -m vllm.entrypoints.openai.api_server \
     --model /path/to/deepseek-local \
     --host 0.0.0.0 --port 8000 \
     --max-model-len 4096 \
     --gpu-memory-utilization 0.9 \
     --enforce-eager
   ```
3) No account/network is needed once the files are local. Keep the path accurate and ensure tokenizer/weights exist in that folder.
