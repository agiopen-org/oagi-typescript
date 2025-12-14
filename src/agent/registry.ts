/**
 * -----------------------------------------------------------------------------
 *  Copyright (c) OpenAGI Foundation
 *  All rights reserved.
 *
 *  This file is part of the official API project.
 *  Licensed under the MIT License.
 * -----------------------------------------------------------------------------
 */

import { StepObserver } from '../types/index.js';
import { Agent } from './index.js';

export type AgentCreateOptions = {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  maxSteps?: number;
  temperature?: number;
  stepObserver?: StepObserver | null;
  stepDelay?: number;
};

// Type alias for agent factory functions
export type AgentFactory = (options?: AgentCreateOptions) => Agent;

// Global registry mapping mode names to factory functions
const agentRegistry: Record<string, AgentFactory> = {};

export const asyncAgentRegister = (mode: string) => {
  /**
   * Decorator to register agent factory functions for specific modes.
   *
   * The decorator performs the following:
   * 1. Registers the factory function under the specified mode name
   * 2. Validates that duplicate modes are not registered
   * 3. Enables runtime validation of returned AsyncAgent instances
   *
   * @param mode The agent mode identifier (e.g., "actor", "planner", "todo")
   */
  return (func: AgentFactory): AgentFactory => {
    // Check if mode is already registered
    if (mode in agentRegistry) {
      throw new Error(
        `Agent mode '${mode}' is already registered. Cannot register the same mode twice.`,
      );
    }

    // Register the factory
    agentRegistry[mode] = func;
    return func;
  };
};

export const getAgentFactory = (mode: string): AgentFactory => {
  /**
   * Get the registered agent factory for a mode.
   */
  if (!(mode in agentRegistry)) {
    const availableModes = Object.keys(agentRegistry);
    throw new Error(
      `Unknown agent mode: '${mode}'. Available modes: ${availableModes}`,
    );
  }
  return agentRegistry[mode]!;
};

export const listAgentModes = (): string[] => {
  /**
   * List all registered agent modes.
   */
  return Object.keys(agentRegistry);
};

export const createAgent = (
  mode: string,
  options: AgentCreateOptions = {},
): Agent => {
  /**
   * Create an agent instance using the registered factory for the given mode.
   */
  const factory = getAgentFactory(mode);

  const agent = factory(options);

  if (!agent || typeof (agent as any).execute !== 'function') {
    throw new TypeError(
      `Factory for mode '${mode}' returned an object that doesn't implement Agent. Expected an object with an 'execute' method.`,
    );
  }

  return agent;
};
