## Pre-discovery with Gemini

### Gemini:
  You can run Nimble (nimble) or Tev1 (tev1) locally with Ollama (version 0.35.0 or later) as an alternative to TypeSafe's Jev API. [1] (https://laurencemoroney.com/2026/09/30/small-decision-models-go-local.html), [2] (https://buthonestly.io/nimble-free-local-alternative-to-jev/), [3] (https://ollama.com/library/tev1)
  Ollama supports these structured decision models through its /v1/systemone endpoint, returning choices, yes/no probabilities, and scores instead of generating text. [1] (https://medium.com/data-science-in-your-pocket/ollaya-run-jev-ai-locally-bb2102f10bba), [2] (https://laurencemoroney.com/2026/09/30/small-decision-models-go-local.html)

  Options Available in Ollama

  • Nimble (nimble): Released by Bespoke Labs under the Apache 2.0 license, designed for fast classification, ticket triage, and routing via the local /v1/systemone endpoint.
  • Tev1 (tev1): An experimental family of decision models from Together AI fine-tuned from Qwen3.5 in 0.8B and 4B sizes. [1] (https://ollama.com/library/tev1), [2] (https://buthonestly.io/nimble-free-local-alternative-to-jev/), [3] (https://laurencemoroney.com/2026/09/30/small-decision-models-go-local.html)

  How to Use Them:
  1. Ensure you have Ollama v0.35.0 or later installed.
  2. Pull the model in your terminal:bash
  `ollama pull nimble`
  `ollama pull tev1:0.8b`
  
  3. Send structured JSON requests to the local /v1/systemone endpoint instead of running a standard chat prompt. [1] (https://buthonestly.io/nimble-free-local-alternative-to-jev/), [2] (https://laurencemoroney.com/2026/09/30/small-decision-models-go-local.html)
  Would you like an example of the JSON payload structure to send to the /v1/systemone endpoint, or help setting up a specific classification task?

### Me:
I pulled tev1:0.8b and oddly, when I run it with ollama, it works just fine but does not load in VRAM. therefore, testing `http://127.0.0.1:11433/v1/systemone` with openchamber to replace JEV fails. what are my options?
I'm fine having the model in RAM but how can i tell openchamber to use it if ollama does not serve it via its endpoint? and how does that even work from the command line? if it works from command line, there got to be a way. i do NOT want this model in VRAM

`curl -X POST http://127.0.0.1:11433/v1/systemone -H "Content-Type: application/json" -d "{\"model\": \"tev1:0.8b\", \"keep_alive\": -1, \"prompt\": \"hello\"}"`
result: {"error":"questions must contain 1–64 fields"}

And the answer is: SAVE before testing in openchamber. now it works and is accepted as custom endpoint.
however, it does not work: in AUTO mode, i see openchamber is always using my fallback model instead of 1 of the 4 i have setup for plan/hard/trivial etc.

what am i missing? well, typing `/?` in the tev1 prompt gives this:

tev1 Available Commands:
```
  /set            Set session variables
  /show           Show model information
  /load <model>   Load a session or model
  /save <model>   Save your current session
  /clear          Clear session context
  /bye            Exit
  /?, /help       Help for a command
  /? shortcuts    Help for keyboard shortcuts

Use """ to begin a multi-line message.
```

### Gemini v2:
  Ah, that explains absolutely everything. tev1 is strictly a binary decision model. It is hardcoded to only evaluate Yes/No conditions, true/false logic, or probability pairs.
  Because it cannot generate text like "trivial", "hard", or "plan", it is physically impossible for tev1:0.8b to pick between your 4 custom router tiers. When OpenChamber tries to pass its multi-choice routing prompt to it, the model rejects it or fails the constraint, forcing OpenChamber to drop down to your fallback model every single time.
  To handle a 4-tier classification setup locally in RAM without using VRAM or JEV, you need a model that can actually generate text tokens or pick from multiple arbitrary classes.
  Here are your best paths forward:

    Swap tev1 for llama3.2:1b (Recommended for multi-tier routing) or strands-decider:2b.


### Me after more testing:

ollama library: https://ollama.com/library/strands-decider
`ollama pull strands-decider:2b`
result: Error: this model requires MLX support, but the MLX runtime is not available

Other models I tried:
`ollama pull qwen3.5:0.8b`
`ollama pull llama3.2:1b`
`curl -X POST http://127.0.0.1:11434/v1/systemone -H "Content-Type: application/json" -d "{\"model\": \"llama3.2:1b\", \"keep_alive\": -1}"`
result: {"error":"model \"llama3.2:1b\" is not a llama.cpp decision model"}

`ollama pull strands-decider:2b`
result: Error: this model requires MLX support, but the MLX runtime is not available

`ollama pull qwen3.5:0.8b`
result: {"error":"model \"qwen3.5:0.8b\" is not a llama.cpp decision model"}

Same for qwen3:0.6B, qwen3:0.6B, gemma3:1B.


### Summary:

1. the model must live in RAM because i use all VRAM for qwen3.8
2. i already tested those:
  * tev1:0.8b: only accepts yes/no
  * llama3.2:1b is not a llama.cpp decision model
  * qwen3.5:0.8b is not a llama.cpp decision model
  * qwen3:0.6B is not a llama.cpp decision model
  * gemma3:1B is not a llama.cpp decision model
  * nimble may work but is 9GB




## how to talk to Jev
I asked Gemini to help me craft the specific routing schema for OpenChamber use case: 

* Routing: Pick the right model for each prompt automatically.
* JEV classification:  Small decision models that OpenChamber uses across different workflows. They see short excerpts of your conversation and the action being checked, never files or images.
* categories: Auto sorts prompts by reading these names and descriptions, so write them as instructions: what belongs in the category and what does not.


**important** The 4 categories OpenChamber has by default are (prompts pulled directly from the UI):

1. trivial: Trivial, mechanical, or purely factual work: rename a symbol, fix a typo, reformat, add a comment, answer a short factual question about a known file, run one obvious command and report the output. Not for anything requiring design judgement or multi-file reasoning. glm-5.3-flash.
2. research: Read and explain existing code or behaviour without changing it: explain how a module works, find where something is implemented, summarise what a change does. Not for requests that ask for edits or a plan. gemma-4-31b-it.
3. implement: Ordinary engineering with a clear, bounded shape: implement a well-specified function, endpoint, or component; write or fix tests for existing behaviour; a localised bug fix where the cause is already understood. Not for open-ended architecture, subtle concurrency, or unknown-cause debugging. North-mini-code.
4. Hard reasoning, ambiguity, planning, or high blast radius: debug a failure whose cause is unknown, plan or design a change across several modules, security, auth, concurrency, data-migration, or money-handling logic. Not for work a competent mid-level engineer would finish without thinking hard. deepseek v41 flash.


Gemini reply:

```
{
  "model": "tev1:0.8b",
  "keep_alive": -1,
  "state": {
    "prompt": "Your short conversation excerpt here",
    "action": "The specific action being checked"
  },
  "questions": {
    "intent_category": {
      "type": "choice",
      "instructions": "Which category best describes this prompt?",
      "criteria": {
        "trivial": "Mechanical, factual, or formatting work only: rename symbols, fix typos, reformat, add comments, answer known-file questions, run one obvious command. NOT design, multi-file reasoning, or judgement calls.",
        "research": "Explain existing code/behavior without changes: explain module function, find implementation locations, summarize changes. NOT requests that ask for edits or plans.",
        "implement": "Ordinary engineering with clear shape: implement specified function/component, write/fix tests, localized bug fix with understood cause. NOT open-ended architecture, concurrency subtleties, unknown debugging.",
        "hard_reasoning": "Debugging unknown causes, planning across modules, security/auth, concurrency, data migration, money logic. NOT work a mid-level engineer would finish without deep thinking."
      }
    },
    "is_clear": {
      "type": "noul",
      "instructions": "Is this prompt type and category choice unambiguous enough to route confidently?"
    }
  }
}
```

And the 2-liner version for command line paste:

```
echo {"model":"tev1:0.8b","keep_alive":-1,"state":{"prompt":"User asked me to fix a typo in README.md","action":"fix formatting"},"questions":{"intent_category":{"type":"choice","instructions":"Which category best describes this prompt?","criteria":{"trivial":"Mechanical, factual, or formatting work only: rename symbols, fix typos, reformat, add comments, answer known-file questions, run one obvious command. NOT design, multi-file reasoning, or judgement calls.","research":"Explain existing code/behavior without changes: explain module function, find implementation locations, summarize changes. NOT requests that ask for edits or plans.","implement":"Ordinary engineering with clear shape: implement specified function/component, write/fix tests, localized bug fix with understood cause. NOT open-ended architecture, concurrency subtleties, unknown debugging.","hard_reasoning":"Debugging unknown causes, planning across modules, security/auth, concurrency, data migration, money logic. NOT work a mid-level engineer would finish without deep thinking."}},"is_clear":{"type":"noul","instructions":"Is this prompt type and category choice unambiguous enough to route confidently?"}}}>%TMP%\jev_request.json
curl -X POST http://127.0.0.1:11433/v1/systemone -H "Content-Type: application/json" --data @%TMP%\jev_request.json
```

Result: success!
```
{"model":"tev1:0.8b","answers":{"intent_category":{"type":"choice","choice":"trivial","probabilities":{"trivial":0.9814558689167698,"research":0.0011359301312351968,"implement":0.017348052575324395,"hard_reasoning":6.014837667051316e-05},"confidence":0.9752744918890265},"is_clear":{"type":"noul","noul":0.5799622640006347}},"usage":{"input_tokens":434,"output_tokens":0}}
```

## How to start a second Ollama instance with tev1 only on CPU

### Goals

I want tev1 to be on CPU only because:

1. ollama:11434 is for GPU and qwen3.8:27b takes everything.
2. tev1 on CPU is as fast anyways.
3. Impossible to force CPU only for tev1 with a Modelfile and `ollama create`, the manifest won't accept it.

### Solution: serve separate ollama instance on port 11433

`cat E:/GPT/Ollama/tev1-0.8b-start.cmd`

```
REM # 1. Pull (if not already) — it'll stay CPU
ollama pull tev1:0.8b

REM # 2. Start Ollama with CPU-only flag
set OLLAMA_LLM_LIBRARY=cpu
set CUDA_VISIBLE_DEVICES=-1
set ROCR_VISIBLE_DEVICES=-1
set VULKAN_DRIVER_SELECT=-1
set OLLAMA_HOST=127.0.0.1:11433

REM start ollama on port 11433 in separate window
start "ollama tev1:11433" ollama serve

echo {"model":"tev1:0.8b","keep_alive":-1,"state":{"prompt":"User asked me to fix a typo in README.md","action":"fix formatting"},"questions":{"intent_category":{"type":"choice","instructions":"Which category best describes this prompt?","criteria":{"trivial":"Mechanical, factual, or formatting work only: rename symbols, fix typos, reformat, add comments, answer known-file questions, run one obvious command. NOT design, multi-file reasoning, or judgement calls.","research":"Explain existing code/behavior without changes: explain module function, find implementation locations, summarize changes. NOT requests that ask for edits or plans.","implement":"Ordinary engineering with clear shape: implement specified function/component, write/fix tests, localized bug fix with understood cause. NOT open-ended architecture, concurrency subtleties, unknown debugging.","hard_reasoning":"Debugging unknown causes, planning across modules, security/auth, concurrency, data migration, money logic. NOT work a mid-level engineer would finish without deep thinking."}},"is_clear":{"type":"noul","instructions":"Is this prompt type and category choice unambiguous enough to route confidently?"}}}>%TMP%\jev_request.json

curl -X POST http://127.0.0.1:11433/v1/systemone -H "Content-Type: application/json" --data @%TMP%\jev_request.json

REM # 3. Verify it's on CPU:
ollama ps
  REM NAME         ID              SIZE      PROCESSOR    CONTEXT    RUNNER      UNTIL
  REM tev1:0.8b    abc31fdb0bf5    1.3 GB    100% CPU     8192       llamacpp    Forever

REM show the ports:
netstat -ano | findstr :1143
  REM TCP    0.0.0.0:11434          0.0.0.0:0              LISTENING       9044   < ollama GPU
  REM TCP    127.0.0.1:11433        0.0.0.0:0              LISTENING       1956   < separate ollama tev1
  REM TCP    127.0.0.1:11434        127.0.0.1:49867        ESTABLISHED     9044
  REM TCP    127.0.0.1:11434        127.0.0.1:59558        ESTABLISHED     9044
  REM TCP    127.0.0.1:49867        127.0.0.1:11434        ESTABLISHED     5476
  REM TCP    127.0.0.1:56690        127.0.0.1:11433        TIME_WAIT       0
  REM TCP    127.0.0.1:59558        127.0.0.1:11434        ESTABLISHED     2240
  REM TCP    [::]:11434             [::]:0                 LISTENING       9044

pause
```

Only problem with this approach: an extra cmd prompt that you must not close.

### Speed comparison for tev1 GPU vs CPU

* GPU:

```
slot   operator(): id  2 | task 5 | new prompt, n_ctx_slot = 8192, n_keep = 0, task.n_tokens = 132
slot   operator(): id  2 | task 5 | cached n_tokens = 69, memory_seq_rm [69, end)
slot      release: id  0 | task 4 | stop processing: n_tokens = 302, truncated = 0
[GIN] 2026/10/27 - 21:59:57 | 200 | 308.23ms |       127.0.0.1 | POST     "/v1/systemone"
```

Constantly 300ms, steals 1.3GB VRAM.

* CPU:

```
slot   operator(): id  5 | task 17 | new prompt, n_ctx_slot = 8192, n_keep = 0, task.n_tokens = 132
slot   operator(): id  5 | task 17 | cached n_tokens = 69, memory_seq_rm [69, end)
slot      release: id  0 | task 16 | stop processing: n_tokens = 302, truncated = 0
[GIN] 2026/10/27 - 22:17:39 | 200 |    1.82s |       127.0.0.1 | POST     "/v1/systemone"
```

Constantly 1.8s... horrific, but frees up 1.3GB for the GPU! I can live with +1.8s for each prompt I send.


## what OpenChamber config files hold

### JEV custom endpoint

`cat ~/.config/openchamber/classifier-endpoint.json`

```
{
  "version": 1,
  "endpoint": {
    "url": "http://127.0.0.1:11433/v1/systemone",
    "model": "tev1:0.8b"
  }
}
```

### AUTO routing categories

`cat ~/.config/openchamber/routing.json`

```
{
  "version": 1,
  "enabled": true,
  "minConfidence": 0.6,
  "preserveCache": true,
  "safetyNet": {
    "enabled": false,
    "threshold": 0.6
  },
  "fallback": {
    "model": {
      "providerID": "openrouter",
      "modelID": "openrouter/free"
    }
  },
  "categories": {
    "trivial": {
      "builtin": true,
      "model": {
        "providerID": "opencode",
        "modelID": "glm-5.3-flash-free"
      },
      "agent": "build"
    },
    "research": {
      "builtin": true,
      "model": {
        "providerID": "openrouter",
        "modelID": "google/gemma-4-31b-it:free"
      },
      "agent": "plan"
    },
    "implement": {
      "builtin": true,
      "model": {
        "providerID": "openrouter",
        "modelID": "cohere/north-mini-code:free"
      },
      "agent": "build"
    },
    "hard": {
      "builtin": true,
      "model": {
        "providerID": "opencode",
        "modelID": "deepseek-v4.1-flash-free"
      },
      "variant": "high",
      "agent": "build"
    }
  }
}
```


