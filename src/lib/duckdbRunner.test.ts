import { describe, expect, it } from "vitest";
import {
  compareQueryResults,
  decimalToString,
  normalizeQueryRows,
  normalizeQueryValue,
} from "./duckdbRunner";

describe("decimalToString", () => {
  it("formats a positive DECIMAL(10,2) like 75.00", () => {
    expect(decimalToString(new Uint32Array([7500, 0, 0, 0]), 2)).toBe("75.00");
  });

  it("formats a positive DECIMAL with scale 0", () => {
    expect(decimalToString(new Uint32Array([1234567, 0, 0, 0]), 0)).toBe(
      "1234567",
    );
  });

  it("pads the fractional part when the value is smaller than the scale", () => {
    expect(decimalToString(new Uint32Array([5, 0, 0, 0]), 4)).toBe("0.0005");
  });

  it("formats a negative DECIMAL(10,2) like -75.00", () => {
    const buf = new Uint32Array([-7500 >>> 0, 0xffffffff, 0xffffffff, 0xffffffff]);
    expect(decimalToString(buf, 2)).toBe("-75.00");
  });

  it("handles multi-word magnitudes above 2^32", () => {
    expect(decimalToString(new Uint32Array([0, 1, 0, 0]), 0)).toBe("4294967296");
  });
});

describe("normalizeQueryValue", () => {
  it("formats a scaled bigint DECIMAL value as a decimal string", () => {
    expect(normalizeQueryValue(7500n, 2)).toBe("75.00");
  });

  it("formats a negative scaled bigint DECIMAL value", () => {
    expect(normalizeQueryValue(-75n, 2)).toBe("-0.75");
  });
});

describe("normalizeQueryRows", () => {
  it("normalizes scaled DECIMAL cells through the public row-shaping path", () => {
    expect(
      normalizeQueryRows(
        ["label", "amount", "rate"],
        [null, 2, null],
        [
          { label: "subtotal", amount: 7500n, rate: 1.5 },
          {
            label: "tax",
            amount: new Uint32Array([125, 0, 0, 0]),
            rate: 0.05,
          },
        ],
      ),
    ).toEqual([
      ["subtotal", "75.00", 1.5],
      ["tax", "1.25", 0.05],
    ]);
  });
});

describe("compareQueryResults", () => {
  it("treats matching row values as correct even when column aliases differ", () => {
    expect(
      compareQueryResults(
        { columns: ["total"], rows: [[3]] },
        { columns: ["count"], rows: [[3]] },
      ),
    ).toBe(true);
  });

  it("fails when row values differ", () => {
    expect(
      compareQueryResults(
        { columns: ["total"], rows: [[3]] },
        { columns: ["total"], rows: [[2]] },
      ),
    ).toBe(false);
  });
});
