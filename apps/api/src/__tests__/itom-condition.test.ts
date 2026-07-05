/**
 * itom-condition.ts — pure DSL parser + evaluator unit tests (Sprint 3.4b).
 *
 * No DB. Covers: single comparisons, AND/OR precedence, parentheses, severity
 * ordinal comparison, numeric coercion, string-only field guards, malformed
 * input → ConditionParseError, and the never-throwing matchesCondition wrapper.
 */
import { describe, it, expect } from "vitest";
import {
  parseCondition,
  evaluateCondition,
  matchesCondition,
  ConditionParseError,
  type EvaluableEvent,
} from "../lib/itom-condition";

const ev = (o: Partial<EvaluableEvent> = {}): EvaluableEvent => ({
  count: 1,
  severity: "info",
  node: "web-01",
  metric: "cpu_load",
  state: "open",
  value: null,
  threshold: null,
  ...o,
});

describe("itom-condition DSL (Sprint 3.4b)", () => {
  describe("single comparisons", () => {
    it("numeric >", () => {
      expect(matchesCondition("count > 10", ev({ count: 11 }))).toBe(true);
      expect(matchesCondition("count > 10", ev({ count: 10 }))).toBe(false);
    });

    it("string = / !=", () => {
      expect(matchesCondition("node = web-01", ev({ node: "web-01" }))).toBe(true);
      expect(matchesCondition("node != web-01", ev({ node: "db-02" }))).toBe(true);
      expect(matchesCondition("node = web-01", ev({ node: "db-02" }))).toBe(false);
    });

    it("quoted string value", () => {
      expect(matchesCondition('metric = "disk usage"', ev({ metric: "disk usage" }))).toBe(true);
    });
  });

  describe("severity ordinal comparison", () => {
    it("severity >= major matches critical and major", () => {
      expect(matchesCondition("severity >= major", ev({ severity: "critical" }))).toBe(true);
      expect(matchesCondition("severity >= major", ev({ severity: "major" }))).toBe(true);
      expect(matchesCondition("severity >= major", ev({ severity: "minor" }))).toBe(false);
    });

    it("unknown severity → non-match, never throws", () => {
      expect(matchesCondition("severity >= major", ev({ severity: "bogus" }))).toBe(false);
    });
  });

  describe("boolean composition", () => {
    it("AND requires both", () => {
      const cond = "count > 10 AND severity = critical";
      expect(matchesCondition(cond, ev({ count: 11, severity: "critical" }))).toBe(true);
      expect(matchesCondition(cond, ev({ count: 11, severity: "info" }))).toBe(false);
      expect(matchesCondition(cond, ev({ count: 5, severity: "critical" }))).toBe(false);
    });

    it("OR requires either", () => {
      const cond = "severity = critical OR count > 100";
      expect(matchesCondition(cond, ev({ severity: "critical", count: 1 }))).toBe(true);
      expect(matchesCondition(cond, ev({ severity: "info", count: 200 }))).toBe(true);
      expect(matchesCondition(cond, ev({ severity: "info", count: 1 }))).toBe(false);
    });

    it("case-insensitive AND / OR", () => {
      expect(matchesCondition("count > 1 and severity = info", ev({ count: 2 }))).toBe(true);
      expect(matchesCondition("count > 100 or severity = info", ev({ count: 2 }))).toBe(true);
    });

    it("AND binds tighter than OR", () => {
      // a OR (b AND c): with a false, b true, c false → false
      const cond = "node = db-01 OR metric = cpu_load AND count > 100";
      expect(matchesCondition(cond, ev({ node: "web-01", metric: "cpu_load", count: 5 }))).toBe(false);
      // a true short-circuits
      expect(matchesCondition(cond, ev({ node: "db-01", metric: "x", count: 0 }))).toBe(true);
    });

    it("parentheses override precedence", () => {
      const cond = "(node = db-01 OR metric = cpu_load) AND count > 100";
      expect(matchesCondition(cond, ev({ node: "web-01", metric: "cpu_load", count: 200 }))).toBe(true);
      expect(matchesCondition(cond, ev({ node: "web-01", metric: "cpu_load", count: 5 }))).toBe(false);
    });
  });

  describe("numeric coercion", () => {
    it("string value field coerces to number", () => {
      expect(matchesCondition("value >= 90", ev({ value: "95" }))).toBe(true);
      expect(matchesCondition("value >= 90", ev({ value: "80" }))).toBe(false);
    });

    it("non-numeric event value on numeric comparison → false", () => {
      expect(matchesCondition("value >= 90", ev({ value: "n/a" }))).toBe(false);
      expect(matchesCondition("count > 1", ev({ count: null }))).toBe(false);
    });
  });

  describe("parse errors", () => {
    it("empty → ConditionParseError", () => {
      expect(() => parseCondition("")).toThrow(ConditionParseError);
      expect(() => parseCondition("   ")).toThrow(ConditionParseError);
    });

    it("unknown field", () => {
      expect(() => parseCondition("bogus = 1")).toThrow(ConditionParseError);
    });

    it("order operator on string-only field", () => {
      expect(() => parseCondition("node > db-01")).toThrow(ConditionParseError);
    });

    it("missing operator / value / unbalanced parens", () => {
      expect(() => parseCondition("count")).toThrow(ConditionParseError);
      expect(() => parseCondition("count >")).toThrow(ConditionParseError);
      expect(() => parseCondition("(count > 1")).toThrow(ConditionParseError);
    });

    it("matchesCondition swallows parse errors → false", () => {
      expect(matchesCondition("this is not valid", ev())).toBe(false);
    });
  });

  describe("parse + evaluate separation", () => {
    it("parseCondition builds a reusable AST", () => {
      const ast = parseCondition("count > 10 AND severity = critical");
      expect(evaluateCondition(ast, ev({ count: 20, severity: "critical" }))).toBe(true);
      expect(evaluateCondition(ast, ev({ count: 2, severity: "critical" }))).toBe(false);
    });
  });
});
