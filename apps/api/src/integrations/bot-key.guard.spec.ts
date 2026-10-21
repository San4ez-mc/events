import type { ExecutionContext } from "@nestjs/common";
import { BotKeyGuard } from "./bot-key.guard";

const ctx = (headers: Record<string, string | string[] | undefined>) => ({ switchToHttp: () => ({ getRequest: () => ({ headers }) }) }) as unknown as ExecutionContext;
const guard = (key: string | undefined) => new BotKeyGuard({ get: () => key } as never);

describe("BotKeyGuard", () => {
  it("lets the right key through", () => {
    expect(guard("s3cret-key").canActivate(ctx({ "x-bot-key": "s3cret-key" }))).toBe(true);
  });

  it.each([[undefined], ["wrong"], ["s3cret-ke"], ["s3cret-keyy"], [["s3cret-key-x", "s3cret-key"]]])("answers 401 to %p", (header) => {
    expect(() => guard("s3cret-key").canActivate(ctx({ "x-bot-key": header as never }))).toThrow(expect.objectContaining({ code: "AUTH_REQUIRED" }));
  });

  it("pretends the route does not exist while the integration is switched off", () => {
    expect(() => guard(undefined).canActivate(ctx({ "x-bot-key": "anything" }))).toThrow(expect.objectContaining({ code: "NOT_FOUND" }));
  });
});
