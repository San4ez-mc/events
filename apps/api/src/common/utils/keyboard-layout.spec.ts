import { fixKeyboardLayout } from "./keyboard-layout";

describe("fixKeyboardLayout", () => {
  it("turns wrong-layout text into Ukrainian", () => {
    expect(fixKeyboardLayout("nthyj")).toBe("терно");
    expect(fixKeyboardLayout("Rb]d")).toBe("київ");
    expect(fixKeyboardLayout("jltcf")).toBe("одеса");
  });

  it("leaves real words and other scripts alone", () => {
    expect(fixKeyboardLayout("концерт")).toBeNull();
    expect(fixKeyboardLayout("123")).toBeNull();
    expect(fixKeyboardLayout("")).toBeNull();
  });
});
