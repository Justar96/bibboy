import { describe, expect, it } from "vitest"
import { Schema } from "effect"
import {
  AGENT_POSES,
  AgentPoseSchema,
  CHARACTER_STATES,
  CharacterStateSchema,
  isAgentPose,
  isCharacterState,
} from "../src"

describe("character schemas", () => {
  it("accepts all known character states", () => {
    for (const state of CHARACTER_STATES) {
      expect(Schema.decodeUnknownSync(CharacterStateSchema)(state)).toBe(state)
      expect(isCharacterState(state)).toBe(true)
    }
  })

  it("rejects unknown character states", () => {
    expect(isCharacterState("floating")).toBe(false)
    expect(() => Schema.decodeUnknownSync(CharacterStateSchema)("floating")).toThrow()
  })

  it("accepts valid agent poses and keeps them as a subset of states", () => {
    for (const pose of AGENT_POSES) {
      expect(Schema.decodeUnknownSync(AgentPoseSchema)(pose)).toBe(pose)
      expect(isAgentPose(pose)).toBe(true)
      expect(isCharacterState(pose)).toBe(true)
    }
  })

  it("rejects unknown poses", () => {
    expect(isAgentPose("thinking")).toBe(false)
    expect(() => Schema.decodeUnknownSync(AgentPoseSchema)("thinking")).toThrow()
  })
})
