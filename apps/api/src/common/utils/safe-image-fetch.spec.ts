import { fetchImageSafely, isPrivateAddress } from "./safe-image-fetch";

describe("isPrivateAddress", () => {
  it.each(["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "0.0.0.0", "100.64.0.1", "224.0.0.1", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:10.0.0.5", "not-an-ip"])(
    "treats %s as internal",
    (ip) => expect(isPrivateAddress(ip)).toBe(true),
  );

  it.each(["8.8.8.8", "149.154.167.220", "172.32.0.1", "172.15.255.255", "2606:4700:4700::1111"])("treats %s as public", (ip) => expect(isPrivateAddress(ip)).toBe(false));
});

describe("fetchImageSafely (rejections that never reach the network)", () => {
  it("only allows https", async () => {
    await expect(fetchImageSafely("http://example.com/a.jpg", 1000)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("rejects garbage and internal hosts", async () => {
    await expect(fetchImageSafely("not a url", 1000)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(fetchImageSafely("https://127.0.0.1/a.jpg", 1000)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(fetchImageSafely("https://[::1]/a.jpg", 1000)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(fetchImageSafely("https://169.254.169.254/latest/meta-data", 1000)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});
