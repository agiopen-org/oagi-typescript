# OAGI TypeScript SDK

TypeScript SDK for the OAGI API - vision-based task automation.

## What is OAGI?

OAGI is the TypeScript SDK for **Lux**, the world's most advanced computer-use model from the OpenAGI Foundation. 

**Computer Use** is AI's ability to operate human-facing software — not just through APIs, but by operating computers natively, just as human users do. It's a paradigm shift in what AI can do: not just generating, reasoning, or researching, but actually operating on your computer.

Lux comes in three modes, giving you control over depth, speed, and style of execution:

- **Tasker** — Strictly follows step-by-step instructions with ultra-stable, controllable execution
- **Actor** — Ideal for immediate tasks, completing actions at near-instant speed
- **Thinker** — Understands vague, complex goals, performing hour-long executions

### Use Cases

With Lux, possibilities are endless. Here are a few examples:

- **Web Scraping & Data Crawl** — Navigate websites, sort results, and collect product information autonomously
- **Software QA** — Automate repetitive testing tasks, navigate applications, perform test actions, and validate expected behaviors
- **Financial Data Extraction** — Navigate to sites like NASDAQ and extract insider activity data
- **Data Entry** — Enter accurate data across dashboards and forms
- **Workflow Automation** — Chain together multi-step tasks across different applications

## Table of Contents

- [OAGI TypeScript SDK](#oagi-typescript-sdk)
  - [What is OAGI?](#what-is-oagi)
    - [Use Cases](#use-cases)
  - [Table of Contents](#table-of-contents)
  - [Installation](#installation)
  - [Quick Start](#quick-start)
    - [Automated Task Execution](#automated-task-execution)
    - [Command Line Interface](#command-line-interface)
    - [Image Processing](#image-processing)
    - [Manual Control with Actor](#manual-control-with-actor)
  - [Documentation](#documentation)
  - [License](#license)

## Installation

```bash
# If you are using Node.js
npm install oagi
yarn add oagi
pnpm add oagi

# If you are using Deno
deno add npm:oagi

# If you are using Bun
bun install oagi
```

## Quick Start

Set your API credentials:
```bash
export OAGI_API_KEY="your-api-key" # get your API key from https://developer.agiopen.org/
# export OAGI_BASE_URL="https://api.agiopen.org/", # optional, defaults to production endpoint
```

### Automated Task Execution

Run tasks automatically with screenshot capture and action execution:

```typescript
import { DefaultActionHandler, DefaultAgent, ScreenshotMaker } from 'oagi';

const agent = new DefaultAgent();
await agent.execute(
  'Search weather on Google',
  new DefaultActionHandler(),
  new ScreenshotMaker(),
);
```

### Command Line Interface

Run agents directly from the terminal:

```bash
# Run with actor model
oagi agent run "Go to nasdaq.com, search for AAPL. Under More, go to Insider Activity" --model lux-actor-1

# Run with thinker mode (uses lux-thinker-1 model with more steps)
oagi agent run "Look up the store hours for the nearest Apple Store to zip code 23456 using the Apple Store Locator" --model lux-thinker-1

# Run pre-configured tasker workflows (no instruction needed)
oagi agent run --mode tasker:software_qa

# List all available modes
oagi agent modes

# Check macOS permissions (screen recording & accessibility)
oagi agent permission

# Export execution history
oagi agent run "Complete the form" --export html --export-file report.html
```

CLI options:
- `--mode`: Agent mode (default: actor). Use `oagi agent modes` to list available modes
- `--model`: Override the model (default: determined by mode)
- `--max-steps`: Maximum steps (default: determined by mode)
- `--temperature`: Sampling temperature (default: determined by mode)
- `--step-delay`: Delay after each action before next screenshot (default: 0.3s)
- `--export`: Export format (markdown, html, json)
- `--export-file`: Output file path for export

### Image Processing

Process and optimize images before sending to API:

```typescript
import sharp from 'sharp';

const compressed = await sharp('large_screenshot.png')
  .resize(1260, 700, { fit: 'fill' })
  .jpeg({ quality: 85 })
  .toBuffer();
```

### Manual Control with Actor

For step-by-step control over task execution:

```typescript
import { Actor, DefaultActionHandler, ScreenshotMaker } from 'oagi';

const actor = new Actor();
actor.initTask('Complete the form');
const image_provider = new ScreenshotMaker();
const action_handler = new DefaultActionHandler();

for (let i = 0; i < 10; ++i) {
  const image = await image_provider.provide();
  const step = await actor.step(image);

  if (step.stop) break;

  await action_handler.handle(step.actions);
}
```

## Documentation

For full Lux documentation and guides, visit the [OAGI Developer Documentation](https://developer.agiopen.org/docs/index).

## License

MIT
