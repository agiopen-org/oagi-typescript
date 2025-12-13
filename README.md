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

## Documentation

For full Lux documentation and guides, visit the [OAGI Developer Documentation](https://developer.agiopen.org/docs/index).

## License

MIT
